"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type RFQItemRaw = {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  standardPartNo: string | null;
  rawDescription: string;
  qty: number;
  netWeightLbs: number | null;
  supplierUnitPrice: number | null;
  // Existing CBU fields (if any)
  logisticsFee: number | null;
  bankFee: number | null;
  dutyPercent: number | null;
  commissionPercent: number | null;
  citPercent: number | null;
  marginPercent: number | null;
  ddpPriceUsd: number | null;
};

type RFQDetail = {
  id: string;
  rfqCode: string;
  status: string;
  supplierQuoteCode: string | null;
  supplierName: string | null;
  supplierLogo?: string | null;
  exchangeRate: number;
  client: { name: string; companyName: string };
  items: RFQItemRaw[];
};

// Per-row CBU inputs (editable by user)
type RowInputs = {
  dutyPercent: number;
  commissionPercent: number;
  citPercent: number;
  marginPercent: number;
  ddpOverride: number | ""; // "" means auto-calculate
};

// Per-row CBU outputs (live-calculated)
type RowCalc = {
  materialCost: number;
  duty: number;
  baseCost: number;
  ddpUsd: number;
  ddpVnd: number;
  commissionUsd: number;
  citUsd: number;
  unitCostUsd: number;
  totalCostLine: number;
  marginPerUnit: number;
  actualMarginPct: number;
};

// ─── CBU Engine (pure TS, runs on client) ────────────────────────────────────

