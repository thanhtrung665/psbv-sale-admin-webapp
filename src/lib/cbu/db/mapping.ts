// src/lib/cbu/db/mapping.ts
// Pure mapping between database rows (RFQ / RFQItem) and the CBU engine. No I/O in this file, so every
// rule (units, weights, overrides, status policy, finalize gate) is unit-tested without a database.
//
// SERVER-SIDE ONLY: the engine one folder up never imports from here.

import type { Prisma } from "@prisma/client";
import { n } from "../math";
import type { CbuLineInput, CbuMode, CbuParams, CbuParamsInput, CbuProfile, CbuResult, QuoteBasis } from "../types";
import { roundUpToStep } from "../math";
import { badInput } from "./errors";

// ─── Row views (a Prisma RFQ / RFQItem satisfies these structurally) ─────────────

export interface RfqCbuRow {
  status: string;
  incoTerm?: string | null;
  cbuProfile?: string | null;
  cbuMode?: string | null;
  exchangeRate?: number | null;
  vndRoundingStep?: number | null;
  lbToKg?: number | null;
  goodsOrigin?: string | null;
  destinationCountry?: string | null;
  freightCost?: number | null;
  freightFixed?: number | null;
  freightRatePerKg?: number | null;
  chargeableWeightKg?: number | null;
  clearanceCost?: number | null;
  inlandCost?: number | null;
  docFee?: number | null;
  insuredValuePercent?: number | null;
  insuranceRatePercent?: number | null;
  minInsuranceUsd?: number | null;
  remittanceRatePercent?: number | null;
  bankVatFactor?: number | null;
  minRemittanceFeeUsd?: number | null;
  receiveRatePercent?: number | null;
  minReceiveFeeUsd?: number | null;
  receiveBaseUsd?: number | null;
  otherBankFeeUsd?: number | null;
  percentValueFinanced?: number | null;
  interestRatePercent?: number | null;
  financingDays?: number | null;
  daysPerYear?: number | null;
  targetMarginPercent?: number | null;
  commissionRate?: number | null;
  citOnCommission?: number | null;
  cbuConfig?: unknown;
}

export interface ItemCbuRow {
  id: string;
  lineNo: number;
  qty?: number | null;
  supplierUnitPrice?: number | null;
  netWeightLbs?: number | null;
  extWeightLbs?: number | null;
  dutyPercent?: number | null;
  marginPercent?: number | null;
  marginOverrideUsd?: number | null;
  ddpPriceUsd?: number | null;
}

/** What a client may change on one line. Absent field = keep the stored value; `null` clears an override. */
export interface CbuItemEdit {
  id: string;
  materialUsd?: number;
  /** TOTAL weight of the line, lb (canonical). */
  totalWeightLb?: number;
  /** Weight of ONE unit, lb — converted with the STORED qty. Ignored when `totalWeightLb` is given. */
  weightLbPerUnit?: number;
  dutyPct?: number;
  marginPctOverride?: number | null;
  marginUsdOverride?: number | null;
  ddpPriceUsdInput?: number | null;
}

/** undefined for null / NaN / non-numbers → the engine default applies. */
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

// ─── RFQ columns ⇄ engine params ─────────────────────────────────────────────

export function modeFromRfq(rfq: RfqCbuRow): CbuMode {
  return rfq.cbuMode === "PRICE_INPUT" ? "PRICE_INPUT" : "MARGIN_INPUT";
}

export function profileFromRfq(rfq: RfqCbuRow): CbuProfile {
  return rfq.cbuProfile === "FCA_DAP" ? "FCA_DAP" : "DDP_IMPORT";
}

/** Which price goes onto the lines / totals the Quotation reads (FCA_DAP): DAP when the RFQ's Incoterm says so, else FCA. */
export function defaultQuoteBasis(incoTerm: string | null | undefined): QuoteBasis {
  return /\b(DAP|DDP)\b/i.test(incoTerm ?? "") ? "DAP" : "FCA";
}

