/**
 * Zod schemas for the CBU v2 API (SPEC §11.8).
 *
 * Every percentage is a percent number (3 = 3%). Unknown keys are stripped — in particular any totals or
 * per-line RESULTS a client sends (`totalRevenueUsd`, `ddpPriceVnd`, …) never reach the service: the server
 * recomputes everything from the inputs below (SPEC §11.6-5).
 */
import { z } from "zod";

const money = z.number().finite().min(0).max(1e9);
const percent = (max = 100) => z.number().finite().min(0).max(max);
/** A margin must leave room for the price: strictly below 100%. */
const marginPercent = z.number().finite().min(0).lt(100);
const factor = z.number().finite().min(0).max(10);
const label = z.string().trim().min(1).max(50);

export const cbuModeSchema = z.enum(["MARGIN_INPUT", "PRICE_INPUT"]);

const logisticsSchema = z
  .object({
    freightAllInUsd: money,
    freightFixedUsd: money,
    freightRatePerKg: money,
    chargeableKg: money,
    clearanceUsd: money,
    inlandUsd: money,
    otherUsd: money,
  })
  .partial();

const insuranceSchema = z
  .object({
    insuredValuePct: percent(1000),
    ratePct: percent(100),
    minUsd: money,
  })
  .partial();

// `receiveVatFactor` and `usdRoundingDecimals` are policy constants, deliberately not client-editable / not persisted.
const bankSchema = z
  .object({
    remitRatePct: percent(100),
    remitVatFactor: factor,
    minRemitUsd: money,
    receiveRatePct: percent(100),
    minReceiveUsd: money,
    receiveBaseUsd: money,
    otherUsd: money,
  })
  .partial();

export const cbuParamsSchema = z
  .object({
    fx: z.number().finite().positive().max(1e6),
    vndRoundingStep: z.number().finite().min(0).max(1e6),
    lbToKg: z.number().finite().positive().max(10),
    targetMarginPct: marginPercent,
    commissionPct: z.number().finite().min(0).lt(100),
    citPct: percent(100),
    goodsOrigin: label,
    destinationCountry: label,
    pctFinanced: percent(100),
    interestPct: percent(1000),
    financingDays: z.number().finite().min(0).max(3650),
    daysPerYear: z.number().finite().min(1).max(400),
    logistics: logisticsSchema,
    insurance: insuranceSchema,
    bank: bankSchema,
  })
  .partial();

export const cbuItemEditSchema = z.object({
  id: z.string().trim().min(1),
  materialUsd: money.optional(),
  /** TOTAL weight of the line, lb. */
  totalWeightLb: z.number().finite().min(0).max(1e9).optional(),
  /** Weight of ONE unit, lb (used by the legacy page). Ignored when `totalWeightLb` is present. */
  weightLbPerUnit: z.number().finite().min(0).max(1e9).optional(),
  dutyPct: percent(100).optional(),
  /** null clears the override (= use the target margin). */
  marginPctOverride: marginPercent.nullable().optional(),
  marginUsdOverride: money.nullable().optional(),
  ddpPriceUsdInput: money.nullable().optional(),
});

/** Body of `PUT /api/rfq/[id]/cbu` and `POST /api/rfq/[id]/cbu/finalize`: INPUTS only. */
export const saveCbuSchema = z
  .object({
    mode: cbuModeSchema.optional(),
    params: cbuParamsSchema.optional(),
    items: z.array(cbuItemEditSchema).max(1000).optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    (body.items ?? []).forEach((it, index) => {
      if (seen.has(it.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "id"], message: `Dòng bị lặp: ${it.id}` });
      }
      seen.add(it.id);
    });
  });

export type CbuParamsBody = z.infer<typeof cbuParamsSchema>;
export type CbuItemEditBody = z.infer<typeof cbuItemEditSchema>;
export type SaveCbuInput = z.infer<typeof saveCbuSchema>;

// ─── Legacy body of POST /api/rfq/[id]/calculate-cbu (sent by the pre-v2 cbu-calc page) ─────────────────────
//
// The old page posts engine results too (`items[*].ddpPriceUsd`, `totalRevenueUsd`, …). They are NOT read:
// only the inputs below are taken, converted to `SaveCbuInput`, and re-validated by `saveCbuSchema`.

const lenient = z.number().finite().nullish();

export const legacyCalculateCbuSchema = z.object({
  finalize: z.boolean().optional(),
  cbuMode: cbuModeSchema.nullish(),
  exchangeRate: lenient,
  vndRoundingStep: lenient,
  lbToKg: lenient,
  goodsOrigin: z.string().nullish(),
  destinationCountry: z.string().nullish(),
  freightCost: lenient,
  freightFixed: lenient,
  freightRatePerKg: lenient,
  chargeableWeightKg: lenient,
  clearanceCost: lenient,
  inlandCost: lenient,
  docFee: lenient,
  insuredValuePercent: lenient,
  insuranceRatePercent: lenient,
  minInsuranceUsd: lenient,
  remittanceRatePercent: lenient,
  bankVatFactor: lenient,
  minRemittanceFeeUsd: lenient,
  receiveRatePercent: lenient,
  minReceiveFeeUsd: lenient,
  receiveBaseUsd: lenient,
  otherBankFeeUsd: lenient,
  percentValueFinanced: lenient,
  interestRatePercent: lenient,
  financingDays: lenient,
  daysPerYear: lenient,
  targetMarginPercent: lenient,
  commissionRate: lenient,
  citOnCommission: lenient,
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        supplierUnitPrice: lenient,
        /** Weight of ONE unit, lb. */
        netWeightLbs: lenient,
        dutyPercent: lenient,
        marginPercent: lenient,
        marginOverrideUsd: lenient,
        targetDdpPriceUsd: lenient,
      })
    )
    .max(1000)
    .optional(),
});

export type LegacyCalculateCbuBody = z.infer<typeof legacyCalculateCbuSchema>;
