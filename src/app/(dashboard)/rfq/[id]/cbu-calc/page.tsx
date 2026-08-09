"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateCBU, CBUItemEngineData, CBUResult, parseJsonField } from "@/lib/cbu-engine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

const parseNumInput = (val: any) => {
  if (val === '' || val === null || val === undefined) return 0;
  const parsed = parseFloat(String(val).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
};

// Tailwind class for inputs
const NUM_INPUT_CLASS = "w-full px-2 py-1 border border-slate-200 rounded text-right text-xs font-mono focus:outline-none hover:border-slate-300 focus:border-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white";
const GLOBAL_INPUT_CLASS = "w-full border border-slate-200 rounded p-1.5 text-sm text-right font-mono focus:ring-2 focus:ring-blue-500/50 outline-none";
const GLOBAL_SELECT_CLASS = "w-full border border-slate-200 rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none bg-white";

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
  const [incoTerm, setIncoTerm] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");

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
        setIncoTerm(rawData.incoTerm || "");
        setPaymentTerm(rawData.paymentTerm || "");

        // Initialize string inputs for Globals
        const initInputs: Record<string, string> = {
          // B. Tỷ giá & làm tròn
          exchangeRate: String(safeNum(rawData.exchangeRate, 26500)),
          bookingExchangeRate: String(safeNum(rawData.bookingExchangeRate, 26500)),
          vndRoundingStep: String(safeNum(rawData.vndRoundingStep, 10000)),
          lbToKg: String(safeNum(rawData.lbToKg, 0.4536)),
          // C. Điều kiện
          goodsOrigin: rawData.goodsOrigin || "Oversea",
          destinationCountry: rawData.destinationCountry || "VN",
          // D. Logistics
          freightCost: String(safeNum(rawData.freightCost)),
          freightFixed: String(safeNum(rawData.freightFixed)),
          freightRatePerKg: String(safeNum(rawData.freightRatePerKg)),
          chargeableWeightKg: String(safeNum(rawData.chargeableWeightKg)),
          clearanceCost: String(safeNum(rawData.clearanceCost, 150)),
          inlandCost: String(safeNum(rawData.inlandCost, 100)),
          docFee: String(safeNum(rawData.docFee, 15)),
          // E. Bảo hiểm
          insuredValuePercent: String(safeNum(rawData.insuredValuePercent, 110)),
          insuranceRatePercent: String(safeNum(rawData.insuranceRatePercent, 0.01)),
          minInsuranceUsd: String(safeNum(rawData.minInsuranceUsd, 15)),
          // F. Ngân hàng
          remittanceRatePercent: String(safeNum(rawData.remittanceRatePercent, 0.2)),
          bankVatFactor: String(safeNum(rawData.bankVatFactor, 1.1)),
          minRemittanceFeeUsd: String(safeNum(rawData.minRemittanceFeeUsd, 50)),
          receiveRatePercent: String(safeNum(rawData.receiveRatePercent, 0.05)),
          minReceiveFeeUsd: String(safeNum(rawData.minReceiveFeeUsd, 5)),
          receiveBaseUsd: String(safeNum(rawData.receiveBaseUsd, 0)),
          otherBankFeeUsd: String(safeNum(rawData.otherBankFeeUsd, 0)),
          // G. Chi phí vốn
          percentValueFinanced: String(safeNum(rawData.percentValueFinanced, 50)),
          interestRatePercent: String(safeNum(rawData.interestRatePercent, 15)),
          financingDays: String(safeNum(rawData.financingDays, 15)),
          daysPerYear: String(safeNum(rawData.daysPerYear, 360)),
        };

        const rawItems: any[] = Array.isArray(rawData.items) ? rawData.items : [];
        const loadedItems: CBUItemEngineData[] = rawItems.map((item: any) => {
          const id = String(item.id || "");
          // Initialize item specific numeric fields to strings
          initInputs[`${id}_supplierUnitPrice`] = String(safeNum(item.supplierUnitPrice));
          initInputs[`${id}_dutyPercent`] = String(safeNum(item.dutyPercent));
          initInputs[`${id}_commissionPercent`] = String(safeNum(item.commissionPercent, 3));
          initInputs[`${id}_citPercent`] = String(safeNum(item.citPercent, 20));
          initInputs[`${id}_marginPercent`] = String(safeNum(item.marginPercent, 25));
          initInputs[`${id}_netWeightLbs`] = String(safeNum(item.netWeightLbs));

          return {
            id,
            lineNo: safeNum(item.lineNo, 0),
            rawPartNumber: String(item.rawPartNumber || ""),
            rawDescription: String(item.rawDescription || ""),
            uom: String(item.uom || "PCS"),
            qty: safeNum(item.qty, 1) || 1,
            supplierUnitPrice: 0, 
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
          commissionPercent: parseNumInput(inputs[`${item.id}_commissionPercent`]),
          citPercent: parseNumInput(inputs[`${item.id}_citPercent`]),
          marginPercent: parseNumInput(inputs[`${item.id}_marginPercent`]),
          customValues: {},
        }));

        const res = calculateCBU(engineItems, {
          exchangeRate: parseNumInput(inputs.exchangeRate),
          bookingExchangeRate: parseNumInput(inputs.bookingExchangeRate),
          vndRoundingStep: parseNumInput(inputs.vndRoundingStep),
          lbToKg: parseNumInput(inputs.lbToKg),
          goodsOrigin: inputs.goodsOrigin,
          destinationCountry: inputs.destinationCountry,
          freightCost: parseNumInput(inputs.freightCost),
          freightFixed: parseNumInput(inputs.freightFixed),
          freightRatePerKg: parseNumInput(inputs.freightRatePerKg),
          chargeableWeightKg: parseNumInput(inputs.chargeableWeightKg),
          clearanceCost: parseNumInput(inputs.clearanceCost),
          inlandCost: parseNumInput(inputs.inlandCost),
          docFee: parseNumInput(inputs.docFee),
          insuredValuePercent: parseNumInput(inputs.insuredValuePercent),
          insuranceRatePercent: parseNumInput(inputs.insuranceRatePercent),
          minInsuranceUsd: parseNumInput(inputs.minInsuranceUsd),
          remittanceRatePercent: parseNumInput(inputs.remittanceRatePercent),
          bankVatFactor: parseNumInput(inputs.bankVatFactor),
          minRemittanceFeeUsd: parseNumInput(inputs.minRemittanceFeeUsd),
          receiveRatePercent: parseNumInput(inputs.receiveRatePercent),
          minReceiveFeeUsd: parseNumInput(inputs.minReceiveFeeUsd),
          receiveBaseUsd: parseNumInput(inputs.receiveBaseUsd),
          otherBankFeeUsd: parseNumInput(inputs.otherBankFeeUsd),
          percentValueFinanced: parseNumInput(inputs.percentValueFinanced),
          interestRatePercent: parseNumInput(inputs.interestRatePercent),
          financingDays: parseNumInput(inputs.financingDays),
          daysPerYear: parseNumInput(inputs.daysPerYear),
          customColumns: [],
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
          // B-G
          exchangeRate: parseNumInput(inputs.exchangeRate),
          bookingExchangeRate: parseNumInput(inputs.bookingExchangeRate),
          vndRoundingStep: parseNumInput(inputs.vndRoundingStep),
          lbToKg: parseNumInput(inputs.lbToKg),
          goodsOrigin: inputs.goodsOrigin,
          destinationCountry: inputs.destinationCountry,
          freightCost: parseNumInput(inputs.freightCost),
          freightFixed: parseNumInput(inputs.freightFixed),
          freightRatePerKg: parseNumInput(inputs.freightRatePerKg),
          chargeableWeightKg: parseNumInput(inputs.chargeableWeightKg),
          clearanceCost: parseNumInput(inputs.clearanceCost),
          inlandCost: parseNumInput(inputs.inlandCost),
          docFee: parseNumInput(inputs.docFee),
          insuredValuePercent: parseNumInput(inputs.insuredValuePercent),
          insuranceRatePercent: parseNumInput(inputs.insuranceRatePercent),
          minInsuranceUsd: parseNumInput(inputs.minInsuranceUsd),
          remittanceRatePercent: parseNumInput(inputs.remittanceRatePercent),
          bankVatFactor: parseNumInput(inputs.bankVatFactor),
          minRemittanceFeeUsd: parseNumInput(inputs.minRemittanceFeeUsd),
          receiveRatePercent: parseNumInput(inputs.receiveRatePercent),
          minReceiveFeeUsd: parseNumInput(inputs.minReceiveFeeUsd),
          receiveBaseUsd: parseNumInput(inputs.receiveBaseUsd),
          otherBankFeeUsd: parseNumInput(inputs.otherBankFeeUsd),
          percentValueFinanced: parseNumInput(inputs.percentValueFinanced),
          interestRatePercent: parseNumInput(inputs.interestRatePercent),
          financingDays: parseNumInput(inputs.financingDays),
          daysPerYear: parseNumInput(inputs.daysPerYear),
          customColumns: [],
          
          totalCostUsd: cbuResult.totalCostUsd,
          totalRevenueUsd: cbuResult.totalRevenueUsd,
          totalRevenueVnd: cbuResult.totalRevenueVnd,
          totalMarginUsd: cbuResult.totalMarginUsd,
          actualMarginPct: cbuResult.effectiveMarginPct,
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
    <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/rfq" className="text-slate-400 hover:text-slate-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Tính Toán CBU - Cấu Trúc Mới</h1>
          </div>
          <p className="text-slate-500 text-sm">
            <span className="font-semibold text-blue-600">{rfqCode}</span>
            {clientName && <> · {clientName}</>}
            {companyName && <> — {companyName}</>}
            {supplierName && <> · <span className="font-medium text-slate-700">{supplierName}</span></>}
          </p>
        </div>
        
        <div className="flex gap-2">
           <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex flex-col">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Incoterm</span>
              <span className="text-sm font-medium text-slate-800">{incoTerm || "-"}</span>
           </div>
           <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex flex-col">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Payment</span>
              <span className="text-sm font-medium text-slate-800">{paymentTerm || "-"}</span>
           </div>
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
      {cbuResult.warnings.length > 0 && (
        <div className="flex flex-col gap-1 bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-amber-700 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Cảnh báo từ Engine
          </div>
          <ul className="list-disc pl-6 space-y-1">
            {cbuResult.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* ── Settings Panel ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Basic Settings */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-slate-800 border-b pb-2">Tỷ giá & Điều kiện</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Tỷ giá VND/USD</label>
              <input type="text" inputMode="decimal" value={inputs.exchangeRate} onChange={(e) => handleInput("exchangeRate", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Booking Rate</label>
              <input type="text" inputMode="decimal" value={inputs.bookingExchangeRate} onChange={(e) => handleInput("bookingExchangeRate", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Làm tròn VND</label>
              <input type="text" inputMode="decimal" value={inputs.vndRoundingStep} onChange={(e) => handleInput("vndRoundingStep", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Lb to Kg</label>
              <input type="text" inputMode="decimal" value={inputs.lbToKg} onChange={(e) => handleInput("lbToKg", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Nguồn hàng</label>
              <select value={inputs.goodsOrigin} onChange={(e) => handleInput("goodsOrigin", e.target.value)} className={GLOBAL_SELECT_CLASS}>
                <option value="Oversea">Oversea</option>
                <option value="Local">Local</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Quốc gia đích</label>
              <input type="text" value={inputs.destinationCountry} onChange={(e) => handleInput("destinationCountry", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
          </div>
        </div>

        {/* Logistics Settings */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-slate-800 border-b pb-2">Logistics Inputs ($)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Freight (All-in)</label>
              <input type="text" inputMode="decimal" value={inputs.freightCost} onChange={(e) => handleInput("freightCost", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Freight Fixed</label>
              <input type="text" inputMode="decimal" value={inputs.freightFixed} onChange={(e) => handleInput("freightFixed", e.target.value)} disabled={parseNumInput(inputs.freightCost) > 0} className={GLOBAL_INPUT_CLASS + (parseNumInput(inputs.freightCost) > 0 ? " opacity-50 bg-slate-50" : "")} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Rate Per Kg</label>
              <input type="text" inputMode="decimal" value={inputs.freightRatePerKg} onChange={(e) => handleInput("freightRatePerKg", e.target.value)} disabled={parseNumInput(inputs.freightCost) > 0} className={GLOBAL_INPUT_CLASS + (parseNumInput(inputs.freightCost) > 0 ? " opacity-50 bg-slate-50" : "")} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Chargeable Wt</label>
              <input type="text" inputMode="decimal" value={inputs.chargeableWeightKg} onChange={(e) => handleInput("chargeableWeightKg", e.target.value)} disabled={parseNumInput(inputs.freightCost) > 0} className={GLOBAL_INPUT_CLASS + (parseNumInput(inputs.freightCost) > 0 ? " opacity-50 bg-slate-50" : "")} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Clearance Cost</label>
              <input type="text" inputMode="decimal" value={inputs.clearanceCost} onChange={(e) => handleInput("clearanceCost", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Inland Cost</label>
              <input type="text" inputMode="decimal" value={inputs.inlandCost} onChange={(e) => handleInput("inlandCost", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
          </div>
        </div>

        {/* Bank & Finance Settings */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 border-b pb-2">Bank & Finance Inputs</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {/* Remittance */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Remit Rate (%)</label>
              <input type="text" inputMode="decimal" value={inputs.remittanceRatePercent} onChange={(e) => handleInput("remittanceRatePercent", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Min Remit ($)</label>
              <input type="text" inputMode="decimal" value={inputs.minRemittanceFeeUsd} onChange={(e) => handleInput("minRemittanceFeeUsd", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">VAT Factor</label>
              <input type="text" inputMode="decimal" value={inputs.bankVatFactor} onChange={(e) => handleInput("bankVatFactor", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            {/* Receive */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Receive Rate (%)</label>
              <input type="text" inputMode="decimal" value={inputs.receiveRatePercent} onChange={(e) => handleInput("receiveRatePercent", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Min Receive ($)</label>
              <input type="text" inputMode="decimal" value={inputs.minReceiveFeeUsd} onChange={(e) => handleInput("minReceiveFeeUsd", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Receive Base ($)</label>
              <input type="text" inputMode="decimal" value={inputs.receiveBaseUsd} onChange={(e) => handleInput("receiveBaseUsd", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            {/* Finance */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Financed (%)</label>
              <input type="text" inputMode="decimal" value={inputs.percentValueFinanced} onChange={(e) => handleInput("percentValueFinanced", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Interest Rate (%)</label>
              <input type="text" inputMode="decimal" value={inputs.interestRatePercent} onChange={(e) => handleInput("interestRatePercent", e.target.value)} className={GLOBAL_INPUT_CLASS} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3 Summary Tables (Logistics, Bank Fee/Finance, Insurance) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bảng 1: Logistics */}
        <div className="bg-white rounded-lg overflow-hidden flex flex-col shadow-sm border border-slate-200">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Logistics Table</h3>
            <span className="text-[10px] font-medium text-slate-400">Total Results</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 w-1/2">Freight (Applied)</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(cbuResult.freightUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Custom Clearance</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(parseNumInput(inputs.clearanceCost))}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Inland</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(parseNumInput(inputs.inlandCost))}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Doc Fee</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(parseNumInput(inputs.docFee))}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 bg-slate-50">Total Weight (kg)</td>
                <td className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-right font-mono font-medium">{fmt(cbuResult.totalWeightKg)} kg</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-bold text-slate-800 px-3 py-2 border-b border-r border-slate-100 bg-blue-50/50">Total Amount ($)</td>
                <td className="px-3 py-2 border-b border-slate-100 bg-blue-50/50 text-right font-mono font-bold text-blue-700">${fmt(cbuResult.totalLogisticsUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-r border-slate-100">Transit Time Rate</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">
                  {cbuResult.totalWeightLbs > 0 ? fmt(cbuResult.totalLogisticsUsd / cbuResult.totalWeightLbs, 2) : "0.00"}/lb
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bảng 2: Bank Fee & Finance */}
        <div className="bg-white rounded-lg overflow-hidden flex flex-col shadow-sm border border-slate-200">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bank Fee & Finance Table</h3>
            <span className="text-[10px] font-medium text-slate-400">Total Results</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 w-1/2">Remittance Fee</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(cbuResult.remittanceFeeUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Receive Fee</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(cbuResult.receiveFeeUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Other Bank Fee</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">${fmt(parseNumInput(inputs.otherBankFeeUsd))}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 bg-slate-50">Total Bank Fee</td>
                <td className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-right font-mono font-medium">${fmt(cbuResult.totalBankFeeUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 text-amber-700">Financing Cost</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono text-amber-700">${fmt(cbuResult.totalFinancingCostUsd)}</td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-bold text-slate-800 px-3 py-2 border-r border-slate-100 bg-amber-50/50 pt-[45px]">Total Bank+Fin ($)</td>
                <td className="px-3 py-2 bg-amber-50/50 text-right font-mono font-bold text-amber-700 pt-[45px]">${fmt(cbuResult.totalBankFeeUsd + cbuResult.totalFinancingCostUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bảng 3: Insurance & Other */}
        <div className="bg-white rounded-lg overflow-hidden flex flex-col shadow-sm border border-slate-200">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Insurance Table</h3>
            <span className="text-[10px] font-medium text-slate-400">Total Results</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100 w-1/2">Insured Value %</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">
                  <input type="text" inputMode="decimal" value={inputs.insuredValuePercent} onChange={(e) => handleInput("insuredValuePercent", e.target.value)} className="w-16 text-right bg-transparent border-b border-slate-300 focus:border-emerald-500 outline-none" />%
                </td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Insurance Rate %</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">
                  <input type="text" inputMode="decimal" value={inputs.insuranceRatePercent} onChange={(e) => handleInput("insuranceRatePercent", e.target.value)} className="w-16 text-right bg-transparent border-b border-slate-300 focus:border-emerald-500 outline-none" />%
                </td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-semibold text-slate-600 px-3 py-2 border-b border-r border-slate-100">Min Insurance</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">
                  $<input type="text" inputMode="decimal" value={inputs.minInsuranceUsd} onChange={(e) => handleInput("minInsuranceUsd", e.target.value)} className="w-16 text-right bg-transparent border-b border-slate-300 focus:border-emerald-500 outline-none" />
                </td>
              </tr>
              <tr>
                <td className="text-xs uppercase font-bold text-slate-800 px-3 py-2 border-r border-slate-100 bg-emerald-50/50 h-full align-bottom pt-[124px]">Total Insurance ($)</td>
                <td className="px-3 py-2 bg-emerald-50/50 text-right font-mono font-bold text-emerald-700 align-bottom pt-[124px]">${fmt(cbuResult.totalInsuranceUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Margin Analysis Table (Full 19 Columns) ────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        {/* Table Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Margin Analysis Engine (Full Form)</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Closed-form DDP Calculation (Mới)</p>
          </div>

          <div className="flex gap-5 items-center">
             <div className="text-right">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Total Material</p>
              <p className="text-sm font-bold text-slate-900 font-mono">${fmt(cbuResult.totalMaterialUsd)}</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Total Cost</p>
              <p className="text-sm font-bold text-slate-900 font-mono">${fmt(cbuResult.totalCostUsd)}</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            <div className="text-right">
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">DDP Revenue</p>
              <p className="text-sm font-bold text-blue-700 font-mono">${fmt(cbuResult.totalRevenueUsd)}</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            <div className="text-right">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Effective Margin</p>
              <p className={`text-sm font-bold font-mono ${cbuResult.effectiveMarginPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                ${fmt(cbuResult.effectiveGrossProfitUsd)} ({fmt(cbuResult.effectiveMarginPct, 2)}%)
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full max-h-[600px] overflow-y-auto">
          <table className="text-[11px] border-collapse min-w-max w-full">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-slate-100 border-b-2 border-slate-200 divide-x divide-slate-200">
                <th className="text-left px-2 py-2 text-slate-600 font-bold uppercase tracking-wider w-[40px]">No.</th>
                <th className="text-left px-2 py-2 text-slate-600 font-bold uppercase tracking-wider min-w-[120px]">Part Number</th>
                <th className="text-left px-2 py-2 text-slate-600 font-bold uppercase tracking-wider min-w-[150px]">Description</th>
                <th className="text-center px-2 py-2 text-slate-600 font-bold uppercase tracking-wider w-[50px]">Qty</th>
                <th className="text-center px-2 py-2 text-slate-600 font-bold uppercase tracking-wider w-[50px]">UOM</th>
                <th className="text-right px-2 py-2 text-slate-600 font-bold uppercase tracking-wider min-w-[90px]">Unit Price ($)</th>
                <th className="text-right px-2 py-2 text-slate-600 font-bold uppercase tracking-wider min-w-[90px]">Total Mat ($)</th>
                <th className="text-right px-2 py-2 text-slate-600 font-bold uppercase tracking-wider min-w-[80px]">Net Wt (lbs)</th>
                
                {/* Inputs for Cost Configs */}
                <th className="text-right px-2 py-2 text-amber-700 font-bold uppercase tracking-wider min-w-[70px]">Duty %</th>
                <th className="text-right px-2 py-2 text-amber-700 font-bold uppercase tracking-wider min-w-[70px]">Comm %</th>
                <th className="text-right px-2 py-2 text-amber-700 font-bold uppercase tracking-wider min-w-[70px]">CIT %</th>
                
                {/* Cost Apportionments */}
                <th className="text-right px-2 py-2 text-slate-500 font-bold uppercase tracking-wider min-w-[80px]">Duty ($)</th>
                <th className="text-right px-2 py-2 text-slate-500 font-bold uppercase tracking-wider min-w-[80px]">Logistics ($)</th>
                <th className="text-right px-2 py-2 text-slate-500 font-bold uppercase tracking-wider min-w-[80px]">Bank+Fin ($)</th>
                
                {/* Totals */}
                <th className="text-right px-2 py-2 text-slate-900 font-bold uppercase tracking-wider min-w-[90px]">Unit Cost ($)</th>
                
                {/* Final Target */}
                <th className="text-right px-2 py-2 text-blue-700 font-bold uppercase tracking-wider min-w-[80px] bg-blue-50">Margin %</th>
                <th className="text-right px-2 py-2 text-blue-700 font-bold uppercase tracking-wider min-w-[90px] bg-blue-50">Unit DDP ($)</th>
                <th className="text-right px-2 py-2 text-blue-700 font-bold uppercase tracking-wider min-w-[90px] bg-blue-50">Total DDP ($)</th>
                <th className="text-right px-2 py-2 text-violet-700 font-bold uppercase tracking-wider min-w-[100px] bg-violet-50">Total DDP (VND)</th>
                <th className="text-right px-2 py-2 text-emerald-700 font-bold uppercase tracking-wider min-w-[90px] bg-emerald-50">Profit ($)</th>
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
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors divide-x divide-slate-100">
                    <td className="px-2 py-1.5 text-slate-500 font-mono text-center bg-slate-50">{item.lineNo || idx + 1}</td>
                    <td className="px-2 py-1.5 text-slate-800 font-mono font-medium truncate max-w-[150px]" title={item.rawPartNumber}>
                      {item.rawPartNumber}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600 text-[10px] truncate max-w-[200px]" title={item.rawDescription}>
                      {item.rawDescription}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-700 font-mono font-medium">{item.qty}</td>
                    <td className="px-2 py-1.5 text-center text-slate-500 font-mono uppercase">{item.uom}</td>

                    {/* UNIT PRICE ($) */}
                    <td className="px-2 py-1.5">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_supplierUnitPrice`] ?? ""} onChange={(e) => handleInput(`${item.id}_supplierUnitPrice`, e.target.value)} className={NUM_INPUT_CLASS} />
                    </td>
                    {/* TOTAL MAT AMOUNT ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-600 font-mono bg-slate-50">{fmt(totalAmount)}</td>
                    
                    {/* NET WEIGHT (LBS) */}
                    <td className="px-2 py-1.5">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_netWeightLbs`] ?? ""} onChange={(e) => handleInput(`${item.id}_netWeightLbs`, e.target.value)} className={NUM_INPUT_CLASS} />
                    </td>

                    {/* DUTY % */}
                    <td className="px-2 py-1.5 bg-amber-50/20">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_dutyPercent`] ?? ""} onChange={(e) => handleInput(`${item.id}_dutyPercent`, e.target.value)} className={NUM_INPUT_CLASS + " !border-amber-200 focus:!border-amber-400"} />
                    </td>
                    {/* COMM % */}
                    <td className="px-2 py-1.5 bg-amber-50/20">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_commissionPercent`] ?? ""} onChange={(e) => handleInput(`${item.id}_commissionPercent`, e.target.value)} className={NUM_INPUT_CLASS + " !border-amber-200 focus:!border-amber-400"} />
                    </td>
                    {/* CIT % */}
                    <td className="px-2 py-1.5 bg-amber-50/20">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_citPercent`] ?? ""} onChange={(e) => handleInput(`${item.id}_citPercent`, e.target.value)} className={NUM_INPUT_CLASS + " !border-amber-200 focus:!border-amber-400"} />
                    </td>

                    {/* DUTY ($) apportioned */}
                    <td className="px-2 py-1.5 text-right text-slate-500 font-mono bg-slate-50/50">{fmt(item.dutyAmount)}</td>
                    {/* LOGISTICS ($) apportioned */}
                    <td className="px-2 py-1.5 text-right text-slate-500 font-mono bg-slate-50/50">{fmt(item.apportionedLogistics)}</td>
                    {/* BANK + FIN ($) apportioned */}
                    <td className="px-2 py-1.5 text-right text-slate-500 font-mono bg-slate-50/50">{fmt((item.apportionedBank ?? 0) + (item.apportionedInsurance ?? 0))}</td>

                    {/* UNIT COST ($) */}
                    <td className="px-2 py-1.5 text-right text-slate-900 font-bold font-mono bg-slate-100 border-x-2 border-slate-300">
                      {fmt(item.unitCostUsd)}
                    </td>

                    {/* MARGIN (%) */}
                    <td className="px-2 py-1.5 bg-blue-50/40">
                      <input type="text" inputMode="decimal" placeholder="0" value={inputs[`${item.id}_marginPercent`] ?? ""} onChange={(e) => handleInput(`${item.id}_marginPercent`, e.target.value)} className={NUM_INPUT_CLASS + " !border-blue-300 focus:!border-blue-600 font-bold text-blue-700"} />
                    </td>

                    {/* UNIT DDP USD ($) */}
                    <td className="px-2 py-1.5 text-right text-blue-700 font-bold font-mono bg-blue-50/40">{fmt(item.ddpPriceUsd)}</td>

                    {/* TOTAL DDP USD ($) */}
                    <td className="px-2 py-1.5 text-right text-blue-700 font-bold font-mono bg-blue-50/40">{fmt(totalDdpUsd)}</td>

                    {/* TOTAL DDP VND */}
                    <td className="px-2 py-1.5 text-right text-violet-700 font-bold font-mono bg-violet-50/30">{fmtVnd(totalDdpVnd)}</td>

                    {/* PROFIT ($) */}
                    <td className={`px-2 py-1.5 text-right font-bold font-mono bg-emerald-50/20 ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
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
      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={() => handleSave(false)} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40">
          Save Draft
        </button>

        <button onClick={() => handleSave(true)} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg shadow-sm transition-all">
          {saving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Đang lưu...
            </>
          ) : (
            <>
              Complete CBU & Generate Quote
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