function calcItemCBU(
  supplierUnitPrice: number,
  qty: number,
  logisticsFee: number,
  bankFee: number,
  inputs: RowInputs,
  exchangeRate: number
): RowCalc {
  const materialCost = supplierUnitPrice * qty;
  const dutyRate = inputs.dutyPercent / 100;
  const commRate = inputs.commissionPercent / 100;
  const citRate = inputs.citPercent / 100;
  const marginRate = inputs.marginPercent / 100;

  // Thuế NK = (materialCost + logistics) * dutyRate
  const duty = (materialCost + logisticsFee) * dutyRate;
  // BaseCost = materialCost + logistics + duty + bankFee
  const baseCost = materialCost + logisticsFee + duty + bankFee;

  // DDP USD — use override if provided, else reverse algebra
  let ddpUsd: number;
  if (inputs.ddpOverride !== "" && inputs.ddpOverride > 0) {
    ddpUsd = inputs.ddpOverride;
  } else {
    const divisor = 1 - marginRate - commRate - commRate * citRate;
    ddpUsd = divisor > 0.001 ? baseCost / divisor : baseCost;
  }

  // DDP VND — ROUNDUP Excel -4
  const ddpVnd = Math.ceil((ddpUsd * exchangeRate) / 10000) * 10000;

  // Reverse-derived costs
  const commissionUsd = ddpUsd * commRate;
  const citUsd = commissionUsd * citRate;
  const totalCostLine = materialCost + logisticsFee + duty + bankFee + commissionUsd + citUsd;
  const unitCostUsd = qty > 0 ? totalCostLine / qty : 0;
  const marginPerUnit = qty > 0 ? (ddpUsd - totalCostLine) / qty : 0;
  const actualMarginPct = ddpUsd > 0 ? ((ddpUsd - totalCostLine) / ddpUsd) * 100 : 0;

  return {
    materialCost,
    duty,
    baseCost,
    ddpUsd,
    ddpVnd,
    commissionUsd,
    citUsd,
    unitCostUsd,
    totalCostLine,
    marginPerUnit,
    actualMarginPct,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CBUCalcPage() {
  const params = useParams();
  const router = useRouter();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<RFQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Global fee inputs
  const [exchangeRate, setExchangeRate] = useState(25500);
  const [globalLogistics, setGlobalLogistics] = useState(0);
  const [globalBankFee, setGlobalBankFee] = useState(0);

  // Per-row inputs keyed by item ID
  const [rowInputs, setRowInputs] = useState<Record<string, RowInputs>>({});

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch RFQ ──────────────────────────────────────────────────────────────
  const fetchRFQ = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}`);
    if (res.ok) {
      const data: RFQDetail = await res.json();
      setRfq(data);
      setExchangeRate(data.exchangeRate || 25500);

      // Initialize row inputs from existing DB values or defaults
      const initInputs: Record<string, RowInputs> = {};
      for (const item of data.items) {
        initInputs[item.id] = {
          dutyPercent: item.dutyPercent ?? 0,
          commissionPercent: item.commissionPercent ?? 0,
          citPercent: item.citPercent ?? 0,
          marginPercent: item.marginPercent ?? 20,
          ddpOverride: item.ddpPriceUsd ? item.ddpPriceUsd : "",
        };
      }
      setRowInputs(initInputs);
    }
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchRFQ();
  }, [fetchRFQ]);

  // ── Live-calculated row results ────────────────────────────────────────────
  const rowCalcs = useMemo<Record<string, RowCalc>>(() => {
    if (!rfq) return {};
    const result: Record<string, RowCalc> = {};
    const perItemLogistics = rfq.items.length > 0 ? globalLogistics / rfq.items.length : 0;
    const perItemBank = rfq.items.length > 0 ? globalBankFee / rfq.items.length : 0;

    for (const item of rfq.items) {
      const inputs = rowInputs[item.id] || {
        dutyPercent: 0, commissionPercent: 0, citPercent: 0, marginPercent: 20, ddpOverride: "",
      };
      result[item.id] = calcItemCBU(
        item.supplierUnitPrice ?? 0,
        item.qty,
        perItemLogistics,
        perItemBank,
        inputs,
        exchangeRate
      );
    }
    return result;
  }, [rfq, rowInputs, globalLogistics, globalBankFee, exchangeRate]);

  // ── Summary KPIs ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalCostUsd = 0;
    let totalRevenueUsd = 0;
    let totalRevenueVnd = 0;

    for (const calc of Object.values(rowCalcs)) {
      totalCostUsd += calc.totalCostLine;
      totalRevenueUsd += calc.ddpUsd;
      totalRevenueVnd += calc.ddpVnd;
    }

    const totalMarginUsd = totalRevenueUsd - totalCostUsd;
    const actualMarginPct = totalRevenueUsd > 0 ? (totalMarginUsd / totalRevenueUsd) * 100 : 0;

    return { totalCostUsd, totalRevenueUsd, totalRevenueVnd, totalMarginUsd, actualMarginPct };
  }, [rowCalcs]);

  // ── Update row input ───────────────────────────────────────────────────────
  const updateRowInput = (id: string, field: keyof RowInputs, value: number | "") => {
    setRowInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  // ── Build payload ──────────────────────────────────────────────────────────
  const buildPayload = (finalize: boolean) => {
    const perItemLogistics = rfq!.items.length > 0 ? globalLogistics / rfq!.items.length : 0;
    const perItemBank = rfq!.items.length > 0 ? globalBankFee / rfq!.items.length : 0;

    const items = rfq!.items.map((item) => {
      const inputs = rowInputs[item.id];
      const calc = rowCalcs[item.id];
      return {
        id: item.id,
        logisticsFee: perItemLogistics,
        bankFee: perItemBank,
        dutyPercent: inputs?.dutyPercent ?? 0,
        dutyAmount: calc?.duty ?? 0,
        commissionPercent: inputs?.commissionPercent ?? 0,
        commissionAmount: calc?.commissionUsd ?? 0,
        citPercent: inputs?.citPercent ?? 0,
        citAmount: calc?.citUsd ?? 0,
        marginPercent: inputs?.marginPercent ?? 0,
        unitCostUsd: calc?.unitCostUsd ?? 0,
        ddpPriceUsd: calc?.ddpUsd ?? 0,
        ddpPriceVnd: calc?.ddpVnd ?? 0,
        marginPerUnitUsd: calc?.marginPerUnit ?? 0,
      };
    });

    return {
      items,
      exchangeRate,
      totalCostUsd: summary.totalCostUsd,
      totalRevenueUsd: summary.totalRevenueUsd,
      totalRevenueVnd: summary.totalRevenueVnd,
      totalMarginUsd: summary.totalMarginUsd,
      actualMarginPct: summary.actualMarginPct,
      finalize,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    const res = await fetch(`/api/rfq/${rfqId}/calculate-cbu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(false)),
    });
    setSaving(false);
    if (res.ok) showToast("Đã lưu nháp CBU thành công!", "ok");
    else showToast("Lưu thất bại.", "err");
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    const res = await fetch(`/api/rfq/${rfqId}/calculate-cbu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(true)),
    });
    setFinalizing(false);
    if (res.ok) {
      showToast("Hoàn tất CBU! Đang tạo Quotation...", "ok");
      setTimeout(() => router.push(`/rfq/${rfqId}/quote-preview`), 1400);
    } else {
      showToast("Có lỗi xảy ra.", "err");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải...
        </div>
      </div>
    );
  }

  if (!rfq) return <div className="text-center text-gray-500 py-16">Không tìm thấy RFQ.</div>;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
          toast.type === "ok"
            ? "bg-emerald-900/95 border-emerald-700 text-emerald-300"
            : "bg-red-900/95 border-red-700 text-red-300"
        }`}>
          {toast.type === "ok"
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            {rfq.supplierLogo && (
              <img src={rfq.supplierLogo} alt="Supplier Logo" className="h-8 object-contain" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{rfq.rfqCode}</h1>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
              Tính CBU — Báo giá
            </span>
            {rfq.supplierQuoteCode && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                Quote Hãng: {rfq.supplierQuoteCode}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {rfq.client.name} — {rfq.client.companyName}
            {rfq.supplierName && <span className="text-gray-400"> · Hãng: {rfq.supplierName}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            id="save-draft-cbu"
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium border border-gray-200 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {saving ? "Đang lưu..." : "Lưu Nháp"}
          </button>
          <button
            id="finalize-cbu"
            onClick={handleFinalize}
            disabled={finalizing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            {finalizing ? "Đang xử lý..." : "HOÀN TẤT CBU & TẠO QUOTATION"}
          </button>
        </div>
      </div>

      {/* ── SECTION 1: Global Config ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Cấu hình Chi phí Chung (Phân bổ đều theo dòng sản phẩm)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              id: "exchange-rate",
              label: "Tỷ giá USD/VND",
              value: exchangeRate,
              setter: setExchangeRate,
              suffix: "VNĐ",
              color: "blue",
            },
            {
              id: "logistics-fee",
              label: "Phí Vận Chuyển Tổng (USD)",
              value: globalLogistics,
              setter: setGlobalLogistics,
              suffix: "USD",
              color: "amber",
            },
            {
              id: "bank-fee",
              label: "Phí Ngân Hàng Tổng (USD)",
              value: globalBankFee,
              setter: setGlobalBankFee,
              suffix: "USD",
              color: "violet",
            },
          ].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="block text-xs font-medium text-gray-600 mb-1.5">
                {field.label}
              </label>
              <div className="relative">
                <input
                  id={field.id}
                  type="number"
                  min={0}
                  value={field.value}
                  onChange={(e) => field.setter(Number(e.target.value))}
                  className={`w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-${field.color}-500/50 focus:border-${field.color}-500/50 transition-all pr-14`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none font-mono">
                  {field.suffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 2: Interactive CBU Table ──────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-200">
          <p className="text-gray-900 font-semibold">Bảng Tính CBU Tương Tác — Live Recalculate</p>
          <p className="text-gray-500 text-xs mt-0.5">Thay đổi bất kỳ ô % → Tự động cập nhật kết quả ngay lập tức</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            {/* Column groups */}
            <thead>
              {/* Group header */}
              <tr className="border-b border-gray-200">
                <th colSpan={5} className="text-center text-xs text-gray-500 font-medium px-3 py-2 border-r border-gray-200 bg-gray-50">
                  Thông tin Sản phẩm
                </th>
                <th colSpan={4} className="text-center text-xs text-amber-700 font-medium px-3 py-2 border-r border-gray-200 bg-amber-50">
                  ← Chi phí có thể nhập (%)
                </th>
                <th colSpan={6} className="text-center text-xs text-emerald-700 font-medium px-3 py-2 bg-emerald-50">
                  ← Kết quả tính toán (Live)
                </th>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                {[
                  { label: "#", cls: "w-8" },
                  { label: "Part Number", cls: "min-w-32" },
                  { label: "Mô tả", cls: "min-w-36" },
                  { label: "Qty", cls: "w-12 text-center" },
                  { label: "Giá Nhập ($)", cls: "w-24 text-right border-r border-gray-200" },
                  { label: "Duty %", cls: "w-20 text-center" },
                  { label: "Comm %", cls: "w-20 text-center" },
                  { label: "CIT %", cls: "w-20 text-center" },
                  { label: "Margin % / DDP $", cls: "w-28 text-center border-r border-gray-200" },
                  { label: "Thuế NK ($)", cls: "w-24 text-right" },
                  { label: "Unit Cost ($)", cls: "w-24 text-right" },
                  { label: "DDP USD ($)", cls: "w-28 text-right font-bold" },
                  { label: "DDP VNĐ", cls: "w-32 text-right font-bold" },
                  { label: "Lãi/Unit ($)", cls: "w-24 text-right" },
                  { label: "Margin %", cls: "w-20 text-center" },
                ].map((h) => (
                  <th key={h.label} className={`text-gray-500 font-semibold uppercase tracking-wide px-2 py-2.5 ${h.cls}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rfq.items.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-gray-500">
                    Chưa có dòng sản phẩm nào.
                  </td>
                </tr>
              ) : (
                rfq.items.map((item) => {
                  const inputs = rowInputs[item.id] || { dutyPercent: 0, commissionPercent: 0, citPercent: 0, marginPercent: 20, ddpOverride: "" };
                  const calc = rowCalcs[item.id];
                  const isNegativeMargin = calc && calc.actualMarginPct < 0;

                  return (
                    <tr key={item.id} className={`transition-colors ${isNegativeMargin ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"}`}>
                      {/* Static info */}
                      <td className="px-2 py-2.5 text-gray-500 font-mono">{item.lineNo}</td>
                      <td className="px-2 py-2.5">
                        <span className="text-blue-600 font-mono font-semibold text-xs">
                          {item.standardPartNo || item.rawPartNumber}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-gray-700 max-w-[140px] truncate" title={item.rawDescription}>
                        {item.rawDescription || "—"}
                      </td>
                      <td className="px-2 py-2.5 text-gray-900 text-center">{item.qty}</td>
                      <td className="px-2 py-2.5 text-right text-gray-900 font-mono border-r border-gray-200">
                        {item.supplierUnitPrice != null ? fmtUSD(item.supplierUnitPrice) : <span className="text-red-500 text-xs">Chưa có giá</span>}
                      </td>

                      {/* Editable % inputs */}
                      {(["dutyPercent", "commissionPercent", "citPercent"] as const).map((field) => (
                        <td key={field} className="px-2 py-2.5">
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={inputs[field]}
                              onChange={(e) => updateRowInput(item.id, field, Number(e.target.value))}
                              className="w-full px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all shadow-sm"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-amber-600 text-[10px]">%</span>
                          </div>
                        </td>
                      ))}

                      {/* Margin % OR DDP Override */}
                      <td className="px-2 py-2.5 border-r border-gray-200">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={inputs.marginPercent}
                              onChange={(e) => updateRowInput(item.id, "marginPercent", Number(e.target.value))}
                              className="w-full px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all shadow-sm"
                              placeholder="Margin%"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-amber-600 text-[10px]">%</span>
                          </div>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={inputs.ddpOverride}
                            onChange={(e) => updateRowInput(item.id, "ddpOverride", e.target.value === "" ? "" : Number(e.target.value))}
                            className="w-full px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-sm"
                            placeholder="DDP $ Override"
                          />
                        </div>
                      </td>

                      {/* Live-calculated results */}
                      {calc ? (
                        <>
                          <td className="px-2 py-2.5 text-right text-gray-700 font-mono">{fmtUSD(calc.duty)}</td>
                          <td className="px-2 py-2.5 text-right text-gray-700 font-mono">{fmtUSD(calc.unitCostUsd)}</td>
                          <td className="px-2 py-2.5 text-right font-mono font-bold text-gray-900">{fmtUSD(calc.ddpUsd)}</td>
                          <td className="px-2 py-2.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">{fmtVND(calc.ddpVnd)}</td>
                          <td className={`px-2 py-2.5 text-right font-mono ${calc.marginPerUnit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {fmtUSD(calc.marginPerUnit)}
                          </td>
                          <td className={`px-2 py-2.5 text-center font-mono font-bold text-xs ${
                            calc.actualMarginPct >= 15 ? "text-emerald-600" :
                            calc.actualMarginPct >= 5 ? "text-amber-500" : "text-red-500"
                          }`}>
                            {fmtPct(calc.actualMarginPct)}
                          </td>
                        </>
                      ) : (
                        <td colSpan={6} className="text-center text-gray-400 text-xs py-2">—</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 3: KPI Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            id: "kpi-total-cost",
            label: "Tổng Giá Vốn",
            sublabel: "Total Cost USD",
            value: fmtUSD(summary.totalCostUsd),
            icon: "📦",
            color: "from-slate-600 to-slate-700",
            textColor: "text-white",
          },
          {
            id: "kpi-revenue-usd",
            label: "Tổng Doanh Thu",
            sublabel: "Total Revenue USD",
            value: fmtUSD(summary.totalRevenueUsd),
            icon: "💵",
            color: "from-blue-600 to-indigo-600",
            textColor: "text-white",
          },
          {
            id: "kpi-revenue-vnd",
            label: "Tổng Doanh Thu",
            sublabel: "Total Revenue VND",
            value: fmtVND(summary.totalRevenueVnd),
            icon: "🏦",
            color: "from-teal-600 to-emerald-600",
            textColor: "text-white",
          },
          {
            id: "kpi-margin",
            label: "Tổng Lợi Nhuận",
            sublabel: `Margin ${fmtPct(summary.actualMarginPct)}`,
            value: fmtUSD(summary.totalMarginUsd),
            icon: summary.totalMarginUsd >= 0 ? "📈" : "📉",
            color: summary.totalMarginUsd >= 0 ? "from-emerald-600 to-green-600" : "from-red-600 to-rose-600",
            textColor: "text-white",
          },
        ].map((card) => (
          <div key={card.id} id={card.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-lg shadow-md flex-shrink-0 text-white`}>
                {card.icon}
              </div>
              <div className="min-w-0">
                <p className="text-gray-500 text-xs">{card.label}</p>
                <p className={`text-sm font-bold mt-0.5 ${card.textColor === "text-white" ? "text-gray-900" : card.textColor} break-all leading-tight`}>{card.value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{card.sublabel}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live hint */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pb-4">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Live Calculation — Tất cả con số cập nhật tức thì khi bạn thay đổi % hoặc phí bên trên.
      </div>
    </div>
  );
}
