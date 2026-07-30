import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-pro";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedQuoteItem {
  partNumber: string;
  supplierUnitPrice: number;
  netWeightLbs: number;
  leadTime: string;
}

export interface ParsedSupplierQuote {
  supplierQuoteCode: string;
  supplierName: string;
  items: ParsedQuoteItem[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert procurement data extractor specializing in industrial supplier quotations.
Your job is to extract structured pricing data from supplier quote documents (PDF, Excel, or image).

CRITICAL RULES:
1. Return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.
2. Follow this EXACT schema:
{
  "supplierQuoteCode": "The supplier's quote reference number or ID",
  "supplierName": "Name of the supplier/manufacturer",
  "items": [
    {
      "partNumber": "Exact part number as printed",
      "supplierUnitPrice": 0.00,
      "netWeightLbs": 0.00,
      "leadTime": "Lead time string e.g. '2-3 weeks' or '10 days'"
    }
  ]
}
3. supplierUnitPrice must be a number (USD), default 0 if not found.
4. netWeightLbs must be a number (lbs), default 0 if not found.
5. If a field is missing, use empty string "" for strings, 0 for numbers.
6. Extract ALL line items — do not skip any.
7. Do NOT convert currencies — use the price as printed.`;

// ─── Parser ───────────────────────────────────────────────────────────────────

export async function parseSupplierQuoteWithGemini(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedSupplierQuote> {
  const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
  const apiKey = config?.apiKey || DEFAULT_API_KEY;
  const modelName = config?.modelName || DEFAULT_MODEL;
  const prompt = config?.quotePrompt || SYSTEM_PROMPT;

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
          { text: "Extract all supplier quote data from this document." },
        ],
      },
    ],
  });

  const rawText = result.response.text().trim();
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: ParsedSupplierQuote;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini trả về JSON không hợp lệ: ${rawText.substring(0, 200)}`);
  }

  return {
    supplierQuoteCode: parsed.supplierQuoteCode || "",
    supplierName: parsed.supplierName || "",
    items: (parsed.items || []).map((item: any) => ({
      partNumber: item.partNumber || "",
      supplierUnitPrice: Number(item.supplierUnitPrice) || 0,
      netWeightLbs: Number(item.netWeightLbs) || 0,
      leadTime: item.leadTime || "",
    })),
  };
}
