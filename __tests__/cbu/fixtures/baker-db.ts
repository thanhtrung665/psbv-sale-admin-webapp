/** In-memory RFQ + items for the Baker Hughes (FCA_DAP) tests: AC0481, line qty 30, material $105.5 (see ac0481.ts). */
import type { CbuDb } from "../../../src/lib/cbu/db/service";
import { AC0481_LINE as L, AC0481_SCENARIOS as S } from "./ac0481";

export type Row = Record<string, unknown>;

export function makeDb(rfq: Row, items: Row[]) {
  const state = { rfq: { ...rfq }, items: items.map((i) => ({ ...i })) };
  const db = {
    rFQ: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === state.rfq.id ? { ...state.rfq, items: state.items.map((i) => ({ ...i })) } : null),
      update: async ({ data }: { data: Row }) => { Object.assign(state.rfq, data); return state.rfq; },
    },
    rFQItem: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => { Object.assign(state.items.find((i) => i.id === where.id) as Row, data); return state.items[0]; },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as CbuDb;
  return { db, state };
}

export const bakerRfq = (extra: Row = {}): Row => ({
  id: "b1", rfqCode: "AC0481", status: "SUPPLIER_QUOTED", incoTerm: "FCA", cbuProfile: "FCA_DAP", cbuMode: "MARGIN_INPUT", cbuConfig: null, cbuCalculatedAt: null,
  exchangeRate: 25500, vndRoundingStep: 10000, lbToKg: 0.4536, goodsOrigin: "Oversea", destinationCountry: "MY",
  // base scenario = Payment with Order: quoted freight 1800, Logistic reference 1800, no credit
  freightCost: S.paymentWithOrder.freightQuotedUsd, freightFixed: S.paymentWithOrder.freightReferenceUsd, freightRatePerKg: 0, chargeableWeightKg: 0,
  clearanceCost: 0, inlandCost: 0, docFee: 0,
  insuredValuePercent: 110, insuranceRatePercent: 0.01, minInsuranceUsd: 15,
  remittanceRatePercent: 0.2, bankVatFactor: 1.1, minRemittanceFeeUsd: 50, receiveRatePercent: 0.05, minReceiveFeeUsd: 35, receiveBaseUsd: 3930, otherBankFeeUsd: 0,
  percentValueFinanced: 0, interestRatePercent: 15, financingDays: 0, daysPerYear: 360,
  targetMarginPercent: 17, commissionRate: 0, citOnCommission: 0,
  totalCostUsd: null, totalRevenueUsd: null, totalRevenueVnd: null, totalMarginUsd: null, actualMarginPct: null, ...extra,
});
export const bakerItems = (): Row[] => [
  { id: "l1", rfqId: "b1", lineNo: 1, rawPartNumber: L.partNo, rawDescription: "1R MODEL F STD. SERVICE DRILL PIPE FLOAT VALVE", uom: "PCS", qty: L.qty, supplierUnitPrice: L.materialUsd, netWeightLbs: null, extWeightLbs: L.totalWeightLb, dutyPercent: 0, marginPercent: null, marginOverrideUsd: null, ddpPriceUsd: null },
];

