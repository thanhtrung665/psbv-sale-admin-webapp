// src/lib/cbu/db/http.ts
// Turns service errors into JSON responses for the CBU routes. Unknown errors are logged, never leaked.

import { NextResponse } from "next/server";
import { CbuHttpError } from "./errors";

export function cbuErrorResponse(err: unknown, tag: string, opts: { flattenDetails?: boolean } = {}): NextResponse {
  if (err instanceof CbuHttpError) {
    // The pre-v2 page only shows `error`, so the legacy alias asks for the reasons to be folded into it.
    const error = opts.flattenDetails && err.details.length > 0 ? `${err.message} ${err.details.join(" ")}` : err.message;
    return NextResponse.json({ error, details: err.details }, { status: err.status });
  }
  console.error(`[${tag}]`, err);
  return NextResponse.json({ error: "Có lỗi xảy ra khi xử lý CBU." }, { status: 500 });
}
