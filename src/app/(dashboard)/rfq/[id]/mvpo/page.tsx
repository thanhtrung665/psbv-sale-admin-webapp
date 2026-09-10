"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Trash2, RotateCcw, Loader2, Printer, Download, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_TERMS } from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────────────────────────

type RFQItem = {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  standardPartNo?: string;
  rawDescription?: string;
  supplierDescription?: string;
  qty: number;
  uom: string;
  supplierUnitPrice?: number;
};

type RFQDetail = {
  id: string;
  rfqCode: string;
  status: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  poNumber?: string;
  deliveryDate?: string;
  paymentTerm?: string;
  opportunityName?: string;
  items: RFQItem[];
};

type FormValues = {
  supplierName: string;
  supplierShortName: string;
  supplierAddress: string;
  supplierTel: string;
  supplierEmail: string;
  poNumber: string;
  deliveryDate: string;
  buyerName: string;
  paymentTerm: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Default delivery date: today + 30 days, formatted DD/MM/YYYY */
function defaultDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY
}

function buildFormValues(rfq: RFQDetail): FormValues {
  return {
    supplierName: rfq.supplierName || "",
    supplierShortName: rfq.supplierName ? rfq.supplierName.split(" ")[0] : "",
    supplierAddress: rfq.supplierAddress || "",
    supplierTel: rfq.supplierPhone || "",
    supplierEmail: rfq.supplierEmail || "",
    poNumber: rfq.poNumber || `${rfq.rfqCode}-MVPO`,
    deliveryDate: rfq.deliveryDate
      ? new Date(rfq.deliveryDate).toLocaleDateString("en-GB")
      : defaultDeliveryDate(),
    buyerName: "Vu Trong Hung",
    paymentTerm: rfq.paymentTerm || "100% Payment with Order",
  };
}

// ─── Reusable field component ────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all shadow-sm ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

// ─── Payment Term Select ─────────────────────────────────────────────────────

