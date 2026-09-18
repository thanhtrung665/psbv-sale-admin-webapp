/**
 * Shared request-validation helpers built on top of Zod.
 *
 * Usage in an API route:
 *
 *   import { updateRfqSchema } from "@/lib/schemas";
 *   import { validateBody, validatePathParam } from "@/lib/validation";
 *
 *   const idCheck = validatePathParam(params.id, "id");
 *   if (!idCheck.success) return idCheck.response;
 *
 *   const bodyCheck = await validateBody(req, updateRfqSchema);
 *   if (!bodyCheck.success) return bodyCheck.response;
 *
 *   await prisma.rFQ.update({ where: { id: idCheck.data }, data: bodyCheck.data });
 */
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError, ZodSchema } from "zod";
import { idParamSchema } from "./schemas/common.schemas";

export interface ValidationErrorItem {
  field: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/** Flattens a ZodError into a list of { field, message } pairs.
 * `field` is the dot-joined path (e.g. "items.0.qty"); the root-level
 * issues (object-level `.refine()` failures) use "_root". */
export function formatZodErrors(error: ZodError): ValidationErrorItem[] {
  return error.errors.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "_root",
    message: issue.message,
  }));
}

/** Builds the standard validation-failure JSON response used across the API. */
export function createValidationErrorResponse(
  error: ZodError | Error,
  statusCode: number = 400
): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        errors: formatZodErrors(error),
        message: "Validation failed",
      },
      { status: statusCode }
    );
  }

  return NextResponse.json(
    {
      success: false,
      errors: [{ field: "_root", message: error.message }],
      message: "Validation failed",
    },
    { status: statusCode }
  );
}

/** Parses the request body as JSON and validates it against `schema`.
 * Handles malformed JSON (empty body, non-JSON payload) as a 400 as well,
 * rather than letting it bubble up as an unhandled exception. */
export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          errors: [{ field: "_root", message: "Body phải là JSON hợp lệ." }],
          message: "Validation failed",
        },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: createValidationErrorResponse(result.error) };
  }

  return { success: true, data: result.data };
}

/** Validates URL search params against `schema`. Multi-value params are
 * passed through as their last occurrence (standard URLSearchParams.get()
 * behaviour) — schemas needing arrays should read `url.searchParams.getAll()`
 * separately. */
export function validateQuery<T>(url: URL, schema: ZodSchema<T>): ValidationResult<T> {
  const queryObject = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(queryObject);
  if (!result.success) {
    return { success: false, response: createValidationErrorResponse(result.error) };
  }

  return { success: true, data: result.data };
}

/** Validates a single dynamic-route param (e.g. `params.id`).
 * Defaults to requiring a non-empty string; pass a stricter schema (e.g.
 * `uuidSchema`) when the param must be a specific format. */
export function validatePathParam(
  param: string | undefined,
  fieldName: string,
  schema: ZodSchema<string> = idParamSchema
): ValidationResult<string> {
  const result = schema.safeParse(param);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          errors: [{ field: fieldName, message: `${fieldName} không hợp lệ.` }],
          message: "Validation failed",
        },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: result.data };
}

// Re-exported for convenience so callers rarely need a separate `import { z }`.
export { z, ZodError, ZodSchema };
