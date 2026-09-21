// src/lib/cbu/checks.ts
// Self-checks — the Excel "CHECK" rows (must be 0). SPEC §11.4.
//   C1  unit cost = material + bank + logistics + duty (+ custom) + commission + CIT
//   C2  Σ qty × (bank fee − financing) = total bank fee pool
//   C3  Σ qty × logistics = logistics pool            (only when total weight > 0)
//   C4  MARGIN_INPUT: realised margin ≥ requested margin (ROUNDUP can only raise it)

import { activeMarginPct } from "./pricing";
import type { CbuCheck, CbuLineInput, CbuLineResult, CbuMode, CbuPools } from "./types";

const TOL = 1e-6;

export interface CheckInput {
  mode: CbuMode;
  lines: CbuLineResult[];
  inputs: CbuLineInput[];
  pools: CbuPools;
  targetMarginPct: number;
  /** Lines whose price could not be derived (already warned) — excluded from C4. */
  unpricedIds: Set<string>;
}

export function runChecks({ mode, lines, inputs, pools, targetMarginPct, unpricedIds }: CheckInput): CbuCheck[] {
  const checks: CbuCheck[] = [];

  // C1
  const c1Bad: string[] = [];
  let c1Max = 0;
  for (const l of lines) {
    const parts = l.materialUsd + l.bankFeeUsd + l.logisticsUsd + l.dutyUsd + l.customUsd + l.commissionUsd + l.citUsd;
    const d = Math.abs(l.unitCostUsd - parts);
    if (d > TOL) c1Bad.push(l.id);
    c1Max = Math.max(c1Max, d);
  }
  checks.push({
    id: "C1",
    label: "Unit Cost = Material + Bank + Logistics + Duty + Commission + CIT",
    delta: c1Max,
    ok: c1Bad.length === 0,
    ...(c1Bad.length ? { lineIds: c1Bad } : {}),
  });

  // C2
  const bankAllocated = lines.reduce((s, l) => s + l.qty * (l.bankFeeUsd - l.financingUsd), 0);
  const c2 = pools.totalMaterialUsd > 0 ? Math.abs(bankAllocated - pools.bankTotalUsd) : 0;
  checks.push({ id: "C2", label: "Phí ngân hàng phân bổ = Total Bank Fee", delta: c2, ok: c2 <= TOL * Math.max(1, pools.bankTotalUsd) });

  // C3
  const logisticsAllocated = lines.reduce((s, l) => s + l.qty * l.logisticsUsd, 0);
  const c3 = pools.totalWeightKg > 0 ? Math.abs(logisticsAllocated - pools.logisticsPoolUsd) : 0;
  checks.push({ id: "C3", label: "Logistics phân bổ = Pool logistics", delta: c3, ok: c3 <= TOL * Math.max(1, pools.logisticsPoolUsd) });

  // C4 — skipped for lines whose price could not be derived (they already carry a pricing warning).
  const c4Bad: string[] = [];
  let c4Max = 0;
  if (mode === "MARGIN_INPUT") {
    lines.forEach((l, i) => {
      if (unpricedIds.has(l.id)) return;
      const inp = inputs[i];
      const usd = Number(inp?.marginUsdOverride);
      let shortfall = 0;
      if (Number.isFinite(usd) && usd > 0) {
        shortfall = usd - l.marginPerUnitUsd;
      } else {
        const wanted = activeMarginPct(inp, targetMarginPct);
        shortfall = wanted - l.marginPct;
      }
      if (shortfall > 1e-7) c4Bad.push(l.id);
      c4Max = Math.max(c4Max, shortfall, 0);
    });
  }
  checks.push({
    id: "C4",
    label: "Margin thực ≥ margin yêu cầu",
    delta: c4Max,
    ok: c4Bad.length === 0,
    ...(c4Bad.length ? { lineIds: c4Bad } : {}),
  });

  return checks;
}
