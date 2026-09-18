/**
 * Zod schemas for Client CRUD.
 * Covers POST /api/clients and PUT /api/clients/[id].
 */
import { z } from "zod";
import { emailSchema, nonEmptyStringSchema, optionalStringSchema } from "./common.schemas";

export const createClientSchema = z.object({
  name: nonEmptyStringSchema,
  companyName: nonEmptyStringSchema,
  email: emailSchema,
  phone: optionalStringSchema,
  address: optionalStringSchema,
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

// Update uses the same required fields as create (the existing route
// requires name/companyName/email to all be present on every PUT).
export const updateClientSchema = createClientSchema;

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
