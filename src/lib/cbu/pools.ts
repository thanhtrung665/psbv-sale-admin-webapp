// src/lib/cbu/pools.ts
// Shipment-level cost pools (Excel sheets "Logistic" and "Bank Fee") and the financing rate.

import { pctToFrac } from "./math";
import type { CbuParams } from "./types";

/** FREIGHT = all-in when given, else Fixed charge + Rate × Chargeable weight. */
export function computeFreight(p: CbuParams): number {
  const l = p.logistics;
  return l.freightAllInUsd > 0 ? l.freightAllInUsd : l.freightFixedUsd + l.freightRatePerKg * l.chargeableKg;
}

/**
 * Insurance = MAX((Goods value + FREIGHT) × %Insured × Rate, Min insurance).
 * The computed amount is used — never the "Min insurance" input itself (SPEC §11.12 Q3).
 */
export function computeInsurance(goodsUsd: number, freightUsd: number, p: CbuParams): number {
  const i = p.insurance;
  const premium = (goodsUsd + freightUsd) * pctToFrac(i.insuredValuePct) * pctToFrac(i.ratePct);
  return Math.max(premium, i.minUsd);
}

export interface BankPool {
  remittanceFeeUsd: number;
  receiveFeeUsd: number;
  otherBankFeeUsd: number;
  totalUsd: number;
}

/** Bank Fee sheet: remittance (paid to supplier) + receive (from customer) + other. */
export function computeBankPool(materialUsd: number, p: CbuParams): BankPool {
  const b = p.bank;
  const isLocal = p.goodsOrigin.toLowerCase() === "local";
  const isDomesticCustomer = p.destinationCountry.toUpperCase() === "VN";

  const remittanceFeeUsd = isLocal
    ? 0
    : Math.max(pctToFrac(b.remitRatePct) * b.remitVatFactor * materialUsd, b.minRemitUsd);
  const receiveFeeUsd = isDomesticCustomer
    ? 0
    : Math.max(pctToFrac(b.receiveRatePct) * b.receiveVatFactor * b.receiveBaseUsd, b.minReceiveUsd);
  const otherBankFeeUsd = b.otherUsd;

  return {
    remittanceFeeUsd,
    receiveFeeUsd,
    otherBankFeeUsd,
    totalUsd: remittanceFeeUsd + receiveFeeUsd + otherBankFeeUsd,
  };
}

/**
 * Financing (cost of tied-up capital) as a fraction of the material value:
 *   %financed × (interest × days ÷ daysPerYear)
 * Same formula for both profiles (Baker Net 60 = 100% · 15% · 45 days).
 */
export function financingRate(p: CbuParams): number {
  return p.daysPerYear > 0
    ? pctToFrac(p.pctFinanced) * (pctToFrac(p.interestPct) * (p.financingDays / p.daysPerYear))
    : 0;
}
