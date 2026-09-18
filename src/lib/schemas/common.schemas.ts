/**
 * Common Zod schemas shared across the API surface.
 *
 * Keep this file focused on small, reusable building blocks (ids, enums,
 * pagination, ...) — domain-specific shapes belong in their own
 * `*.schemas.ts` file and should import from here instead of redefining
 * primitives.
 */
import { z } from "zod";

/** Accepts any Prisma `cuid`/`uuid` style identifier. Our schema uses
 * `@default(uuid())` everywhere, so we validate the UUID shape, but we keep
 * the error message generic in case IDs change format later. */
export const uuidSchema = z.string().uuid({ message: "ID không hợp lệ." });

/** Loose identifier check for path params where we don't want to hard-fail
 * on format (e.g. legacy records) — just require a non-empty string. */
export const idParamSchema = z.string().trim().min(1, { message: "ID không được để trống." });

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "Email không được để trống." })
  .email({ message: "Email không hợp lệ." });

export const optionalEmailSchema = z
  .union([emailSchema, z.literal(""), z.null(), z.undefined()])
  .optional();

export const nonEmptyStringSchema = z.string().trim().min(1, { message: "Trường này không được để trống." });

/** Trimmed optional string — coerces "" to undefined so it plays nicely with
 * Prisma's optional-field semantics. */
export const optionalStringSchema = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((val) => (val === null || val === undefined || val === "" ? undefined : val))
  .optional();

export const positiveNumberSchema = z.number().finite().positive();

export const nonNegativeNumberSchema = z.number().finite().nonnegative();

/** RFQ lifecycle — mirrors `OrderStatus` in prisma/schema.prisma. */
export const orderStatusSchema = z.enum([
  "INQUIRY_RECEIVED",
  "RFO_PENDING_ADMIN",
  "RFO_SENT_TO_SUPPLIER",
  "SUPPLIER_QUOTED",
  "CBU_PENDING_ADMIN",
  "QUOTATION_DRAFTED",
  "QUOTED_TO_CLIENT",
]);

/** Mirrors `TaskStatus` in prisma/schema.prisma. */
export const taskStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);

/** Mirrors `Role` in prisma/schema.prisma. */
export const roleSchema = z.enum(["ADMIN", "SALE_ADMIN"]);

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;
