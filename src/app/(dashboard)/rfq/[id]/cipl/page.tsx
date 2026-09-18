"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Download, Printer, RotateCcw, AlertCircle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type CiplItemRow = {
  id: string;
  lineNo: number;
  partNo: string;
  description: string | null;
  hsCode: string | null;
  quantity: string | null;
  countryOrigin: string | null;
  uom: string | null;
  unitPrice: string | null;
  extPrice: string | null;
  batchNo: string | null;
  netWeight: string | null;
};

type CiplRecord = {
  id: string;
  rfqId: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  poNo: string | null;
  poDate: string | null;
  incoterm: string | null;
  mot: string | null;
  pol: string | null;
  pod: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeAttn: string | null;
  consigneeEmail: string | null;
  consigneeTel: string | null;
  totalAmount: string | null;
  totalWeightLbs: string | null;
  numberOfBox: string | null;
  boxDimension: string | null;
  shippingMark: string | null;
  items: CiplItemRow[];
  createdAt: string;
};

// ─── Editable Field ──────────────────────────────────────────────────────────

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CiplPage() {
  const params = useParams();
  const rfqId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<CiplRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("CIPL.pdf");
  const [status, setStatus] = useState<string | null>(null);

  // Override state — mirrors DB values but editable
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<CiplItemRow[]>([]);

  const updateForm = (key: string, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setPdfUrl(null);
  };

  const updateItem = (idx: number, field: keyof CiplItemRow, val: string) => {
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    setPdfUrl(null);
  };

  const loadData = useCallback(async () => {
    try {
      // First get rfq info for rfqCode
      const rfqRes = await fetch(`/api/rfq/${rfqId}`);
      if (rfqRes.ok) {
        const rfqData = await rfqRes.json();
        setRfqCode(rfqData.rfqCode || "");
        setFileName(`CIPL_${rfqData.rfqCode || rfqId}.pdf`);
      }

      const res = await fetch(`/api/cipl/${rfqId}`);
      if (!res.ok) {
        if (res.status === 404) { setNotFound(true); return; }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success) { setNotFound(true); return; }

      const rec: CiplRecord = data.data;
      setRecord(rec);
      setItems(rec.items || []);
      setForm({
        invoice_no: rec.invoiceNo || "",
        invoice_date: rec.invoiceDate || "",
        po_no: rec.poNo || "",
        po_date: rec.poDate || "",
        incoterm: rec.incoterm || "",
        mot: rec.mot || "",
        pol: rec.pol || "",
        pod: rec.pod || "",
        consignee_name: rec.consigneeName || "",
        consignee_address: rec.consigneeAddress || "",
        consignee_attn: rec.consigneeAttn || "",
        consignee_email: rec.consigneeEmail || "",
        consignee_tel: rec.consigneeTel || "",
        total_amount: rec.totalAmount || "",
        total_weight_lbs: rec.totalWeightLbs || "",
        number_of_box: rec.numberOfBox || "",
        box_dimension: rec.boxDimension || "",
        shipping_mark_product: rec.shippingMark || "",
      });
    } catch (err: any) {
      setStatus(`Lỗi tải dữ liệu: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async () => {
    if (!rfqCode) return;
    setGenerating(true);
    setStatus("⏳ Đang tạo PDF CIPL...");
    setPdfUrl(null);

    // Build payload with form values + items
    const overrides = {
      ...form,
      items: items.map(item => ({
        part_no: item.partNo || "",
        description: item.description || "",
        hs_code: item.hsCode || "",
        quantity: item.quantity || "",
        country_origin: item.countryOrigin || "",
        uom: item.uom || "",
        unit_price: item.unitPrice || "",
        ext_price: item.extPrice || "",
        batch_no: item.batchNo || "",
        net_weight: item.netWeight || "",
      })),
    };

    try {
      const res = await fetch("/api/rfq/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfqCode, docType: "CIPL_PDF", overrides }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Lỗi tạo PDF.");
      setPdfUrl(data.url);
      setFileName(data.fileName || fileName);
      setStatus("✅ Tạo PDF thành công!");
    } catch (err: any) {
      setStatus(`❌ Lỗi: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!pdfUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setStatus(`❌ Lỗi tải file: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-500">
        <AlertCircle className="w-12 h-12 text-amber-400" />
        <h2 className="text-lg font-semibold text-slate-700">Chưa có dữ liệu CIPL</h2>
        <p className="text-sm text-center max-w-md">
          Đơn hàng này chưa có dữ liệu CIPL. Vui lòng vào <strong>Xử lý File → 📋 Extract CIPL</strong> để bóc tách dữ liệu từ chứng từ hãng trước.
        </p>
        <Link href="/rfq" className="mt-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          ← Quay lại danh sách RFQ
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/rfq" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">← RFQ</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-base font-bold text-slate-900">Tạo File CIPL</h1>
          {rfqCode && (
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-mono font-semibold text-blue-700">
              {rfqCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-all">
              <Printer className="w-3.5 h-3.5" /> Xem PDF
            </a>
          )}
          {pdfUrl && (
            <button onClick={handleDownload} disabled={downloading}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-all disabled:opacity-60">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Tải PDF
            </button>
          )}
          <button
            onClick={() => { setPdfUrl(null); setStatus(null); }}
            disabled={!pdfUrl}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-medium transition-all disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !rfqCode}
            className="h-9 inline-flex items-center gap-1.5 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "🖨️"}
            {generating ? "Đang tạo..." : "Tạo PDF CIPL"}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div className={`mx-6 mt-4 px-4 py-2.5 rounded-xl text-xs font-medium border ${
          status.startsWith("✅") ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          status.startsWith("❌") ? "bg-red-50 border-red-200 text-red-700" :
          "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          {status}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 mt-6 space-y-5">
        {/* PDF Preview */}
        {pdfUrl && (
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700">📄 Preview PDF CIPL</h3>
              <span className="text-xs font-mono text-slate-400">{fileName}</span>
            </div>
            <iframe src={pdfUrl} className="w-full h-[600px]" title="CIPL PDF Preview" />
          </div>
        )}

        {/* Invoice Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">📋 Thông Tin Chứng Từ</h3>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Invoice No" value={form.invoice_no || ""} onChange={v => updateForm("invoice_no", v)} />
            <Field label="Invoice Date" value={form.invoice_date || ""} onChange={v => updateForm("invoice_date", v)} />
            <Field label="PO No" value={form.po_no || ""} onChange={v => updateForm("po_no", v)} />
            <Field label="PO Date" value={form.po_date || ""} onChange={v => updateForm("po_date", v)} />
            <Field label="Incoterm" value={form.incoterm || ""} onChange={v => updateForm("incoterm", v)} />
            <Field label="Mode of Transport" value={form.mot || ""} onChange={v => updateForm("mot", v)} />
            <Field label="Port of Loading (POL)" value={form.pol || ""} onChange={v => updateForm("pol", v)} />
            <Field label="Port of Discharge (POD)" value={form.pod || ""} onChange={v => updateForm("pod", v)} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
            <Field label="Consignee Name" value={form.consignee_name || ""} onChange={v => updateForm("consignee_name", v)} />
            <Field label="Consignee Attn" value={form.consignee_attn || ""} onChange={v => updateForm("consignee_attn", v)} />
            <div className="col-span-2">
              <Field label="Consignee Address" value={form.consignee_address || ""} onChange={v => updateForm("consignee_address", v)} />
            </div>
            <Field label="Consignee Email" value={form.consignee_email || ""} onChange={v => updateForm("consignee_email", v)} />
            <Field label="Consignee Tel" value={form.consignee_tel || ""} onChange={v => updateForm("consignee_tel", v)} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-4 gap-4">
            <Field label="Total Amount (USD)" value={form.total_amount || ""} onChange={v => updateForm("total_amount", v)} />
            <Field label="Total Weight (lbs)" value={form.total_weight_lbs || ""} onChange={v => updateForm("total_weight_lbs", v)} />
            <Field label="No. of Boxes" value={form.number_of_box || ""} onChange={v => updateForm("number_of_box", v)} />
            <Field label="Box Dimension" value={form.box_dimension || ""} onChange={v => updateForm("box_dimension", v)} />
            <div className="col-span-4">
              <Field label="Shipping Mark / Product" value={form.shipping_mark_product || ""} onChange={v => updateForm("shipping_mark_product", v)} />
            </div>
          </div>
          {record && (
            <p className="mt-3 text-[11px] text-slate-400">Extracted: {new Date(record.createdAt).toLocaleString("vi-VN")}</p>
          )}
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">📦 Danh Sách Hàng Hóa ({items.length} dòng)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  {["#", "Part No", "Description", "HS Code", "Batch No", "Net Wt", "Qty", "UOM", "COO", "Unit Price", "Ext Price"].map((h, i) => (
                    <th key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 whitespace-nowrap ${
                      i === 0 ? "w-10 pl-6" : ""} ${[6, 9, 10].includes(i) ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 pl-6 text-xs text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-2.5"><input value={item.partNo} onChange={e => updateItem(idx, "partNo", e.target.value)} className="w-full bg-transparent text-xs font-mono text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5 max-w-[200px]"><input value={item.description || ""} onChange={e => updateItem(idx, "description", e.target.value)} className="w-full bg-transparent text-xs text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.hsCode || ""} onChange={e => updateItem(idx, "hsCode", e.target.value)} className="w-full bg-transparent text-xs font-mono text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.batchNo || ""} onChange={e => updateItem(idx, "batchNo", e.target.value)} className="w-full bg-transparent text-xs font-mono text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.netWeight || ""} onChange={e => updateItem(idx, "netWeight", e.target.value)} className="w-16 bg-transparent text-xs text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.quantity || ""} onChange={e => updateItem(idx, "quantity", e.target.value)} className="w-20 bg-transparent text-xs text-right text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.uom || ""} onChange={e => updateItem(idx, "uom", e.target.value)} className="w-16 bg-transparent text-xs text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.countryOrigin || ""} onChange={e => updateItem(idx, "countryOrigin", e.target.value)} className="w-16 bg-transparent text-xs text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.unitPrice || ""} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="w-20 bg-transparent text-xs font-mono text-right text-slate-700 focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                    <td className="px-4 py-2.5"><input value={item.extPrice || ""} onChange={e => updateItem(idx, "extPrice", e.target.value)} className="w-24 bg-transparent text-xs font-mono text-right text-slate-800 font-semibold focus:outline-none border-b border-transparent hover:border-slate-300 focus:border-blue-400 transition-colors" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 border-t border-slate-200">
                  <td colSpan={10} className="px-4 py-3 pl-6 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Amount</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 font-mono">${form.total_amount || "0.00"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}