"use client";

import { useState, useMemo } from "react";
import { calculateCBU, CBUItemEngineData, CBUGlobals } from "../../../lib/cbu-engine";

export default function CBUForm() {
  // A. Thông tin đơn hàng (Readonly mock for now, this would usually come from props)
  const orderInfo = {
    jobNo: "AC0084-PCS-OTHVN",
    customer: "Hoang Son",
    incoterm: "DDP Vung Tau",
    paymentTerms: "30% with order, 70% prior shipment",
    inquiryDate: "2026-08-09",
    supplier: "Keystone",
    currency: "USD",
  };

  // State for Globals
  const [globals, setGlobals] = useState<CBUGlobals>({
    // B. Tỷ giá & làm tròn
    exchangeRate: 26500,
    bookingExchangeRate: 26500,
    vndRoundingStep: 10000,
    lbToKg: 0.4536,
    
    // C. Điều kiện áp dụng
    goodsOrigin: "Oversea",
    destinationCountry: "VN",

    // D. Logistics
    freightCost: 0,
    freightFixed: 0,
    freightRatePerKg: 0,
    chargeableWeightKg: 0,
    clearanceCost: 150,
    inlandCost: 100,
    docFee: 0,

    // E. Bảo hiểm
    insuredValuePercent: 110,
    insuranceRatePercent: 0.01,
    minInsuranceUsd: 15,

    // F. Phí ngân hàng
    remittanceRatePercent: 0.2,
    bankVatFactor: 1.1,
    minRemittanceFeeUsd: 50,
    receiveRatePercent: 0.05,
    minReceiveFeeUsd: 5,
    receiveBaseUsd: 0,
    otherBankFeeUsd: 0,

    // G. Chi phí vốn
    percentValueFinanced: 50,
    interestRatePercent: 15,
    financingDays: 15,
    daysPerYear: 360,

    customColumns: [],
  });

  // State for Items (I. Cấp dòng hàng)
  const [items, setItems] = useState<CBUItemEngineData[]>([
    {
      id: "1",
      lineNo: 1,
      rawPartNumber: "VALVE-001",
      rawDescription: "Gate Valve 2 inch",
      uom: "PCS",
      qty: 10,
      supplierUnitPrice: 500,
      netWeightLbs: 20,
      dutyPercent: 0,
      commissionPercent: 3,
      citPercent: 20,
      marginPercent: 25,
      customValues: {}
    }
  ]);

  // Live calculation
  const result = useMemo(() => {
    return calculateCBU(items, globals);
  }, [items, globals]);

  const handleGlobalChange = (field: keyof CBUGlobals, value: any) => {
    setGlobals(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index: number, field: keyof CBUItemEngineData, value: any) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const formatMoney = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return "0.00";
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatVnd = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return "0";
    return val.toLocaleString('vi-VN');
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 space-y-6">
      
      {/* Header Info */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">A. Thông tin đơn hàng (Chỉ hiển thị)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500 block">Job No</span><span className="font-semibold">{orderInfo.jobNo}</span></div>
          <div><span className="text-gray-500 block">Customer</span><span className="font-semibold">{orderInfo.customer}</span></div>
          <div><span className="text-gray-500 block">Incoterm</span><span className="font-semibold">{orderInfo.incoterm}</span></div>
          <div><span className="text-gray-500 block">Payment</span><span className="font-semibold">{orderInfo.paymentTerms}</span></div>
          <div><span className="text-gray-500 block">Inquiry Date</span><span className="font-semibold">{orderInfo.inquiryDate}</span></div>
          <div><span className="text-gray-500 block">Supplier</span><span className="font-semibold">{orderInfo.supplier}</span></div>
          <div><span className="text-gray-500 block">Currency</span><span className="font-semibold">{orderInfo.currency}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Settings */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* B. Tỷ giá & làm tròn */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">B. Tỷ giá & Làm tròn</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Exchange Rate (VND/USD)</label>
                <input type="number" value={globals.exchangeRate} onChange={e => handleGlobalChange("exchangeRate", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Booking Rate</label>
                <input type="number" value={globals.bookingExchangeRate} onChange={e => handleGlobalChange("bookingExchangeRate", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">VND Rounding Step</label>
                <input type="number" value={globals.vndRoundingStep} onChange={e => handleGlobalChange("vndRoundingStep", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">LB to KG factor</label>
                <input type="number" step="0.0001" value={globals.lbToKg} onChange={e => handleGlobalChange("lbToKg", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* C. Điều kiện */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">C. Điều kiện áp dụng</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Goods Origin</label>
                  <select value={globals.goodsOrigin} onChange={e => handleGlobalChange("goodsOrigin", e.target.value)} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="Oversea">Oversea</option>
                    <option value="Local">Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Destination Country</label>
                  <input type="text" value={globals.destinationCountry} onChange={e => handleGlobalChange("destinationCountry", e.target.value)} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>

            {/* E. Bảo hiểm */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">E. Bảo hiểm</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Insured Value (%)</label>
                  <input type="number" value={globals.insuredValuePercent} onChange={e => handleGlobalChange("insuredValuePercent", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Rate (%)</label>
                  <input type="number" step="0.01" value={globals.insuranceRatePercent} onChange={e => handleGlobalChange("insuranceRatePercent", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Insurance (USD)</label>
                  <input type="number" value={globals.minInsuranceUsd} onChange={e => handleGlobalChange("minInsuranceUsd", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* D. Logistics */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">D. Logistics (USD)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Freight Cost (All-in)</label>
                <input type="number" value={globals.freightCost} onChange={e => handleGlobalChange("freightCost", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Freight Fixed</label>
                <input type="number" value={globals.freightFixed} onChange={e => handleGlobalChange("freightFixed", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" disabled={Number(globals.freightCost) > 0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate Per Kg</label>
                <input type="number" step="0.1" value={globals.freightRatePerKg} onChange={e => handleGlobalChange("freightRatePerKg", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" disabled={Number(globals.freightCost) > 0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Chargeable Wt (kg)</label>
                <input type="number" value={globals.chargeableWeightKg} onChange={e => handleGlobalChange("chargeableWeightKg", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" disabled={Number(globals.freightCost) > 0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Clearance Cost</label>
                <input type="number" value={globals.clearanceCost} onChange={e => handleGlobalChange("clearanceCost", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Inland Cost</label>
                <input type="number" value={globals.inlandCost} onChange={e => handleGlobalChange("inlandCost", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Doc Fee</label>
                <input type="number" value={globals.docFee} onChange={e => handleGlobalChange("docFee", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            {Number(globals.freightCost) > 0 && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded border border-amber-200">
                Lưu ý: "Freight Cost (All-in)" đang &gt; 0, sẽ ghi đè các mục tính theo Fixed/Rate/Kg.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* F. Phí ngân hàng */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">F. Phí ngân hàng</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remit Rate (%)</label>
                  <input type="number" step="0.01" value={globals.remittanceRatePercent} onChange={e => handleGlobalChange("remittanceRatePercent", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Remit (USD)</label>
                  <input type="number" value={globals.minRemittanceFeeUsd} onChange={e => handleGlobalChange("minRemittanceFeeUsd", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Receive Rate (%)</label>
                  <input type="number" step="0.01" value={globals.receiveRatePercent} onChange={e => handleGlobalChange("receiveRatePercent", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Receive (USD)</label>
                  <input type="number" value={globals.minReceiveFeeUsd} onChange={e => handleGlobalChange("minReceiveFeeUsd", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Receive Base (USD)</label>
                  <input type="number" value={globals.receiveBaseUsd} onChange={e => handleGlobalChange("receiveBaseUsd", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">VAT Factor</label>
                  <input type="number" step="0.1" value={globals.bankVatFactor} onChange={e => handleGlobalChange("bankVatFactor", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Other Bank Fee (USD)</label>
                  <input type="number" value={globals.otherBankFeeUsd} onChange={e => handleGlobalChange("otherBankFeeUsd", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>

            {/* G. Chi phí vốn */}
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">G. Chi phí vốn</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Financed (%)</label>
                  <input type="number" value={globals.percentValueFinanced} onChange={e => handleGlobalChange("percentValueFinanced", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%)</label>
                  <input type="number" value={globals.interestRatePercent} onChange={e => handleGlobalChange("interestRatePercent", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Financing Days</label>
                  <input type="number" value={globals.financingDays} onChange={e => handleGlobalChange("financingDays", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Days Per Year</label>
                  <input type="number" value={globals.daysPerYear} onChange={e => handleGlobalChange("daysPerYear", Number(e.target.value))} className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Live Results */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl shadow-lg text-white sticky top-4">
            <h3 className="font-bold text-xl mb-4 text-blue-300">Live Result</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Material Cost</span>
                <span className="font-mono text-lg">${formatMoney(result.totalMaterialUsd)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Logistics</span>
                <span className="font-mono text-lg">${formatMoney(result.totalLogisticsUsd)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Bank Fee</span>
                <span className="font-mono text-lg">${formatMoney(result.totalBankFeeUsd)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Unit Cost</span>
                <span className="font-mono text-lg">${formatMoney(result.totalCostUsd)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Revenue</span>
                <span className="font-mono text-xl font-bold text-green-400">${formatMoney(result.totalRevenueUsd)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-400">Total Revenue (VND)</span>
                <span className="font-mono text-xl font-bold text-green-400">{formatVnd(result.totalRevenueVnd)} ₫</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-400">Target Margin</span>
                <span className="font-mono text-2xl font-black text-blue-400">{result.effectiveMarginPct?.toFixed(2)}%</span>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className="mt-6 bg-red-900/50 border border-red-500/50 rounded-lg p-3">
                <h4 className="text-red-300 text-sm font-bold mb-2 flex items-center gap-2">
                  ⚠️ Cảnh báo
                </h4>
                <ul className="list-disc pl-4 text-xs text-red-200 space-y-1">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* I. Cấp dòng hàng */}
      <div className="bg-white p-5 rounded-xl border shadow-sm overflow-hidden">
        <h3 className="font-semibold text-gray-700 mb-4">I. Line Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase border-b">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Part / Desc</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Unit Price ($)</th>
                <th className="px-4 py-3">Net Wt (lbs)</th>
                <th className="px-4 py-3 border-l bg-blue-50">Duty %</th>
                <th className="px-4 py-3 bg-blue-50">Comm %</th>
                <th className="px-4 py-3 bg-blue-50">CIT %</th>
                <th className="px-4 py-3 bg-blue-50">Margin %</th>
                <th className="px-4 py-3 border-l text-right">DDP Price ($)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const calculatedItem = result.items[index];
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">{item.lineNo}</td>
                    <td className="px-4 py-3 font-medium">
                      <div>{item.rawPartNumber}</div>
                      <div className="text-xs text-gray-500 font-normal">{item.rawDescription}</div>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={item.qty} onChange={e => handleItemChange(index, "qty", Number(e.target.value))} className="w-16 border rounded p-1 text-xs" />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.uom}</td>
                    <td className="px-4 py-3">
                      <input type="number" value={item.supplierUnitPrice} onChange={e => handleItemChange(index, "supplierUnitPrice", Number(e.target.value))} className="w-20 border rounded p-1 text-xs" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={item.netWeightLbs} onChange={e => handleItemChange(index, "netWeightLbs", Number(e.target.value))} className="w-20 border rounded p-1 text-xs" />
                    </td>
                    <td className="px-4 py-3 border-l bg-blue-50/50">
                      <input type="number" value={item.dutyPercent} onChange={e => handleItemChange(index, "dutyPercent", Number(e.target.value))} className="w-16 border border-blue-200 rounded p-1 text-xs bg-white" />
                    </td>
                    <td className="px-4 py-3 bg-blue-50/50">
                      <input type="number" value={item.commissionPercent} onChange={e => handleItemChange(index, "commissionPercent", Number(e.target.value))} className="w-16 border border-blue-200 rounded p-1 text-xs bg-white" />
                    </td>
                    <td className="px-4 py-3 bg-blue-50/50">
                      <input type="number" value={item.citPercent} onChange={e => handleItemChange(index, "citPercent", Number(e.target.value))} className="w-16 border border-blue-200 rounded p-1 text-xs bg-white" />
                    </td>
                    <td className="px-4 py-3 bg-blue-50/50">
                      <input type="number" value={item.marginPercent} onChange={e => handleItemChange(index, "marginPercent", Number(e.target.value))} className="w-16 border border-blue-200 rounded p-1 text-xs bg-white" />
                    </td>
                    <td className="px-4 py-3 border-l text-right font-mono font-semibold text-green-600">
                      ${formatMoney(calculatedItem?.ddpPriceUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <button 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            onClick={() => {
              const newItem: CBUItemEngineData = {
                id: Math.random().toString(),
                lineNo: items.length + 1,
                rawPartNumber: "NEW-PART",
                uom: "PCS",
                qty: 1,
                supplierUnitPrice: 0,
                netWeightLbs: 0,
                dutyPercent: 0,
                commissionPercent: 3,
                citPercent: 20,
                marginPercent: 25,
                customValues: {}
              };
              setItems([...items, newItem]);
            }}
          >
            + Add Line Item
          </button>
        </div>
      </div>

    </div>
  );
}
