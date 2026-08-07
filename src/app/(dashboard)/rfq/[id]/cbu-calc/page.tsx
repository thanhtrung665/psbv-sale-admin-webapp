"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateCBU, CBUItemEngineData, CBUResult, CustomColumnDef } from "@/lib/cbu-engine";

// Tailwind class for removing spin buttons on all browsers
const NUM_INPUT = [
  "w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md",
  "text-right text-xs font-mono text-slate-800",
  "focus:outline-none focus:ring-1 focus:ring-slate-400/60",
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
].join(" ");

const NUM_INPUT_AMBER = [
  "w-full px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md",
  "text-right text-xs font-mono text-amber-700",
  "focus:outline-none focus:ring-1 focus:ring-amber-400/60",
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
].join(" ");

const NUM_INPUT_BLUE = [
  "w-full px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md",
  "text-right text-xs font-mono text-blue-700",
  "focus:outline-none focus:ring-1 focus:ring-blue-400/60",
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
].join(" ");

const NUM_INPUT_PINK = [
  "w-full px-1.5 py-1 bg-white border border-pink-100 rounded text-right text-xs font-mono text-slate-800",
  "focus:outline-none focus:ring-1 focus:ring-pink-400/50 min-w-[60px]",
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
].join(" ");

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

        // Defensive: customColumns may be null for older records
        const cols = Array.isArray(data.customColumns) ? data.customColumns : [];
        setCustomColumns(cols);

        const loadedItems: CBUItemEngineData[] = (data.items || []).map((item: any) => ({
          id: item.id,
          lineNo: item.lineNo,
          rawPartNumber: item.rawPartNumber || "",
          uom: item.uom || "PCS",
          qty: Number(item.qty) || 1,
          supplierUnitPrice: Number(item.supplierUnitPrice) || 0,
          netWeightLbs: Number(item.netWeightLbs) || 0,

          dutyPercent: Number(item.dutyPercent) || 0,
          commissionPercent: Number(item.commissionPercent) || 0,
          citPercent: Number(item.citPercent) || 0,
          marginPercent: Number(item.marginPercent) || 0,

          // Defensive: customValues may be null
          customValues: (item.customValues && typeof item.customValues === "object") ? item.customValues : {},
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
      try {
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
      } catch (e) {
        console.error("CBU calculation error:", e);
      }
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
    loading,
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
            ...(item.customValues || {}),
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
    if (!confirm("Xóa cột tùy chỉnh này khỏi bảng?")) return;
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
    (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtVnd = (n: number | undefined) =>
    (n ?? 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải dữ liệu CBU...
        </div>
      </div>
    );
  }

  if (error && !cbuResult) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <p className="text-red-600 font-medium">{error}</p>
          <Link href="/rfq" className="text-sm text-slate-500 hover:text-slate-900">← Quay lại danh sách</Link>
        </div>
      </div>
    );
  }

  if (!cbuResult) return null;

  return (
    <div className="space-y-5 max-w-full mx-auto pb-12">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/rfq" className="text-slate-400 hover:text-slate-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Tính Toán CBU</h1>
          </div>
          <p className="text-slate-500 text-sm">
            <span className="font-semibold text-blue-600">{rfqCode}</span>
            {clientName && <> · {clientName}</>}
            {companyName && <> — {companyName}</>}
            {supplierName && <> · <span className="font-medium text-slate-700">{supplierName}</span></>}
          </p>
        </div>

        {/* Exchange Rate */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Tỷ giá USD/VND</label>
          <input
            type="text"
            inputMode="decimal"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
            className={`w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-sm text-right font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        </div>
      </div>

      {/* ── Alerts ────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3.5 text-red-700 text-sm">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-emerald-700 text-sm">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* ── 3 Sub-Ledger Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* CARD 1: LOGISTICS COST */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Logistics Cost</h3>
            <div className="space-y-2.5">
              {[
                { label: "Freight ($)", val: freightCost, set: setFreightCost },
                { label: "Clearance ($)", val: clearanceCost, set: setClearanceCost },
                { label: "Inland ($)", val: inlandCost, set: setInlandCost },
              ].map(({ label, val, set }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <label className="text-xs text-slate-500 whitespace-nowrap">{label}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => set(parseFloat(e.target.value) || 0)}
                    className={`w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-right text-sm font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Total Weight</span>
              <span className="font-mono font-medium text-slate-700">{fmt(cbuResult.totalWeight)} lbs</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Total Logistics</span>
              <span className="font-mono font-medium text-slate-700">${fmt(cbuResult.totalLogisticsUsd)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-blue-600">
              <span>Rate ($/lb)</span>
              <span className="font-mono">
                ${cbuResult.totalWeight > 0 ? fmt((cbuResult.totalLogisticsUsd + 15) / cbuResult.totalWeight) : "0.00"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 text-right italic">+$15 Docs Fee included</p>
          </div>
        </div>

        {/* CARD 2: BANK FEE */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Bank Fee</h3>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-slate-500 whitespace-nowrap">Bank Fee Rate (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={bankFeePercent}
                onChange={(e) => setBankFeePercent(parseFloat(e.target.value) || 0)}
                className={`w-24 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-right text-sm font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex justify-between text-xs font-medium text-amber-700">
              <span>Total Bank Fee</span>
              <span className="font-mono font-bold">${fmt(cbuResult.totalBankFeeUsd)}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: INSURANCE */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Insurance</h3>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-slate-500 whitespace-nowrap">Insurance Rate (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={insurancePercent}
                onChange={(e) => setInsurancePercent(parseFloat(e.target.value) || 0)}
                className={`w-24 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-right text-sm font-mono text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex justify-between text-xs font-medium text-emerald-700">
              <span>Total Insurance</span>
              <span className="font-mono font-bold">${fmt(cbuResult.totalInsuranceUsd)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Margin Analysis Table ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Table Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Margin Analysis Engine</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Chi phí tự động phân bổ theo trọng lượng và giá vật tư.</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Column
            </button>
          </div>

          {/* Summary mini stats */}
          <div className="flex gap-5 items-center">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Cost</p>
              <p className="text-sm font-bold text-slate-900 font-mono">${fmt(cbuResult.totalCostUsd)}</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            <div className="text-right">
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider">Revenue</p>
              <p className="text-sm font-bold text-blue-700 font-mono">${fmt(cbuResult.totalRevenueUsd)}</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Margin</p>
              <p className={`text-sm font-bold font-mono ${cbuResult.actualMarginPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                ${fmt(cbuResult.totalMarginUsd)} ({fmt(cbuResult.actualMarginPct, 1)}%)
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider text-[10px] min-w-[28px]">#</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider text-[10px] min-w-[140px]">Part Number</th>
                <th className="text-center px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider text-[10px] min-w-[44px]">Qty</th>
                <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider text-[10px] min-w-[90px]">Supplier ($)</th>

                {/* Dynamic custom columns */}
                {(customColumns || []).map((col) => (
                  <th key={col.id} className="text-right px-2.5 py-2.5 text-pink-600 font-semibold uppercase tracking-wider text-[10px] min-w-[90px] bg-pink-50/40 border-x border-pink-100">
                    <div className="flex items-center justify-end gap-1.5 group">
                      <button onClick={() => handleDeleteCustomColumn(col.id)} className="text-pink-300 hover:text-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove column">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      <span>{col.name} <span className="bg-pink-100 text-pink-700 px-1 py-0.5 rounded text-[9px] normal-case">{col.type === "AMOUNT" ? "$" : "%"}</span></span>
                    </div>
                  </th>
                ))}

                <th className="text-right px-3 py-2.5 text-amber-600 font-semibold uppercase tracking-wider text-[10px] min-w-[64px]">Duty %</th>
                <th className="text-right px-3 py-2.5 text-amber-600 font-semibold uppercase tracking-wider text-[10px] min-w-[64px]">Comm %</th>
                <th className="text-right px-3 py-2.5 text-amber-600 font-semibold uppercase tracking-wider text-[10px] min-w-[56px]">CIT %</th>
                <th className="text-right px-3 py-2.5 text-blue-600 font-semibold uppercase tracking-wider text-[10px] min-w-[64px] bg-blue-50/40">Margin %</th>
                <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider text-[10px] min-w-[90px] border-l border-slate-200">Base Cost ($)</th>
                <th className="text-right px-3 py-2.5 text-blue-600 font-semibold uppercase tracking-wider text-[10px] min-w-[90px]">DDP USD ($)</th>
                <th className="text-right px-3 py-2.5 text-violet-600 font-semibold uppercase tracking-wider text-[10px] min-w-[100px]">DDP VND (₫)</th>
                <th className="text-right px-3 py-2.5 text-emerald-600 font-semibold uppercase tracking-wider text-[10px] min-w-[80px]">Margin/U ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(cbuResult?.items || []).map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2 text-slate-400 font-mono">{item.lineNo || idx + 1}</td>
                  <td className="px-3 py-2 text-slate-800 font-mono font-medium truncate max-w-[200px]" title={(item as any).rawPartNumber}>
                    {(item as any).rawPartNumber}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600 font-mono">{item.qty}</td>
                  <td className="px-3 py-2 text-right text-slate-800 font-mono">{fmt(item.supplierUnitPrice)}</td>

                  {/* Dynamic custom column inputs */}
                  {(customColumns || []).map((col) => (
                    <td key={col.id} className="px-1.5 py-1.5 bg-pink-50/10 border-x border-pink-50">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={(item.customValues || {})[col.id] ?? ""}
                        onChange={(e) => updateItemCustomValue(item.id, col.id, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className={NUM_INPUT_PINK}
                      />
                    </td>
                  ))}

                  {/* Duty % */}
                  <td className="px-1.5 py-1.5">
                    <input type="text" inputMode="decimal" value={item.dutyPercent}
                      onChange={(e) => updateItemField(item.id, "dutyPercent", parseFloat(e.target.value) || 0)}
                      className={NUM_INPUT_AMBER} />
                  </td>

                  {/* Commission % */}
                  <td className="px-1.5 py-1.5">
                    <input type="text" inputMode="decimal" value={item.commissionPercent}
                      onChange={(e) => updateItemField(item.id, "commissionPercent", parseFloat(e.target.value) || 0)}
                      className={NUM_INPUT_AMBER} />
                  </td>

                  {/* CIT % */}
                  <td className="px-1.5 py-1.5">
                    <input type="text" inputMode="decimal" value={item.citPercent}
                      onChange={(e) => updateItemField(item.id, "citPercent", parseFloat(e.target.value) || 0)}
                      className={NUM_INPUT_AMBER} />
                  </td>

                  {/* Margin % */}
                  <td className="px-1.5 py-1.5 bg-blue-50/20">
                    <input type="text" inputMode="decimal" value={item.marginPercent}
                      onChange={(e) => updateItemField(item.id, "marginPercent", parseFloat(e.target.value) || 0)}
                      className={NUM_INPUT_BLUE} />
                  </td>

                  {/* Computed columns */}
                  <td className="px-3 py-2 text-right text-slate-600 font-mono font-medium border-l border-slate-100 bg-slate-50/30 whitespace-nowrap"
                    title={`Logistics: $${fmt(item.apportionedLogistics)}\nBank: $${fmt(item.apportionedBank)}\nInsurance: $${fmt(item.apportionedInsurance)}\nDuty: $${fmt(item.dutyAmount)}\nComm: $${fmt(item.commissionAmount)}\nCIT: $${fmt(item.citAmount)}`}>
                    {fmt(item.unitCostUsd)}
                  </td>
                  <td className="px-3 py-2 text-right text-blue-700 font-mono font-bold whitespace-nowrap">{fmt(item.ddpPriceUsd)}</td>
                  <td className="px-3 py-2 text-right text-violet-700 font-mono font-semibold whitespace-nowrap">{fmtVnd(item.ddpPriceVnd)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${(item.marginPerUnitUsd ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {fmt(item.marginPerUnitUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom Action Buttons ─────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
        >
          Save Draft
        </button>

        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-all"
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

      {/* ── Add Custom Column Modal ───────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Add Custom Column</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Column Name</label>
                <input
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="VD: Phí đăng kiểm, Coating Fee..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400 transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Calculation Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewColType("AMOUNT")}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${newColType === "AMOUNT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <span className="font-bold font-mono">$</span> Amount / Unit
                  </button>
                  <button
                    onClick={() => setNewColType("PERCENT")}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${newColType === "PERCENT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <span className="font-bold font-mono">%</span> of Material Cost
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomColumn}
                disabled={!newColName.trim()}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
