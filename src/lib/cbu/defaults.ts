// src/lib/cbu/defaults.ts
// The ONE place that holds default values (SPEC §11.6-3).
//
// Only POLICY parameters have defaults (tariffs, insurance terms, day-count basis, lb→kg,
// rounding step, FX). Per-shipment costs (freight, clearance, inland, other) default to 0:
// the 150 / 100 / 15 values that used to be prefilled were the numbers of one sample shipment (F4).
//
// All percentages are percent numbers (3 = 3%).

import type { CbuParams, CbuProfile, DeepPartial } from "./types";

export const CBU_DEFAULTS: CbuParams = {
  profile: "DDP_IMPORT",
  quoteBasis: "FCA",
  mode: "MARGIN_INPUT",
  fx: 26500,
  vndRoundingStep: 10000,
  lbToKg: 0.4536,
  usdRoundingDecimals: 2,

  targetMarginPct: 25,
  commissionPct: 3,
  citPct: 20,

  goodsOrigin: "Oversea",
  destinationCountry: "VN",

  pctFinanced: 50,
  interestPct: 15,
  financingDays: 15,
  daysPerYear: 360,

  logistics: {
    freightAllInUsd: 0,
    freightFixedUsd: 0,
    freightRatePerKg: 0,
    chargeableKg: 0,
    clearanceUsd: 0,
    inlandUsd: 0,
    otherUsd: 0,
  },

  insurance: {
    insuredValuePct: 110,
    ratePct: 0.01,
    minUsd: 15,
  },

  bank: {
    remitRatePct: 0.2,
    remitVatFactor: 1.1,
    minRemitUsd: 50,
    receiveRatePct: 0.05,
    receiveVatFactor: 1,
    minReceiveUsd: 5,
    receiveBaseUsd: 0,
    otherUsd: 0,
  },
};

/**
 * Defaults that differ per profile, applied on top of CBU_DEFAULTS (SPEC §11.5). Baker Hughes (AC0481):
 * whole-dollar prices, no commission / CIT, margin typed per line (17%), financing only through the payment terms
 * (Payment with Order = 0, Net 60 = 100% · 15% · 45 days), receive fee minimum $35.
 */
export const PROFILE_DEFAULTS: Record<CbuProfile, DeepPartial<CbuParams>> = {
  DDP_IMPORT: {},
  FCA_DAP: {
    usdRoundingDecimals: 0,
    targetMarginPct: 17,
    commissionPct: 0,
    citPct: 0,
    destinationCountry: "MY",
    pctFinanced: 0,
    interestPct: 15,
    financingDays: 0,
    bank: { minReceiveUsd: 35 },
  },
};
