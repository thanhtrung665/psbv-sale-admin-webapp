// lib/cbu-engine.ts
// =============================================================================
// CBU PRICING ENGINE
//
// Mirrors the corrected CBU workbook (Margin Analysis / Logistic / Bank Fee).
//
// PRICING CHAIN (per unit, USD):
//   preMargin  = material + bankFee + logistics + insurance + duty + custom
//   ddpUsd     = ROUNDUP( preMargin / (1 - m - q*(1+c)) , 2 )
//   commission = q * ddpUsd
//   cit        = c * commission
//   unitCost   = preMargin + commission + cit
//   margin%    = (ddpUsd - unitCost) / ddpUsd     ->  >= m  (round-up uplift)
//
// WHY THE CLOSED FORM:
//   Commission is charged ON the selling price and is ALSO a cost component, so
//   cost -> price -> commission -> cost is circular. Solving for ddpUsd
//   algebraically removes the loop: no iteration, no manual back-solving.
//
// SAFETY RULES:
// - Every value from the DB is treated as potentially null / undefined / NaN.
// - All arithmetic goes through n() / g() and is guaranteed finite.
// - No division without a zero-guard.
// - .toFixed() is never called here — callers handle formatting.
//
// UNIT CONVENTIONS:
// - Every *Percent field is 0-100 (25 means 25%), never 0.25.
// - Money is USD unless the field name ends in Vnd.
// - Weight inputs are lbs; kg is derived via globals.lbToKg.
// =============================================================================

// ─── Types ───────────────────────────────────────────────────────────────────

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
  netWeightLbs: number;

  /** % of the customs value (material + logistics). 0-100. */
  dutyPercent: number;
  /** % of the DDP SELLING price — not of cost. 0-100. */
  commissionPercent: number;
  /** % of the COMMISSION amount — not of material cost. 0-100. */
  citPercent: number;
  /** Target gross margin on the selling price. 0-100. */
  marginPercent: number;

  customValues: CustomColumnValues;

  // ── Calculated: per unit (USD) ────────────────────────────────────────────
  extWeightLbs?: number;
  extWeightKg?: number;
  supplierExtPrice?: number;

  logisticsPerUnit?: number;
  insurancePerUnit?: number;
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
  /** Realised margin on ddpPriceUsd, 0-100. Slightly above target due to round-up. */
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
  // ── FX & rounding ─────────────────────────────────────────────────────────
  /** Rate used to convert DDP USD -> VND on the quotation. */
  exchangeRate: number;
  /** Internal booking rate. Defaults to exchangeRate. Affects effective margin only. */
  bookingExchangeRate?: number;
  /** VND prices round UP to a multiple of this. Default 10 000. */
  vndRoundingStep?: number;
  /** lb -> kg factor. Default 0.4536. Set to 1 when weights are already in kg. */
  lbToKg?: number;

  // ── Logistics pool (USD per shipment) ─────────────────────────────────────
  /** Explicit all-in freight. When omitted: freightFixed + freightRatePerKg * chargeableWeightKg. */
  freightCost?: number;
  freightFixed?: number;
  freightRatePerKg?: number;
  /** Volumetric / chargeable weight quoted by the forwarder, kg. */
  chargeableWeightKg?: number;
  clearanceCost?: number;
  inlandCost?: number;
  /** Flat documentation charge. Default 0 — do NOT put insurance here, it is computed separately. */
  docFee?: number;

  // ── Insurance ─────────────────────────────────────────────────────────────
  /** Insured value as % of (goods + freight). Default 110. */
  insuredValuePercent?: number;
  /** Premium rate on the insured value, 0-100. Default 0.01. */
  insuranceRatePercent?: number;
  /** Minimum premium, USD. Default 15. */
  minInsuranceUsd?: number;

  // ── Bank fees ─────────────────────────────────────────────────────────────
  /** Outbound remittance rate, 0-100. Default 0.2. */
  remittanceRatePercent?: number;
  /** VAT multiplier on bank fees. Default 1.1. */
  bankVatFactor?: number;
  /** Minimum remittance fee, USD. Default 50. */
  minRemittanceFeeUsd?: number;
  /** Inbound receipt rate, 0-100. Default 0.05. */
  receiveRatePercent?: number;
  /** Minimum receipt fee, USD. Default 5. */
  minReceiveFeeUsd?: number;
  /**
   * Base for the inbound fee (contract value, USD). MUST be entered manually —
   * deriving it from computed revenue would re-introduce a circular dependency.
   */
  receiveBaseUsd?: number;
  /** Any other flat bank charge, USD. */
  otherBankFeeUsd?: number;

  /** "Local" disables the outbound remittance fee. */
  goodsOrigin?: string;
  /** "VN" disables the inbound receipt fee. */
  destinationCountry?: string;

  // ── Financing cost (working capital tied up) ──────────────────────────────
  /** Share of material value financed, 0-100. Default 50. */
  percentValueFinanced?: number;
  /** Annual interest rate, 0-100. Default 15. */
  interestRatePercent?: number;
  /** Days financed. Default 15. */
  financingDays?: number;
  /** Day-count basis. Default 360. */
  daysPerYear?: number;

  customColumns: CustomColumnDef[];
}

