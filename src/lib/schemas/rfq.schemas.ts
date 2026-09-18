/**
 * Zod schemas for the RFQ (Request for Quotation) domain.
 *
 * Covers:
 *  - POST /api/rfq/create-manual
 *  - POST /api/rfq/save-supplier-quote
 *  - POST /api/rfq/save-customer-po
 *  - PATCH /api/rfq/[id]
 */
import { z } from "zod";
import {
  emailSchema,
  nonEmptyStringSchema,
  optionalStringSchema,
  orderStatusSchema,
} from "./common.schemas";

// ─── POST /api/rfq/create-manual ────────────────────────────────────────────

export const manualRfqItemSchema = z.object({
  lineNo: z.number().int().positive().optional(),
  rawPartNumber: optionalStringSchema,
  rawDescription: optionalStringSchema,
  qty: z.coerce.number().positive({ message: "Số lượng phải lớn hơn 0." }).default(1),
  uom: optionalStringSchema,
});

export const createRfqManualSchema = z.object({
  clientName: nonEmptyStringSchema,
  clientEmail: emailSchema,
  companyName: optionalStringSchema,
  clientPhone: optionalStringSchema,
  opportunityName: optionalStringSchema,
  supplierName: optionalStringSchema,
  incoTerm: optionalStringSchema,
  paymentTerm: optionalStringSchema,
  rfqCode: optionalStringSchema,
  items: z
    .array(manualRfqItemSchema)
    .min(1, { message: "Vui lòng thêm ít nhất 1 sản phẩm." }),
});

export type CreateRfqManualInput = z.infer<typeof createRfqManualSchema>;

// ─── POST /api/rfq/save-supplier-quote ──────────────────────────────────────

export const supplierQuoteRowSchema = z.object({
  lineNo: z.number().int().nonnegative(),
  partNumber: optionalStringSchema,
  description: optionalStringSchema,
  qty: z.coerce.number().nonnegative(),
  unitPrice: z.coerce.number().nonnegative(),
  netWeightLbs: z.coerce.number().nonnegative().default(0),
  leadtime: optionalStringSchema,
  rfqItemId: z.string().trim().min(1).nullable().optional(),
});

export const saveSupplierQuoteSchema = z
  .object({
    rfqCode: optionalStringSchema,
    rfqId: optionalStringSchema,
    supplierQuoteCode: optionalStringSchema,
    supplierName: optionalStringSchema,
    rows: z.array(supplierQuoteRowSchema).min(1, { message: "Danh sách rows không được để trống." }),
  })
  .refine((data) => Boolean(data.rfqCode) || Boolean(data.rfqId), {
    message: "Thiếu rfqCode hoặc rfqId.",
    path: ["rfqId"],
  });

export type SaveSupplierQuoteInput = z.infer<typeof saveSupplierQuoteSchema>;

// ─── POST /api/rfq/save-customer-po ─────────────────────────────────────────

export const customerPoRowSchema = z.object({
  lineNo: z.number().int().nonnegative(),
  partNumber: optionalStringSchema,
  description: optionalStringSchema,
  qty: z.coerce.number().nonnegative(),
  uom: optionalStringSchema,
  agreedDdpPrice: z.coerce.number().nonnegative().default(0),
  deliveryDate: optionalStringSchema,
});

export const saveCustomerPoSchema = z
  .object({
    rfqCode: optionalStringSchema,
    rfqId: optionalStringSchema,
    poNumber: nonEmptyStringSchema,
    customerName: optionalStringSchema,
    deliveryDate: optionalStringSchema,
    currency: optionalStringSchema,
    rows: z.array(customerPoRowSchema).min(1, { message: "Danh sách rows không được để trống." }),
  })
  .refine((data) => Boolean(data.rfqCode) || Boolean(data.rfqId), {
    message: "Thiếu rfqCode hoặc rfqId.",
    path: ["rfqId"],
  });

export type SaveCustomerPoInput = z.infer<typeof saveCustomerPoSchema>;

// ─── PATCH /api/rfq/[id] ─────────────────────────────────────────────────────
//
// SECURITY: This schema is a strict allow-list of scalar RFQ fields that are
// safe for a client to mutate directly. Anything not listed here (id,
// rfqCode, clientId, createdById, approvedById, relations, timestamps,
// BigInt fields, ...) is silently stripped by Zod's default object parsing
// so it can never reach `prisma.rFQ.update()`.
export const updateRfqSchema = z
  .object({
    status: orderStatusSchema,
    opportunityName: optionalStringSchema,
    supplierName: optionalStringSchema,
    supplierAddress: optionalStringSchema,
    supplierPhone: optionalStringSchema,
    supplierEmail: z.union([emailSchema, z.literal(""), z.null()]).optional(),
    supplierQuoteCode: optionalStringSchema,
    poNumber: optionalStringSchema,
    incoTerm: optionalStringSchema,
    paymentTerm: optionalStringSchema,
    currency: optionalStringSchema,
    goodsOrigin: optionalStringSchema,
    destinationCountry: optionalStringSchema,
    exchangeRate: z.coerce.number().positive().optional(),
    bookingExchangeRate: z.coerce.number().positive().optional(),
    vndRoundingStep: z.coerce.number().positive().optional(),
    lbToKg: z.coerce.number().positive().optional(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Không có trường nào để cập nhật.",
  });

export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;