/** Flat RFQ columns → engine params. Missing / null columns fall back to the engine defaults. */
export function paramsFromRfq(rfq: RfqCbuRow): CbuParamsInput {
  return {
    profile: profileFromRfq(rfq),
    mode: modeFromRfq(rfq),
    fx: num(rfq.exchangeRate),
    vndRoundingStep: num(rfq.vndRoundingStep),
    lbToKg: num(rfq.lbToKg),
    targetMarginPct: num(rfq.targetMarginPercent),
    commissionPct: num(rfq.commissionRate),
    citPct: num(rfq.citOnCommission),
    goodsOrigin: text(rfq.goodsOrigin),
    destinationCountry: text(rfq.destinationCountry),
    pctFinanced: num(rfq.percentValueFinanced),
    interestPct: num(rfq.interestRatePercent),
    financingDays: num(rfq.financingDays),
    daysPerYear: num(rfq.daysPerYear),
    logistics: {
      freightAllInUsd: num(rfq.freightCost),
      freightFixedUsd: num(rfq.freightFixed),
      freightRatePerKg: num(rfq.freightRatePerKg),
      chargeableKg: num(rfq.chargeableWeightKg),
      clearanceUsd: num(rfq.clearanceCost),
      inlandUsd: num(rfq.inlandCost),
      otherUsd: num(rfq.docFee),
    },
    insurance: {
      insuredValuePct: num(rfq.insuredValuePercent),
      ratePct: num(rfq.insuranceRatePercent),
      minUsd: num(rfq.minInsuranceUsd),
    },
    bank: {
      remitRatePct: num(rfq.remittanceRatePercent),
      remitVatFactor: num(rfq.bankVatFactor),
      minRemitUsd: num(rfq.minRemittanceFeeUsd),
      receiveRatePct: num(rfq.receiveRatePercent),
      minReceiveUsd: num(rfq.minReceiveFeeUsd),
      receiveBaseUsd: num(rfq.receiveBaseUsd),
      otherUsd: num(rfq.otherBankFeeUsd),
    },
  };
}

/**
 * Deep-merge `patch` over `base` (both partial params). Only `undefined` means "not given";
 * everything else — including 0 and "" handled by the caller's schema — overrides.
 */
export function mergeParams(base: CbuParamsInput, patch: CbuParamsInput | undefined): CbuParamsInput {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = (base as Record<string, unknown>)[key];
    out[key] =
      value !== null && typeof value === "object" && prev !== null && typeof prev === "object"
        ? mergeParams(prev as CbuParamsInput, value as CbuParamsInput)
        : value;
  }
  return out as CbuParamsInput;
}

/** Resolved engine params → the flat RFQ columns (persisted so the sheet re-opens identically). */
export function paramsToRfqColumns(p: CbuParams) {
  return {
    cbuMode: p.mode,
    exchangeRate: p.fx,
    vndRoundingStep: p.vndRoundingStep,
    lbToKg: p.lbToKg,
    targetMarginPercent: p.targetMarginPct,
    commissionRate: p.commissionPct,
    citOnCommission: p.citPct,
    goodsOrigin: p.goodsOrigin,
    destinationCountry: p.destinationCountry,
    percentValueFinanced: p.pctFinanced,
    interestRatePercent: p.interestPct,
    financingDays: p.financingDays,
    daysPerYear: p.daysPerYear,
    freightCost: p.logistics.freightAllInUsd,
    freightFixed: p.logistics.freightFixedUsd,
    freightRatePerKg: p.logistics.freightRatePerKg,
    chargeableWeightKg: p.logistics.chargeableKg,
    clearanceCost: p.logistics.clearanceUsd,
    inlandCost: p.logistics.inlandUsd,
    docFee: p.logistics.otherUsd,
    insuredValuePercent: p.insurance.insuredValuePct,
    insuranceRatePercent: p.insurance.ratePct,
    minInsuranceUsd: p.insurance.minUsd,
    remittanceRatePercent: p.bank.remitRatePct,
    bankVatFactor: p.bank.remitVatFactor,
    minRemittanceFeeUsd: p.bank.minRemitUsd,
    receiveRatePercent: p.bank.receiveRatePct,
    minReceiveFeeUsd: p.bank.minReceiveUsd,
    receiveBaseUsd: p.bank.receiveBaseUsd,
    otherBankFeeUsd: p.bank.otherUsd,
  };
}

