/**
 * Validates the raw JSON Gemini returns for the 4 AI extraction modules (lib/gemini-*.ts), before it is trusted
 * as `ParsedInquiry` / `ParsedSupplierQuote` / `ParsedCustomerPo` / `ParsedCiplData`.
 *
 * Gemini is asked to follow an exact JSON schema in the system prompt, but nothing enforces it actually does:
 * a field can come back missing, null, the wrong type, or (seen in practice for the quote parser) under a
 * differently-capitalised key. `JSON.parse(...)` alone only proves the text is valid JSON, not that its shape
 * matches what the caller assumes — every field before this file was trusted via a bare `as ParsedX` cast.
 *
 * Each schema below defaults/coerces the same way the call sites already did by hand (`String(x || "")`,
 * `Number(x) || fallback`, `Array.isArray(x) ? x : []`), so wiring it in changes no observable behaviour — it
 * only replaces scattered ad-hoc coercion with one typed, testable definition, and turns a genuinely broken
 * response (not an object at all, `items` not an array) into a clear thrown error instead of a crash deep in a
 * `.map()` call or a `TypeError: undefined is not iterable`.
 */
import { z } from "zod";

/** `Number(v) || fallback` semantics: NaN, 0, undefined and null all become `fallback` — matches every call
 * site's old `Number(x) || 0` / `Number(x) || 1`, including its quirk of treating a real 0 as "not specified". */
const numDefault = (fallback: number) =>
  z.preprocess((v) => Number(v) || fallback, z.number());

/** `String(v || "")` semantics. Plain `z.coerce.string()` would turn a missing/null field into the literal
 * text "undefined"/"null" (it's just `String(v)`), which is not what the old `x || ""` fallbacks did. */
const strDefault = (fallback = "") =>
  z.preprocess((v) => (v === null || v === undefined || v === "" ? fallback : String(v)), z.string());

/** `lineNo` isn't defaulted per-field (it needs the array index) — done by `fillLineNumbers` below. */
const rawItemsArray = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => x !== null && typeof x === "object") : []),
    z.array(itemSchema)
  );

/** Fills a missing/non-positive `lineNo` with its 1-based position, same as the old `item.lineNo || idx + 1`. */
export function fillLineNumbers<T extends { lineNo?: number }>(items: T[]): (T & { lineNo: number })[] {
  return items.map((item, idx) => ({ ...item, lineNo: item.lineNo && item.lineNo > 0 ? item.lineNo : idx + 1 }));
}

// ─── parseInquiryWithGemini (lib/gemini-inquiry.ts) ───────────────────────────

export const geminiInquiryItemSchema = z.object({
  lineNo: z.coerce.number().int().positive().optional().catch(undefined),
  rawPartNumber: strDefault(),
  rawDescription: strDefault(),
  qty: numDefault(1),
  uom: strDefault("PCS"),
  supplier: strDefault(),
});

export const geminiInquirySchema = z.object({
  clientName: strDefault(),
  clientEmail: strDefault(),
  companyName: strDefault(),
  clientPhone: strDefault(),
  items: rawItemsArray(geminiInquiryItemSchema).catch([]),
});

export type GeminiInquiryOutput = z.infer<typeof geminiInquirySchema>;

// ─── parseSupplierQuoteWithGemini (lib/gemini-quote.ts) ───────────────────────
//
// Gemini has been observed echoing the schema's PascalCase field names instead of the requested camelCase
// (e.g. "UnitPrice" instead of "supplierUnitPrice") — normalise both spellings to the canonical key first.

const normaliseQuoteItem = (raw: unknown) => {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    partNumber: r.partNumber ?? r.PartNumber,
    description: r.description ?? r.Description,
    supplierUnitPrice: r.supplierUnitPrice ?? r.UnitPrice,
    netWeightLbs: r.netWeightLbs ?? r.NetWeight,
    extWeightLbs: r.extWeightLbs ?? r.ExtWeight,
    leadTime: r.leadTime ?? r.LeadTime,
  };
};

export const geminiQuoteItemSchema = z.preprocess(
  normaliseQuoteItem,
  z.object({
    partNumber: strDefault(),
    description: strDefault(),
    supplierUnitPrice: numDefault(0),
    netWeightLbs: numDefault(0),
    extWeightLbs: numDefault(0),
    leadTime: strDefault(),
  })
);

export const geminiSupplierQuoteSchema = z.object({
  supplierQuoteCode: strDefault(),
  supplierName: strDefault(),
  items: rawItemsArray(geminiQuoteItemSchema).catch([]),
});

export type GeminiSupplierQuoteOutput = z.infer<typeof geminiSupplierQuoteSchema>;

// ─── parseCustomerPoWithGemini (lib/gemini-po.ts) ─────────────────────────────

export const geminiPoItemSchema = z.object({
  lineNo: z.coerce.number().int().positive().optional().catch(undefined),
  partNumber: strDefault(),
  description: strDefault(),
  qty: numDefault(1),
  uom: strDefault("PCS"),
  agreedDdpPrice: numDefault(0),
  deliveryDate: strDefault(),
});

export const geminiCustomerPoSchema = z.object({
  poNumber: strDefault(),
  customerName: strDefault(),
  deliveryDate: strDefault(),
  currency: strDefault("USD"),
  items: rawItemsArray(geminiPoItemSchema).catch([]),
});

export type GeminiCustomerPoOutput = z.infer<typeof geminiCustomerPoSchema>;

// ─── extractCiplFromPdf (lib/gemini-cipl.ts) ──────────────────────────────────

export const geminiCiplItemSchema = z.object({
  part_no: strDefault(),
  description: strDefault(),
  hs_code: strDefault(),
  quantity: strDefault(),
  country_origin: strDefault(),
  uom: strDefault(),
  unit_price: strDefault(),
  ext_price: strDefault(),
  batch_no: strDefault(),
  net_weight: strDefault(),
});

export const geminiCiplSchema = z.object({
  invoice_no: strDefault(),
  invoice_date: strDefault(),
  po_no: strDefault(),
  po_date: strDefault(),
  incoterm: strDefault(),
  mot: strDefault(),
  pol: strDefault(),
  pod: strDefault(),
  consignee_name: strDefault(),
  consignee_address: strDefault(),
  consignee_attn: strDefault(),
  consignee_email: strDefault(),
  consignee_tel: strDefault(),
  items: rawItemsArray(geminiCiplItemSchema).catch([]),
  total_amount: strDefault(),
  total_weight_lbs: strDefault(),
  number_of_box: strDefault(),
  box_dimension: strDefault(),
  shipping_mark_product: strDefault(),
});

export type GeminiCiplOutput = z.infer<typeof geminiCiplSchema>;
