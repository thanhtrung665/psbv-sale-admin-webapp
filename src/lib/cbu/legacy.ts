// src/lib/cbu/legacy.ts
// Backwards-compatible adapter: the pre-v2 `calculateCBU(items, globals)` API, computed by the v2 engine.
//
// It exists so `cbu-calc/page.tsx`, `cbu-form.tsx` and `calculate-cbu/route.ts` keep working until the
// UI is rebuilt (SPEC §11.11 phase C3). New code must call `calculateCbu` from "./index" instead.
// Remove this file together with the legacy page (phase C5).
//
// DIFFERENCES FROM THE OLD ENGINE (all intentional, SPEC §11.2):
//  - percentages are ALWAYS percent numbers (3 = 3%); the "≤ 1 is a fraction" guess is gone (F2)
//  - `netWeightLbs` is the weight of ONE unit (the DB meaning); line total = netWeightLbs × qty (F1)
//  - `logisticsPerUnit` INCLUDES insurance (Excel col K). `insurancePerUnit` is informational only —
//    never add it to `logisticsPerUnit`. `apportionedLogistics` + `apportionedInsurance` = whole pool.
//  - duty base includes insurance (F3); `docFee` maps to "other logistics" and defaults to 0 (F4)
//  - commission % and CIT % are order-wide: the first line's values are used (the page injects the same
//    values into every line)
//  - `bookingExchangeRate` is ignored (SPEC §11.12 Q5); "effective" margin is measured at the quote rate

import { calculateCbu } from "./index";
import { g, n, pctToFrac } from "./math";
import type { CbuLineInput, CbuMode, CbuParamsInput } from "./types";

// ─── Legacy types (unchanged shapes) ─────────────────────────────────────────

export interface CustomColumnDef {
  id: string;
  name: string;
  /** AMOUNT = USD per unit. PERCENT = % of the unit material cost. */
  type: "AMOUNT" | "PERCENT";
}

export interface CustomColumnValues {
  [colId: string]: number;
}

export interface CBUItemEngineData {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription?: string;
  uom: string;
  qty: number;
  supplierUnitPrice: number;
  /** Weight of ONE unit, lb. */
  netWeightLbs: number;

  /** % of the customs value (material + logistics). 0-100. */
  dutyPercent: number;
  /** % of the DDP SELLING price. 0-100. */
  commissionPercent: number;
  /** % of the COMMISSION amount. 0-100. */
  citPercent: number;
  /** Margin % override for this line; null = use the target margin. */
  marginPercent?: number | null;
  /** Fixed margin per unit in USD. Wins over marginPercent when > 0. */
  marginOverrideUsd?: number;
  /** DDP price typed by the user (PRICE_INPUT mode). */
  targetDdpPriceUsd?: number;

  customValues: CustomColumnValues;

  // ── Calculated: per unit (USD) ────────────────────────────────────────────
  extWeightLbs?: number;
  extWeightKg?: number;
  supplierExtPrice?: number;

  /** Allocated freight + clearance + inland + other + INSURANCE (Excel col K). */
  logisticsPerUnit?: number;
  /** Informational: the insurance share already inside `logisticsPerUnit`. */
  insurancePerUnit?: number;
  /** Financing + allocated bank fees (Excel col J). */
  bankFeePerUnit?: number;
  financingCostPerUnit?: number;
  customCostPerUnit?: number;
  dutyPerUnit?: number;
  commissionPerUnit?: number;
  citPerUnit?: number;

  unitCostUsd?: number;
  ddpPriceUsd?: number;
  ddpPriceVnd?: number;
  marginPerUnitUsd?: number;
  /** Realised margin on ddpPriceUsd, 0-100. */
  marginPercentActual?: number;

  // ── Calculated: line totals ───────────────────────────────────────────────
  apportionedLogistics?: number;
  apportionedInsurance?: number;
  apportionedBank?: number;
  dutyAmount?: number;
  commissionAmount?: number;
  citAmount?: number;
  totalCostUsd?: number;
  totalRevenueUsd?: number;
  totalRevenueVnd?: number;
  totalMarginUsd?: number;
}

export interface CBUGlobals {
  exchangeRate: number;
  /** Ignored since v2 (SPEC §11.12 Q5). */
  bookingExchangeRate?: number;
  vndRoundingStep?: number;
  lbToKg?: number;

  freightCost?: number;
  freightFixed?: number;
  freightRatePerKg?: number;
  chargeableWeightKg?: number;
  clearanceCost?: number;
  inlandCost?: number;
  /** Maps to "other shipment charge". Excel has none → default 0. */
  docFee?: number;

  insuredValuePercent?: number;
  insuranceRatePercent?: number;
  minInsuranceUsd?: number;

