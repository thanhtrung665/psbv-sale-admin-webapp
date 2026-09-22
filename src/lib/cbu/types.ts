// src/lib/cbu/types.ts
// Public types of the CBU engine v2 (SPEC §11).
//
// UNIT CONVENTIONS (SPEC §11.6):
//  - every *Pct field is a percent number: 3 = 3%
//  - weight input is the TOTAL weight of the line in pounds (Excel col F = RFQItem.extWeightLbs)
//  - money is USD unless the name ends in Vnd

export type CbuMode = "MARGIN_INPUT" | "PRICE_INPUT";

/** DDP_IMPORT = Hoàng Sơn (Air/Sea, duty, commission…). FCA_DAP = Baker Hughes (FCA + DAP, payment terms). SPEC §11.3. */
export type CbuProfile = "DDP_IMPORT" | "FCA_DAP";
/** FCA_DAP only: which of the two prices is saved on the lines / totals that the Quotation reads. */
export type QuoteBasis = "FCA" | "DAP";

/** One priced line (Excel "Margin Analysis" row). */
export interface CbuLineInput {
  id: string;
  lineNo?: number;
  qty: number;
  /** Supplier price per unit, USD (Excel col H). */
  materialUsd: number;
  /** TOTAL weight of the whole line, lb (Excel col F). */
  totalWeightLb: number;
  /** Import duty rate, percent of (material + allocated logistics) (Excel col I). */
  dutyPct?: number;
  /** Margin % override for this line. null/undefined = use the target margin. 0 is a real 0%. */
  marginPctOverride?: number | null;
  /** Margin $/unit override (> 0 wins over every % margin). null/undefined/0 = not used. */
  marginUsdOverride?: number | null;
  /** DDP price typed by the user — only read in PRICE_INPUT mode. FCA_DAP: the FCA price. */
  ddpPriceUsdInput?: number | null;
  /** FCA_DAP + PRICE_INPUT: the DAP price typed for this line. */
  dapPriceUsdInput?: number | null;
  /** Extra cost per unit, USD (custom columns collapsed by the caller). Default 0. */
  customUsd?: number;
}

export interface LogisticsParams {
  /** All-in freight. When > 0 it replaces fixed + rate × chargeable weight. */
  freightAllInUsd: number;
  freightFixedUsd: number;
  freightRatePerKg: number;
  /** Chargeable / volumetric weight quoted by the forwarder, kg. */
  chargeableKg: number;
  clearanceUsd: number;
  inlandUsd: number;
  /** Any other shipment-level charge. Default 0 (Excel has none). */
  otherUsd: number;
}

export interface InsuranceParams {
  /** Insured value as % of (goods + freight). */
  insuredValuePct: number;
  /** Premium rate on the insured value, percent (0.01 = 0.01%). */
  ratePct: number;
  minUsd: number;
}

export interface BankParams {
  remitRatePct: number;
  /** VAT multiplier applied to the remittance fee (1.1). */
  remitVatFactor: number;
  minRemitUsd: number;
  receiveRatePct: number;
  /** VAT multiplier applied to the receive fee (1.0 in the md). */
  receiveVatFactor: number;
  minReceiveUsd: number;
  /**
   * Base of the inbound fee (contract value, USD). MUST be typed by the user:
   * deriving it from computed revenue would re-create the revenue → bank fee → cost → revenue loop.
   */
  receiveBaseUsd: number;
  otherUsd: number;
}

export interface CbuParams {
  profile: CbuProfile;
  /** FCA_DAP only. */
  quoteBasis: QuoteBasis;
  mode: CbuMode;
  /** USD → VND rate used on the quotation. */
  fx: number;
  /** DDP VND prices round UP to a multiple of this. */
  vndRoundingStep: number;
  /** lb → kg (set 1 when weights are already in kg). */
  lbToKg: number;
  /** ROUNDUP decimals for the USD selling price (2 for DDP_IMPORT). */
  usdRoundingDecimals: number;

  /** Target margin on the selling price, percent. Used by lines without an override. */
  targetMarginPct: number;
  /** Commission, percent of the SELLING price. */
  commissionPct: number;
  /** CIT, percent of the COMMISSION amount. */
  citPct: number;

  /** "Local" waives the outbound remittance fee. */
  goodsOrigin: string;
  /** "VN" waives the inbound receive fee. */
  destinationCountry: string;

