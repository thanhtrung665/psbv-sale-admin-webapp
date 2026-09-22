// src/lib/cbu/profiles/fca-dap.ts
// Profile FCA_DAP — Baker Hughes (Malaysia) · AC0481 (Excel sheets "MA - Payment w Order" and "MA - Net 60 Days").
// Formulas: SPEC §11.5, checked against the four Baker markdown workbooks (see __tests__/cbu/fca-dap.golden.test.ts).
//
// Each line has TWO price blocks over the same material cost:
//   FCA  financial = bank fees allocated by material value
//        unit cost = material + financial
//   DAP  financial = the same + credit interest  (material × %financed × interest × days ÷ daysPerYear)
//        unit cost = material + financial
//   price = ROUNDUP(unit cost ÷ (1 − margin), 0)   (PRICE_INPUT: typed)
// The DAP offer adds ONE lump-sum freight at order level (Excel G16 = G15 + P16); the freight is never per unit.
// No duty, commission, CIT, insurance or weight allocation exist in this profile.
//
// Payment terms are the scenarios: Payment with Order = 0% financed / 0 days, Net 60 = 100% · 15% · 45 days.

import { EPS, n, pctToFrac, roundUp, roundUpToStep, safeDiv } from "../math";
import { computeBankPool, financingRate } from "../pools";
import { activeMarginPct } from "../pricing";
import type { CbuBasisBlock, CbuCheck, CbuDapSummary, CbuLineInput, CbuLineResult, CbuParams, CbuPools, CbuResult, CbuTotals } from "../types";

const TOL = 1e-6;

interface BlockArgs {
  line: CbuLineInput;
  materialUsd: number;
  qty: number;
  financialUsd: number;
  /** null = MARGIN_INPUT; otherwise the typed price of this block (PRICE_INPUT), 0 when missing. */
  typedPrice: number | null;
  p: CbuParams;
  label: "FCA" | "DAP";
}

function priceBlock(a: BlockArgs): { block: CbuBasisBlock; warning?: string } {
  const { line, materialUsd, qty, financialUsd, typedPrice, p, label } = a;
  const unitCostUsd = materialUsd + financialUsd;
  let priceUsd = 0;
  let warning: string | undefined;

  if (typedPrice !== null) {
    priceUsd = typedPrice;
    if (!(priceUsd > 0)) warning = `Chưa nhập giá bán ${label}.`;
  } else {
    const usd = Number(line.marginUsdOverride);
    if (Number.isFinite(usd) && usd > 0) {
      priceUsd = roundUp(unitCostUsd + usd, p.usdRoundingDecimals);
    } else {
      const m = activeMarginPct(line, p.targetMarginPct);
      const denominator = 1 - pctToFrac(m);
      if (denominator > EPS) priceUsd = roundUp(unitCostUsd / denominator, p.usdRoundingDecimals);
      else {
        priceUsd = roundUp(unitCostUsd, p.usdRoundingDecimals);
        warning = `Margin ${m}% ≥ 100% — không tính được giá bán ${label}, đã trả về giá vốn.`;
      }
    }
  }

  const marginPerUnitUsd = priceUsd - unitCostUsd;
  return {
    warning,
    block: {
      financialUsd,
      unitCostUsd,
      priceUsd,
      marginPerUnitUsd,
      marginPct: priceUsd > 0 ? (marginPerUnitUsd / priceUsd) * 100 : 0,
      totalCostUsd: unitCostUsd * qty,
      totalRevenueUsd: priceUsd * qty,
      totalMarginUsd: marginPerUnitUsd * qty,
      pricingFailed: warning !== undefined,
    },
  };
}

