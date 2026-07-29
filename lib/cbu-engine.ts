import { RFQItem, RFQ } from "@prisma/client";

/**
 * CBU (Cost Build-Up) Engine
 * 
 * Performs Cost Build-Up calculation for an RFQ line item.
 * Calculations are based on standard algebraic rules to determine 
 * Cost, Margin, and Final DDP Price in USD & VND.
 */

export function calculateRFQItemCBU(
  item: Partial<RFQItem>, 
  exchangeRate: number = 25500
): Partial<RFQItem> {
  const qty = item.qty || 1;
  const supplierUnitPrice = item.supplierUnitPrice || 0;
  
  // 1. Supplier Ext. Price
  const extPrice = supplierUnitPrice * qty;
  
  // 2. Add-ons & Duty
  // Assume Duty is applied to (Ext Price + Logistics + Bank Fee)
  const logisticsFee = item.logisticsFee || 0;
  const bankFee = item.bankFee || 0;
  
  const baseForDuty = extPrice + logisticsFee + bankFee;
  const dutyAmt = baseForDuty * ((item.dutyPercent || 0) / 100);
  
  const totalCostBeforeCommission = baseForDuty + dutyAmt;
  
  // 3. Commission & CIT
  const commissionAmt = totalCostBeforeCommission * ((item.commissionPercent || 0) / 100);
  const citAmt = totalCostBeforeCommission * ((item.citPercent || 0) / 100);
  
  // 4. Total Cost USD
  const totalCostUsd = totalCostBeforeCommission + commissionAmt + citAmt;
  const unitCostUsd = qty > 0 ? totalCostUsd / qty : 0;
  
  // 5. Margin & Final Price Calculation
  // Standard algebraic reverse math: Price = Cost / (1 - Margin%)
  const marginPct = (item.marginPercent || 0) / 100;
  
  // Prevent division by zero or negative prices if margin >= 100%
  const ddpPriceUsd = marginPct < 1 ? totalCostUsd / (1 - marginPct) : totalCostUsd;
  
  // Margin USD
  const marginPerUnitUsd = qty > 0 ? (ddpPriceUsd - totalCostUsd) / qty : 0;
  
  // Final Price VND (Roundup to nearest integer)
  const ddpPriceVnd = BigInt(Math.ceil(ddpPriceUsd * exchangeRate));
  
  return {
    ...item,
    supplierExtPrice: extPrice,
    dutyAmount: dutyAmt,
    commissionAmount: commissionAmt,
    citAmount: citAmt,
    unitCostUsd,
    ddpPriceUsd,
    ddpPriceVnd,
    marginPerUnitUsd
  };
}

export function calculateRFQCBU(
  rfq: Partial<RFQ>, 
  items: Partial<RFQItem>[]
): { rfq: Partial<RFQ>, items: Partial<RFQItem>[] } {
  const exchangeRate = rfq.exchangeRate || 25500;
  const calculatedItems = items.map(item => calculateRFQItemCBU(item, exchangeRate));
  
  let totalCostUsd = 0;
  let totalRevenueUsd = 0;
  let totalRevenueVnd = 0n;
  
  calculatedItems.forEach(item => {
    totalCostUsd += (item.unitCostUsd || 0) * (item.qty || 1);
    totalRevenueUsd += (item.ddpPriceUsd || 0);
    totalRevenueVnd += (item.ddpPriceVnd || 0n);
  });
  
  const totalMarginUsd = totalRevenueUsd - totalCostUsd;
  const actualMarginPct = totalRevenueUsd > 0 ? (totalMarginUsd / totalRevenueUsd) * 100 : 0;
  
  return {
    rfq: {
      ...rfq,
      totalCostUsd,
      totalRevenueUsd,
      totalRevenueVnd,
      totalMarginUsd,
      actualMarginPct
    },
    items: calculatedItems
  };
}
