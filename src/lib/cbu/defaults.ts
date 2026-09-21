// src/lib/cbu/defaults.ts
// The ONE place that holds default values (SPEC §11.6-3).
//
// Only POLICY parameters have defaults (tariffs, insurance terms, day-count basis, lb→kg,
// rounding step, FX). Per-shipment costs (freight, clearance, inland, other) default to 0:
// the 150 / 100 / 15 values that used to be prefilled were the numbers of one sample shipment (F4).
//
// All percentages are percent numbers (3 = 3%).

import type { CbuParams } from "./types";

export const CBU_DEFAULTS: CbuParams = {
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