export function calculateFcaDap(rawLines: CbuLineInput[], p: CbuParams): CbuResult {
  const warnings: string[] = [];
  const inputs = Array.isArray(rawLines) ? rawLines : [];
  const hasLines = inputs.length > 0;
  const priceMode = p.mode === "PRICE_INPUT";

  const prepared = inputs.map((l, idx) => {
    const qty = Math.max(0, n(l?.qty, 1));
    const materialUsd = Math.max(0, n(l?.materialUsd));
    const totalWeightLb = Math.max(0, n(l?.totalWeightLb));
    return {
      src: l,
      id: String(l?.id ?? idx),
      lineNo: n(l?.lineNo, idx + 1),
      qty,
      materialUsd,
      // informational only (it feeds the freight reference on the Logistic sheet, never a price)
      weightKgPerUnit: qty > 0 ? (totalWeightLb / qty) * p.lbToKg : 0,
    };
  });

  const totalMaterialUsd = prepared.reduce((s, l) => s + l.qty * l.materialUsd, 0);
  const totalWeightKg = prepared.reduce((s, l) => s + l.qty * l.weightKgPerUnit, 0);

  const bank = hasLines
    ? computeBankPool(totalMaterialUsd, p)
    : { remittanceFeeUsd: 0, receiveFeeUsd: 0, otherBankFeeUsd: 0, totalUsd: 0 };

  if (hasLines && p.destinationCountry.toUpperCase() !== "VN" && p.bank.receiveBaseUsd <= 0) {
    warnings.push(
      "Chưa nhập giá trị hợp đồng (receiveBase) — phí nhận ngoại tệ đang rơi về mức tối thiểu. " +
        "Nhập giá trị hợp đồng USD ước tính (không link doanh thu để tránh vòng lặp)."
    );
  }

  const interestRate = financingRate(p);
  const unpriced = new Set<string>();

  const lines: CbuLineResult[] = prepared.map((l) => {
    const lineWarnings: string[] = [];
    const financialFca = bank.totalUsd * safeDiv(l.materialUsd, totalMaterialUsd);
    const financialDap = financialFca + l.materialUsd * interestRate;

    const typed = (v: unknown): number | null => (priceMode ? (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0) : null);
    const fcaRes = priceBlock({ line: l.src, materialUsd: l.materialUsd, qty: l.qty, financialUsd: financialFca, typedPrice: typed(l.src?.ddpPriceUsdInput), p, label: "FCA" });
    const dapRes = priceBlock({ line: l.src, materialUsd: l.materialUsd, qty: l.qty, financialUsd: financialDap, typedPrice: typed(l.src?.dapPriceUsdInput), p, label: "DAP" });

    for (const r of [fcaRes, dapRes]) {
      if (r.warning) {
        lineWarnings.push(r.warning);
        warnings.push(`Dòng ${l.lineNo}: ${r.warning}`);
      }
    }
    if (fcaRes.warning || dapRes.warning) unpriced.add(l.id);

    const primary = p.quoteBasis === "DAP" ? dapRes.block : fcaRes.block;
    const ddpPriceVnd = roundUpToStep(primary.priceUsd * p.fx, p.vndRoundingStep);

    return {
      id: l.id,
      lineNo: l.lineNo,
      qty: l.qty,
      materialUsd: l.materialUsd,
      weightKgPerUnit: l.weightKgPerUnit,
      financingUsd: p.quoteBasis === "DAP" ? financialDap - financialFca : 0,
      bankFeeUsd: primary.financialUsd,
      logisticsUsd: 0,
      insuranceUsd: 0,
      dutyUsd: 0,
      customUsd: 0,
      commissionUsd: 0,
      citUsd: 0,
      unitCostUsd: primary.unitCostUsd,
      ddpPriceUsd: primary.priceUsd,
      ddpPriceVnd,
      marginPerUnitUsd: primary.marginPerUnitUsd,
      marginPct: primary.marginPct,
      totalCostUsd: primary.totalCostUsd,
      totalRevenueUsd: primary.totalRevenueUsd,
      totalRevenueVnd: ddpPriceVnd * l.qty,
      totalMarginUsd: primary.totalMarginUsd,
      pricingFailed: primary.pricingFailed,
      warnings: lineWarnings,
      fca: fcaRes.block,
      dap: dapRes.block,
    };
  });

  // ── Roll-ups ────────────────────────────────────────────────────────────────
  const sum = (pick: (l: CbuLineResult) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const revenueUsd = sum((l) => l.totalRevenueUsd);
  const costUsd = sum((l) => l.totalCostUsd);
  const totals: CbuTotals = {
    qty: sum((l) => l.qty),
    weightKg: totalWeightKg,
    materialUsd: totalMaterialUsd,
    bankFeeUsd: sum((l) => l.bankFeeUsd * l.qty),
    financingUsd: sum((l) => l.financingUsd * l.qty),
    logisticsUsd: 0,
    dutyUsd: 0,
    commissionUsd: 0,
    citUsd: 0,
    costUsd,
    revenueUsd,
    revenueVnd: sum((l) => l.totalRevenueVnd),
    marginUsd: revenueUsd - costUsd,
    marginPct: revenueUsd > 0 ? ((revenueUsd - costUsd) / revenueUsd) * 100 : 0,
  };

  // DAP offer: goods at DAP prices + one lump-sum freight (Excel G16 = G15 + P16).
  const dapGoods = sum((l) => l.dap?.totalRevenueUsd ?? 0);
  const dapCost = sum((l) => l.dap?.totalCostUsd ?? 0);
  const freightUsd = hasLines ? Math.max(0, p.logistics.freightAllInUsd) : 0;
  const freightReferenceUsd = hasLines ? Math.max(0, p.logistics.freightFixedUsd) : 0;
  const mismatch = freightReferenceUsd > 0 ? Math.abs(freightReferenceUsd - freightUsd) : 0;
  if (mismatch > 0.005) {
    warnings.push(
      `Cước dùng để báo giá DAP (${freightUsd}) khác cước theo bảng Logistic (${freightReferenceUsd}) — chênh ${Math.round(mismatch * 100) / 100}.`
    );
  }
  const dap: CbuDapSummary = {
    goodsRevenueUsd: dapGoods,
    freightUsd,
    freightReferenceUsd,
    freightMismatchUsd: mismatch,
    totalUsd: dapGoods + freightUsd,
    costUsd: dapCost,
    marginUsd: dapGoods - dapCost,
    marginPct: dapGoods > 0 ? ((dapGoods - dapCost) / dapGoods) * 100 : 0,
  };

  const pools: CbuPools = {
    totalWeightKg,
    totalMaterialUsd,
    freightUsd,
    insuranceUsd: 0,
    logisticsPoolUsd: 0,
    remittanceFeeUsd: bank.remittanceFeeUsd,
    receiveFeeUsd: bank.receiveFeeUsd,
    otherBankFeeUsd: bank.otherBankFeeUsd,
    bankTotalUsd: bank.totalUsd,
  };

  return { profile: "FCA_DAP", lines, pools, totals, checks: runFcaDapChecks(lines, inputs, pools, p, unpriced), warnings, dap };
}

/**
 * The workbook's CHECK rows for this profile (must be 0):
 *   C1 unit cost = material + financial (both blocks) · C2 Σ qty × financial (FCA) = total bank fee
 *   C4 MARGIN_INPUT: realised margin ≥ requested margin (both blocks). C3 (logistics pool) does not exist here.
 */
function runFcaDapChecks(lines: CbuLineResult[], inputs: CbuLineInput[], pools: CbuPools, p: CbuParams, unpriced: Set<string>): CbuCheck[] {
  const c1Bad: string[] = [];
  let c1Max = 0;
  for (const l of lines) {
    for (const b of [l.fca, l.dap]) {
      if (!b) continue;
      const d = Math.abs(b.unitCostUsd - (l.materialUsd + b.financialUsd));
      c1Max = Math.max(c1Max, d);
      if (d > TOL && !c1Bad.includes(l.id)) c1Bad.push(l.id);
    }
  }

  const allocated = lines.reduce((s, l) => s + l.qty * (l.fca?.financialUsd ?? 0), 0);
  const c2 = pools.totalMaterialUsd > 0 ? Math.abs(allocated - pools.bankTotalUsd) : 0;

  const c4Bad: string[] = [];
  let c4Max = 0;
  if (p.mode === "MARGIN_INPUT") {
    lines.forEach((l, i) => {
      if (unpriced.has(l.id)) return;
      const inp = inputs[i];
      const usd = Number(inp?.marginUsdOverride);
      for (const b of [l.fca, l.dap]) {
        if (!b) continue;
        const shortfall = Number.isFinite(usd) && usd > 0 ? usd - b.marginPerUnitUsd : activeMarginPct(inp, p.targetMarginPct) - b.marginPct;
        if (shortfall > 1e-7 && !c4Bad.includes(l.id)) c4Bad.push(l.id);
        c4Max = Math.max(c4Max, shortfall, 0);
      }
    });
  }

  return [
    { id: "C1", label: "Unit Cost = Material Cost + Financial Cost (Block FCA, Block DAP)", delta: c1Max, ok: c1Bad.length === 0, ...(c1Bad.length ? { lineIds: c1Bad } : {}) },
    { id: "C2", label: "Bank fee allocated (Block FCA) = TOTAL FEE", delta: c2, ok: c2 <= TOL * Math.max(1, pools.bankTotalUsd) },
    { id: "C4", label: "% Margin ≥ requested % Margin (Block FCA, Block DAP)", delta: c4Max, ok: c4Bad.length === 0, ...(c4Bad.length ? { lineIds: c4Bad } : {}) },
  ];
}
