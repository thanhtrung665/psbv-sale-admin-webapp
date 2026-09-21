// src/lib/cbu/db/service.ts
// Load / save a CBU sheet. The SERVER decides the numbers: it reads the stored inputs, applies the client's
// edits, runs the engine and persists the result. Nothing the client computed is ever written (SPEC §11.6-5).
//
// The Prisma client is injected so the whole flow (including "save → reload gives the same sheet") is tested
// against an in-memory fake without a database.

import type { PrismaClient } from "@prisma/client";
import { calculateCbu } from "../index";
import { resolveParams } from "../params";
import type { CbuLineInput, CbuMode, CbuParams, CbuResult } from "../types";
import type { SaveCbuInput } from "../../schemas/cbu.schemas";
import { blocked, notFound } from "./errors";
import {
  buildLines,
  finalizeBlockers,
  itemUpdateData,
  mergeParams,
  nextStatus,
  normalizeCbuConfig,
  paramsFromRfq,
  rfqUpdateData,
  type CbuAction,
} from "./mapping";

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
  ddpPriceUsdInput: number | null;
  /** The price stored in the database (may differ from `result` when the sheet was saved by the pre-v2 engine). */
  savedDdpPriceUsd: number | null;
}

export interface CbuSheet {
  rfq: {
    id: string;
    rfqCode: string;
    status: string;
    incoTerm: string | null;
    paymentTerm: string | null;
    supplierName: string | null;
  };
  profile: string;
  mode: CbuMode;
  /** Fully resolved parameters (defaults applied). */
  params: CbuParams;
  items: CbuSheetItem[];
  /** Recomputed from the stored inputs on every load — never a stale copy. */
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

const itemsInclude = { items: { orderBy: { lineNo: "asc" as const } } };

async function readRfq(db: CbuDb, rfqId: string) {
  const rfq = await db.rFQ.findUnique({ where: { id: rfqId }, include: itemsInclude });
  if (!rfq) throw notFound();
  return rfq;
}

type RfqWithItems = Awaited<ReturnType<typeof readRfq>>;

function toSheet(rfq: RfqWithItems, params: CbuParams, lines: CbuLineInput[], result: CbuResult): CbuSheet {
  return {
    rfq: {
      id: rfq.id,
      rfqCode: rfq.rfqCode,
      status: rfq.status,
      incoTerm: rfq.incoTerm ?? null,
      paymentTerm: rfq.paymentTerm ?? null,
      supplierName: rfq.supplierName ?? null,
    },
    profile: rfq.cbuProfile ?? "DDP_IMPORT",
    mode: params.mode,
    params,
    items: rfq.items.map((item, i) => ({
      id: item.id,
      lineNo: item.lineNo,
      rawPartNumber: item.rawPartNumber,
      rawDescription: item.rawDescription ?? "",
      uom: item.uom,
      qty: lines[i].qty,
      materialUsd: lines[i].materialUsd,
      totalWeightLb: lines[i].totalWeightLb,
      dutyPct: lines[i].dutyPct ?? 0,
      marginPctOverride: lines[i].marginPctOverride ?? null,
      marginUsdOverride: lines[i].marginUsdOverride ?? null,
      ddpPriceUsdInput: lines[i].ddpPriceUsdInput ?? null,
      savedDdpPriceUsd: item.ddpPriceUsd ?? null,
    })),
    result,
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

function compute(rfq: RfqWithItems, input?: SaveCbuInput) {
  const params = resolveParams(
    mergeParams(paramsFromRfq(rfq), { ...(input?.params ?? {}), ...(input?.mode ? { mode: input.mode } : {}) })
  );
  const lines = buildLines(rfq.items, input?.items);
  const result = calculateCbu(lines, params);
  return { params, lines, result };
}

/** Current sheet: stored inputs + a fresh server-side calculation. */
export async function loadCbuSheet(db: CbuDb, rfqId: string): Promise<CbuSheet> {
  const rfq = await readRfq(db, rfqId);
  const { params, lines, result } = compute(rfq);
  return toSheet(rfq, params, lines, result);
}

/**
 * Apply `input` on top of the stored sheet, recalculate on the server and persist.
 * `finalize` additionally requires every self-check to pass and every line to be priced and weighed.
 */
export async function saveCbuSheet(
  db: CbuDb,
  rfqId: string,
  input: SaveCbuInput,
  action: CbuAction,
  now: Date = new Date()
): Promise<CbuSaveOutcome> {
  const rfq = await readRfq(db, rfqId);
  const { params, lines, result } = compute(rfq, input);

  if (action === "finalize") {
    const reasons = finalizeBlockers(lines, result);
    if (reasons.length > 0) throw blocked("Chưa thể hoàn tất CBU.", reasons);
  }

  const { status, note } = nextStatus(rfq.status, action);
  const config = normalizeCbuConfig(rfq.cbuConfig);

  await db.$transaction([
    ...rfq.items.map((item, i) =>
      db.rFQItem.update({ where: { id: item.id }, data: itemUpdateData(item, lines[i], result.lines[i], params) })
    ),
    db.rFQ.update({ where: { id: rfqId }, data: rfqUpdateData({ params, result, status, config, now }) }),
  ]);

  // Re-read so the response is exactly what a later load returns (save → reload must match).
  const sheet = await loadCbuSheet(db, rfqId);
  return { sheet, statusChange: { from: rfq.status, to: status }, notes: note ? [note] : [] };
}