// ─── Items ⇄ engine lines ────────────────────────────────────────────────────

/** Canonical line weight = TOTAL lb (SPEC §11.6-2): `extWeightLbs`, else `netWeightLbs × qty`. */
export function totalWeightLbOf(item: ItemCbuRow): number {
  const qty = Math.max(0, n(item.qty, 1));
  const ext = n(item.extWeightLbs);
  return ext > 0 ? ext : Math.max(0, n(item.netWeightLbs)) * qty;
}

export function itemToLine(item: ItemCbuRow): CbuLineInput {
  return {
    id: item.id,
    lineNo: item.lineNo,
    qty: Math.max(0, n(item.qty, 1)),
    materialUsd: Math.max(0, n(item.supplierUnitPrice)),
    totalWeightLb: totalWeightLbOf(item),
    dutyPct: Math.max(0, n(item.dutyPercent)),
    // NULL must stay null: it means "use the target margin", never 0% (SPEC §11.2 F6).
    marginPctOverride: num(item.marginPercent) ?? null,
    marginUsdOverride: num(item.marginOverrideUsd) ?? null,
    // The last saved price is what a PRICE_INPUT sheet shows again when re-opened.
    ddpPriceUsdInput: num(item.ddpPriceUsd) ?? null,
  };
}

export function applyEdit(line: CbuLineInput, edit: CbuItemEdit): CbuLineInput {
  const out = { ...line };
  if (edit.materialUsd !== undefined) out.materialUsd = edit.materialUsd;
  if (edit.totalWeightLb !== undefined) out.totalWeightLb = edit.totalWeightLb;
  else if (edit.weightLbPerUnit !== undefined) out.totalWeightLb = edit.weightLbPerUnit * line.qty;
  if (edit.dutyPct !== undefined) out.dutyPct = edit.dutyPct;
  if (edit.marginPctOverride !== undefined) out.marginPctOverride = edit.marginPctOverride;
  if (edit.marginUsdOverride !== undefined) out.marginUsdOverride = edit.marginUsdOverride;
  if (edit.ddpPriceUsdInput !== undefined) out.ddpPriceUsdInput = edit.ddpPriceUsdInput;
  return out;
}

/** Stored rows + client edits → engine lines. Edits for ids that are not on this RFQ are rejected. */
export function buildLines(items: ItemCbuRow[], edits: CbuItemEdit[] | undefined): CbuLineInput[] {
  const byId = new Map(items.map((i) => [i.id, itemToLine(i)]));
  const unknown: string[] = [];
  for (const e of edits ?? []) {
    const base = byId.get(e.id);
    if (!base) unknown.push(e.id);
    else byId.set(e.id, applyEdit(base, e));
  }
  if (unknown.length > 0) {
    throw badInput("Có dòng hàng không thuộc RFQ này.", unknown.map((id) => `Dòng không tồn tại: ${id}`));
  }
  return items.map((i) => byId.get(i.id) as CbuLineInput);
}

// ─── Persisted shapes ────────────────────────────────────────────────────────

/** RFQItem columns written after a calculation. Line totals follow the legacy meaning of the columns. */
export function itemUpdateData(
  item: ItemCbuRow,
  line: CbuLineInput,
  res: CbuResult["lines"][number],
  params: CbuParams
): Prisma.RFQItemUpdateInput {
  const qty = res.qty;
  const usd = num(line.marginUsdOverride);
  return {
    supplierUnitPrice: line.materialUsd,
    supplierExtPrice: line.materialUsd * qty,
    extWeightLbs: line.totalWeightLb,
    // Per-unit weight is derived; keep the stored one when qty is 0 (nothing to divide by).
    ...(qty > 0 ? { netWeightLbs: line.totalWeightLb / qty } : {}),
    dutyPercent: line.dutyPct ?? 0,
    marginPercent: line.marginPctOverride ?? null,
    marginOverrideUsd: usd !== undefined && usd > 0 ? usd : null,
    commissionPercent: params.commissionPct,
    citPercent: params.citPct,

    // legacy meaning: apportionedLogistics EXCLUDES insurance, apportionedInsurance is that share alone.
    apportionedLogistics: (res.logisticsUsd - res.insuranceUsd) * qty,
    apportionedInsurance: res.insuranceUsd * qty,
    apportionedBank: res.bankFeeUsd * qty,
    dutyAmount: res.dutyUsd * qty,
    commissionAmount: res.commissionUsd * qty,
    citAmount: res.citUsd * qty,
    unitCostUsd: res.unitCostUsd,
    ddpPriceUsd: res.ddpPriceUsd,
    ddpPriceVnd: BigInt(Math.round(res.ddpPriceVnd)),
    marginPerUnitUsd: res.marginPerUnitUsd,
  };
}

