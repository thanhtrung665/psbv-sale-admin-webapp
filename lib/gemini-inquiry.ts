import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import { fillLineNumbers, geminiInquirySchema } from "@/lib/schemas";

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

// ─── Parser function ──────────────────────────────────────────────────────────

export async function parseInquiryWithGemini(
  fileBuffer?: Buffer,
  mimeType?: string,
  textContent?: string,
  fileName?: string
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

  // Handle file input
  if (fileBuffer && mimeType) {
    const isExcel = isExcelFile(mimeType, fileName);

    if (isExcel) {
      // Convert Excel to CSV text and send as text content
      console.log("[gemini-inquiry] Processing Excel file as CSV");
      const csvData = parseExcelToCsv(fileBuffer);
      parts.push({
        text: `Extract procurement inquiry data from the following CSV/Excel content:\n\n${csvData}`,
      });
    } else if (mimeType.includes("pdf") || mimeType.startsWith("image/")) {
      // Gemini supports PDF and images natively via inlineData
      parts.push({
        inlineData: {
          mimeType,
          data: fileBuffer.toString("base64"),
        },
      });
      parts.push({ text: "Extract all procurement inquiry data from the provided document." });
    } else {
      // Fallback: try as text
      console.warn(`[gemini-inquiry] Unsupported mimeType: ${mimeType}, treating as text`);
      parts.push({
        text: `Extract procurement inquiry data from the following content:\n\n${fileBuffer.toString("utf-8").substring(0, 5000)}`,
      });
    }
  }

  // Add text content if provided (email paste, or supplemental text)
  if (textContent) {
    parts.push({
      text: `Extract procurement inquiry data from the following content:\n\n${textContent}`,
    });
  } else if (parts.length === 0) {
    parts.push({ text: "Extract all procurement inquiry data from the provided document." });
  }

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  const rawText = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Gemini returned invalid JSON: ${rawText.substring(0, 200)}`);
  }

  const validated = geminiInquirySchema.safeParse(raw);
  if (!validated.success) {
    throw new Error(`Gemini returned an unexpected data shape: ${validated.error.message}`);
  }
  const parsed = validated.data;

  const itemsWithMatch = await Promise.all(
    fillLineNumbers(parsed.items).map(async (item) => {
      let uom = item.uom;
      let standardPartNo = "";

      try {
        const { matchStandardPartNumber } = await import("./catalog-matcher");
        const match = await matchStandardPartNumber(item.rawDescription, item.rawPartNumber);
        if (match) {
          standardPartNo = match.standardPartNo;
          uom = match.uom || uom;
        }
      } catch (matchErr) {
        console.warn("[gemini-inquiry] Catalog matching failed, skipping:", matchErr);
      }

      return { ...item, uom, standardPartNo };
    })
  );

  return {
    clientName: parsed.clientName,
    clientEmail: parsed.clientEmail,
    companyName: parsed.companyName,
    clientPhone: parsed.clientPhone,
    items: itemsWithMatch,
  };
}
