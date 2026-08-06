"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateCBU, CBUItemEngineData, CBUResult, CustomColumnDef } from "@/lib/cbu-engine";

export default function CBUCalcPage({ params }: { params: { id: string } }) {
  const { id: rfqId } = params;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [rfqCode, setRfqCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [supplierName, setSupplierName] = useState("");

  // Global inputs
  const [exchangeRate, setExchangeRate] = useState(25500);
  const [freightCost, setFreightCost] = useState(0);
  const [clearanceCost, setClearanceCost] = useState(0);
  const [inlandCost, setInlandCost] = useState(0);
  const [bankFeePercent, setBankFeePercent] = useState(0);
  const [insurancePercent, setInsurancePercent] = useState(0);

  // Custom Columns Config
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([]);

  // Add Column Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"AMOUNT" | "PERCENT">("AMOUNT");

  // Items base state (before calc)
  const [items, setItems] = useState<CBUItemEngineData[]>([]);
  
  // Calculated Result State
  const [cbuResult, setCbuResult] = useState<CBUResult | null>(null);

  // ── Load RFQ data ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/rfq/${rfqId}`);
        if (!res.ok) throw new Error("Không tìm thấy đơn hàng.");
        const data = await res.json();

        setRfqCode(data.rfqCode || "");
        setClientName(data.client?.name || "");
        setCompanyName(data.client?.companyName || "");
        setSupplierName(data.supplierName || "");
        
        setExchangeRate(data.exchangeRate || 25500);
        setFreightCost(data.freightCost || 0);
        setClearanceCost(data.clearanceCost || 0);
        setInlandCost(data.inlandCost || 0);
        setBankFeePercent(data.bankFeePercent || 0);
        setInsurancePercent(data.insurancePercent || 0);
        setCustomColumns(data.customColumns || []);

        const loadedItems: CBUItemEngineData[] = (data.items || []).map((item: any) => ({
          id: item.id,
          lineNo: item.lineNo,
          rawPartNumber: item.rawPartNumber || "",
          uom: item.uom || "PCS",
          qty: item.qty || 1,
          supplierUnitPrice: item.supplierUnitPrice || 0,
          netWeightLbs: item.netWeightLbs || 0,
          
          dutyPercent: item.dutyPercent || 0,
          commissionPercent: item.commissionPercent || 0,
          citPercent: item.citPercent || 0,
          marginPercent: item.marginPercent || 0,
          
          customValues: item.customValues || {},
        }));

        setItems(loadedItems);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [rfqId]);

  // ── Live Recalculate Effect ───────────────────────────────────────────
  useEffect(() => {
    if (!loading && items.length > 0) {
      const res = calculateCBU(items, {
        exchangeRate,
        freightCost,
        clearanceCost,
        inlandCost,
        bankFeePercent,
        insurancePercent,
        customColumns,
      });
      setCbuResult(res);
    }
  }, [
    items,
    exchangeRate,
    freightCost,
    clearanceCost,
    inlandCost,
    bankFeePercent,
    insurancePercent,
    customColumns,
    loading
  ]);

  // ── Field Updaters ──────────────────────────────────────────────────
  const updateItemField = (id: string, field: keyof CBUItemEngineData, value: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const updateItemCustomValue = (itemId: string, colId: string, value: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          customValues: {
            ...item.customValues,
            [colId]: value,
          },
        };
      })
    );
  };

  // ── Custom Columns Handlers ───────────────────────────────────────────
  const handleAddCustomColumn = () => {
    if (!newColName.trim()) return;
    const newCol: CustomColumnDef = {
      id: `col_${Date.now()}`,
      name: newColName.trim(),
      type: newColType,
    };
    setCustomColumns((prev) => [...prev, newCol]);
    setShowAddModal(false);
    setNewColName("");
    setNewColType("AMOUNT");
  };

  const handleDeleteCustomColumn = (colId: string) => {
    if (!confirm("Xóa cột tùy chỉnh này khỏi bảng? Dữ liệu lịch sử đã nhập sẽ không được tính toán nữa.")) return;
    setCustomColumns((prev) => prev.filter((col) => col.id !== colId));
  };

  // ── Save handler ─────────────────────────────────────────────────────
  const handleSave = async (finalize: boolean) => {
    if (!cbuResult) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/rfq/${rfqId}/calculate-cbu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalize,
          exchangeRate,
          freightCost,
          clearanceCost,
          inlandCost,
          bankFeePercent,
          insurancePercent,
          customColumns,
          totalCostUsd: cbuResult.totalCostUsd,
          totalRevenueUsd: cbuResult.totalRevenueUsd,
          totalRevenueVnd: cbuResult.totalRevenueVnd,
          totalMarginUsd: cbuResult.totalMarginUsd,
          actualMarginPct: cbuResult.actualMarginPct,
          items: cbuResult.items,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi lưu.");

      if (finalize) {
        setSuccess("Hoàn tất CBU! Đang chuyển sang trang Preview...");
        setTimeout(() => router.push(`/rfq/${rfqId}/quote-preview`), 1500);
      } else {
        setSuccess("Đã lưu nháp CBU thành công.");
        setSaving(false);
      }
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  // ── Helper: format number ────────────────────────────────────────────
  const fmt = (n: number | undefined, dec = 2) =>
    (n || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtVnd = (n: number | undefined) =>
    (n || 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (loading || !cbuResult) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải dữ liệu CBU...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/rfq" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">📊 Tính Toán CBU</h1>
          </div>
          <p className="text-gray-500 text-sm">
            <span className="font-semibold text-blue-600">{rfqCode}</span>
            {clientName && <> · {clientName}</>}
            {companyName && <> — {companyName}</>}
            {supplierName && <> · Hãng: <span className="font-semibold">{supplierName}</span></>}
          </p>
        </div>

        {/* Exchange Rate Control */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Tỷ giá USD/VND:</label>
          <input
            type="number"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 text-right font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          3 Sub-Ledger Cards
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1: LOGISTICS COST */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-blue-600">🚢</span> Logistics Cost
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Freight ($)</label>
                <input type="number" step="0.01" value={freightCost} onChange={(e) => setFreightCost(Number(e.target.value))} className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-right text-sm font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Clearance ($)</label>
                <input type="number" step="0.01" value={clearanceCost} onChange={(e) => setClearanceCost(Number(e.target.value))} className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-right text-sm font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Inland ($)</label>
                <input type="number" step="0.01" value={inlandCost} onChange={(e) => setInlandCost(Number(e.target.value))} className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-right text-sm font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
              </div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 bg-gray-50/50 rounded-lg p-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Total Weight:</span>
              <span className="font-mono font-semibold text-gray-700">{fmt(cbuResult.totalWeight)} lbs</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Total Logistics ($):</span>
              <span className="font-mono font-semibold text-gray-700">${fmt(cbuResult.totalLogisticsUsd)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-600 font-medium">
              <span>Logistics Rate ($/lb):</span>
              <span className="font-mono">${cbuResult.totalWeight > 0 ? fmt((cbuResult.totalLogisticsUsd + 15) / cbuResult.totalWeight) : "0.00"}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 italic text-right">*Đã bao gồm +$15 Docs Fee</p>
          </div>
        </div>

        {/* CARD 2: BANK FEE */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-amber-500">🏦</span> Bank Fee
            </h3>
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs text-gray-500">Bank Fee Rate (%)</label>
              <input type="number" step="0.01" value={bankFeePercent} onChange={(e) => setBankFeePercent(Number(e.target.value))} className="w-24 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md text-right text-sm font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 bg-amber-50/30 rounded-lg p-3">
            <div className="flex justify-between text-xs text-amber-700 font-medium">
              <span>Total Bank Fee ($):</span>
              <span className="font-mono font-bold">${fmt(cbuResult.totalBankFeeUsd)}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: INSURANCE */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-emerald-600">🛡️</span> Insurance
            </h3>
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs text-gray-500">Insurance Rate (%)</label>
              <input type="number" step="0.01" value={insurancePercent} onChange={(e) => setInsurancePercent(Number(e.target.value))} className="w-24 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-right text-sm font-mono text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 bg-emerald-50/30 rounded-lg p-3">
            <div className="flex justify-between text-xs text-emerald-700 font-medium">
              <span>Total Insurance ($):</span>
              <span className="font-mono font-bold">${fmt(cbuResult.totalInsuranceUsd)}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Margin Analysis (Main Table)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Margin Analysis Engine</h2>
              <p className="text-xs text-gray-400 mt-0.5">Chi phí tự động phân bổ theo trọng lượng và giá vật tư.</p>
            </div>
            
            {/* Toolbar: Add Custom Column */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Custom Column
            </button>
          </div>
          
          {/* Summary Mini-Cards */}
          <div className="flex gap-4 items-center mr-2">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Total Cost</p>
              <p className="text-sm font-bold text-gray-900 font-mono">${fmt(cbuResult.totalCostUsd)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200"></div>
            <div className="text-right">
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider">Total Rev</p>
              <p className="text-sm font-bold text-blue-700 font-mono">${fmt(cbuResult.totalRevenueUsd)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200"></div>
            <div className="text-right">
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">Margin</p>
              <p className={`text-sm font-bold font-mono ${cbuResult.actualMarginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${fmt(cbuResult.totalMarginUsd)} ({fmt(cbuResult.actualMarginPct, 1)}%)
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full max-w-[100vw]">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                {/* Fixed Info Columns */}
                <th className="text-left px-2.5 py-2.5 text-gray-500 font-semibold min-w-[30px] whitespace-nowrap">#</th>
                <th className="text-left px-2.5 py-2.5 text-gray-500 font-semibold min-w-[150px] whitespace-nowrap">Part Number</th>
                <th className="text-center px-2.5 py-2.5 text-gray-500 font-semibold min-w-[50px] whitespace-nowrap">Qty</th>
                <th className="text-right px-2.5 py-2.5 text-gray-500 font-semibold min-w-[90px] whitespace-nowrap">Supplier ($)</th>
                
                {/* DYNAMIC CUSTOM COLUMNS */}
                {customColumns.map(col => (
                  <th key={col.id} className="text-right px-2.5 py-2.5 text-pink-600 font-semibold min-w-[90px] whitespace-nowrap bg-pink-50/30 border-x border-pink-100">
                    <div className="flex items-center justify-end gap-1.5 group">
                      <button onClick={() => handleDeleteCustomColumn(col.id)} className="text-pink-300 hover:text-pink-700 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove column">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      <span>{col.name} <span className="bg-pink-100 text-pink-800 px-1 py-0.5 rounded text-[10px]">{col.type === "AMOUNT" ? "$" : "%"}</span></span>
                    </div>
                  </th>
                ))}
                
                {/* Fixed Fee Columns */}
                <th className="text-right px-2.5 py-2.5 text-amber-600 font-semibold min-w-[70px] whitespace-nowrap">Duty %</th>
                <th className="text-right px-2.5 py-2.5 text-amber-600 font-semibold min-w-[70px] whitespace-nowrap">Comm %</th>
                <th className="text-right px-2.5 py-2.5 text-amber-600 font-semibold min-w-[70px] whitespace-nowrap">CIT %</th>
                <th className="text-right px-2.5 py-2.5 text-blue-600 font-semibold min-w-[70px] whitespace-nowrap bg-blue-50/50">Margin %</th>
                
                {/* Final Results */}
                <th className="text-right px-2.5 py-2.5 text-gray-500 font-semibold min-w-[90px] whitespace-nowrap border-l border-gray-100">Base Cost ($)</th>
                <th className="text-right px-2.5 py-2.5 text-blue-600 font-semibold min-w-[90px] whitespace-nowrap">DDP USD ($)</th>
                <th className="text-right px-2.5 py-2.5 text-violet-600 font-semibold min-w-[100px] whitespace-nowrap">DDP VND (₫)</th>
                <th className="text-right px-2.5 py-2.5 text-emerald-600 font-semibold min-w-[90px] whitespace-nowrap">Margin/U ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cbuResult.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-2.5 py-2 text-gray-400 font-mono whitespace-nowrap">{item.lineNo || idx + 1}</td>
                  <td className="px-2.5 py-2 text-gray-900 font-mono font-medium truncate max-w-[200px]" title={(item as any).rawPartNumber}>
                    {(item as any).rawPartNumber}
                  </td>
                  <td className="px-2.5 py-2 text-center text-gray-700 font-mono whitespace-nowrap">{item.qty}</td>
                  <td className="px-2.5 py-2 text-right text-gray-900 font-mono whitespace-nowrap">{fmt(item.supplierUnitPrice)}</td>

                  {/* DYNAMIC CUSTOM COLUMNS INPUTS */}
                  {customColumns.map(col => (
                    <td key={col.id} className="px-1.5 py-1.5 bg-pink-50/10 border-x border-pink-50">
                      <input 
                        type="number" step="0.01" 
                        value={item.customValues[col.id] || ""} 
                        onChange={(e) => updateItemCustomValue(item.id, col.id, Number(e.target.value))} 
                        placeholder="0"
                        className="w-full px-1.5 py-1 bg-white border border-pink-100 rounded text-right text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-pink-500/50 min-w-[60px]" 
                      />
                    </td>
                  ))}

                  {/* Editable: Duty % */}
                  <td className="px-1.5 py-1.5">
                    <input type="number" step="0.1" value={item.dutyPercent} onChange={(e) => updateItemField(item.id, "dutyPercent", Number(e.target.value))} className="w-full px-1.5 py-1 bg-amber-50 border border-amber-200 rounded text-right text-xs font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50 min-w-[50px]" />
                  </td>

                  {/* Editable: Commission % */}
                  <td className="px-1.5 py-1.5">
                    <input type="number" step="0.1" value={item.commissionPercent} onChange={(e) => updateItemField(item.id, "commissionPercent", Number(e.target.value))} className="w-full px-1.5 py-1 bg-amber-50 border border-amber-200 rounded text-right text-xs font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50 min-w-[50px]" />
                  </td>

                  {/* Editable: CIT % */}
                  <td className="px-1.5 py-1.5">
                    <input type="number" step="0.1" value={item.citPercent} onChange={(e) => updateItemField(item.id, "citPercent", Number(e.target.value))} className="w-full px-1.5 py-1 bg-amber-50 border border-amber-200 rounded text-right text-xs font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-500/50 min-w-[50px]" />
                  </td>

                  {/* Editable: Margin % */}
                  <td className="px-1.5 py-1.5 bg-blue-50/20">
                    <input type="number" step="0.1" value={item.marginPercent} onChange={(e) => updateItemField(item.id, "marginPercent", Number(e.target.value))} className="w-full px-1.5 py-1 bg-blue-50 border border-blue-200 rounded text-right text-xs font-mono text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-w-[50px]" />
                  </td>

                  {/* Computed: Base Cost/Unit */}
                  <td className="px-2.5 py-2 text-right text-gray-700 font-mono font-medium border-l border-gray-100 bg-gray-50/30 whitespace-nowrap" title={`Logistics: $${fmt(item.apportionedLogistics)}\nBank: $${fmt(item.apportionedBank)}\nInsurance: $${fmt(item.apportionedInsurance)}\nDuty: $${fmt(item.dutyAmount)}\nComm: $${fmt(item.commissionAmount)}\nCIT: $${fmt(item.citAmount)}`}>
                    {fmt(item.unitCostUsd)}
                  </td>

                  {/* Computed: DDP USD */}
                  <td className="px-2.5 py-2 text-right text-blue-700 font-mono font-bold whitespace-nowrap">{fmt(item.ddpPriceUsd)}</td>

                  {/* Computed: DDP VND (Rounded Up) */}
                  <td className="px-2.5 py-2 text-right text-violet-700 font-mono font-semibold whitespace-nowrap">{fmtVnd(item.ddpPriceVnd)}</td>

                  {/* Computed: Margin/Unit */}
                  <td className={`px-2.5 py-2 text-right font-mono font-semibold whitespace-nowrap ${item.marginPerUnitUsd! >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmt(item.marginPerUnitUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Bottom Action Buttons
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl border border-gray-200 shadow-sm transition-all disabled:opacity-40"
        >
          💾 Save Draft
        </button>

        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20"
        >
          {saving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Đang lưu...
            </>
          ) : (
            <>
              Complete CBU & Generate Quote
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ADD CUSTOM COLUMN MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add Custom Column</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Column Name</label>
                <input 
                  type="text" 
                  value={newColName} 
                  onChange={(e) => setNewColName(e.target.value)} 
                  placeholder="VD: Phí đăng kiểm, Coating Fee..." 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Calculation Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setNewColType("AMOUNT")}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${newColType === "AMOUNT" ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    <span className="text-lg font-bold font-mono">$</span> Amount / Unit
                  </button>
                  <button 
                    onClick={() => setNewColType("PERCENT")}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${newColType === "PERCENT" ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    <span className="text-lg font-bold font-mono">%</span> of Material Cost
                  </button>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddCustomColumn}
                disabled={!newColName.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
