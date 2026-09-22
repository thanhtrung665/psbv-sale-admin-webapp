// src/lib/cbu/db/service.ts
// Load / save a CBU sheet. The SERVER decides the numbers: it reads the stored inputs, applies the client's
// edits, runs the engine once per scenario and persists the CHOSEN scenario's result. Nothing the client computed
// is ever written (SPEC §11.6-5).
//
// The Prisma client is injected so the whole flow (including "save → reload gives the same sheet") is tested
// against an in-memory fake without a database.

import type { PrismaClient } from "@prisma/client";
import { calculateCbu } from "../index";
import { finalizeBlockers } from "../finalize";
import { resolveParams } from "../params";
import type { CbuLineInput, CbuMode, CbuParams, CbuProfile, CbuResult, QuoteBasis } from "../types";
import type { SaveCbuInput } from "../../schemas/cbu.schemas";
import { blocked, notFound } from "./errors";
import {
  buildLines,
  defaultQuoteBasis,
  itemUpdateData,
  mergeParams,
  nextStatus,
  normalizeCbuConfig,
  paramsFromRfq,
  profileFromRfq,
  rfqUpdateData,
  type CbuAction,
  type CbuConfig,
} from "./mapping";
import { dapPricesToPersist, pricesToPersist, resolveScenarios, scenarioLines, scenarioParams, type ScenarioState } from "./scenarios";

export type CbuDb = Pick<PrismaClient, "rFQ" | "rFQItem" | "$transaction">;

export interface CbuSheetItem {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  uom: string;
  qty: number;
  materialUsd: number;
  /** TOTAL weight of the line, lb. */
  totalWeightLb: number;
  dutyPct: number;
  marginPctOverride: number | null;
  marginUsdOverride: number | null;
  /** The typed price of the CHOSEN scenario (per-scenario prices are in `scenarios[].prices`). */
  ddpPriceUsdInput: number | null;
  /** The price stored in the database (may differ from `result` when the sheet was saved by the pre-v2 engine). */
  savedDdpPriceUsd: number | null;
}

export interface CbuSheetScenario {
  id: string;
  label: string;
  /** Effective params of this scenario (base + overrides): logistics, and for FCA_DAP the payment terms. */
  params: CbuParams;
  /** Typed DDP price per line id (PRICE_INPUT); FCA_DAP: the FCA price. */
  prices: Record<string, number>;
  /** FCA_DAP: the typed DAP price per line id. */
  dapPrices: Record<string, number>;
  result: CbuResult;
}

export interface CbuSheet {
  rfq: {
    id: string;
    rfqCode: string;
    status: string;
    incoTerm: string | null;
    paymentTerm: string | null;
    supplierName: string | null;
    clientName: string | null;
  };
  profile: CbuProfile;
  /** FCA_DAP: which price is saved on the lines / totals (`quoteBasis`). */
  quoteBasis: QuoteBasis;
  mode: CbuMode;
  /** Base parameters = the FIRST scenario's effective params (defaults applied). */
  params: CbuParams;
  items: CbuSheetItem[];
  scenarios: CbuSheetScenario[];
  chosenScenarioId: string;
  /** The CHOSEN scenario's result, recomputed from the stored inputs on every load — never a stale copy. */
  result: CbuResult;
  saved: {
    calculatedAt: string | null;
    totalCostUsd: number | null;
    totalRevenueUsd: number | null;
    totalRevenueVnd: number | null;
    totalMarginUsd: number | null;
    actualMarginPct: number | null;
  };
}

export interface CbuSaveOutcome {
  sheet: CbuSheet;
  statusChange: { from: string; to: string };
  notes: string[];
}

const itemsInclude = { items: { orderBy: { lineNo: "asc" as const } }, client: true };

async function readRfq(db: CbuDb, rfqId: string) {
  const rfq = await db.rFQ.findUnique({ where: { id: rfqId }, include: itemsInclude });
  if (!rfq) throw notFound();
  return rfq;
}

type RfqWithItems = Awaited<ReturnType<typeof readRfq>>;

interface ScenarioRun {
  scenario: ScenarioState;
  params: CbuParams;
  lines: CbuLineInput[];
  result: CbuResult;
  /** Prices to persist / show for this scenario. */
  prices: Record<string, number>;
  dapPrices: Record<string, number>;
}

function compute(rfq: RfqWithItems, input?: SaveCbuInput) {
  const stored = normalizeCbuConfig(rfq.cbuConfig);
  const profile: CbuProfile = input?.profile ?? profileFromRfq(rfq);
  const quoteBasis: QuoteBasis = input?.quoteBasis ?? stored.quoteBasis ?? defaultQuoteBasis(rfq.incoTerm);
  const baseInput = mergeParams(paramsFromRfq(rfq), { ...(input?.params ?? {}), ...(input?.mode ? { mode: input.mode } : {}), profile, quoteBasis });
  const baseParams = resolveParams(baseInput);
  const lines = buildLines(rfq.items, input?.items);
  const { scenarios, chosenId } = resolveScenarios(stored, { ...input, items: input?.items }, lines);

  const runs: ScenarioRun[] = scenarios.map((scenario, i) => {
    const params = scenarioParams(baseInput, scenario, i);
    const sLines = scenarioLines(lines, scenario);
    return {
      scenario,
      params,
      lines: sLines,
      result: calculateCbu(sLines, params),
      prices: pricesToPersist(scenario, sLines, baseParams.mode === "PRICE_INPUT"),
      dapPrices: dapPricesToPersist(scenario, sLines),
    };
  });
  const chosen = runs.find((r) => r.scenario.id === chosenId) as ScenarioRun;
  return { baseParams, lines, runs, chosen };
}