export interface CBUResult {
  items: CBUItemEngineData[];

  totalWeightLbs: number;
  totalWeightKg: number;
  totalMaterialUsd: number;

  freightUsd: number;
  /** Freight + clearance + inland + docFee (excludes insurance). */
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
  /** Margin after the VND round-up and the booking FX rate, 0-100. */
  effectiveMarginPct: number;
  effectiveGrossProfitUsd: number;

  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Guarantee a finite number, default 0. */
function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

/** Optional numeric global: falls back when null / undefined / "" / NaN. */
function g(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === "") return fallback;
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

/** Percent (0-100) -> fraction. */
function pct(v: unknown): number {
  return n(v) / 100;
}

const EPS = 1e-9;

/** ROUNDUP(value, decimals) — matches Excel, immune to float dust. */
function roundUp(value: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.ceil(n(value) * f - EPS) / f;
}

/** Round UP to the next multiple of `step`. */
function roundUpToStep(value: number, step: number): number {
  const s = n(step);
  if (s <= 0) return n(value);
  return Math.ceil(n(value) / s - EPS) * s;
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

// ─── Engine ──────────────────────────────────────────────────────────────────

export function calculateCBU(
  rawItems: CBUItemEngineData[],
  rawGlobals: CBUGlobals
): CBUResult {
  const warnings: string[] = [];

  // ── 0. Sanitise globals ───────────────────────────────────────────────────
  const exchangeRate = g(rawGlobals?.exchangeRate, 25500);
  const bookingExchangeRate = g(rawGlobals?.bookingExchangeRate, exchangeRate);
  const vndRoundingStep = g(rawGlobals?.vndRoundingStep, 10000);
  const lbToKg = g(rawGlobals?.lbToKg, 0.4536);

  const freightFixed = g(rawGlobals?.freightFixed, 0);
  const freightRatePerKg = g(rawGlobals?.freightRatePerKg, 0);
  const chargeableWeightKg = g(rawGlobals?.chargeableWeightKg, 0);
  const clearanceCost = g(rawGlobals?.clearanceCost, 0);
  const inlandCost = g(rawGlobals?.inlandCost, 0);
  const docFee = g(rawGlobals?.docFee, 0);

  const insuredValuePercent = g(rawGlobals?.insuredValuePercent, 110);
  const insuranceRatePercent = g(rawGlobals?.insuranceRatePercent, 0.01);
  const minInsuranceUsd = g(rawGlobals?.minInsuranceUsd, 15);

  const remittanceRatePercent = g(rawGlobals?.remittanceRatePercent, 0.2);
  const bankVatFactor = g(rawGlobals?.bankVatFactor, 1.1);
  const minRemittanceFeeUsd = g(rawGlobals?.minRemittanceFeeUsd, 50);
  const receiveRatePercent = g(rawGlobals?.receiveRatePercent, 0.05);
  const minReceiveFeeUsd = g(rawGlobals?.minReceiveFeeUsd, 5);
  const receiveBaseUsd = g(rawGlobals?.receiveBaseUsd, 0);
  const otherBankFeeUsd = g(rawGlobals?.otherBankFeeUsd, 0);

  const goodsOrigin = String(rawGlobals?.goodsOrigin ?? "Oversea").trim();
  const destinationCountry = String(rawGlobals?.destinationCountry ?? "VN").trim();

  const percentValueFinanced = g(rawGlobals?.percentValueFinanced, 50);
  const interestRatePercent = g(rawGlobals?.interestRatePercent, 15);
  const financingDays = g(rawGlobals?.financingDays, 15);
  const daysPerYear = g(rawGlobals?.daysPerYear, 360);

  const customColumnsParsed = parseJsonField<CustomColumnDef[]>(
    rawGlobals?.customColumns,
    []
  );
  const customColumns = Array.isArray(customColumnsParsed) ? customColumnsParsed : [];

  // ── 1. Pass 1 — sanitise items, accumulate weight & material totals ───────
  let totalWeightLbs = 0;
  let totalMaterialUsd = 0;

  const processedItems = (Array.isArray(rawItems) ? rawItems : []).map((item) => {
    const qty = Math.max(0, n(item?.qty, 1));
    const supplierUnitPrice = Math.max(0, n(item?.supplierUnitPrice));
    const netWeightLbs = Math.max(0, n(item?.netWeightLbs));

    const extWeightLbs = netWeightLbs * qty;
    const supplierExtPrice = supplierUnitPrice * qty;

    totalWeightLbs += extWeightLbs;
    totalMaterialUsd += supplierExtPrice;

    const rawCustomValues = parseJsonField<CustomColumnValues>(item?.customValues, {});
    const customValues: CustomColumnValues =
      rawCustomValues && typeof rawCustomValues === "object" && !Array.isArray(rawCustomValues)
        ? rawCustomValues
        : {};

    return {
      ...item,
      qty,
      supplierUnitPrice,
      netWeightLbs,
      dutyPercent: n(item?.dutyPercent),
      commissionPercent: n(item?.commissionPercent),
      citPercent: n(item?.citPercent),
      marginPercent: n(item?.marginPercent),
      customValues,
      extWeightLbs,
      extWeightKg: extWeightLbs * lbToKg,
      supplierExtPrice,
    };
  });

  if (totalWeightLbs <= 0 && processedItems.length > 0) {
    warnings.push(
      "Tổng trọng lượng = 0 nên chi phí logistics không phân bổ được cho dòng nào."
    );
  }

  // ── 2. Shared cost pools ──────────────────────────────────────────────────

  // Freight: explicit override wins, else fixed + rate * chargeable weight.
  const hasExplicitFreight =
    rawGlobals?.freightCost !== undefined &&
    rawGlobals?.freightCost !== null &&
    n(rawGlobals.freightCost) > 0;
  const freightUsd = hasExplicitFreight
    ? n(rawGlobals.freightCost)
    : freightFixed + freightRatePerKg * chargeableWeightKg;

  // Logistics pool EXCLUDING insurance — allocated by weight.
  const totalLogisticsUsd = freightUsd + clearanceCost + inlandCost + docFee;

  // Insurance = MAX((goods + freight) * insuredValue% * rate, minimum).
  // Allocated by weight, same driver as logistics.
  const insuredBase = (totalMaterialUsd + freightUsd) * pct(insuredValuePercent);
  const totalInsuranceUsd =
    processedItems.length > 0
      ? Math.max(insuredBase * pct(insuranceRatePercent), minInsuranceUsd)
      : 0;

  const logisticsPoolUsd = totalLogisticsUsd + totalInsuranceUsd;

  // Bank fees — conditional on origin / destination, with minimum-fee floors.
  const remittanceFeeUsd =
    goodsOrigin.toLowerCase() === "local" || processedItems.length === 0
      ? 0
      : Math.max(
        totalMaterialUsd * pct(remittanceRatePercent) * bankVatFactor,
        minRemittanceFeeUsd
      );

  const receiveFeeUsd =
    destinationCountry.toUpperCase() === "VN" || processedItems.length === 0
      ? 0
      : Math.max(
        receiveBaseUsd * pct(receiveRatePercent) * bankVatFactor,
        minReceiveFeeUsd
      );

  if (
    destinationCountry.toUpperCase() !== "VN" &&
    receiveBaseUsd <= 0 &&
    processedItems.length > 0
  ) {
    warnings.push(
      "receiveBaseUsd chưa nhập — phí nhận ngoại tệ đang rơi về mức tối thiểu. " +
      "Nhập giá trị hợp đồng USD ước tính (không link doanh thu để tránh vòng lặp)."
    );
  }

  const totalBankFeeUsd = remittanceFeeUsd + receiveFeeUsd + otherBankFeeUsd;

  // Financing rate applied to each unit's material value.
  const financingRate =
    daysPerYear > 0
      ? pct(percentValueFinanced) *
      (pct(interestRatePercent) * (financingDays / daysPerYear))
      : 0;

  // ── 3. Pass 2 — per-item allocation & pricing ─────────────────────────────
  let totalCostUsd = 0;
  let totalRevenueUsd = 0;
  let totalRevenueVnd = 0;
  let totalFinancingCostUsd = 0;
  let totalCommissionUsd = 0;
  let totalCitUsd = 0;
  let totalDutyUsd = 0;

  const finalItems: CBUItemEngineData[] = processedItems.map((item) => {
    const qty = item.qty;
    const materialPerUnit = item.supplierUnitPrice;

    // -- Weight-driven pools: logistics + insurance ---------------------------
    // The share is per unit, so SUM(qty * share) reconstitutes exactly 100%.
    const weightShare = totalWeightLbs > 0 ? item.netWeightLbs / totalWeightLbs : 0;
    const logisticsPerUnit = totalLogisticsUsd * weightShare;
    const insurancePerUnit = totalInsuranceUsd * weightShare;

    // -- Value-driven pool: bank fee, plus the financing cost ----------------
    const materialShare = totalMaterialUsd > 0 ? materialPerUnit / totalMaterialUsd : 0;
    const financingCostPerUnit = materialPerUnit * financingRate;
    const bankFeePerUnit = totalBankFeeUsd * materialShare + financingCostPerUnit;

    // -- Custom columns -------------------------------------------------------
    let customCostPerUnit = 0;
    for (const col of customColumns) {
      if (!col || typeof col.id !== "string") continue;
      const val = n(item.customValues[col.id]);
      if (col.type === "AMOUNT") {
        customCostPerUnit += val; // already per unit
      } else if (col.type === "PERCENT") {
        customCostPerUnit += materialPerUnit * pct(val);
      }
    }

    // -- Duty: charged on the customs value (goods + freight) ----------------
    const dutyPerUnit = (materialPerUnit + logisticsPerUnit) * pct(item.dutyPercent);

    // -- Cost base that does NOT depend on the selling price ------------------
    const preMarginPerUnit =
      materialPerUnit +
      bankFeePerUnit +
      logisticsPerUnit +
      insurancePerUnit +
      dutyPerUnit +
      customCostPerUnit;

    // -- Closed-form price: breaks the cost -> price -> commission loop -------
    const m = pct(item.marginPercent);
    const q = pct(item.commissionPercent);
    const c = pct(item.citPercent);
    const denominator = 1 - m - q * (1 + c);

    let ddpPriceUsd: number;
    if (denominator > EPS) {
      ddpPriceUsd = roundUp(preMarginPerUnit / denominator, 2);
    } else {
      ddpPriceUsd = roundUp(preMarginPerUnit, 2);
      warnings.push(
        `Dòng ${item.lineNo ?? item.id}: margin ${item.marginPercent}% + commission ` +
        `${item.commissionPercent}% vượt 100% — không tính được giá bán, đã trả về giá vốn.`
      );
    }

    // -- Price-dependent costs, resolved once the price is known -------------
    const commissionPerUnit = q * ddpPriceUsd;
    const citPerUnit = c * commissionPerUnit;

    const unitCostUsd = preMarginPerUnit + commissionPerUnit + citPerUnit;
    const marginPerUnitUsd = ddpPriceUsd - unitCostUsd;
    const marginPercentActual =
      ddpPriceUsd > 0 ? (marginPerUnitUsd / ddpPriceUsd) * 100 : 0;

    // -- VND price, rounded UP to the configured step ------------------------
    const ddpPriceVnd = roundUpToStep(ddpPriceUsd * exchangeRate, vndRoundingStep);

    // -- Line roll-up ---------------------------------------------------------
    const lineCost = unitCostUsd * qty;
    const lineRevenueUsd = ddpPriceUsd * qty;
    const lineRevenueVnd = ddpPriceVnd * qty;

    totalCostUsd += lineCost;
    totalRevenueUsd += lineRevenueUsd;
    totalRevenueVnd += lineRevenueVnd;
    totalFinancingCostUsd += financingCostPerUnit * qty;
    totalCommissionUsd += commissionPerUnit * qty;
    totalCitUsd += citPerUnit * qty;
    totalDutyUsd += dutyPerUnit * qty;

    return {
      ...item,
      logisticsPerUnit: n(logisticsPerUnit),
      insurancePerUnit: n(insurancePerUnit),
      bankFeePerUnit: n(bankFeePerUnit),
      financingCostPerUnit: n(financingCostPerUnit),
      customCostPerUnit: n(customCostPerUnit),
      dutyPerUnit: n(dutyPerUnit),
      commissionPerUnit: n(commissionPerUnit),
      citPerUnit: n(citPerUnit),

      unitCostUsd: n(unitCostUsd),
      ddpPriceUsd: n(ddpPriceUsd),
      ddpPriceVnd: n(ddpPriceVnd),
      marginPerUnitUsd: n(marginPerUnitUsd),
      marginPercentActual: n(marginPercentActual),

      apportionedLogistics: n(logisticsPerUnit * qty),
      apportionedInsurance: n(insurancePerUnit * qty),
      apportionedBank: n(bankFeePerUnit * qty),
      dutyAmount: n(dutyPerUnit * qty),
      commissionAmount: n(commissionPerUnit * qty),
      citAmount: n(citPerUnit * qty),
      totalCostUsd: n(lineCost),
      totalRevenueUsd: n(lineRevenueUsd),
      totalRevenueVnd: n(lineRevenueVnd),
      totalMarginUsd: n(marginPerUnitUsd * qty),
    };
  });

  // ── 4. Roll-up ────────────────────────────────────────────────────────────
  const totalMarginUsd = totalRevenueUsd - totalCostUsd;
  const nominalMarginPct =
    totalRevenueUsd > 0 ? (totalMarginUsd / totalRevenueUsd) * 100 : 0;

  // Effective margin captures the VND round-up uplift and the FX spread —
  // this is the number that actually lands in the P&L.
  const revenueAtBookingRate =
    bookingExchangeRate > 0 ? totalRevenueVnd / bookingExchangeRate : 0;
  const effectiveGrossProfitUsd = revenueAtBookingRate - totalCostUsd;
  const effectiveMarginPct =
    revenueAtBookingRate > 0 ? (effectiveGrossProfitUsd / revenueAtBookingRate) * 100 : 0;

  return {
    items: finalItems,

    totalWeightLbs: n(totalWeightLbs),
    totalWeightKg: n(totalWeightLbs * lbToKg),
    totalMaterialUsd: n(totalMaterialUsd),

    freightUsd: n(freightUsd),
    totalLogisticsUsd: n(totalLogisticsUsd),
    totalInsuranceUsd: n(totalInsuranceUsd),
    logisticsPoolUsd: n(logisticsPoolUsd),

    remittanceFeeUsd: n(remittanceFeeUsd),
    receiveFeeUsd: n(receiveFeeUsd),
    totalBankFeeUsd: n(totalBankFeeUsd),
    totalFinancingCostUsd: n(totalFinancingCostUsd),

    totalCommissionUsd: n(totalCommissionUsd),
    totalCitUsd: n(totalCitUsd),
    totalDutyUsd: n(totalDutyUsd),

    totalCostUsd: n(totalCostUsd),
    totalRevenueUsd: n(totalRevenueUsd),
    totalRevenueVnd: n(totalRevenueVnd),
    totalMarginUsd: n(totalMarginUsd),

    nominalMarginPct: n(nominalMarginPct),
    effectiveMarginPct: n(effectiveMarginPct),
    effectiveGrossProfitUsd: n(effectiveGrossProfitUsd),

    warnings,
  };
}