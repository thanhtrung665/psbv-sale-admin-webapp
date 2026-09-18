/**
 * Zod schemas for Task CRUD.
 * Covers POST /api/tasks.
 */
import { z } from "zod";
import { idParamSchema, nonEmptyStringSchema, optionalStringSchema } from "./common.schemas";

export const createTaskSchema = z.object({
  title: nonEmptyStringSchema,
  description: optionalStringSchema,
  dueDate: optionalStringSchema,
  // Only respected when the caller is ADMIN (route enforces this); a
  // SALE_ADMIN's tasks always default to themselves regardless of this field.
  assigneeId: idParamSchema.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