export interface CbuConfig {
  schemaVersion: 1;
  chosenScenarioId: string;
  /** FCA_DAP: which price is saved on the lines / totals. Absent = derived from the RFQ's Incoterm. */
  quoteBasis?: QuoteBasis;
  /**
   * The FIRST scenario is the base: its params are the flat RFQ columns and its `overrides` stay empty.
   * Later scenarios store only what differs (today: logistics). `prices` = typed DDP price per line id
   * (PRICE_INPUT); `undefined` means a legacy config — fall back to the price stored on the item.
   * `dapPrices` (FCA_DAP): the typed DAP price per line id; `prices` then holds the FCA prices.
   */
  scenarios: { id: string; label: string; overrides: CbuParamsInput; prices?: Record<string, number>; dapPrices?: Record<string, number> }[];
}

/** Keeps an existing v1 config untouched; otherwise starts with the single implicit scenario. */
export function normalizeCbuConfig(raw: unknown): CbuConfig {
  const c = raw as Partial<CbuConfig> | null | undefined;
  if (c && c.schemaVersion === 1 && Array.isArray(c.scenarios) && c.scenarios.length > 0 && typeof c.chosenScenarioId === "string") {
    return c as CbuConfig;
  }
  return { schemaVersion: 1, chosenScenarioId: "default", scenarios: [{ id: "default", label: "Mặc định", overrides: {} }] };
}

export function rfqUpdateData(args: {
  params: CbuParams;
  result: CbuResult;
  status: string;
  config: CbuConfig;
  now: Date;
}): Prisma.RFQUpdateInput {
  const { params, result, status, config, now } = args;
  const dapFreightUsd = params.profile === "FCA_DAP" && params.quoteBasis === "DAP" ? (result.dap?.freightUsd ?? 0) : 0;
  return {
    ...paramsToRfqColumns(params),
    cbuProfile: params.profile,
    cbuConfig: config as unknown as Prisma.InputJsonValue,
    cbuCalculatedAt: now,
    totalCostUsd: result.totals.costUsd,
    // FCA_DAP quoted on DAP: the lump-sum freight is part of what the customer pays (Excel G16 = G15 + P16).
    totalRevenueUsd: result.totals.revenueUsd + dapFreightUsd,
    totalRevenueVnd: BigInt(Math.round(result.totals.revenueVnd + roundUpToStep(dapFreightUsd * params.fx, params.vndRoundingStep))),
    totalMarginUsd: result.totals.marginUsd,
    // Nominal margin on USD revenue (the "booking rate" margin was dropped — SPEC §11.12 Q5).
    actualMarginPct: result.totals.marginPct,
    status: status as Prisma.RFQUpdateInput["status"],
  };
}

// ─── Status policy & finalize gate ───────────────────────────────────────────

export type CbuAction = "draft" | "finalize";

/**
 * draft:    → CBU_PENDING_ADMIN; a drafted Quotation no longer matches the new numbers so it falls back too.
 * finalize: → QUOTATION_DRAFTED.
 * A quotation that was already SENT to the client is never demoted (the sent price is history).
 */
export function nextStatus(current: string, action: CbuAction): { status: string; note?: string } {
  if (current === "QUOTED_TO_CLIENT") {
    return {
      status: current,
      note: "RFQ đã gửi báo giá cho khách — trạng thái được giữ nguyên; báo giá đã gửi không tự cập nhật theo số mới.",
    };
  }
  return { status: action === "finalize" ? "QUOTATION_DRAFTED" : "CBU_PENDING_ADMIN" };
}

export { finalizeBlockers } from "../finalize";
