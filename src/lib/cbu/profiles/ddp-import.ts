// src/lib/cbu/profiles/ddp-import.ts
// Profile DDP_IMPORT — Hoàng Sơn · AC0084 (Excel sheets: Margin Analysis + Logistic + Bank Fee).
// Formulas: SPEC §11.4, verified line-by-line against the AIR and SEA blocks of the md.

import { runChecks } from "../checks";
import { n, pctToFrac, roundUpToStep, safeDiv } from "../math";
import { computeBankPool, computeFreight, computeInsurance, financingRate } from "../pools";
import { priceLine } from "../pricing";
import type { CbuLineInput, CbuLineResult, CbuParams, CbuPools, CbuResult, CbuTotals } from "../types";

export function calculateDdpImport(rawLines: CbuLineInput[], p: CbuParams): CbuResult {
  const warnings: string[] = [];
  const inputs = Array.isArray(rawLines) ? rawLines : [];
  const hasLines = inputs.length > 0;

  // ── (1) Sanitise lines; weight per unit and shipment totals ────────────────
  const prepared = inputs.map((l, idx) => {
    const qty = Math.max(0, n(l?.qty, 1));
    const materialUsd = Math.max(0, n(l?.materialUsd));
    const totalWeightLb = Math.max(0, n(l?.totalWeightLb));
    // Excel col G: WeightKg = TotalWeightLb ÷ Qty × LbToKg   (per unit)
    const weightKgPerUnit = qty > 0 ? (totalWeightLb / qty) * p.lbToKg : 0;
    return {
      src: l,
      id: String(l?.id ?? idx),
      lineNo: n(l?.lineNo, idx + 1),
      qty,
      materialUsd,
      totalWeightLb,
      weightKgPerUnit,
      dutyPct: Math.max(0, n(l?.dutyPct)),
      customUsd: n(l?.customUsd),
    };
  });

  // AirTotalWeight / AirTotalMaterial = SUMPRODUCT(Qty, col)
  const totalWeightKg = prepared.reduce((s, l) => s + l.qty * l.weightKgPerUnit, 0);
  const totalMaterialUsd = prepared.reduce((s, l) => s + l.qty * l.materialUsd, 0);

  if (hasLines && totalWeightKg <= 0) {
    warnings.push("Tổng trọng lượng = 0 nên chi phí logistics không phân bổ được cho dòng nào.");
  }

  // ── (2) Logistics pool and (3) bank pool ───────────────────────────────────
  const freightUsd = computeFreight(p);
  const insuranceUsd = hasLines ? computeInsurance(totalMaterialUsd, freightUsd, p) : 0;
  const lg = p.logistics;
  const logisticsPoolUsd = hasLines ? freightUsd + lg.clearanceUsd + lg.inlandUsd + lg.otherUsd + insuranceUsd : 0;

  const bank = hasLines
    ? computeBankPool(totalMaterialUsd, p)
    : { remittanceFeeUsd: 0, receiveFeeUsd: 0, otherBankFeeUsd: 0, totalUsd: 0 };

  if (hasLines && p.destinationCountry.toUpperCase() !== "VN" && p.bank.receiveBaseUsd <= 0) {
    warnings.push(
      "Chưa nhập giá trị hợp đồng (receiveBase) — phí nhận ngoại tệ đang rơi về mức tối thiểu. " +
        "Nhập giá trị hợp đồng USD ước tính (không link doanh thu để tránh vòng lặp)."
    );
  }

  const finRate = financingRate(p);
  const q = pctToFrac(p.commissionPct);
  const c = pctToFrac(p.citPct);

  // ── (4) Per line ───────────────────────────────────────────────────────────
  const unpricedIds = new Set<string>();
  const lines: CbuLineResult[] = prepared.map((l) => {
    const lineWarnings: string[] = [];
    const financingUsd = l.materialUsd * finRate;
    const bankFeeUsd = financingUsd + bank.totalUsd * safeDiv(l.materialUsd, totalMaterialUsd);

    const share = safeDiv(l.weightKgPerUnit, totalWeightKg);
    const logisticsUsd = logisticsPoolUsd * share;
    const insuranceShareUsd = insuranceUsd * share;
    if (totalWeightKg > 0 && l.qty > 0 && l.weightKgPerUnit <= 0) {
      lineWarnings.push("Thiếu trọng lượng — logistics chưa phân bổ được cho dòng này.");
    }

    // Excel col L: Duty = (Material + Logistics) × %Duty — logistics already includes insurance.
    const dutyUsd = (l.materialUsd + logisticsUsd) * pctToFrac(l.dutyPct);
    const base = l.materialUsd + bankFeeUsd + logisticsUsd + dutyUsd + l.customUsd;

    const priced = priceLine(l.src, {
      mode: p.mode,
      base,
      q,
      c,
      targetMarginPct: p.targetMarginPct,
      usdDecimals: p.usdRoundingDecimals,
    });
    if (priced.warning) {
      lineWarnings.push(priced.warning);
      unpricedIds.add(l.id);
      warnings.push(`Dòng ${l.lineNo}: ${priced.warning}`);
    }
    const ddpPriceUsd = priced.ddpPriceUsd;

    const commissionUsd = q * ddpPriceUsd;
    const citUsd = c * commissionUsd;
    const unitCostUsd = base + commissionUsd + citUsd;
    const marginPerUnitUsd = ddpPriceUsd - unitCostUsd;
    const marginPct = ddpPriceUsd > 0 ? (marginPerUnitUsd / ddpPriceUsd) * 100 : 0;
    const ddpPriceVnd = roundUpToStep(ddpPriceUsd * p.fx, p.vndRoundingStep);

    return {
      id: l.id,
      lineNo: l.lineNo,
      qty: l.qty,
      materialUsd: l.materialUsd,
      weightKgPerUnit: l.weightKgPerUnit,
      financingUsd,
      bankFeeUsd,
      logisticsUsd,
      insuranceUsd: insuranceShareUsd,
      dutyUsd,
      customUsd: l.customUsd,
      commissionUsd,
      citUsd,
      unitCostUsd,
      ddpPriceUsd,
      ddpPriceVnd,
      marginPerUnitUsd,
      marginPct,
      totalCostUsd: unitCostUsd * l.qty,
      totalRevenueUsd: ddpPriceUsd * l.qty,
      totalRevenueVnd: ddpPriceVnd * l.qty,
      totalMarginUsd: marginPerUnitUsd * l.qty,
      warnings: lineWarnings,
    };
  });

  // ── (5) Roll-up (Excel TOTAL row: SUMPRODUCT(Qty, col)) ────────────────────
  const sum = (pick: (l: CbuLineResult) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const revenueUsd = sum((l) => l.totalRevenueUsd);
  const costUsd = sum((l) => l.totalCostUsd);
  const totals: CbuTotals = {
    qty: sum((l) => l.qty),
    weightKg: totalWeightKg,
    materialUsd: totalMaterialUsd,
    bankFeeUsd: sum((l) => l.bankFeeUsd * l.qty),
    financingUsd: sum((l) => l.financingUsd * l.qty),
    logisticsUsd: sum((l) => l.logisticsUsd * l.qty),
    dutyUsd: sum((l) => l.dutyUsd * l.qty),
    commissionUsd: sum((l) => l.commissionUsd * l.qty),
    citUsd: sum((l) => l.citUsd * l.qty),
    costUsd,
    revenueUsd,
    revenueVnd: sum((l) => l.totalRevenueVnd),
    marginUsd: revenueUsd - costUsd,
    marginPct: revenueUsd > 0 ? ((revenueUsd - costUsd) / revenueUsd) * 100 : 0,
  };

  const pools: CbuPools = {
    totalWeightKg,
    totalMaterialUsd,
    freightUsd: hasLines ? freightUsd : 0,
    insuranceUsd,
    logisticsPoolUsd,
    remittanceFeeUsd: bank.remittanceFeeUsd,
    receiveFeeUsd: bank.receiveFeeUsd,
    otherBankFeeUsd: bank.otherBankFeeUsd,
    bankTotalUsd: bank.totalUsd,
  };

  const checks = runChecks({ mode: p.mode, lines, inputs, pools, targetMarginPct: p.targetMarginPct, unpricedIds });

  return { lines, pools, totals, checks, warnings };
}
