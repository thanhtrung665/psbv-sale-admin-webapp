import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import { geminiSupplierQuoteSchema } from "@/lib/schemas";

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-pro";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedQuoteItem {
  partNumber: string;
  description: string;
  supplierUnitPrice: number;
  netWeightLbs: number;
  extWeightLbs: number;
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
      "description": "Description of the part",
      "supplierUnitPrice": 0.00,
      "netWeightLbs": 0.00,
      "extWeightLbs": 0.00,
      "leadTime": "Lead time string e.g. '2-3 weeks' or '10 days'"
    }
  ]
}
3. supplierUnitPrice must be a number (USD), default 0 if not found.
4. netWeightLbs must be a number (lbs), default 0 if not found.
5. If a field is missing, use empty string "" for strings, 0 for numbers.
6. Extract ALL line items — do not skip any.
7. Do NOT convert currencies — use the price as printed.`;

// ─── Utilities ──────────────────────────────────────────────────────────────────

export function extractQuoteCodeFromFilename(fileName: string): string | null {
  const match1 = fileName.match(/(Quote|QT|QUOTATION|KET|NOV)[_\s-]*([A-Z0-9]+)/i);
  if (match1 && match1[1] && match1[2]) {
    const prefix = match1[1].toUpperCase();
    const finalPrefix = prefix === "QUOTE" ? "Quote" : prefix === "QUOTATION" ? "Quotation" : prefix;
    return `${finalPrefix} ${match1[2]}`;
  }

  const match2 = fileName.match(/([A-Z0-9]{4,12})/i);
  if (match2 && match2[1]) return match2[1];

  return null;
}

// ─── Excel file handler ───────────────────────────────────────────────────────

function isExcelFile(mimeType: string | undefined, fileName: string | undefined): boolean {
  if (!mimeType && !fileName) return false;
  const excelMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/excel",
  ];
  const excelExtensions = [".xlsx", ".xls", ".csv"];

  if (mimeType && excelMimeTypes.includes(mimeType)) return true;
  if (fileName) {
    const lower = fileName.toLowerCase();
    return excelExtensions.some((ext) => lower.endsWith(ext));
  }
  return false;
}

function parseExcelToCsv(buffer: Buffer): string {
  try {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("No sheets found in Excel file");
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const csvData = xlsx.utils.sheet_to_csv(worksheet);
    return csvData;
  } catch (err) {
    throw new Error(`Failed to parse Excel file: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export async function parseSupplierQuoteWithGemini(
  fileBuffer: Buffer,
  mimeType: string | undefined,
  fileName?: string
): Promise<ParsedSupplierQuote> {
  const config = await prisma.aiConfig.findFirst({ where: { name: "core" } });
  const apiKey = config?.apiKey || DEFAULT_API_KEY;
  const modelName = config?.modelName || DEFAULT_MODEL;
  let currentPrompt = config?.quotePrompt || SYSTEM_PROMPT;

  const effectiveMimeType = mimeType || "application/octet-stream";

  if (fileName) {
    currentPrompt += `\n\nFile PDF này có tên là '${fileName}'. Hãy kết hợp trích xuất mã Quote Hãng (supplierQuoteCode) từ cả tên file VÀ Header/Tiêu đề của file PDF. Nếu tên file chứa chuỗi như 'KET_67373' hoặc 'Quote_67373', hãy ưu tiên sử dụng mã này làm 'supplierQuoteCode'.`;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: currentPrompt,
  });

  const parts: any[] = [];

  // Handle file input based on type
  if (isExcelFile(effectiveMimeType, fileName)) {
    // Convert Excel to CSV and send as text
    console.log("[gemini-quote] Processing Excel file as CSV");
    const csvData = parseExcelToCsv(fileBuffer);
    parts.push({
      text: `Extract all supplier quote data from the following CSV/Excel content:\n\n${csvData}`,
    });
  } else if (effectiveMimeType.includes("pdf") || effectiveMimeType.startsWith("image/")) {
    // Gemini supports PDF and images natively
    parts.push({
      inlineData: {
        mimeType: effectiveMimeType,
        data: fileBuffer.toString("base64"),
      },
    });
    parts.push({ text: "Extract all supplier quote data from this document." });
  } else {
    // Fallback: try as text
    console.warn(`[gemini-quote] Unsupported mimeType: ${effectiveMimeType}, treating as text`);
    const textContent = fileBuffer.toString("utf-8");
    parts.push({
      text: `Extract all supplier quote data from the following content:\n\n${textContent.substring(0, 10000)}`,
    });
  }

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts,
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

  const validated = geminiSupplierQuoteSchema.safeParse(raw);
  if (!validated.success) {
    throw new Error(`Gemini trả về dữ liệu sai định dạng: ${validated.error.message}`);
  }
  const parsed = validated.data;

  const filenameCode = fileName ? extractQuoteCodeFromFilename(fileName) : null;
  const finalQuoteCode = parsed.supplierQuoteCode || filenameCode || "";

  return {
    supplierQuoteCode: finalQuoteCode,
    supplierName: parsed.supplierName,
    items: parsed.items,
  };
}
