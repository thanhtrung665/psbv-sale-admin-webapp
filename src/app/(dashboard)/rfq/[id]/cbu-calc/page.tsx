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
  uom: string | null;
  netWeightLbs: number | null;
  supplierUnitPrice: number | null;
  dutyPercent: number | null;
  commissionPercent: number | null;
  marginPercent: number | null;
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

// String-based inputs for smooth decimal typing without React glitches
type RowInputs = {
  dutyPercent: string;
  commissionPercent: string;
  marginPercent: string;
};

type RowCalc = {
  baseCost: number;
  ddpUsd: number;
  ddpVnd: number;
  unitCostUsd: number;
  marginPerUnit: number;
};

function calcItemCBU(
  supplierUnitPrice: number,
  qty: number,
  inputs: { duty: number; comm: number; margin: number },
  exchangeRate: number
): RowCalc {
  const materialCost = supplierUnitPrice * qty;
  const dutyRate = inputs.duty / 100;
  const commRate = inputs.comm / 100;
  const marginRate = inputs.margin / 100;

  const duty = materialCost * dutyRate;
  const baseCost = materialCost + duty;

  // DDP USD = BaseCost / (1 - MarginRate - CommRate)
  const divisor = 1 - marginRate - commRate;
  const ddpUsd = divisor > 0.001 ? baseCost / divisor : baseCost;

  // DDP VND = ROUNDUP -4
  const ddpVnd = Math.ceil((ddpUsd * exchangeRate) / 10000) * 10000;

  const commissionUsd = ddpUsd * commRate;
  const totalCostLine = materialCost + duty + commissionUsd;
  const unitCostUsd = qty > 0 ? totalCostLine / qty : 0;
  const marginPerUnit = qty > 0 ? (ddpUsd - totalCostLine) / qty : 0;

  return { baseCost, ddpUsd, ddpVnd, unitCostUsd, marginPerUnit };
}

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);

