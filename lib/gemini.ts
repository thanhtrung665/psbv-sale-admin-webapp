import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

// Config defaults
const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-pro";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedInquiryItem {
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  qty: number;
  uom?: string;
  supplier?: string;
  standardPartNo?: string;
}

export interface ParsedInquiry {
  clientName: string;
  clientEmail: string;
  companyName: string;
  clientPhone: string;
  items: ParsedInquiryItem[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert B2B procurement data extractor for an industrial parts company.
Your ONLY job is to extract structured data from purchasing inquiries (PDF, image, email text, or Excel data).

CRITICAL RULES:
1. Return ONLY a valid JSON object — no markdown, no explanation, no extra text.
2. Always follow this exact schema:
{
  "clientName": "Full name of the contact person",
  "clientEmail": "Email address of the sender/contact",
  "companyName": "Company or organization name",
  "clientPhone": "Phone number, empty string if not found",
  "items": [
    {
      "lineNo": 1,
      "rawPartNumber": "Exact part number as written",
      "rawDescription": "Full description of the part",
      "qty": 1,
      "uom": "Unit of measure (e.g. PCS, EA, SET), default to PCS",
      "supplier": "Manufacturer or supplier name if specified, else empty"
    }
  ]
}
3. lineNo must start at 1 and increment.
4. qty must be a number (default 1 if not specified).
5. If a field is not found, use empty string "" for strings or 0 for numbers.
6. Extract ALL line items — do not skip any.`;

// ─── Parser function ──────────────────────────────────────────────────────────

export async function parseInquiryWithGemini(
  fileBuffer?: Buffer,
  mimeType?: string,
  textContent?: string
): Promise<ParsedInquiry> {
  const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
  const apiKey = config?.apiKey || DEFAULT_API_KEY;
  const modelName = config?.modelName || DEFAULT_MODEL;
  const prompt = config?.inquiryPrompt || SYSTEM_PROMPT;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: prompt,
  });

  const parts: any[] = [];

  // Add file part if provided (PDF, image, XLSX as base64)
  if (fileBuffer && mimeType) {
    parts.push({
      inlineData: {
        mimeType,
        data: fileBuffer.toString("base64"),
      },
    });
  }

  // Add text content if provided (email paste, or supplemental text)
  if (textContent) {
    parts.push({ text: `Extract procurement inquiry data from the following content:\n\n${textContent}` });
  } else {
    parts.push({ text: "Extract all procurement inquiry data from the provided document." });
  }

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  const rawText = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: ParsedInquiry;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Gemini returned invalid JSON: ${rawText.substring(0, 200)}`);
  }

  const itemsWithMatch = await Promise.all(
    (parsed.items || []).map(async (item: any, idx: number) => {
      const lineNo = item.lineNo || idx + 1;
      const rawPartNumber = item.rawPartNumber || "";
      const rawDescription = item.rawDescription || "";
      const qty = Number(item.qty) || 1;
      let uom = item.uom || "PCS";
      const supplier = item.supplier || "";
      let standardPartNo = "";

      const { matchStandardPartNumber } = await import("./catalog-matcher");
      const match = await matchStandardPartNumber(rawDescription, rawPartNumber);
      if (match) {
        standardPartNo = match.standardPartNo;
        uom = match.uom || uom;
      }

      return {
        lineNo,
        rawPartNumber,
        rawDescription,
        qty,
        uom,
        supplier,
        standardPartNo,
      };
    })
  );

  // Validate and fill defaults
  return {
    clientName: parsed.clientName || "",
    clientEmail: parsed.clientEmail || "",
    companyName: parsed.companyName || "",
    clientPhone: parsed.clientPhone || "",
    items: itemsWithMatch,
  };
}
