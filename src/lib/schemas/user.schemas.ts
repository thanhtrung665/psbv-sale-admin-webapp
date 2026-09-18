/**
 * Zod schemas for User management (Admin-only).
 * Mirrors the shapes accepted by src/app/api/users/route.ts.
 *
 * Note: these routes are not yet wired to validateBody() (out of scope for
 * this pass — see the 7 priority routes in the Zod validation plan) but the
 * schemas are defined here so future work / tests can rely on them.
 */
import { z } from "zod";
import { emailSchema, idParamSchema, nonEmptyStringSchema, roleSchema } from "./common.schemas";

export const createUserSchema = z.object({
  name: nonEmptyStringSchema,
  email: emailSchema,
  password: z.string().min(6, { message: "Mật khẩu phải ít nhất 6 ký tự." }),
  role: roleSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    id: idParamSchema,
    isActive: z.boolean().optional(),
    role: roleSchema.optional(),
  })
  .refine((data) => data.isActive !== undefined || data.role !== undefined, {
    message: "Không có trường nào để cập nhật.",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  id: idParamSchema,
  newPassword: z.string().min(6, { message: "Mật khẩu phải ít nhất 6 ký tự." }),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
