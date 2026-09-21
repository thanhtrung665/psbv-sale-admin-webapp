// src/lib/cbu/db/errors.ts
// Errors the CBU service throws; routes turn them into HTTP responses.

export class CbuHttpError extends Error {
  readonly status: number;
  /** Human-readable reasons (Vietnamese), e.g. every reason finalize was blocked. */
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "CbuHttpError";
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = "RFQ") => new CbuHttpError(404, `Không tìm thấy ${what}.`);
export const badInput = (message: string, details: string[] = []) => new CbuHttpError(400, message, details);
export const blocked = (message: string, details: string[]) => new CbuHttpError(422, message, details);