  /** Share of the material value that is financed, percent. */
  pctFinanced: number;
  /** Annual interest rate, percent. */
  interestPct: number;
  financingDays: number;
  daysPerYear: number;

  logistics: LogisticsParams;
  insurance: InsuranceParams;
  bank: BankParams;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
/** What callers pass in: every field optional, missing ones take `CBU_DEFAULTS`. */
export type CbuParamsInput = DeepPartial<CbuParams>;

/** FCA_DAP: one of the two price blocks of a line (FCA or DAP). */
export interface CbuBasisBlock {
  /** Allocated bank fees (+ credit interest for DAP). */
  financialUsd: number;
  unitCostUsd: number;
  priceUsd: number;
  marginPerUnitUsd: number;
  /** Realised margin on the price, 0-100. */
  marginPct: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  totalMarginUsd: number;
  pricingFailed: boolean;
}

export interface CbuLineResult {
  id: string;
  lineNo: number;
  qty: number;
  /** USD per unit unless stated otherwise. */
  materialUsd: number;
  /** Weight of ONE unit, kg (Excel col G). */
  weightKgPerUnit: number;
  /** Financing cost part of the bank fee. */
  financingUsd: number;
  /** Excel col J: financing + allocated bank fees. */
  bankFeeUsd: number;
  /** Excel col K: allocated (freight + clearance + inland + insurance). */
  logisticsUsd: number;
  /** Informational: the insurance share already INCLUDED in `logisticsUsd`. Never add it again. */
  insuranceUsd: number;
  dutyUsd: number;
  customUsd: number;
  commissionUsd: number;
  citUsd: number;
  unitCostUsd: number;
  ddpPriceUsd: number;
  ddpPriceVnd: number;
  marginPerUnitUsd: number;
  /** Realised margin on the selling price, 0-100. */
  marginPct: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  totalRevenueVnd: number;
  totalMarginUsd: number;
  /** True when no selling price could be derived (no price typed / margin + commission ≥ 100%). */
  pricingFailed: boolean;
  warnings: string[];
  /** FCA_DAP: both blocks. The primary fields above equal the block of `params.quoteBasis`. */
  fca?: CbuBasisBlock;
  dap?: CbuBasisBlock;
}

export interface CbuPools {
  totalWeightKg: number;
  totalMaterialUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  /** freight + clearance + inland + other + insurance — the pool allocated by weight. */
  logisticsPoolUsd: number;
  remittanceFeeUsd: number;
  receiveFeeUsd: number;
  otherBankFeeUsd: number;
  /** remittance + receive + other — the pool allocated by material value. */
  bankTotalUsd: number;
}

export interface CbuTotals {
  qty: number;
  weightKg: number;
  materialUsd: number;
  bankFeeUsd: number;
  financingUsd: number;
  logisticsUsd: number;
  dutyUsd: number;
  commissionUsd: number;
  citUsd: number;
  costUsd: number;
  revenueUsd: number;
  revenueVnd: number;
  marginUsd: number;
  /** Nominal margin on USD revenue, 0-100. */
  marginPct: number;
}

/** Self-check (Excel "CHECK" rows). `delta` is 0 when everything is consistent. */
export interface CbuCheck {
  id: "C1" | "C2" | "C3" | "C4";
  label: string;
  delta: number;
  ok: boolean;
  /** Line ids that broke the check, when applicable. */
  lineIds?: string[];
}

/** FCA_DAP: the DAP offer = goods at DAP prices + one lump-sum freight added at order level (Excel G16 = G15 + P16). */
export interface CbuDapSummary {
  goodsRevenueUsd: number;
  /** Freight used for quoting (typed). */
  freightUsd: number;
  /** Freight from the Logistic sheet, for reference. */
  freightReferenceUsd: number;
  /** |reference − quoted|; the workbook flags it as a warning when it is not 0. */
  freightMismatchUsd: number;
  totalUsd: number;
  costUsd: number;
  marginUsd: number;
  marginPct: number;
}

export interface CbuResult {
  /** The profile that produced this result (decides which blocks / columns exist). */
  profile: CbuProfile;
  lines: CbuLineResult[];
  pools: CbuPools;
  totals: CbuTotals;
  checks: CbuCheck[];
  warnings: string[];
  /** FCA_DAP only. */
  dap?: CbuDapSummary;
}
