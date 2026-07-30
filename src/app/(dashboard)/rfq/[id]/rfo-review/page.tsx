"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

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
  
  // Auto-suggest Suppliers
  const [supplierQuery, setSupplierQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

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
    }
    setLoading(false);
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
        if (res.ok) {
          setSuggestions(await res.json());
        }
      } else {
        setSuggestions([]);
      }
    };
    const debounceId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceId);
  }, [supplierQuery]);

  const selectSupplier = (sup: any) => {
    setSupplierEmail(sup.email || "");
    setSupplierName(sup.companyName || sup.name || "");
    setRecipientName(sup.recipientName || "");
    setCcEmails(sup.ccEmails || "");
    setSupplierLogo(sup.logoUrl || "");
    setSupplierQuery("");
    setSuggestions([]);
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

  const emailBodyHtml = useMemo(() => {
    const tableRows = items.map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.lineNo}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.standardPartNo || item.rawPartNumber}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.rawDescription}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.qty}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.uom || "PCS"}</td>
      </tr>
    `).join("");

    return `
      <div style="font-family: sans-serif; color: #333; line-height: 1.5;">
        ${supplierLogo ? `<img src="${supplierLogo}" alt="${supplierName} Logo" style="max-height: 50px; margin-bottom: 20px;" /><br/>` : ""}
        <p>Dear ${recipientName || supplierName || "Partner"},</p>
        <p>We are requesting a quotation for the following parts. Please provide your best pricing and lead time at your earliest convenience.</p>
        
        <table style="width: 100%; max-width: 800px; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">#</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Part Number</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Description</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Qty</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">UOM</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="margin-top: 30px;">Looking forward to your quotation.</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0;"><strong>Best regards,</strong></p>
          <img src="https://psbv.vn/logo.png" alt="PSBV Logo" style="height: 40px; margin-top: 10px;" />
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;"><strong>PSBV Trading & Service Co., Ltd.</strong></p>
          <p style="margin: 2px 0 0 0; color: #666; font-size: 12px;">Email: sales@psbv.vn | Tel: (+84) 123 456 789</p>
        </div>
      </div>
    `;
  }, [items, recipientName, supplierName, supplierLogo]);

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
      }),
    });
    setSending(false);
    
    if (res.ok) {
      showToast("Đã gửi email và chuyển trạng thái!", "ok");
      setTimeout(() => router.push("/rfq"), 1500);
    } else {
      showToast("Có lỗi xảy ra khi gửi email.", "err");
    }
  };

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
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
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
              <img src={supplierLogo} alt="Supplier Logo" className="h-8 object-contain" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{rfq.rfqCode}</h1>
          </div>
          <p className="text-gray-500 text-sm">Review và Gửi RFO tới Hãng</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <p className="text-gray-900 font-semibold">Sản phẩm Yêu cầu ({items.length})</p>
              <button
                onClick={handleSaveItems}
                disabled={saving}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
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
                    <th className="px-4 py-3 text-center font-medium text-gray-500 w-24">UOM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.lineNo}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.standardPartNo || ""}
                          onChange={(e) => updateItem(item.id, "standardPartNo", e.target.value)}
                          placeholder={item.rawPartNumber}
                          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500/50"
                        />
                        <div className="text-[10px] text-gray-400 mt-1 truncate" title={item.rawPartNumber}>Raw: {item.rawPartNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.rawDescription || ""}
                          onChange={(e) => updateItem(item.id, "rawDescription", e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-blue-500/50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, "qty", Number(e.target.value))}
                          className="w-16 mx-auto px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-center focus:ring-1 focus:ring-blue-500/50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.uom || ""}
                          onChange={(e) => updateItem(item.id, "uom", e.target.value)}
                          className="w-16 mx-auto px-2 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-center focus:ring-1 focus:ring-blue-500/50 uppercase"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-gray-900 font-semibold mb-4">Preview Draft Email Gửi Hãng</h2>
            <div 
              className="bg-gray-50 rounded-xl p-6 border border-gray-200 text-sm prose max-w-none"
              dangerouslySetInnerHTML={{ __html: emailBodyHtml }} 
            />
          </div>
        </div>

        {/* Right Col: Email Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm sticky top-6">
            <h2 className="text-gray-900 font-semibold mb-5 pb-3 border-b border-gray-100">Cấu hình Mail Gửi Hãng</h2>
            
            <div className="space-y-4">
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
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    {suggestions.map((s) => (
                      <div 
                        key={s.id} 
                        onClick={() => selectSupplier(s)}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <div className="font-medium text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-500">{s.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email Hãng *</label>
                <input
                  type="email"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tên Công ty Hãng</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tên Người Nhận (Dear ...)</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email CC (cách nhau bởi dấu phẩy)</label>
                <input
                  type="text"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="boss@psbv.vn, sale@psbv.vn"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tiêu đề Mail *</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-medium text-gray-900"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSendRFO}
                  disabled={sending || rfq.status !== "RFO_PENDING_ADMIN"}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-all shadow-md shadow-blue-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {sending ? "Đang gửi email..." : "PHÊ DUYỆT & GỬI EMAIL"}
                </button>
                {rfq.status !== "RFO_PENDING_ADMIN" && (
                  <p className="text-xs text-center text-gray-500 mt-2">Đơn hàng đã được duyệt hoặc xử lý.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
