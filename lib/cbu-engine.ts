// lib/cbu-engine.ts
// =============================================================================
// SAFETY RULES FOR THIS ENGINE:
// - Every value from DB must be treated as potentially null/undefined/NaN.
// - All arithmetic uses n() helper to guarantee a finite number.
// - No division without zero-guard.
// - .toFixed() is never called here — callers handle formatting.
// =============================================================================

export interface CustomColumnDef {
  id: string;
  name: string;
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

  dutyPercent: number;
  commissionPercent: number;
  citPercent: number;
  marginPercent: number;

  customValues: CustomColumnValues;

  // Calculated fields (populated by calculateCBU)
  supplierExtPrice?: number;
  extWeightLbs?: number;

  apportionedLogistics?: number;
  apportionedBank?: number;
  apportionedInsurance?: number;

  dutyAmount?: number;
  commissionAmount?: number;
  citAmount?: number;

  unitCostUsd?: number;
  ddpPriceUsd?: number;
  ddpPriceVnd?: number;
  marginPerUnitUsd?: number;
}

export interface CBUGlobals {
  exchangeRate: number;
  freightCost: number;
  clearanceCost: number;
  inlandCost: number;
  docFee: number;
  bankFeePercent: number;
  insurancePercent: number;
  customColumns: CustomColumnDef[];
}

export interface CBUResult {
  items: CBUItemEngineData[];
  totalWeight: number;
  totalLogisticsUsd: number;
  totalBankFeeUsd: number;
  totalInsuranceUsd: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  totalRevenueVnd: number;
  totalMarginUsd: number;
  actualMarginPct: number;
}

// ─── Helper: guarantee a finite number, default 0 ────────────────────────────
function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

// ─── Helper: safe JSON-parse for Prisma Json fields ──────────────────────────
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

/**
 * CBU Engine — allocates shared costs and computes DDP pricing & margin per item.
 *
 * All inputs are sanitised defensively; NaN / Infinity / null are treated as 0.
 */