function toSheet(rfq: RfqWithItems, c: ReturnType<typeof compute>): CbuSheet {
  const { baseParams, runs, chosen } = c;
  return {
    rfq: {
      id: rfq.id,
      rfqCode: rfq.rfqCode,
      status: rfq.status,
      incoTerm: rfq.incoTerm ?? null,
      paymentTerm: rfq.paymentTerm ?? null,
      supplierName: rfq.supplierName ?? null,
      clientName: rfq.client?.companyName ?? rfq.client?.name ?? null,
    },
    profile: baseParams.profile,
    quoteBasis: baseParams.quoteBasis,
    mode: baseParams.mode,
    params: baseParams,
    items: rfq.items.map((item, i) => ({
      id: item.id,
      lineNo: item.lineNo,
      rawPartNumber: item.rawPartNumber,
      rawDescription: item.rawDescription ?? "",
      uom: item.uom,
      qty: chosen.lines[i].qty,
      materialUsd: chosen.lines[i].materialUsd,
      totalWeightLb: chosen.lines[i].totalWeightLb,
      dutyPct: chosen.lines[i].dutyPct ?? 0,
      marginPctOverride: chosen.lines[i].marginPctOverride ?? null,
      marginUsdOverride: chosen.lines[i].marginUsdOverride ?? null,
      ddpPriceUsdInput: chosen.prices[item.id] ?? null,
      savedDdpPriceUsd: item.ddpPriceUsd ?? null,
    })),
    scenarios: runs.map((r) => ({ id: r.scenario.id, label: r.scenario.label, params: r.params, prices: r.prices, dapPrices: r.dapPrices, result: r.result })),
    chosenScenarioId: chosen.scenario.id,
    result: chosen.result,
    saved: {
      calculatedAt: rfq.cbuCalculatedAt ? rfq.cbuCalculatedAt.toISOString() : null,
      totalCostUsd: rfq.totalCostUsd ?? null,
      totalRevenueUsd: rfq.totalRevenueUsd ?? null,
      // BigInt → Number so the sheet is JSON-serialisable (VND totals fit a double).
      totalRevenueVnd: rfq.totalRevenueVnd === null || rfq.totalRevenueVnd === undefined ? null : Number(rfq.totalRevenueVnd),
      totalMarginUsd: rfq.totalMarginUsd ?? null,
      actualMarginPct: rfq.actualMarginPct ?? null,
    },
  };
}

/** Current sheet: stored inputs + a fresh server-side calculation of every scenario. */
export async function loadCbuSheet(db: CbuDb, rfqId: string): Promise<CbuSheet> {
  const rfq = await readRfq(db, rfqId);
  return toSheet(rfq, compute(rfq));
}

/**
 * Apply `input` on top of the stored sheet, recalculate every scenario on the server and persist.
 * The CHOSEN scenario's result becomes the item prices / RFQ totals. `finalize` additionally requires that scenario
 * to pass every self-check and to have every line priced and weighed.
 */
export async function saveCbuSheet(
  db: CbuDb,
  rfqId: string,
  input: SaveCbuInput,
  action: CbuAction,
  now: Date = new Date()
): Promise<CbuSaveOutcome> {
  const rfq = await readRfq(db, rfqId);
  const c = compute(rfq, input);
  const { baseParams, lines, runs, chosen } = c;

  if (action === "finalize") {
    const reasons = finalizeBlockers(chosen.lines, chosen.result);
    if (reasons.length > 0) throw blocked("Chưa thể hoàn tất CBU.", reasons);
  }

  const { status, note } = nextStatus(rfq.status, action);
  const config: CbuConfig = {
    schemaVersion: 1,
    chosenScenarioId: chosen.scenario.id,
    quoteBasis: baseParams.quoteBasis,
    scenarios: runs.map((r) => ({ id: r.scenario.id, label: r.scenario.label, overrides: r.scenario.overrides, prices: r.prices, dapPrices: r.dapPrices })),
  };

  await db.$transaction([
    ...rfq.items.map((item, i) =>
      db.rFQItem.update({ where: { id: item.id }, data: itemUpdateData(item, lines[i], chosen.result.lines[i], chosen.params) })
    ),
    // Flat columns = the base (first) scenario; totals and item prices = the chosen scenario.
    db.rFQ.update({ where: { id: rfqId }, data: rfqUpdateData({ params: baseParams, result: chosen.result, status, config, now }) }),
  ]);

  // Re-read so the response is exactly what a later load returns (save → reload must match).
  const sheet = await loadCbuSheet(db, rfqId);
  return { sheet, statusChange: { from: rfq.status, to: status }, notes: note ? [note] : [] };
}