  remittanceRatePercent?: number;
  /** VAT multiplier on the remittance fee. */
  bankVatFactor?: number;
  minRemittanceFeeUsd?: number;
  receiveRatePercent?: number;
  minReceiveFeeUsd?: number;
  receiveBaseUsd?: number;
  otherBankFeeUsd?: number;

  goodsOrigin?: string;
  destinationCountry?: string;

  percentValueFinanced?: number;
  interestRatePercent?: number;
  financingDays?: number;
  daysPerYear?: number;

  targetMarginPercent?: number;
  cbuMode?: "MARGIN_INPUT" | "PRICE_INPUT";

  customColumns: CustomColumnDef[];
}

export interface CBUResult {
  items: CBUItemEngineData[];

  totalWeightLbs: number;
  totalWeightKg: number;
  totalMaterialUsd: number;

  freightUsd: number;
  /** Freight + clearance + inland + other (EXCLUDES insurance). */
  totalLogisticsUsd: number;
  totalInsuranceUsd: number;
  /** Logistics + insurance — the pool allocated by weight. */
  logisticsPoolUsd: number;

  remittanceFeeUsd: number;
  receiveFeeUsd: number;
  totalBankFeeUsd: number;
  totalFinancingCostUsd: number;

  totalCommissionUsd: number;
  totalCitUsd: number;
  totalDutyUsd: number;

  totalCostUsd: number;
  totalRevenueUsd: number;
  totalRevenueVnd: number;
  totalMarginUsd: number;

  /** Margin on DDP USD revenue, 0-100. */
  nominalMarginPct: number;
  /** Margin measured on VND revenue at the quote rate (captures the VND round-up), 0-100. */
  effectiveMarginPct: number;
  effectiveGrossProfitUsd: number;

  warnings: string[];
}

