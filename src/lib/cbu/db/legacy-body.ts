// src/lib/cbu/db/legacy-body.ts
// Converts the body posted by the pre-v2 cbu-calc page into the v2 save input.
// Only INPUTS are read; every result / total the old page also sends is ignored (SPEC §11.6-5).

import type { CbuParamsInput } from "../types";
import type { LegacyCalculateCbuBody, SaveCbuInput } from "../../schemas/cbu.schemas";

/** null / undefined → undefined so the stored (or default) value is kept. */
const v = <T>(x: T | null | undefined): T | undefined => (x === null || x === undefined ? undefined : x);

export function legacyBodyToSaveInput(b: LegacyCalculateCbuBody): SaveCbuInput {
  const params: CbuParamsInput = {
    fx: v(b.exchangeRate),
    vndRoundingStep: v(b.vndRoundingStep),
    lbToKg: v(b.lbToKg),
    targetMarginPct: v(b.targetMarginPercent),
    commissionPct: v(b.commissionRate),
    citPct: v(b.citOnCommission),
    goodsOrigin: v(b.goodsOrigin),
    destinationCountry: v(b.destinationCountry),
    pctFinanced: v(b.percentValueFinanced),
    interestPct: v(b.interestRatePercent),
    financingDays: v(b.financingDays),
    daysPerYear: v(b.daysPerYear),
    logistics: {
      freightAllInUsd: v(b.freightCost),
      freightFixedUsd: v(b.freightFixed),
      freightRatePerKg: v(b.freightRatePerKg),
      chargeableKg: v(b.chargeableWeightKg),
      clearanceUsd: v(b.clearanceCost),
      inlandUsd: v(b.inlandCost),
      otherUsd: v(b.docFee),
    },
    insurance: {
      insuredValuePct: v(b.insuredValuePercent),
      ratePct: v(b.insuranceRatePercent),
      minUsd: v(b.minInsuranceUsd),
    },
    bank: {
      remitRatePct: v(b.remittanceRatePercent),
      remitVatFactor: v(b.bankVatFactor),
      minRemitUsd: v(b.minRemittanceFeeUsd),
      receiveRatePct: v(b.receiveRatePercent),
      minReceiveUsd: v(b.minReceiveFeeUsd),
      receiveBaseUsd: v(b.receiveBaseUsd),
      otherUsd: v(b.otherBankFeeUsd),
    },
  };

  return {
    mode: v(b.cbuMode),
    params: params as SaveCbuInput["params"],
    items: (b.items ?? []).map((i) => ({
      id: i.id,
      materialUsd: v(i.supplierUnitPrice),
      // legacy `netWeightLbs` is the weight of ONE unit → converted with the stored qty by the mapping layer
      weightLbPerUnit: v(i.netWeightLbs),
      dutyPct: v(i.dutyPercent),
      // null = "no override" (never 0%) — SPEC §11.2 F6
      marginPctOverride: i.marginPercent ?? null,
      marginUsdOverride: i.marginOverrideUsd ?? null,
      ddpPriceUsdInput: i.targetDdpPriceUsd ?? null,
    })),
  };
}
