// src/lib/cbu/finalize.ts
// The rule that decides whether a CBU may be finalized. Pure, so the server (authority) and the workspace (preflight,
// to tell the user before they click) apply exactly the same rule.

import { n } from "./math";
import type { CbuLineInput, CbuResult } from "./types";

/** Reasons a CBU cannot be finalized (empty = OK). SPEC §11.8: checks OK, every line priced and weighed. */
export function finalizeBlockers(lines: CbuLineInput[], result: CbuResult): string[] {
  const reasons: string[] = [];
  if (lines.length === 0) return ["Chưa có dòng hàng nào để tính CBU."];

  for (const c of result.checks) {
    if (!c.ok) reasons.push(`Đối soát ${c.id} lệch (${c.label}): ${c.delta}`);
  }
  result.lines.forEach((l, i) => {
    const input = lines[i];
    const label = `Dòng ${l.lineNo}`;
    if (l.pricingFailed || l.ddpPriceUsd <= 0) reasons.push(`${label}: chưa có giá bán hợp lệ.`);
    if (n(input?.materialUsd) <= 0) reasons.push(`${label}: chưa có giá gốc (Material Cost).`);
    if (l.qty > 0 && n(input?.totalWeightLb) <= 0) reasons.push(`${label}: thiếu trọng lượng.`);
  });
  return reasons;
}
