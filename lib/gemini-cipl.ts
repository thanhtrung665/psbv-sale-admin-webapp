import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-flash";

// ─── Types matching APITemplate CIPL template fields ─────────────────────────

export interface CiplItem {
  part_no: string;
  description: string;
  hs_code: string;
  quantity: string;
  country_origin: string;
  uom: string;
  unit_price: string;
  ext_price: string;
  batch_no: string;
  net_weight: string;
}

export interface ParsedCiplData {
  invoice_no: string;
  invoice_date: string;
  po_no: string;
  po_date: string;
  incoterm: string;
  mot: string;
  pol: string;
  pod: string;
  consignee_name: string;
  consignee_address: string;
  consignee_attn: string;
  consignee_email: string;
  consignee_tel: string;
  items: CiplItem[];
  total_amount: string;
  total_weight_lbs: string;
  number_of_box: string;
  box_dimension: string;
  shipping_mark_product: string;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert logistics document data extractor specializing in Commercial Invoice and Packing List (CIPL) documents.

Your job is to extract all structured data from the provided CIPL PDF document.

CRITICAL RULES:
1. Return ONLY a valid JSON object -- no markdown fences, no explanation text.
2. Follow this EXACT schema with EXACT field names:

{
  "invoice_no": "Commercial Invoice number",
  "invoice_date": "Invoice date as printed e.g. 30-Jul-2026",
  "po_no": "Purchase Order number",
  "po_date": "PO date as printed",
  "incoterm": "Full incoterm string e.g. FCA HOUSTON, USA",
  "mot": "Mode of Transport e.g. Air Freight or Sea Freight",
  "pol": "Port of Loading location",
  "pod": "Port of Discharge location",
  "consignee_name": "Name of the consignee/buyer company",
  "consignee_address": "Full consignee address",
  "consignee_attn": "Attention person name at consignee",
  "consignee_email": "Consignee email address",
  "consignee_tel": "Consignee phone/tel",
  "items": [
    {
      "part_no": "Part or item number",
      "description": "Full item description",
      "hs_code": "HS Tariff Code",
      "quantity": "Quantity as number string e.g. 144",
      "country_origin": "Country of origin e.g. USA",
      "uom": "Unit of measure e.g. Ea or PCS or SET",
      "unit_price": "Unit price as decimal string e.g. 6.00",
      "ext_price": "Extended/total price as decimal string e.g. 864.00",
      "batch_no": "Batch number e.g. BATCH: TF or empty string if not found",
      "net_weight": "Net weight per line item in lbs as decimal string e.g. 92.16"
    }
  ],
  "total_amount": "Total invoice amount with formatting e.g. 1,116.00",
  "total_weight_lbs": "Total weight in lbs as string e.g. 24.00",
  "number_of_box": "Number of packages/boxes e.g. 1 BOX or 3 BOXES",
  "box_dimension": "Box dimensions string e.g. 1 BOX - 12 X 9 X 6",
  "shipping_mark_product": "Shipping marks and product description"
}

3. Extract ALL line items -- do not skip any.
4. For missing fields, use empty string "".
5. Preserve prices exactly as printed (with decimal points).
6. If MOT/POL/POD are not explicitly labeled, infer from context.
7. shipping_mark_product: combine shipping marks and product name if present.
8. batch_no: Look for "BATCH:" labels or batch/lot identifiers per item. If not found, use empty string.
9. net_weight: Extract the net weight (lbs) for each individual line item. This is often in a separate column from the extended price.`;

// ─── Main extraction function ─────────────────────────────────────────────────

export async function extractCiplFromPdf(
  pdfBuffer: Buffer,
  apiKey?: string
): Promise<ParsedCiplData> {
  const key = apiKey || DEFAULT_API_KEY;
  if (!key) throw new Error("Missing Gemini API key for CIPL extraction.");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

  const pdfBase64 = pdfBuffer.toString("base64");

  const result = await model.generateContent([
    {
      inlineData: {
        data: pdfBase64,
        mimeType: "application/pdf",
      },
    },
    SYSTEM_PROMPT,
  ]);

  const rawText = result.response.text().trim();

  // Strip markdown fences if Gemini wraps output in ```json ... ```
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: ParsedCiplData;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON format. Raw output: " + cleaned.substring(0, 300)
    );
  }

  // Ensure items array exists
  if (!Array.isArray(parsed.items)) {
    parsed.items = [];
  }

  return parsed;
}
