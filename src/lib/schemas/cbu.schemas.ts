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
export const cbuProfileSchema = z.enum(["DDP_IMPORT", "FCA_DAP"]);
export const quoteBasisSchema = z.enum(["FCA", "DAP"]);

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

/**
 * A scenario = one logistics option over the SAME lines (Air / Sea). The FIRST scenario is the base: its logistics
 * live in `params.logistics` (flat RFQ columns), so its `overrides` are ignored. Later scenarios store only what
 * differs. Only `logistics` may vary per scenario for now. `prices` = the typed DDP price per line id (PRICE_INPUT).
 */
export const cbuScenarioSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/, "Mã kịch bản chỉ gồm chữ, số, - và _ (tối đa 32 ký tự)"),
  label: z.string().trim().min(1).max(40),
  // what may differ per scenario: logistics (Air / Sea) and the financing terms (Baker: Payment with Order / Net 60)
  overrides: z
    .object({
      logistics: logisticsSchema.optional(),
      pctFinanced: percent(100).optional(),
      interestPct: percent(1000).optional(),
      financingDays: z.number().finite().min(0).max(3650).optional(),
    })
    .optional(),
  prices: z.record(z.string().min(1).max(64), money).optional(),
  /** FCA_DAP: the typed DAP price per line id (`prices` are the FCA prices). */
  dapPrices: z.record(z.string().min(1).max(64), money).optional(),
});

/** Body of `PUT /api/rfq/[id]/cbu` and `POST /api/rfq/[id]/cbu/finalize`: INPUTS only. */
export const saveCbuSchema = z
  .object({
    mode: cbuModeSchema.optional(),
    /** Which CBU model (Hoàng Sơn DDP or Baker Hughes FCA/DAP). Omit to keep the stored one. */
    profile: cbuProfileSchema.optional(),
    /** FCA_DAP: which price is saved on the lines / totals. Omit to keep the stored choice. */
    quoteBasis: quoteBasisSchema.optional(),
    params: cbuParamsSchema.optional(),
    items: z.array(cbuItemEditSchema).max(1000).optional(),
    /** Omit to keep the stored scenarios; give the full list to add / remove / rename / re-price them. */
    scenarios: z.array(cbuScenarioSchema).min(1).max(4).optional(),
    /** The scenario priced into the saved item prices and RFQ totals (what the Quotation reads). */
    chosenScenarioId: cbuScenarioSchema.shape.id.optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    (body.items ?? []).forEach((it, index) => {
      if (seen.has(it.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "id"], message: `Dòng bị lặp: ${it.id}` });
      }
      seen.add(it.id);
    });
    const ids = new Set<string>();
    (body.scenarios ?? []).forEach((s, index) => {
      if (ids.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", index, "id"], message: `Kịch bản bị lặp: ${s.id}` });
      ids.add(s.id);
    });
    if (body.scenarios && body.chosenScenarioId && !ids.has(body.chosenScenarioId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chosenScenarioId"], message: "Kịch bản được chọn không nằm trong danh sách" });
    }
  });

export type CbuParamsBody = z.infer<typeof cbuParamsSchema>;
export type CbuItemEditBody = z.infer<typeof cbuItemEditSchema>;
export type SaveCbuInput = z.infer<typeof saveCbuSchema>;
