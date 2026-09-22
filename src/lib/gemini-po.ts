import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { fillLineNumbers, geminiCustomerPoSchema } from "@/lib/schemas";

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-pro";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedPoItem {
  lineNo: number;
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  /** Agreed DDP unit price (USD) from the PO — may be 0 if not priced */
  agreedDdpPrice: number;
  /** Requested delivery date per line, free-text as printed */
  deliveryDate: string;
}

export interface ParsedCustomerPo {
  /** Customer's own PO number */
  poNumber: string;
  /** Name of the issuing company */
  customerName: string;
  /** Overall requested delivery date (header-level) */
  deliveryDate: string;
  /** Currency code as printed, e.g. "USD", "VND" */
  currency: string;
  items: ParsedPoItem[];
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert B2B procurement data extractor specializing in customer Purchase Orders (PO).
Your job is to extract structured order data from customer PO documents (PDF, Excel, image, or email text).

CRITICAL RULES:
1. Return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.
2. Follow this EXACT schema:
{
  "poNumber": "Customer's PO reference number",
  "customerName": "Issuing company name",
  "deliveryDate": "Requested delivery date (header level), empty string if not found",
  "currency": "Currency code as printed (USD, VND, EUR), default USD",
  "items": [
    {
      "lineNo": 1,
      "partNumber": "Exact part number as printed",
      "description": "Full description of the part",
      "qty": 1,
      "uom": "Unit of measure (PCS, EA, SET), default PCS",
      "agreedDdpPrice": 0.00,
      "deliveryDate": "Per-line delivery date, empty string if not specified"
    }
  ]
}
3. agreedDdpPrice must be a number (USD or as printed), default 0 if not found.
4. lineNo must start at 1 and increment.
5. qty must be a number (default 1 if not specified).
6. If a field is missing, use empty string "" for strings, 0 for numbers.
7. Extract ALL line items — do not skip any.
8. Do NOT convert currencies — use the price as printed.
9. poNumber is the most important field — extract it precisely from headers, footers, or PO title.`;

// ─── Parser ───────────────────────────────────────────────────────────────────

export async function parseCustomerPoWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<ParsedCustomerPo> {
  const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
  const apiKey = config?.apiKey || DEFAULT_API_KEY;
  const modelName = config?.modelName || DEFAULT_MODEL;
  let prompt = SYSTEM_PROMPT;

  if (fileName) {
    prompt += `\n\nFile name: '${fileName}'. Use the file name as a hint to find the PO reference number if needed.`;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: prompt,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: fileBuffer.toString("base64"),
            },
          },
          { text: "Extract all customer PO data from this document." },
        ],
      },
    ],
  });

  const rawText = result.response.text().trim();
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini trả về JSON không hợp lệ: ${rawText.substring(0, 200)}`);
  }

  const validated = geminiCustomerPoSchema.safeParse(raw);
  if (!validated.success) {
    throw new Error(`Gemini trả về dữ liệu sai định dạng: ${validated.error.message}`);
  }
  const parsed = validated.data;

  return {
    poNumber: parsed.poNumber,
    customerName: parsed.customerName,
    deliveryDate: parsed.deliveryDate,
    currency: parsed.currency,
    items: fillLineNumbers(parsed.items),
  };
}
