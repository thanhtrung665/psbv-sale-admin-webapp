import { RFQItem, RFQ } from "@prisma/client";

/**
 * CBU (Cost Build-Up) Engine
 * 
 * Performs Cost Build-Up calculation for an RFQ line item based on:
 * - Duty = (MaterialCost + Logistics) * DutyRate
 * - BaseCost = MaterialCost + Logistics + Duty + BankFee
 * - DDP Price USD = BaseCost / (1 - MarginRate - CommRate - (CommRate * CITRate))
 */

export function calculateRFQItemCBU(
  item: Partial<RFQItem>, 
  exchangeRate: number = 25500
): Partial<RFQItem> {
  const qty = item.qty || 1;
  const supplierUnitPrice = item.supplierUnitPrice || 0;
  
  // Material Cost (Ext Price)
  const materialCost = supplierUnitPrice * qty;
  
  const logistics = item.logisticsFee || 0;
  const bankFee = item.bankFee || 0;
  
  const dutyRate = (item.dutyPercent || 0) / 100;
  const commRate = (item.commissionPercent || 0) / 100;
  const citRate = (item.citPercent || 0) / 100;
  const marginRate = (item.marginPercent || 0) / 100;
  
  // 1. Thuế NK: duty = (materialCost + logistics) * dutyRate
  const duty = (materialCost + logistics) * dutyRate;
  
  // 2. BaseCost = materialCost + logistics + duty + bankFee
  const baseCost = materialCost + logistics + duty + bankFee;
  
  // 3. ĐẠI SỐ ĐẢO NGƯỢC: ddpUsd = BaseCost / (1 - marginRate - commRate - (commRate * citRate))
  let ddpUsd = item.ddpPriceUsd; 
  if (!ddpUsd) {
    const divisor = 1 - marginRate - commRate - (commRate * citRate);
    ddpUsd = divisor > 0 ? baseCost / divisor : baseCost;
  }
  
  // 4. LÀM TRÒN TIỀN VND (ROUNDUP -4 Excel): ddpVnd = Math.ceil((ddpUsd * exchangeRate) / 10000) * 10000
  const ddpVnd = Math.ceil((ddpUsd * exchangeRate) / 10000) * 10000;
  
  // 5. commissionUsd = ddpUsd * commRate
  const commissionUsd = ddpUsd * commRate;
  
  // 6. citUsd = commissionUsd * citRate
  const citUsd = commissionUsd * citRate;
  
  // 7. unitCostUsd = materialCost + commissionUsd + citUsd + bankFee + logistics + duty
  const totalCostUsd = materialCost + commissionUsd + citUsd + bankFee + logistics + duty;
  const unitCostUsd = qty > 0 ? totalCostUsd / qty : 0;
  
  // 8. marginPerUnit = ddpUsd - totalCostUsd 
  const marginPerUnitUsd = qty > 0 ? (ddpUsd - totalCostUsd) / qty : 0;

  return {
    ...item,
    supplierExtPrice: materialCost,
    dutyAmount: duty,
    commissionAmount: commissionUsd,
    citAmount: citUsd,
    unitCostUsd: qty > 0 ? totalCostUsd / qty : 0, 
    ddpPriceUsd: ddpUsd,
    ddpPriceVnd: BigInt(ddpVnd),
    marginPerUnitUsd: marginPerUnitUsd
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
    // Calculated item ddpPriceUsd is total line DDP
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
