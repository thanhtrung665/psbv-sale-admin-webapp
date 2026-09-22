// src/lib/agent/draft-quotation-email.ts
// v1 of the Email Review Agent (SPEC.md §13): drafts the subject/body for the Quotation email sent to a
// client, using Gemini. NEVER sends anything — the caller always shows the draft to a human for edit/approve
// before it goes out through the existing sendEmailViaGraph-backed routes. Deliberately scoped to this one
// use case rather than a general multi-tool agent (SPEC.md §13.2).

import { GoogleGenerativeAI } from "@google/generative-ai";
import { draftQuotationEmailOutputSchema, type DraftQuotationEmailOutput } from "@/lib/schemas/agent.schemas";

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface QuotationEmailItem {
  partNumber: string;
  description: string;
  qty: number;
}

export interface QuotationEmailContext {
  rfqCode: string;
  clientName: string;
  companyName: string;
  incoTerm: string | null;
  paymentTerm: string | null;
  totalRevenueUsd: number;
  /** Full line list; only the first 10 are put in the prompt (SPEC.md §13.3 — keep the prompt compact). */
  items: QuotationEmailItem[];
  senderName?: string;
}

const SYSTEM_PROMPT = `You are a sales assistant drafting a quotation email for an industrial B2B trading company
(PSBV Trading & Service Co., Ltd) to send to one of its clients. You draft ONLY — a human always reviews and
edits before anything is sent, so it is fine to be a little generic; clarity beats cleverness.

Return ONLY a valid JSON object — no markdown fences, no explanation, no extra text — with this exact shape:
{
  "subject": "a short, professional email subject line",
  "bodyHtml": "the email body as simple HTML (p, strong, ul/li, table tags only — no <script>, no <style>, no full <html>/<head>/<body> wrapper)"
}

Rules:
- Write in the language the client's company name / context suggests; default to English if unclear.
- Mention the quotation reference (RFQ code), that the quotation is attached, and invite questions.
- Do NOT invent prices, item counts, or terms beyond what is given in the context below — if a field is
  empty, omit it gracefully rather than writing "undefined" or a placeholder.
- Keep it concise: a short greeting, 2-4 sentences, a closing line. No signature block (added separately).`;

function buildUserPrompt(ctx: QuotationEmailContext): string {
  const lines = [
    `RFQ code: ${ctx.rfqCode}`,
    `Client contact: ${ctx.clientName || "(not given)"}`,
    `Client company: ${ctx.companyName || "(not given)"}`,
    ctx.incoTerm ? `Incoterm: ${ctx.incoTerm}` : null,
    ctx.paymentTerm ? `Payment term: ${ctx.paymentTerm}` : null,
    ctx.totalRevenueUsd > 0 ? `Total quotation value: $${ctx.totalRevenueUsd.toFixed(2)} USD` : null,
    ctx.items.length > 0
      ? `Line items (${ctx.items.length} total, showing up to 10):\n` +
        ctx.items
          .slice(0, 10)
          .map((i) => `- ${i.partNumber || "(no part no.)"}: ${i.description || ""} x${i.qty}`)
          .join("\n")
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function draftQuotationEmailWithGemini(
  ctx: QuotationEmailContext,
  deps: { apiKey?: string; modelName?: string } = {}
): Promise<DraftQuotationEmailOutput> {
  const apiKey = deps.apiKey || DEFAULT_API_KEY;
  const modelName = deps.modelName || DEFAULT_MODEL;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_PROMPT });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(ctx) }] }],
  });

  const rawText = result.response.text().trim();
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini trả về JSON không hợp lệ: ${rawText.substring(0, 200)}`);
  }

  const validated = draftQuotationEmailOutputSchema.safeParse(raw);
  if (!validated.success) {
    throw new Error(`Gemini trả về dữ liệu sai định dạng: ${validated.error.message}`);
  }
  return validated.data;
}