export function calculateCBU(
  rawItems: CBUItemEngineData[],
  rawGlobals: CBUGlobals
): CBUResult {
  // ── 0. Sanitise globals ─────────────────────────────────────────────────────
  const exchangeRate = n(rawGlobals.exchangeRate, 25500);
  const freightCost = n(rawGlobals.freightCost);
  const clearanceCost = n(rawGlobals.clearanceCost);
  const inlandCost = n(rawGlobals.inlandCost);
  const docFee = n(rawGlobals.docFee, 15);
  const bankFeePercent = n(rawGlobals.bankFeePercent);
  const insurancePercent = n(rawGlobals.insurancePercent);

  // Safe-parse customColumns (may arrive as serialised JSON string from Prisma)
  const customColumnsParsed = parseJsonField<CustomColumnDef[]>(
    rawGlobals.customColumns,
    []
  );
  const customColumns = Array.isArray(customColumnsParsed) ? customColumnsParsed : [];

  // ── 1. Sanitise items & compute ext weight ──────────────────────────────────
  let totalWeight = 0;

  const processedItems = (Array.isArray(rawItems) ? rawItems : []).map((item) => {
    const qty = n(item.qty, 1);
    const supplierUnitPrice = n(item.supplierUnitPrice);
    const netWeightLbs = n(item.netWeightLbs);

    const extWeightLbs = netWeightLbs * qty;
    const supplierExtPrice = supplierUnitPrice * qty;

    totalWeight += extWeightLbs;

    // Safe-parse customValues (may arrive as serialised JSON string)
    const rawCustomValues = parseJsonField<CustomColumnValues>(item.customValues, {});
    const customValues: CustomColumnValues =
      rawCustomValues && typeof rawCustomValues === "object" && !Array.isArray(rawCustomValues)
        ? rawCustomValues
        : {};

    return {
      ...item,
      qty,
      supplierUnitPrice,
      netWeightLbs,
      dutyPercent: n(item.dutyPercent),
      commissionPercent: n(item.commissionPercent),
      citPercent: n(item.citPercent),
      marginPercent: n(item.marginPercent),
      customValues,
      extWeightLbs,
      supplierExtPrice,
    };
  });

  // ── 2. Global totals ────────────────────────────────────────────────────────
  const totalLogisticsUsd = freightCost + clearanceCost + inlandCost + docFee;

  let totalBankFeeUsd = 0;
  let totalInsuranceUsd = 0;
  let totalCostUsd = 0;
  let totalRevenueUsd = 0;

  // ── 3. Per-item allocation & pricing ───────────────────────────────────────
  const finalItems = processedItems.map((item) => {
    // Logistics apportioned by weight ratio
    let apportionedLogistics = 0;
    if (totalWeight > 0) {
      apportionedLogistics = totalLogisticsUsd * (item.extWeightLbs / totalWeight);
    }

    // Bank fee & insurance apportioned by ext price
    const apportionedBank = item.supplierExtPrice * (bankFeePercent / 100);
    const apportionedInsurance = item.supplierExtPrice * (insurancePercent / 100);

    totalBankFeeUsd += n(apportionedBank);
    totalInsuranceUsd += n(apportionedInsurance);

    // Fixed-rate fees
    const dutyAmount = item.supplierExtPrice * (item.dutyPercent / 100);
    const commissionAmount = item.supplierExtPrice * (item.commissionPercent / 100);
    const citAmount = item.supplierExtPrice * (item.citPercent / 100);

    // Custom column costs
    let totalCustomCost = 0;
    for (const col of customColumns) {
      const val = n(item.customValues[col.id]);
      if (col.type === "AMOUNT") {
        totalCustomCost += val * item.qty;
      } else if (col.type === "PERCENT") {
        totalCustomCost += item.supplierExtPrice * (val / 100);
      }
    }

    // Total item cost
    const totalItemCost = n(
      item.supplierExtPrice +
        apportionedLogistics +
        apportionedBank +
        apportionedInsurance +
        dutyAmount +
        commissionAmount +
        citAmount +
        totalCustomCost
    );

    const unitCostUsd = item.qty > 0 ? totalItemCost / item.qty : 0;

    // DDP price with margin (Gross Margin formula: Cost / (1 - Margin %))
    const marginPct = n(item.marginPercent) / 100;
    // Prevent divide by zero or negative if margin is 100% or more
    const ddpPriceUsd = marginPct < 1 ? n(unitCostUsd / (1 - marginPct)) : n(unitCostUsd);

    // VND rounded up to nearest 10,000
    const ddpPriceVndRaw = ddpPriceUsd * exchangeRate;
    const ddpPriceVnd = Math.ceil(n(ddpPriceVndRaw) / 10000) * 10000;

    const marginPerUnitUsd = n(ddpPriceUsd - unitCostUsd);

    totalCostUsd += n(totalItemCost);
    totalRevenueUsd += n(ddpPriceUsd * item.qty);

    return {
      ...item,
      apportionedLogistics: n(apportionedLogistics),
      apportionedBank: n(apportionedBank),
      apportionedInsurance: n(apportionedInsurance),
      dutyAmount: n(dutyAmount),
      commissionAmount: n(commissionAmount),
      citAmount: n(citAmount),
      unitCostUsd: n(unitCostUsd),
      ddpPriceUsd: n(ddpPriceUsd),
      ddpPriceVnd: n(ddpPriceVnd),
      marginPerUnitUsd: n(marginPerUnitUsd),
    };
  });

  const totalRevenueVnd = n(totalRevenueUsd * exchangeRate);
  const totalMarginUsd = n(totalRevenueUsd - totalCostUsd);
  const actualMarginPct =
    totalRevenueUsd > 0 ? n((totalMarginUsd / totalRevenueUsd) * 100) : 0;

  return {
    items: finalItems,
    totalWeight: n(totalWeight),
    totalLogisticsUsd: n(totalLogisticsUsd),
    totalBankFeeUsd: n(totalBankFeeUsd),
    totalInsuranceUsd: n(totalInsuranceUsd),
    totalCostUsd: n(totalCostUsd),
    totalRevenueUsd: n(totalRevenueUsd),
    totalRevenueVnd: n(totalRevenueVnd),
    totalMarginUsd: n(totalMarginUsd),
    actualMarginPct: n(actualMarginPct),
  };
}
