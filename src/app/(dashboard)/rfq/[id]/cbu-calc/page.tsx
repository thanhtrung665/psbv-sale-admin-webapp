"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateCBU, CBUItemEngineData, CBUResult, parseJsonField } from "@/lib/cbu-engine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function parsePrismaJson<T>(raw: unknown, fallback: T): T {
  return parseJsonField<T>(raw, fallback);
}

const parseNumInput = (val: any) => {
  if (val === '' || val === null || val === undefined) return 0;
  const parsed = parseFloat(String(val).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
};

// Tailwind class for inputs
const NUM_INPUT_CLASS = "w-full px-2 py-1 border border-slate-200 rounded text-right text-xs font-mono focus:outline-none hover:border-slate-300 focus:border-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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

  // Input states mapping everything to strings for lag-free typing
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // Items base state (static fields, IDs, etc)
  const [items, setItems] = useState<CBUItemEngineData[]>([]);

  // Calculated Result State
  const [cbuResult, setCbuResult] = useState<CBUResult | null>(null);

  // ── Load RFQ data ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/rfq/${rfqId}`);
        if (!res.ok) throw new Error("Không tìm thấy đơn hàng.");
        const rawData = await res.json();

        setRfqCode(rawData.rfqCode || "");
        setClientName(rawData.client?.name || "");
        setCompanyName(rawData.client?.companyName || "");
        setSupplierName(rawData.supplierName || "");

        // Initialize string inputs
        const initInputs: Record<string, string> = {
          exchangeRate: String(safeNum(rawData.exchangeRate, 25500)),
          freightCost: String(safeNum(rawData.freightCost)),
          clearanceCost: String(safeNum(rawData.clearanceCost)),
          inlandCost: String(safeNum(rawData.inlandCost)),
          docFee: String(safeNum(rawData.docFee, 15)),
          bankFeePercent: String(safeNum(rawData.bankFeePercent)),
          insurancePercent: String(safeNum(rawData.insurancePercent)),
        };

        const rawItems: any[] = Array.isArray(rawData.items) ? rawData.items : [];
        const loadedItems: CBUItemEngineData[] = rawItems.map((item: any) => {
          const id = String(item.id || "");
          // Initialize item specific numeric fields to strings
          initInputs[`${id}_supplierUnitPrice`] = String(safeNum(item.supplierUnitPrice));
          initInputs[`${id}_dutyPercent`] = String(safeNum(item.dutyPercent));
          initInputs[`${id}_netWeightLbs`] = String(safeNum(item.netWeightLbs));
          initInputs[`${id}_marginPercent`] = String(safeNum(item.marginPercent));

          return {
            id,
            lineNo: safeNum(item.lineNo, 0),
            rawPartNumber: String(item.rawPartNumber || ""),
            rawDescription: String(item.rawDescription || ""),
            uom: String(item.uom || "PCS"),
            qty: safeNum(item.qty, 1) || 1,
            supplierUnitPrice: 0, // Computed from inputs
            netWeightLbs: 0,
            dutyPercent: 0,
            commissionPercent: 0,
            citPercent: 0,
            marginPercent: 0,
            customValues: {},
          };
        });

        setInputs(initInputs);
        setItems(loadedItems);
      } catch (err: any) {
        setError(err.message ?? "Không thể tải dữ liệu đơn hàng.");
      } finally {
        setLoading(false);
      }
    })();
  }, [rfqId]);


  // ── Live Recalculate Effect ───────────────────────────────────────────
  useEffect(() => {
    if (!loading && items.length > 0) {
      try {
        const engineItems = items.map(item => ({
          ...item,
          supplierUnitPrice: parseNumInput(inputs[`${item.id}_supplierUnitPrice`]),
          netWeightLbs: parseNumInput(inputs[`${item.id}_netWeightLbs`]),
          dutyPercent: parseNumInput(inputs[`${item.id}_dutyPercent`]),
          marginPercent: parseNumInput(inputs[`${item.id}_marginPercent`]),
          commissionPercent: 0, // Ignored in 19-col format
          citPercent: 0,
          customValues: {},
        }));

        const res = calculateCBU(engineItems, {
          exchangeRate: parseNumInput(inputs.exchangeRate),
          freightCost: parseNumInput(inputs.freightCost),
          clearanceCost: parseNumInput(inputs.clearanceCost),
          inlandCost: parseNumInput(inputs.inlandCost),
          docFee: parseNumInput(inputs.docFee),
          bankFeePercent: parseNumInput(inputs.bankFeePercent),
          insurancePercent: parseNumInput(inputs.insurancePercent),
          customColumns: [], // Stripped per requirements
        });
        setCbuResult(res);
      } catch (e) {
        console.error("CBU calculation error:", e);
      }
    }
  }, [inputs, items, loading]);

  // ── Input Handlers ──────────────────────────────────────────────────
  const handleInput = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
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
          exchangeRate: parseNumInput(inputs.exchangeRate),
          freightCost: parseNumInput(inputs.freightCost),
          clearanceCost: parseNumInput(inputs.clearanceCost),
          inlandCost: parseNumInput(inputs.inlandCost),
          docFee: parseNumInput(inputs.docFee),
          bankFeePercent: parseNumInput(inputs.bankFeePercent),
          insurancePercent: parseNumInput(inputs.insurancePercent),
          customColumns: [],
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

  // ── Helper: format number (NaN / Infinity safe) ──────────────────────
  const fmt = (v: number | undefined, dec = 2): string => {
    const num = Number(v);
    return (isFinite(num) ? num : 0).toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  };
  const fmtVnd = (v: number | undefined): string => {
    const num = Number(v);
    return (isFinite(num) ? num : 0).toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

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
    <div className="space-y-5 max-w-[1600px] mx-auto pb-12">
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
            value={inputs.exchangeRate ?? "25500"}
            onChange={(e) => handleInput("exchangeRate", e.target.value)}
            className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-sm text-right font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
        <div className="bg-white rounded-lg overflow-hidden flex flex-col h-full shadow-sm">
          <table className="w-full border-collapse border border-slate-300 text-sm h-full">
            <tbody>
              {[
                { label: "FREIGHT", key: "freightCost" },
                { label: "CUSTOM CLEARANCE", key: "clearanceCost" },
                { label: "INLAND", key: "inlandCost" },
                { label: "DOC FEE", key: "docFee", fallback: "15" },
              ].map(({ label, key, fallback = "0" }) => (
                <tr key={key}>
                  <td className="bg-slate-100 text-xs uppercase font-semibold text-slate-700 px-3 py-2 border border-slate-300 w-1/2">{label}</td>
                  <td className="px-0 py-0 border border-slate-300 bg-white">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={inputs[key] ?? fallback}
                      onChange={(e) => handleInput(key, e.target.value)}
                      className="w-full bg-transparent text-right outline-none px-3 py-2 font-mono text-slate-800 focus:ring-1 focus:ring-slate-400 focus:bg-slate-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="bg-slate-100 text-xs uppercase font-semibold text-slate-700 px-3 py-2 border border-slate-300">TOTAL WEIGHT (KGS/LBS)</td>
                <td className="px-3 py-2 border border-slate-300 bg-slate-50 text-right font-mono font-medium text-slate-700">{fmt(cbuResult.totalWeight)}</td>
              </tr>
              <tr>
                <td className="bg-slate-100 text-xs uppercase font-semibold text-slate-700 px-3 py-2 border border-slate-300">TOTAL AMOUNT ($)</td>
                <td className="px-3 py-2 border border-slate-300 bg-slate-50 text-right font-mono font-bold text-slate-900">${fmt(cbuResult.totalLogisticsUsd)}</td>
              </tr>
              <tr>
                <td className="bg-slate-100 text-xs uppercase font-semibold text-slate-700 px-3 py-2 border border-slate-300">TRANSIT TIME</td>
                <td className="px-3 py-2 border border-slate-300 bg-slate-50 text-right font-mono font-semibold text-blue-600">
                  {cbuResult.totalWeight > 0 ? fmt(cbuResult.totalLogisticsUsd / cbuResult.totalWeight, 2) : "0.00"}/lb
                </td>
              </tr>
            </tbody>
          </table>
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
                value={inputs.bankFeePercent ?? "0"}
                onChange={(e) => handleInput("bankFeePercent", e.target.value)}
                className="w-24 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-right text-sm font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                value={inputs.insurancePercent ?? "0"}
                onChange={(e) => handleInput("insurancePercent", e.target.value)}
                className="w-24 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-right text-sm font-mono text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

      {/* ── Margin Analysis Table (19 Excel Columns) ────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Table Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Margin Analysis Engine</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Engine tính toán DDP dựa trên phân bổ tỷ trọng.</p>
          </div>

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
          <table className="text-[11px] border-collapse min-w-max w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-100">
                <th className="text-left px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider w-[40px]">NO.</th>
                <th className="text-left px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[120px]">PART NUMBER</th>
                <th className="text-left px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[150px]">ITEM DESCRIPTION</th>
                <th className="text-center px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider w-[50px]">QTY</th>
                <th className="text-center px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider w-[50px]">UOM</th>
                <th className="text-right px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[90px]">UNIT PRICE ($)</th>
                <th className="text-right px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[100px]">TOTAL AMOUNT ($)</th>
                <th className="text-right px-2 py-2.5 text-amber-600 font-semibold uppercase tracking-wider min-w-[80px]">IMPORT TAX (%)</th>
                <th className="text-right px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[100px]">IMPORT TAX ($)</th>
                <th className="text-right px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[90px]">NET WEIGHT (LBS)</th>
                <th className="text-right px-2 py-2.5 text-slate-500 font-semibold uppercase tracking-wider min-w-[100px]">LOGISTICS COST ($)</th>
                <th className="text-right px-2 py-2.5 text-slate-900 font-bold uppercase tracking-wider min-w-[100px]">TOTAL COST ($)</th>
                <th className="text-right px-2 py-2.5 text-slate-900 font-bold uppercase tracking-wider min-w-[100px] border-r-2 border-slate-200">UNIT COST ($)</th>
                <th className="text-right px-2 py-2.5 text-blue-600 font-semibold uppercase tracking-wider min-w-[80px]">MARGIN (%)</th>
                <th className="text-right px-2 py-2.5 text-blue-600 font-semibold uppercase tracking-wider min-w-[100px]">UNIT DDP USD ($)</th>
                <th className="text-right px-2 py-2.5 text-blue-600 font-semibold uppercase tracking-wider min-w-[100px]">TOTAL DDP USD ($)</th>
                <th className="text-right px-2 py-2.5 text-violet-600 font-semibold uppercase tracking-wider min-w-[100px]">UNIT DDP VND</th>
                <th className="text-right px-2 py-2.5 text-violet-600 font-semibold uppercase tracking-wider min-w-[100px]">TOTAL DDP VND</th>
                <th className="text-right px-2 py-2.5 text-emerald-600 font-semibold uppercase tracking-wider min-w-[100px]">PROFIT ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(cbuResult?.items || []).map((item, idx) => {
                const totalAmount = item.supplierExtPrice || 0;
                const totalCost = (item.unitCostUsd || 0) * item.qty;
                const totalDdpUsd = (item.ddpPriceUsd || 0) * item.qty;
                const totalDdpVnd = (item.ddpPriceVnd || 0) * item.qty;
                const profit = totalDdpUsd - totalCost;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors divide-x divide-slate-50">
                    <td className="px-2 py-1.5 text-slate-400 font-mono text-center">{item.lineNo || idx + 1}</td>
                    <td className="px-2 py-1.5 text-slate-800 font-mono font-medium truncate max-w-[150px]" title={item.rawPartNumber}>
                      {item.rawPartNumber}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600 text-[10px] truncate max-w-[200px]" title={item.rawDescription}>
                      {item.rawDescription}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-600 font-mono">{item.qty}</td>
                    <td className="px-2 py-1.5 text-center text-slate-600 font-mono uppercase">{item.uom}</td>

                    {/* UNIT PRICE ($) */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={inputs[`${item.id}_supplierUnitPrice`] ?? ""}
                        onChange={(e) => handleInput(`${item.id}_supplierUnitPrice`, e.target.value)}
                        className={NUM_INPUT_CLASS}
                      />
                    </td>

                    {/* TOTAL AMOUNT ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-600 font-mono bg-slate-50/50">
                      {fmt(totalAmount)}
                    </td>

                    {/* IMPORT TAX (%) */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={inputs[`${item.id}_dutyPercent`] ?? ""}
                        onChange={(e) => handleInput(`${item.id}_dutyPercent`, e.target.value)}
                        className={NUM_INPUT_CLASS}
                      />
                    </td>

                    {/* IMPORT TAX ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-600 font-mono bg-slate-50/50">
                      {fmt(item.dutyAmount)}
                    </td>

                    {/* NET WEIGHT (LBS) */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={inputs[`${item.id}_netWeightLbs`] ?? ""}
                        onChange={(e) => handleInput(`${item.id}_netWeightLbs`, e.target.value)}
                        className={NUM_INPUT_CLASS}
                      />
                    </td>

                    {/* LOGISTICS COST ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-600 font-mono bg-slate-50/50">
                      {fmt(item.apportionedLogistics)}
                    </td>

                    {/* TOTAL COST ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-800 font-bold font-mono bg-slate-50">
                      {fmt(totalCost)}
                    </td>

                    {/* UNIT COST ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-800 font-bold font-mono bg-slate-50 border-r-2 border-slate-200">
                      {fmt(item.unitCostUsd)}
                    </td>

                    {/* MARGIN (%) */}
                    <td className="px-2 py-1.5 bg-blue-50/20">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={inputs[`${item.id}_marginPercent`] ?? ""}
                        onChange={(e) => handleInput(`${item.id}_marginPercent`, e.target.value)}
                        className={NUM_INPUT_CLASS}
                      />
                    </td>

                    {/* UNIT DDP USD ($) */}
                    <td className="px-2 py-1.5 text-right text-blue-700 font-bold font-mono bg-blue-50/20">
                      {fmt(item.ddpPriceUsd)}
                    </td>

                    {/* TOTAL DDP USD ($) */}
                    <td className="px-2 py-1.5 text-right text-blue-700 font-bold font-mono bg-blue-50/20">
                      {fmt(totalDdpUsd)}
                    </td>

                    {/* UNIT DDP VND */}
                    <td className="px-2 py-1.5 text-right text-violet-700 font-bold font-mono bg-violet-50/10">
                      {fmtVnd(item.ddpPriceVnd)}
                    </td>

                    {/* TOTAL DDP VND */}
                    <td className="px-2 py-1.5 text-right text-violet-700 font-bold font-mono bg-violet-50/10">
                      {fmtVnd(totalDdpVnd)}
                    </td>

                    {/* PROFIT ($) */}
                    <td className={`px-2 py-1.5 text-right font-bold font-mono bg-emerald-50/10 ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmt(profit)}
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
}
