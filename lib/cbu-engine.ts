// lib/cbu-engine.ts

export interface CustomColumnDef {
  id: string;
  name: string;
  type: "AMOUNT" | "PERCENT";
}

export interface CustomColumnValues {
  [colId: string]: number;
}

export interface CBUItemEngineData {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  uom: string;
  qty: number;
  supplierUnitPrice: number;
  netWeightLbs: number;
  
  dutyPercent: number;
  commissionPercent: number;
  citPercent: number;
  marginPercent: number;
  
  customValues: CustomColumnValues;

  // These will be calculated
  supplierExtPrice?: number;
  extWeightLbs?: number;
  
  apportionedLogistics?: number;
  apportionedBank?: number;
  apportionedInsurance?: number;
  
  dutyAmount?: number;
  commissionAmount?: number;
  citAmount?: number;
  
  unitCostUsd?: number;
  ddpPriceUsd?: number;
  ddpPriceVnd?: number;
  marginPerUnitUsd?: number;
}

export interface CBUGlobals {
  exchangeRate: number;
  freightCost: number;
  clearanceCost: number;
  inlandCost: number;
  bankFeePercent: number;
  insurancePercent: number;
  customColumns: CustomColumnDef[];
}

export interface CBUResult {
  items: CBUItemEngineData[];
  totalWeight: number;
  totalLogisticsUsd: number;
  totalBankFeeUsd: number;
  totalInsuranceUsd: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  totalRevenueVnd: number;
  totalMarginUsd: number;
  actualMarginPct: number;
}

/**
 * CBU Engine: Phân bổ phí phụ trợ & Tính giá DDP, Margin
 */
export function calculateCBU(items: CBUItemEngineData[], globals: CBUGlobals): CBUResult {
  const { exchangeRate, freightCost, clearanceCost, inlandCost, bankFeePercent, insurancePercent, customColumns } = globals;
  
  // 1. Tiền xử lý: Tính tổng Ext Weight
  let totalWeight = 0;
  const processedItems = items.map((item) => {
    const extWeightLbs = item.netWeightLbs * item.qty;
    const supplierExtPrice = item.supplierUnitPrice * item.qty;
    totalWeight += extWeightLbs;
    return { ...item, extWeightLbs, supplierExtPrice };
  });

  // 2. Tính Tổng Logistics
  const totalLogisticsUsd = freightCost + clearanceCost + inlandCost;
  
  let totalBankFeeUsd = 0;
  let totalInsuranceUsd = 0;
  let totalCostUsd = 0;
  let totalRevenueUsd = 0;
  let totalMarginUsd = 0;

  // 3. Phân bổ & Tính toán từng dòng
  const finalItems = processedItems.map((item) => {
    // Phân bổ Logistics: (Total Logistics + 15) * (Item Weight / Total Weight)
    let apportionedLogistics = 0;
    if (totalWeight > 0) {
      apportionedLogistics = (totalLogisticsUsd + 15) * (item.extWeightLbs / totalWeight);
    }

    // Phân bổ Bank Fee & Insurance
    const apportionedBank = item.supplierExtPrice * (bankFeePercent / 100);
    const apportionedInsurance = item.supplierExtPrice * (insurancePercent / 100);

    totalBankFeeUsd += apportionedBank;
    totalInsuranceUsd += apportionedInsurance;

    // Tính các phí tỷ lệ cố định
    const dutyAmount = item.supplierExtPrice * (item.dutyPercent / 100);
    const commissionAmount = item.supplierExtPrice * (item.commissionPercent / 100);
    const citAmount = item.supplierExtPrice * (item.citPercent / 100);

    // Tính phí Custom Columns
    let totalCustomCost = 0;
    if (customColumns && customColumns.length > 0) {
      for (const col of customColumns) {
        const val = item.customValues[col.id] || 0;
        if (col.type === "AMOUNT") {
          totalCustomCost += (val * item.qty);
        } else if (col.type === "PERCENT") {
          totalCustomCost += (item.supplierExtPrice * val / 100);
        }
      }
    }

    // Tính Base Cost (Tổng chi phí)
    const totalItemCost =
      item.supplierExtPrice +
      apportionedLogistics +
      apportionedBank +
      apportionedInsurance +
      dutyAmount +
      commissionAmount +
      citAmount +
      totalCustomCost;

    const unitCostUsd = item.qty > 0 ? totalItemCost / item.qty : 0;
    
    // Tính Giá DDP & Margin
    const marginMultiplier = 1 + item.marginPercent / 100;
    const ddpPriceUsd = unitCostUsd * marginMultiplier;
    
    // Tính VND & Roundup -4 (làm tròn lên hàng chục nghìn)
    const ddpPriceVndRaw = ddpPriceUsd * exchangeRate;
    const ddpPriceVnd = Math.ceil(ddpPriceVndRaw / 10000) * 10000;
    
    const marginPerUnitUsd = ddpPriceUsd - unitCostUsd;

    // Cộng dồn Total
    totalCostUsd += totalItemCost;
    totalRevenueUsd += (ddpPriceUsd * item.qty);

    return {
      ...item,
      apportionedLogistics,
      apportionedBank,
      apportionedInsurance,
      dutyAmount,
      commissionAmount,
      citAmount,
      unitCostUsd,
      ddpPriceUsd,
      ddpPriceVnd,
      marginPerUnitUsd,
    };
  });

  const totalRevenueVnd = totalRevenueUsd * exchangeRate;
  totalMarginUsd = totalRevenueUsd - totalCostUsd;
  const actualMarginPct = totalRevenueUsd > 0 ? (totalMarginUsd / totalRevenueUsd) * 100 : 0;

  return {
    items: finalItems,
    totalWeight,
    totalLogisticsUsd,
    totalBankFeeUsd,
    totalInsuranceUsd,
    totalCostUsd,
    totalRevenueUsd,
    totalRevenueVnd,
    totalMarginUsd,
    actualMarginPct,
  };
}