function PaymentTermField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className="w-full h-9 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-violet-500/30 focus:border-violet-400 data-[placeholder]:text-slate-400">
          <SelectValue placeholder="Chọn Payment Term" />
        </SelectTrigger>
        <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg z-[100]">
          {PAYMENT_TERMS.map((term) => (
            <SelectItem key={term} value={term} className="text-sm cursor-pointer hover:bg-slate-50">
              {term}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MvpoPage() {
  const params = useParams();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<RFQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Editable form values
  const [form, setForm] = useState<FormValues>({
    supplierName: "",
    supplierShortName: "",
    supplierAddress: "",
    supplierTel: "",
    supplierEmail: "",
    poNumber: "",
    deliveryDate: defaultDeliveryDate(),
    buyerName: "Vu Trong Hung",
    paymentTerm: "100% Payment with Order",
  });

  // Editable items list
  const [items, setItems] = useState<RFQItem[]>([]);
  const [originalItems, setOriginalItems] = useState<RFQItem[]>([]);

  // Email state
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Auto-sync supplierShortName when supplierName changes
  const setFormField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "supplierName") {
        next.supplierShortName = (value as string).split(" ")[0];
      }
      return next;
    });
    // Reset PDF when form changes (user should regenerate)
    setPdfUrl(null);
  }, []);

  // Memoized total — recalculates whenever items changes
  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.supplierUnitPrice ?? 0) * Number(item.qty ?? 0), 0),
    [items]
  );

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchRFQ = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}`);
    if (!res.ok) return;
    const data: RFQDetail = await res.json();
    setRfq(data);
    const fv = buildFormValues(data);
    setForm(fv);
    setItems(data.items || []);
    setOriginalItems(data.items || []);
    setTo(data.supplierEmail || "");
    setSubject(`[Purchase Order] ${data.rfqCode} - PSBV Trading & Service Co., Ltd`);
    setFileName(`MVPO_${data.rfqCode}.pdf`);
    setBodyHtml(
      `<p>Dear ${data.supplierName || "Supplier"},</p>` +
        `<p>Please find our Purchase Order attached for your reference.</p>` +
        `<p>Kindly confirm receipt and expected delivery date.</p>` +
        `<p>Best regards,<br/>Vu Trong Hung<br/>PSBV Trading &amp; Service Co., Ltd</p>`
    );
  }, [rfqId]);

  useEffect(() => {
    fetchRFQ().finally(() => setLoading(false));
  }, [fetchRFQ]);

  // ── Item deletion ──────────────────────────────────────────────────────────
  const handleDeleteItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setPdfUrl(null);
  }, []);

  const handleRestoreItems = useCallback(() => {
    setItems(originalItems);
    setPdfUrl(null);
  }, [originalItems]);

  // ── Blob PDF download (forces correct MIME type, no text garbage) ──────────
  const handleDownloadPdf = useCallback(async () => {
    if (!pdfUrl) return;
    setDownloading(true);
    setDownloadStatus("⏳ Đang tải file PDF...");
    try {
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}`);
      const blob = await pdfResponse.blob();
      const blobUrl = window.URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName || `MVPO_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      setDownloadStatus("✅ Đã tải file PDF!");
      setTimeout(() => setDownloadStatus(null), 3000);
    } catch (err: any) {
      setDownloadStatus(`❌ Lỗi: ${err.message}`);
      setTimeout(() => setDownloadStatus(null), 4000);
    } finally {
      setDownloading(false);
    }
  }, [pdfUrl, fileName]);

  // ── PDF generation ──────────────────────────────────────────────────────────
  const generateMvpoPdf = useCallback(async () => {
    if (!rfq) return;
    setGenerating(true);
    setError(null);
    setPdfUrl(null);

    const payload = {
      rfqCode: rfq.rfqCode,
      docType: "MVPO_SUPPLIER_PDF",
      // Pass the edited form values & items directly so the API uses them
      overrides: {
        po_date: new Date().toLocaleDateString("en-GB"),
        po_number: form.poNumber,
        currency: "USD",
        job_file: rfq.opportunityName ? `${rfq.rfqCode} - ${rfq.opportunityName}` : rfq.rfqCode,
        payment_term: form.paymentTerm,
        delivery_date: form.deliveryDate,
        buyer_name: form.buyerName,
        supplier_name: form.supplierName,
        supplier_short_name: form.supplierShortName,
        supplier_address: form.supplierAddress,
        supplier_tel: form.supplierTel,
        supplier_email: form.supplierEmail,
        items: items.map((item) => ({
          part_no: item.standardPartNo || item.rawPartNumber || "",
          description: item.rawDescription || item.supplierDescription || "",
          uom: item.uom || "ea",
          quantity: String(item.qty ?? 0),
          unit_price: Number(item.supplierUnitPrice ?? 0).toFixed(2),
          amount: (Number(item.supplierUnitPrice ?? 0) * Number(item.qty ?? 0)).toFixed(2),
        })),
        total_amount: totalAmount.toFixed(2),
      },
    };

    try {
      const res = await fetch("/api/rfq/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("Server trả về phản hồi không hợp lệ (không phải JSON).");
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Lỗi khi tạo MVPO PDF.");
      }

      setPdfUrl(data.url);
      if (data.fileName) setFileName(data.fileName);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }, [rfq, form, items, totalAmount]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Đang tải dữ liệu đơn hàng...
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="text-center py-16 text-red-500">
        Không tìm thấy đơn hàng (RFQ ID: {rfqId}).
      </div>
    );
  }

  const isItemsModified = items.length !== originalItems.length;

  return (
    <div className="max-w-[1600px] mx-auto h-[calc(100vh-6rem)] flex flex-col">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {rfq.rfqCode}
            <span className="text-xs px-2.5 py-1 rounded-lg font-semibold border bg-violet-50 text-violet-700 border-violet-200">
              Đơn Đặt Hàng MVPO
            </span>
            {isItemsModified && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200 font-medium">
                {originalItems.length - items.length} hàng đã xoá
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Bản xem trước đơn đặt hàng gửi Hãng · {form.supplierName || "Chưa có thông tin hãng"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/rfq/${rfqId}/cbu-calc`} className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2">
            ← CBU
          </Link>
          <button
            onClick={generateMvpoPdf}
            disabled={generating || items.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] disabled:bg-slate-400 text-white rounded-xl text-sm font-semibold transition-all shadow-sm disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {generating ? "Đang tạo PDF..." : pdfUrl ? "Tạo lại MVPO" : "Tạo MVPO PDF"}
          </button>
          {pdfUrl && (
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              {downloading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              {downloading ? "Đang tải..." : "Tải PDF"}
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium flex-shrink-0">
          ❌ {error}
        </div>
      )}

      {/* ── 2-column layout ──────────────────────────────────────────────── */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════ */}
        <div className="w-[48%] flex flex-col gap-4 overflow-y-auto pr-1 pb-6">

          {/* ─ Supplier & Order Info ─ */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              🏭 Thông tin Nhà cung cấp & Đơn hàng
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field
                  label="Tên Hãng (Supplier Name)"
                  value={form.supplierName}
                  onChange={(v) => setFormField("supplierName", v)}
                  placeholder="e.g. Rockwell Automation"
                />
              </div>
              <Field
                label="Tên viết tắt (Short Name)"
                value={form.supplierShortName}
                onChange={(v) => setFormField("supplierShortName", v)}
                mono
                placeholder="Rockwell"
              />
              <Field
                label="PO Number"
                value={form.poNumber}
                onChange={(v) => setFormField("poNumber", v)}
                mono
                placeholder={`${rfq.rfqCode}-MVPO`}
              />
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Địa chỉ (Address)
                </label>
                <textarea
                  value={form.supplierAddress}
                  onChange={(e) => setFormField("supplierAddress", e.target.value)}
                  rows={2}
                  placeholder="123 Main St, Houston, TX 77001, USA"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all shadow-sm resize-none"
                />
              </div>
              <Field
                label="Điện thoại (Tel)"
                value={form.supplierTel}
                onChange={(v) => setFormField("supplierTel", v)}
                placeholder="+1 (800) 000-0000"
              />
              <Field
                label="Email Hãng"
                value={form.supplierEmail}
                onChange={(v) => setFormField("supplierEmail", v)}
                placeholder="orders@supplier.com"
              />
              <Field
                label="Ngày giao hàng (DD/MM/YYYY)"
                value={form.deliveryDate}
                onChange={(v) => setFormField("deliveryDate", v)}
                mono
                placeholder="30/09/2026"
              />
              <PaymentTermField
                label="Payment Term"
                value={form.paymentTerm}
                onChange={(v) => setFormField("paymentTerm", v)}
              />
              <div className="col-span-2">
                <Field
                  label="Người phụ trách (Buyer Name)"
                  value={form.buyerName}
                  onChange={(v) => setFormField("buyerName", v)}
                  placeholder="Vu Trong Hung"
                />
              </div>
            </div>
          </div>

          {/* ─ Items table ─ */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                📦 Danh sách Hàng hoá
                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                  {items.length} items
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-violet-700">{fmtUSD(totalAmount)}</span>
                {isItemsModified && (
                  <button
                    onClick={handleRestoreItems}
                    className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors font-medium border border-amber-200"
                    title="Khôi phục danh sách gốc"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Khôi phục
                  </button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                <p className="mb-3">Tất cả hàng hoá đã bị xoá.</p>
                <button
                  onClick={handleRestoreItems}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />↺ Khôi phục danh sách gốc
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {["#", "Part No", "Mô tả", "UOM", "Qty", "Đơn giá Hãng", "Thành tiền", ""].map((h, i) => (
                        <th
                          key={i}
                          className={`px-2.5 py-2.5 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-left ${
                            [4, 5, 6].includes(i) ? "text-right" : ""
                          } ${i === 7 ? "w-8" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item, idx) => {
                      const amt = Number(item.supplierUnitPrice ?? 0) * Number(item.qty ?? 0);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-2.5 py-2 text-slate-400 font-mono">{item.lineNo}</td>
                          <td className="px-2.5 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {item.standardPartNo || item.rawPartNumber}
                          </td>
                          <td className="px-2.5 py-2 text-slate-600 max-w-[180px] truncate">
                            {item.rawDescription || item.supplierDescription || "—"}
                          </td>
                          <td className="px-2.5 py-2 text-slate-500">{item.uom}</td>
                          <td className="px-2.5 py-2 text-right text-slate-700 font-mono">{item.qty}</td>
                          <td className="px-2.5 py-2 text-right font-mono text-slate-800">
                            {fmtUSD(Number(item.supplierUnitPrice ?? 0))}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold text-violet-700">
                            {fmtUSD(amt)}
                          </td>
                          <td className="px-1 py-2">
                            <button
                              onClick={() => handleDeleteItem(idx)}
                              title="Xoá hàng này"
                              className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-violet-50/60 border-t border-violet-100">
                      <td colSpan={6} className="px-3 py-3 text-right text-[11px] font-bold text-violet-600 uppercase tracking-wider">
                        Tổng giá trị MVPO
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-violet-800">
                        {fmtUSD(totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ─ Email to Supplier ─ */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              ✉️ Gửi PO Email cho Hãng
            </h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Người nhận (To)</label>
              <input type="text" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 shadow-sm"
                placeholder="supplier@brand.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">CC</label>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 shadow-sm"
                placeholder="cc@psbv.vn" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Tiêu đề (Subject)</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 shadow-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Nội dung (Body HTML)</label>
              <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={4}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none shadow-sm" />
            </div>
            <button
              disabled={sending || !pdfUrl}
              onClick={async () => {
                if (!pdfUrl) return;
                setSending(true);
                try {
                  const res = await fetch(`/api/rfq/${rfqId}/send-quote`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ to, cc, subject, bodyHtml, attachmentUrl: pdfUrl, fileName }),
                  });
                  const data = await res.json();
                  if (res.ok) alert("✅ Đã gửi MVPO Email cho Hãng!");
                  else alert(data.error || "Có lỗi khi gửi email.");
                } finally {
                  setSending(false);
                }
              }}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-500/20"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
              ) : !pdfUrl ? (
                "⚠️ Tạo MVPO PDF trước khi gửi"
              ) : (
                <><Send className="w-4 h-4" /> Gửi MVPO cho Hãng</>
              )}
            </button>
          </div>
        </div>

        {/* ══ RIGHT PANEL — PDF Preview ══════════════════════════════════ */}
        <div className="w-[52%] bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              MVPO PDF Preview
            </h2>
            {pdfUrl && (
              <div className="flex items-center gap-2">
                {/* Status toast inline */}
                {downloadStatus && (
                  <span className="text-xs font-medium text-slate-600 px-2">{downloadStatus}</span>
                )}
                {/* Open in new tab — for viewing only */}
                <a href={pdfUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm">
                  🔗 Mở tab mới
                </a>
                {/* Blob download — forces application/pdf MIME type */}
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  {downloading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                  {downloading ? "Đang tải..." : "Tải xuống"}
                </button>
              </div>
            )}
          </div>

          {pdfUrl && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-white flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">📄 Tên file:</span>
              <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all" />
            </div>
          )}

          <div className="flex-1 bg-slate-100 flex items-center justify-center p-4">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full rounded-xl border border-slate-200 bg-white shadow-sm"
                title="MVPO PDF Viewer" />
            ) : (
              <div className="text-center text-slate-500 max-w-sm">
                <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-5 border border-violet-100 shadow-sm">
                  <span className="text-3xl">🖨️</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Chưa có MVPO PDF</p>
                <p className="text-xs text-slate-400 mb-5">
                  Điền thông tin bên trái rồi nhấn{" "}
                  <strong className="text-violet-600">&quot;Tạo MVPO PDF&quot;</strong>{" "}
                  để sinh file đơn đặt hàng với đơn giá Hãng.
                </p>
                {!generating ? (
                  <button onClick={generateMvpoPdf} disabled={items.length === 0}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-violet-500/20">
                    <Printer className="w-4 h-4" /> Tạo MVPO PDF ngay
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-violet-500 text-sm font-medium">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang gọi APITemplate.io...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
