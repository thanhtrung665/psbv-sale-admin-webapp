/**
 * Validates the raw JSON Gemini returns for the quotation-email draft (SPEC.md §13). Same reasoning as
 * gemini.schemas.ts: the prompt asks for an exact shape, nothing enforces the model actually returns it, so
 * every field is defaulted/coerced rather than trusted via a bare cast.
 */
import { z } from "zod";

const strDefault = (fallback = "") =>
  z.preprocess((v) => (v === null || v === undefined || v === "" ? fallback : String(v)), z.string());

export const draftQuotationEmailOutputSchema = z.object({
  subject: strDefault(),
  bodyHtml: strDefault(),
});

export type DraftQuotationEmailOutput = z.infer<typeof draftQuotationEmailOutputSchema>;
