"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { buildRfoEmailHtml, buildOrderTableHtml } from "@/lib/email-builder";

type RFQItem = {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  standardPartNo: string | null;
  qty: number;
  uom: string;
  supplier: string | null;
};

type RFQDetail = {
  id: string;
  rfqCode: string;
  status: string;
  isProcessing: boolean;
  extractionError: string | null;
  createdAt: string;
  client: {
    name: string;
    companyName: string;
    email: string;
    phone: string | null;
  };
  items: RFQItem[];
  supplierLogo?: string | null;
};

export default function RFOReviewPage() {
  const params = useParams();
  const router = useRouter();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<RFQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState<RFQItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Email Config State
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [supplierLogo, setSupplierLogo] = useState("");
  const [catalogUrl, setCatalogUrl] = useState("");
  
  // Editable greeting / body
  const [greetingBody, setGreetingBody] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Auto-suggest Suppliers
  const [supplierQuery, setSupplierQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; email: string; companyName: string; recipientName: string; ccEmails: string; logoUrl: string | null }[]>([]);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRFQ = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}`);
    if (res.ok) {
      const data: RFQDetail = await res.json();
      setRfq(data);
      setItems(data.items);
      setEmailSubject(`Quotation Request for ${data.rfqCode}`);
      if (data.supplierLogo) setSupplierLogo(data.supplierLogo);
      // Default greeting body
      if (!greetingBody) {
        setGreetingBody(
          `<p>Dear ${data.items[0]?.supplier || "Partner"},</p>
