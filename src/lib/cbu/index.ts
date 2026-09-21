// src/lib/cbu/index.ts — public entry of the CBU engine v2 (SPEC §11).
//
// Pure functions, relative imports only → identical behaviour in the browser, on the server and in Jest.

import { resolveParams } from "./params";
import { calculateDdpImport } from "./profiles/ddp-import";
import type { CbuLineInput, CbuParamsInput, CbuResult } from "./types";

export * from "./types";
export { CBU_DEFAULTS } from "./defaults";
export { resolveParams } from "./params";
export { pctToFrac, roundUp, roundUpToStep } from "./math";

/**
 * Price a set of lines. Profile DDP_IMPORT (Hoàng Sơn). The FCA_DAP profile (Baker Hughes)
 * arrives with SPEC §11.11 phase C4.
 */
export function calculateCbu(lines: CbuLineInput[], params: CbuParamsInput = {}): CbuResult {
  return calculateDdpImport(lines, resolveParams(params));
}
