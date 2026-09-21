// src/lib/cbu/index.ts — public entry of the CBU engine v2 (SPEC §11).
//
// Pure functions, relative imports only → identical behaviour in the browser, on the server and in Jest.

import { resolveParams } from "./params";
import { calculateDdpImport } from "./profiles/ddp-import";
import { calculateFcaDap } from "./profiles/fca-dap";
import type { CbuLineInput, CbuParamsInput, CbuResult } from "./types";

export * from "./types";
export { CBU_DEFAULTS } from "./defaults";
export { resolveParams } from "./params";
export { pctToFrac, roundUp, roundUpToStep } from "./math";

/**
 * Price a set of lines with the profile named in `params.profile`: DDP_IMPORT (Hoàng Sơn, default) or
 * FCA_DAP (Baker Hughes).
 */
export function calculateCbu(lines: CbuLineInput[], params: CbuParamsInput = {}): CbuResult {
  const resolved = resolveParams(params);
  return resolved.profile === "FCA_DAP" ? calculateFcaDap(lines, resolved) : calculateDdpImport(lines, resolved);
}
