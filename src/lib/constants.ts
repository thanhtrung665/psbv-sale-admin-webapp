// ============================================================
// SHARED CONSTANTS - Dùng chung cho toàn bộ ứng dụng
// ============================================================

/**
 * Danh sách Payment Terms chuẩn
 * Dùng cho: Inquiry form, Quotation config, MVPO config, v.v.
 */
export const PAYMENT_TERMS = [
  "100% Payment with Order",
  "100% Payment before Order",
  "100% within 30 days",
  "100% within 45 days",
  "100% within 60 days",
  "100% within 90 days",
  "50% PWO - 50% PBS",
  "30% PWO - 70% PBS",
] as const;

export type PaymentTerm = typeof PAYMENT_TERMS[number] | string;