/** Safe JSON-parse for Prisma Json fields. */
export function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export function calculateCBU(rawItems: CBUItemEngineData[], rawGlobals: CBUGlobals): CBUResult {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const gl: Partial<CBUGlobals> = rawGlobals ?? {};
  const extraWarnings: string[] = [];

  const customColumnsRaw = parseJsonField<CustomColumnDef[]>(gl.customColumns, []);
  const customColumns = Array.isArray(customColumnsRaw) ? customColumnsRaw : [];

  const customPerUnit = (item: CBUItemEngineData, materialUsd: number): number => {
    const parsed = parseJsonField<CustomColumnValues>(item?.customValues, {});
    const values = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    let total = 0;
    for (const col of customColumns) {
      if (!col || typeof col.id !== "string") continue;
      const v = n(values[col.id]);
      if (col.type === "AMOUNT") total += v;
      else if (col.type === "PERCENT") total += materialUsd * pctToFrac(v);
    }
    return total;
  };

  const lines: CbuLineInput[] = items.map((item, idx) => {
    const qty = Math.max(0, n(item?.qty, 1));
    const materialUsd = Math.max(0, n(item?.supplierUnitPrice));
    const override = item?.marginPercent;
    return {
      id: String(item?.id ?? idx),
      lineNo: item?.lineNo,
      qty,
      materialUsd,
      totalWeightLb: Math.max(0, n(item?.netWeightLbs)) * qty,
      dutyPct: n(item?.dutyPercent),
      marginPctOverride: override !== null && override !== undefined && Number.isFinite(Number(override)) ? Number(override) : null,
      marginUsdOverride: n(item?.marginOverrideUsd),
      ddpPriceUsdInput: n(item?.targetDdpPriceUsd),
      customUsd: customPerUnit(item, materialUsd),
    };
  });

  const first = items[0];
  const commissionPct = n(first?.commissionPercent, 3);
  const citPct = n(first?.citPercent, 20);
  if (items.some((i) => n(i?.commissionPercent, 3) !== commissionPct || n(i?.citPercent, 20) !== citPct)) {
    extraWarnings.push("Commission/CIT khác nhau giữa các dòng không còn được hỗ trợ — đã dùng giá trị của dòng đầu tiên.");
  }

  const mode: CbuMode = gl.cbuMode === "PRICE_INPUT" ? "PRICE_INPUT" : "MARGIN_INPUT";
  const params: CbuParamsInput = {
    mode,
    fx: gl.exchangeRate,
    vndRoundingStep: gl.vndRoundingStep,
    lbToKg: gl.lbToKg,
    targetMarginPct: gl.targetMarginPercent,
    commissionPct,
    citPct,
    goodsOrigin: gl.goodsOrigin,
    destinationCountry: gl.destinationCountry,
    pctFinanced: gl.percentValueFinanced,
    interestPct: gl.interestRatePercent,
    financingDays: gl.financingDays,
    daysPerYear: gl.daysPerYear,
    logistics: {
      freightAllInUsd: gl.freightCost,
      freightFixedUsd: gl.freightFixed,
      freightRatePerKg: gl.freightRatePerKg,
      chargeableKg: gl.chargeableWeightKg,
      clearanceUsd: gl.clearanceCost,
      inlandUsd: gl.inlandCost,
      otherUsd: gl.docFee,
    },
    insurance: {
      insuredValuePct: gl.insuredValuePercent,
      ratePct: gl.insuranceRatePercent,
      minUsd: gl.minInsuranceUsd,
    },
    bank: {
      remitRatePct: gl.remittanceRatePercent,
      remitVatFactor: gl.bankVatFactor,
      minRemitUsd: gl.minRemittanceFeeUsd,
      receiveRatePct: gl.receiveRatePercent,
      minReceiveUsd: gl.minReceiveFeeUsd,
      receiveBaseUsd: gl.receiveBaseUsd,
      otherUsd: gl.otherBankFeeUsd,
    },
  };

  const r = calculateCbu(lines, params);
  const lbToKg = g(gl.lbToKg, 0.4536);
  const fx = g(gl.exchangeRate, 26500);

  const outItems: CBUItemEngineData[] = items.map((item, idx) => {
    const l = r.lines[idx];
    const extWeightLbs = Math.max(0, n(item?.netWeightLbs)) * l.qty;
    const insuranceShare = l.insuranceUsd;
    return {
      ...item,
      qty: l.qty,
      extWeightLbs,
      extWeightKg: extWeightLbs * lbToKg,
      supplierExtPrice: l.materialUsd * l.qty,

      logisticsPerUnit: l.logisticsUsd,
      insurancePerUnit: insuranceShare,
      bankFeePerUnit: l.bankFeeUsd,
      financingCostPerUnit: l.financingUsd,
      customCostPerUnit: l.customUsd,
      dutyPerUnit: l.dutyUsd,
      commissionPerUnit: l.commissionUsd,
      citPerUnit: l.citUsd,

      unitCostUsd: l.unitCostUsd,
      ddpPriceUsd: l.ddpPriceUsd,
      ddpPriceVnd: l.ddpPriceVnd,
      marginPerUnitUsd: l.marginPerUnitUsd,
      marginPercentActual: l.marginPct,

      apportionedLogistics: (l.logisticsUsd - insuranceShare) * l.qty,
      apportionedInsurance: insuranceShare * l.qty,
      apportionedBank: l.bankFeeUsd * l.qty,
      dutyAmount: l.dutyUsd * l.qty,
      commissionAmount: l.commissionUsd * l.qty,
      citAmount: l.citUsd * l.qty,
      totalCostUsd: l.totalCostUsd,
      totalRevenueUsd: l.totalRevenueUsd,
      totalRevenueVnd: l.totalRevenueVnd,
      totalMarginUsd: l.totalMarginUsd,
    };
  });

  const revenueAtQuoteRate = fx > 0 ? r.totals.revenueVnd / fx : 0;
  const effectiveGrossProfitUsd = revenueAtQuoteRate - r.totals.costUsd;

  return {
    items: outItems,

    totalWeightLbs: outItems.reduce((s, i) => s + (i.extWeightLbs ?? 0), 0),
    totalWeightKg: r.totals.weightKg,
    totalMaterialUsd: r.totals.materialUsd,

    freightUsd: r.pools.freightUsd,
    totalLogisticsUsd: r.pools.logisticsPoolUsd - r.pools.insuranceUsd,
    totalInsuranceUsd: r.pools.insuranceUsd,
    logisticsPoolUsd: r.pools.logisticsPoolUsd,

    remittanceFeeUsd: r.pools.remittanceFeeUsd,
    receiveFeeUsd: r.pools.receiveFeeUsd,
    totalBankFeeUsd: r.pools.bankTotalUsd,
    totalFinancingCostUsd: r.totals.financingUsd,

    totalCommissionUsd: r.totals.commissionUsd,
    totalCitUsd: r.totals.citUsd,
    totalDutyUsd: r.totals.dutyUsd,

    totalCostUsd: r.totals.costUsd,
    totalRevenueUsd: r.totals.revenueUsd,
    totalRevenueVnd: r.totals.revenueVnd,
    totalMarginUsd: r.totals.marginUsd,

    nominalMarginPct: r.totals.marginPct,
    effectiveMarginPct: revenueAtQuoteRate > 0 ? (effectiveGrossProfitUsd / revenueAtQuoteRate) * 100 : 0,
    effectiveGrossProfitUsd,

    warnings: [...r.warnings, ...extraWarnings],
  };
}
