// src/lib/cbu/params.ts
// Turns whatever the caller passes (partial, possibly garbage) into a complete, finite CbuParams.

import { CBU_DEFAULTS as D } from "./defaults";
import { g } from "./math";
import type { CbuMode, CbuParams, CbuParamsInput } from "./types";

const str = (v: unknown, fallback: string): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? fallback : s;
};

export function resolveParams(input: CbuParamsInput | null | undefined): CbuParams {
  const p = input ?? {};
  const l = p.logistics ?? {};
  const i = p.insurance ?? {};
  const b = p.bank ?? {};
  const mode: CbuMode = p.mode === "PRICE_INPUT" ? "PRICE_INPUT" : "MARGIN_INPUT";

  return {
    mode,
    fx: g(p.fx, D.fx),
    vndRoundingStep: g(p.vndRoundingStep, D.vndRoundingStep),
    lbToKg: g(p.lbToKg, D.lbToKg),
    usdRoundingDecimals: Math.max(0, Math.round(g(p.usdRoundingDecimals, D.usdRoundingDecimals))),

    targetMarginPct: g(p.targetMarginPct, D.targetMarginPct),
    commissionPct: g(p.commissionPct, D.commissionPct),
    citPct: g(p.citPct, D.citPct),

    goodsOrigin: str(p.goodsOrigin, D.goodsOrigin),
    destinationCountry: str(p.destinationCountry, D.destinationCountry),

    pctFinanced: g(p.pctFinanced, D.pctFinanced),
    interestPct: g(p.interestPct, D.interestPct),
    financingDays: g(p.financingDays, D.financingDays),
    daysPerYear: g(p.daysPerYear, D.daysPerYear),

    logistics: {
      freightAllInUsd: g(l.freightAllInUsd, D.logistics.freightAllInUsd),
      freightFixedUsd: g(l.freightFixedUsd, D.logistics.freightFixedUsd),
      freightRatePerKg: g(l.freightRatePerKg, D.logistics.freightRatePerKg),
      chargeableKg: g(l.chargeableKg, D.logistics.chargeableKg),
      clearanceUsd: g(l.clearanceUsd, D.logistics.clearanceUsd),
      inlandUsd: g(l.inlandUsd, D.logistics.inlandUsd),
      otherUsd: g(l.otherUsd, D.logistics.otherUsd),
    },
    insurance: {
      insuredValuePct: g(i.insuredValuePct, D.insurance.insuredValuePct),
      ratePct: g(i.ratePct, D.insurance.ratePct),
      minUsd: g(i.minUsd, D.insurance.minUsd),
    },
    bank: {
      remitRatePct: g(b.remitRatePct, D.bank.remitRatePct),
      remitVatFactor: g(b.remitVatFactor, D.bank.remitVatFactor),
      minRemitUsd: g(b.minRemitUsd, D.bank.minRemitUsd),
      receiveRatePct: g(b.receiveRatePct, D.bank.receiveRatePct),
      receiveVatFactor: g(b.receiveVatFactor, D.bank.receiveVatFactor),
      minReceiveUsd: g(b.minReceiveUsd, D.bank.minReceiveUsd),
      receiveBaseUsd: g(b.receiveBaseUsd, D.bank.receiveBaseUsd),
      otherUsd: g(b.otherUsd, D.bank.otherUsd),
    },
  };
}