export default function CBUCalcPage() {
  const params = useParams();
  const router = useRouter();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<RFQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [editingQuoteCode, setEditingQuoteCode] = useState(false);
  const [quoteCodeInput, setQuoteCodeInput] = useState("");

  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [parsingQuote, setParsingQuote] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [aiPreviewData, setAiPreviewData] = useState<any[] | null>(null);

  const [exchangeRate, setExchangeRate] = useState(25500);
  const [rowInputs, setRowInputs] = useState<Record<string, RowInputs>>({});

  const fetchRFQ = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}`);
    if (res.ok) {
      const data: RFQDetail = await res.json();
      setRfq(data);
      setExchangeRate(data.exchangeRate || 25500);
      setQuoteCodeInput(data.supplierQuoteCode || "");

      const initInputs: Record<string, RowInputs> = {};
      for (const item of data.items) {
        initInputs[item.id] = {
          dutyPercent: item.dutyPercent?.toString() || "0",
          commissionPercent: item.commissionPercent?.toString() || "0",
          marginPercent: item.marginPercent?.toString() || "20",
        };
      }
      setRowInputs(initInputs);
    }
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchRFQ();
  }, [fetchRFQ]);

  const rowCalcs = useMemo<Record<string, RowCalc>>(() => {
    if (!rfq) return {};
    const result: Record<string, RowCalc> = {};
    for (const item of rfq.items) {
      const raw = rowInputs[item.id] || { dutyPercent: "0", commissionPercent: "0", marginPercent: "20" };
      const parsed = {
        duty: parseFloat(raw.dutyPercent) || 0,
        comm: parseFloat(raw.commissionPercent) || 0,
        margin: parseFloat(raw.marginPercent) || 0,
      };
      result[item.id] = calcItemCBU(item.supplierUnitPrice ?? 0, item.qty, parsed, exchangeRate);
    }
    return result;
  }, [rfq, rowInputs, exchangeRate]);

  const updateRowInput = (id: string, field: keyof RowInputs, value: string) => {
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setRowInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const buildPayload = (finalize: boolean) => {
    const items = rfq!.items.map((item) => {
      const inputs = rowInputs[item.id];
      const calc = rowCalcs[item.id];
      const duty = parseFloat(inputs?.dutyPercent) || 0;
      const comm = parseFloat(inputs?.commissionPercent) || 0;
      const margin = parseFloat(inputs?.marginPercent) || 0;

      return {
        id: item.id,
        logisticsFee: 0,
        bankFee: 0,
        dutyPercent: duty,
        dutyAmount: (item.supplierUnitPrice || 0) * item.qty * (duty / 100),
        commissionPercent: comm,
        commissionAmount: calc?.ddpUsd ? calc.ddpUsd * (comm / 100) : 0,
        citPercent: 0,
        citAmount: 0,
        marginPercent: margin,
        unitCostUsd: calc?.unitCostUsd ?? 0,
        ddpPriceUsd: calc?.ddpUsd ?? 0,
        ddpPriceVnd: calc?.ddpVnd ?? 0,
        marginPerUnitUsd: calc?.marginPerUnit ?? 0,
      };
    });

    let totalCostUsd = 0;
    let totalRevenueUsd = 0;
    let totalRevenueVnd = 0;

    for (const calc of Object.values(rowCalcs)) {
      totalCostUsd += calc.unitCostUsd * (rfq?.items.find(i => i.id === Object.keys(rowCalcs).find(k => rowCalcs[k] === calc))?.qty || 1);
      totalRevenueUsd += calc.ddpUsd;
      totalRevenueVnd += calc.ddpVnd;
    }

    const totalMarginUsd = totalRevenueUsd - totalCostUsd;
    const actualMarginPct = totalRevenueUsd > 0 ? (totalMarginUsd / totalRevenueUsd) * 100 : 0;

    return {
      items,
      exchangeRate,
      totalCostUsd,
      totalRevenueUsd,
      totalRevenueVnd,
      totalMarginUsd,
      actualMarginPct,
      finalize,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    await fetch(`/api/rfq/${rfqId}/calculate-cbu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(false)),
    });
    setSaving(false);
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    const res = await fetch(`/api/rfq/${rfqId}/calculate-cbu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(true)),
    });
    setFinalizing(false);
    if (res.ok) router.push(`/rfq/${rfqId}/quote-preview`);
  };

  const handleSaveQuoteCode = async () => {
    if (!rfq) return;
    const res = await fetch(`/api/rfq/${rfqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierQuoteCode: quoteCodeInput }),
    });
    if (res.ok) {
      setRfq({ ...rfq, supplierQuoteCode: quoteCodeInput });
      setEditingQuoteCode(false);
    }
  };

  const handleParseQuote = async () => {
    if (!quoteFile || !rfq) return;
    setParsingQuote(true);
    const formData = new FormData();
    formData.append("file", quoteFile);

    try {
      const res = await fetch(`/api/rfq/${rfqId}/parse-supplier-quote`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      
      if (res.ok && result.success) {
        if (result.parsedData) setAiPreviewData(result.parsedData);
        await fetchRFQ();
        setQuoteFile(null);
      }
    } finally {
      setParsingQuote(false);
    }
  };

  if (loading) return <div className="text-center py-16 text-slate-500">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-slate-500">Not found</div>;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-24">
      {/* ── SECTION 1: MINIMAL HEADER ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold text-xl text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
          {rfq.rfqCode}
        </span>
        <span className="text-slate-500">—</span>
        <span className="font-semibold text-slate-700">
          {rfq.supplierName || rfq.client.companyName}
        </span>
        <span className="text-slate-300">|</span>
        
        {editingQuoteCode ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={quoteCodeInput}
              onChange={(e) => setQuoteCodeInput(e.target.value)}
              className="text-sm px-3 py-1 rounded-md border border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono w-40"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveQuoteCode()}
            />
            <button onClick={handleSaveQuoteCode} className="text-sky-600 font-semibold text-sm hover:text-sky-700">Save</button>
          </div>
        ) : rfq.supplierQuoteCode ? (
          <span 
            onClick={() => setEditingQuoteCode(true)}
            className="text-sm px-3 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-mono cursor-pointer hover:bg-sky-100"
          >
            Ref: {rfq.supplierQuoteCode}
          </span>
        ) : (
          <span 
            onClick={() => setEditingQuoteCode(true)}
            className="text-sm px-3 py-1 rounded-md bg-slate-50 text-slate-500 border border-dashed border-slate-300 cursor-pointer hover:bg-slate-100"
          >
            + Add Quote Ref
          </span>
        )}
      </div>

      {/* ── SECTION 2: MINIMAL DROPZONE ────────────────────────────────────── */}
      <div 
        className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all ${isDragging ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-sky-400 bg-slate-50/50"}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) setQuoteFile(e.dataTransfer.files[0]);
        }}
      >
        <input 
          type="file" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept=".pdf,.png,.jpg,.jpeg,.xlsx"
          onChange={(e) => { if (e.target.files && e.target.files[0]) setQuoteFile(e.target.files[0]); }}
        />
        
        {parsingQuote ? (
          <div className="flex items-center gap-3 text-sky-600 font-medium">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            Gemini is parsing Quote PDF...
          </div>
        ) : quoteFile ? (
          <div className="flex items-center gap-4 z-10">
            <span className="font-semibold text-sky-700">{quoteFile.name}</span>
            <button
              onClick={handleParseQuote}
              className="px-4 py-2 bg-sky-600 text-white text-sm font-semibold rounded-lg hover:bg-sky-500 shadow-sm relative z-20 pointer-events-auto"
            >
              ⚡ Extract Quote with AI
            </button>
          </div>
        ) : (
          <div className="text-slate-500 text-sm font-medium flex items-center gap-2 pointer-events-none">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            Drag and drop Supplier Quote PDF here, or click to browse
          </div>
        )}
      </div>

      {/* ── SECTION 3: AI EXTRACTION PREVIEW TABLE ─────────────────────────── */}
      {aiPreviewData && (
        <div className="bg-sky-50/50 border border-sky-100 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-sky-100 flex items-center gap-2">
            <span className="font-semibold text-sky-800 text-sm">AI Extraction Result Preview</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Success</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-sky-50 text-sky-700 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">Line</th>
                  <th className="px-4 py-2">Extracted Part Number</th>
                  <th className="px-4 py-2">Supplier Price ($)</th>
                  <th className="px-4 py-2">Net Weight (lbs)</th>
                  <th className="px-4 py-2">Lead Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {aiPreviewData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-sky-50/50">
                    <td className="px-4 py-2 font-mono">{idx + 1}</td>
                    <td className="px-4 py-2 font-mono font-medium text-sky-900">{item.partNumber}</td>
                    <td className="px-4 py-2 font-mono">{fmtUSD(item.supplierUnitPrice)}</td>
                    <td className="px-4 py-2">{item.netWeightLbs}</td>
                    <td className="px-4 py-2">{item.leadTime || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 4: INTERACTIVE CBU CALCULATION TABLE ───────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-3 w-8">#</th>
                <th className="px-3 py-3 min-w-32">Part Number</th>
                <th className="px-3 py-3 text-center">Qty</th>
                <th className="px-3 py-3 text-center">UOM</th>
                <th className="px-3 py-3 text-right">Supplier Price ($)</th>
                <th className="px-3 py-3 text-center w-24 border-l border-slate-200 bg-amber-50/50">Duty (%)</th>
                <th className="px-3 py-3 text-center w-24 bg-amber-50/50">Commission (%)</th>
                <th className="px-3 py-3 text-center w-24 bg-amber-50/50 border-r border-slate-200">Margin (%)</th>
                <th className="px-3 py-3 text-right">DDP USD ($)</th>
                <th className="px-3 py-3 text-right">DDP VND (VND)</th>
                <th className="px-3 py-3 text-right">Margin/Unit ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rfq.items.map((item) => {
                const inputs = rowInputs[item.id] || { dutyPercent: "0", commissionPercent: "0", marginPercent: "20" };
                const calc = rowCalcs[item.id];
                
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono text-slate-400">{item.lineNo}</td>
                    <td className="px-3 py-3 font-mono font-medium text-slate-800">
                      {item.standardPartNo || item.rawPartNumber}
                      <div className="text-xs text-slate-400 truncate max-w-[200px]" title={item.rawDescription}>{item.rawDescription}</div>
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-700">{item.qty}</td>
                    <td className="px-3 py-3 text-center text-slate-500 text-xs uppercase">{item.uom || "EA"}</td>
                    <td className="px-3 py-3 text-right font-mono font-medium text-slate-700">
                      {item.supplierUnitPrice != null ? fmtUSD(item.supplierUnitPrice) : "—"}
                    </td>

                    {/* Inputs with Clean Number Formatting */}
                    {(["dutyPercent", "commissionPercent", "marginPercent"] as const).map((field, idx) => (
                      <td key={field} className={`px-2 py-2 ${idx === 0 ? "border-l border-slate-200" : ""} ${idx === 2 ? "border-r border-slate-200" : ""}`}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inputs[field]}
                          onChange={(e) => updateRowInput(item.id, field, e.target.value)}
                          className="w-full text-center py-1.5 px-1 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors"
                        />
                      </td>
                    ))}

                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">{calc ? fmtUSD(calc.ddpUsd) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-600">{calc ? fmtVND(calc.ddpVnd) : "—"}</td>
                    <td className={`px-3 py-3 text-right font-mono font-medium ${calc && calc.marginPerUnit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {calc ? fmtUSD(calc.marginPerUnit) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 5: CLEAN ACTION BAR ────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 px-8 flex justify-end gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 lg:ml-64">
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          onClick={handleFinalize}
          disabled={finalizing}
          className="px-6 py-2.5 rounded-lg bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-50 flex items-center gap-2"
        >
          {finalizing ? "Processing..." : "Complete CBU & Generate Quote ➔"}
        </button>
      </div>
    </div>
  );
}
