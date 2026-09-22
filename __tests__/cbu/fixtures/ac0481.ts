// Baker Hughes (Malaysia) — AC0481. HAND-TRANSCRIBED from the markdown workbooks (single item), source of truth:
//   documents/CBU_docx/CBU_BakerHughes_MarginnInput/CBU-AC0481_BakerHughes_MarginInput.md
//   documents/CBU_docx/CBU_BakerHughes_PriceInput/CBU-AC0481_BakerHughes_PriceInput.md
// Two sheets = two payment terms ("MA - Payment w Order" and "MA - Net 60 Days"); each has an FCA block and a DAP block.
// Never adjust a number here to make a test pass.

export const AC0481_LINE = {
  id: "l1",
  lineNo: 1,
  partNo: "480131200",
  qty: 30,
  /** Excel col N: supplier price per unit, USD. */
  materialUsd: 105.5,
  /** Excel: (43.2 / qty) × 0.46 → the weight only feeds the freight *reference*, never a price. */
  totalWeightLb: 43.2,
} as const;

/** Values shared by both sheets. Bank fee: remittance min $50 + receive min $35 = $85 (Bank Fee!M9). */
export const AC0481_PARAMS = {
  targetMarginPct: 17,
  goodsOrigin: "Oversea",
  destinationCountry: "MY",
  interestPct: 15,
  daysPerYear: 360,
  /** Bank Fee!L7 — the DAP goods revenue, typed by hand here (see SPEC §11.12 Q4). */
  receiveBaseUsd: 3930,
} as const;

export const AC0481_SCENARIOS = {
  /** "MA - Payment w Order": 30% deposit, no credit interest. */
  paymentWithOrder: { pctFinanced: 0, financingDays: 0, freightQuotedUsd: 1800, freightReferenceUsd: 1800 },
  /** "MA - Net 60 Days": credit 45 days, 100% financed at 15% p.a.; quoted freight differs from the Logistic sheet. */
  net60: { pctFinanced: 100, financingDays: 45, freightQuotedUsd: 1100, freightReferenceUsd: 1800 },
} as const;

export const AC0481_EXPECTED = {
  remittanceFeeUsd: 50,
  receiveFeeUsd: 35,
  bankTotalUsd: 85,
  /** FCA block — identical in both sheets (no credit interest on FCA). */
  fca: { financialUsd: 85 / 30, unitCostUsd: 105.5 + 85 / 30, priceUsd: 131, revenueUsd: 3930, costUsd: 3250, marginUsd: 680, marginPct: (680 / 3930) * 100 },
  paymentWithOrder: {
    dap: { financialUsd: 85 / 30, unitCostUsd: 105.5 + 85 / 30, priceUsd: 131, revenueUsd: 3930, costUsd: 3250, marginUsd: 680, marginPct: (680 / 3930) * 100 },
    totalUsd: 5730,
    freightMismatchUsd: 0,
  },
  net60: {
    // md: unit cost 110.31, financial 4.81, total cost 3,309.3438, margin 680.6562, price 133, revenue 3,990
    dap: { financialUsd: (3309.3438 - 3165) / 30, unitCostUsd: 3309.3438 / 30, priceUsd: 133, revenueUsd: 3990, costUsd: 3309.3438, marginUsd: 680.6562, marginPct: (680.6562 / 3990) * 100 },
    totalUsd: 5090,
    freightMismatchUsd: 700,
  },
} as const;