<p>We are requesting a quotation for the following parts. Please provide your best pricing and lead time at your earliest convenience.</p>`
        );
      }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId]);

  useEffect(() => {
    fetchRFQ();
    const interval = setInterval(() => {
      if (rfq?.isProcessing) fetchRFQ();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchRFQ, rfq?.isProcessing]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (supplierQuery.trim().length > 1) {
        const res = await fetch(`/api/suppliers/suggest?query=${encodeURIComponent(supplierQuery)}`);
        if (res.ok) setSuggestions(await res.json());
      } else {
        setSuggestions([]);
      }
    };
    const id = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(id);
  }, [supplierQuery]);

  const selectSupplier = (sup: typeof suggestions[0]) => {
    setSupplierEmail(sup.email || "");
    setSupplierName(sup.companyName || sup.name || "");
    setRecipientName(sup.recipientName || "");
    setCcEmails(sup.ccEmails || "");
    setSupplierLogo(sup.logoUrl || "");
    setSupplierQuery("");
    setSuggestions([]);
    // Update greeting with real recipient name
    setGreetingBody(
      `<p>Dear ${sup.recipientName || sup.name || "Partner"},</p>\n<p>We are requesting a quotation for the following parts. Please provide your best pricing and lead time at your earliest convenience.</p>`
    );
  };

  const updateItem = (id: string, field: keyof RFQItem, value: string | number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleSaveItems = async () => {
    setSaving(true);
    const res = await fetch(`/api/rfq/${rfqId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (res.ok) showToast("Đã lưu thay đổi!", "ok");
    else showToast("Lưu thất bại.", "err");
  };

  // Build email HTML using the builder service
  const orderTableHtml = useMemo(() => buildOrderTableHtml(items), [items]);
  
  const emailBodyHtml = useMemo(() =>
    buildRfoEmailHtml({
      greetingBody,
      orderTableHtml,
      supplierLogoUrl: supplierLogo || undefined,
      catalogUrl: catalogUrl || undefined,
    }),
    [greetingBody, orderTableHtml, supplierLogo, catalogUrl]
  );

  const handleSendRFO = async () => {
    if (!supplierEmail || !emailSubject) {
      showToast("Vui lòng nhập Email Hãng và Tiêu đề", "err");
      return;
    }
    setSending(true);
    const res = await fetch(`/api/rfq/${rfqId}/send-rfo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierEmail,
        supplierName,
        recipientName,
        ccEmails,
        emailSubject,
        emailBody: emailBodyHtml,
        catalogUrl,
      }),
    });
    setSending(false);
    if (res.ok) {
      showToast("✅ Đã phê duyệt & gửi RFO tới Hãng! Chuyển sang bước nhập báo giá...", "ok");
      setTimeout(() => router.push(`/rfq/${rfqId}/cbu-calc`), 1800);
    } else {
      const data = await res.json();
      showToast(data.error || "Có lỗi xảy ra khi gửi email.", "err");
    }
  };

  const canSend = ["INQUIRY_RECEIVED", "RFO_PENDING_ADMIN"].includes(rfq?.status || "");
  const alreadySent = ["RFO_SENT_TO_SUPPLIER", "SUPPLIER_QUOTED", "CBU_PENDING_ADMIN", "QUOTATION_DRAFTED", "QUOTED_TO_CLIENT"].includes(rfq?.status || "");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Đang tải...
        </div>
      </div>
    );
  }

  if (!rfq) return <div className="text-center py-16 text-gray-500">Không tìm thấy đơn hàng.</div>;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${toast.type === "ok" ? "bg-emerald-900/90 border-emerald-700 text-emerald-300" : "bg-red-900/90 border-red-700 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {supplierLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supplierLogo} alt="Supplier Logo" className="h-8 object-contain" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{rfq.rfqCode}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${
              canSend ? "bg-amber-50 text-amber-700 border border-amber-200" : alreadySent ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500"
            }`}>
              {rfq.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-gray-500 text-sm">Review và Gửi RFO tới Hãng</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* ─── Left Col: Items + Preview ─── */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Items Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <p className="text-gray-900 font-semibold">Sản phẩm Yêu cầu ({items.length})</p>
              <button onClick={handleSaveItems} disabled={saving} className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                {saving ? "Đang lưu..." : "Lưu bảng"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-12">#</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-48">Standard P/N</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Mô tả</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 w-24">Qty</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500 w-20">UOM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.lineNo}</td>
                      <td className="px-4 py-3">
                        <input type="text" value={item.standardPartNo || ""} onChange={(e) => updateItem(item.id, "standardPartNo", e.target.value)} placeholder={item.rawPartNumber}
                          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500/50" />
                        <div className="text-[10px] text-gray-400 mt-1 truncate" title={item.rawPartNumber}>Raw: {item.rawPartNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" value={item.rawDescription || ""} onChange={(e) => updateItem(item.id, "rawDescription", e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500/50" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", Number(e.target.value))}
                          className="w-16 mx-auto block px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-center focus:ring-1 focus:ring-blue-500/50" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" value={item.uom || ""} onChange={(e) => updateItem(item.id, "uom", e.target.value)}
                          className="w-16 mx-auto block px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-center focus:ring-1 focus:ring-blue-500/50 uppercase" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Email Preview / Editor */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-gray-900 font-semibold">
                {editMode ? "✏️ Chỉnh sửa Email" : "👁 Preview Draft Email Gửi Hãng"}
              </h2>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-all ${editMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
              >
                {editMode ? "Xem Preview →" : "✏️ Chỉnh sửa Email"}
              </button>
            </div>

            {editMode ? (
              /* Edit Mode */
              <div className="p-5 space-y-4">
                {/* Catalog URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    🔗 Link Catalog / Hình ảnh sản phẩm <span className="font-normal text-gray-400">(tùy chọn — sẽ hiển thị dưới dạng nút bấm trong email)</span>
                  </label>
                  <input
                    type="url"
                    value={catalogUrl}
                    onChange={(e) => setCatalogUrl(e.target.value)}
                    placeholder="https://www.keystoneelectronics.com/catalog/..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                {/* Greeting Body */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    📝 Nội dung lời chào & thân email <span className="font-normal text-gray-400">(hỗ trợ HTML)</span>
                  </label>
                  <textarea
                    value={greetingBody}
                    onChange={(e) => setGreetingBody(e.target.value)}
                    rows={7}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder="<p>Dear Partner,</p><p>We are requesting a quotation...</p>"
                  />
                </div>

                <p className="text-xs text-gray-400 italic">💡 Bảng sản phẩm và PSBV Footer Card sẽ tự động được lắp ghép bên dưới khi gửi.</p>

                <button
                  onClick={() => setEditMode(false)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-all"
                >
                  Xem Preview →
                </button>
              </div>
            ) : (
              /* Preview Mode */
              <div className="p-4">
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <iframe
                    srcDoc={emailBodyHtml}
                    title="Email Preview"
                    className="w-full"
                    style={{ height: "600px", border: "none" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Col: Email Config ─── */}
        <div className="xl:col-span-1">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm sticky top-6 space-y-4">
            <h2 className="text-gray-900 font-semibold pb-3 border-b border-gray-100">Cấu hình Mail Gửi Hãng</h2>

            {/* Supplier Auto-suggest */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-700 mb-1">Tìm Supplier (Auto-suggest)</label>
              <input
                type="text"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                placeholder="Gõ tên hãng để tìm..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                  {suggestions.map((s) => (
                    <div key={s.id} onClick={() => selectSupplier(s)}
                      className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <div className="font-semibold text-sm text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Hãng */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Hãng *</label>
              <input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} required
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Tên Công ty */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên Công ty Hãng</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Tên Người Nhận */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên Người Nhận (Dear ...)</label>
              <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Email CC */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email CC (cách nhau bởi dấu phẩy)</label>
              <input type="text" value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="boss@psbv.vn, sale@psbv.vn"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Tiêu đề Mail */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tiêu đề Mail *</label>
              <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-medium text-gray-900" />
            </div>

            {/* Catalog URL (also in right panel for quick access) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">🔗 Catalog / Ảnh sản phẩm URL</label>
              <input type="url" value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* ─── Action Buttons ─── */}
            <div className="pt-2 space-y-2">
              {/* Save Draft */}
              <button
                onClick={handleSaveItems}
                disabled={saving}
                className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all"
              >
                {saving ? "Đang lưu..." : "💾 Lưu Nháp"}
              </button>

              {/* Send Button */}
              <button
                onClick={handleSendRFO}
                disabled={sending || alreadySent}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all shadow-lg ${
                  sending
                    ? "bg-indigo-800 text-white opacity-80 cursor-wait"
                    : canSend
                    ? "bg-indigo-900 hover:bg-indigo-800 active:scale-[0.98] text-white shadow-indigo-900/40 hover:shadow-indigo-900/60"
                    : alreadySent
                    ? "bg-emerald-700 text-white opacity-60 cursor-not-allowed"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {sending ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Đang gửi email...
                  </>
                ) : alreadySent ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ĐÃ GỬI HÃNG
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    PHÊ DUYỆT &amp; GỬI EMAIL
                  </>
                )}
              </button>

              {alreadySent && (
                <p className="text-xs text-center text-emerald-600 font-medium">✅ RFO đã được gửi tới Hãng thành công.</p>
              )}
              {!canSend && !alreadySent && (
                <p className="text-xs text-center text-amber-600">⚠ Đơn hàng chưa sẵn sàng để gửi RFO.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
