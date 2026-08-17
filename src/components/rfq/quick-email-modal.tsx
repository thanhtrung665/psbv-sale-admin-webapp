"use client";

import { Mail } from "lucide-react";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_ACTIONS = [
  {
    value: "SEND_RFO_SUPPLIER",
    label: "Gửi Yêu Cầu Báo Giá (RFO) Cho Hãng",
    icon: "🏭",
    color: "purple",
    defaultSubject: (rfqCode: string) =>
      `[RFO] Request for Offer — ${rfqCode}`,
    defaultBody: (rfqCode: string, clientName?: string) =>
      `<p>Dear Sir/Madam,</p>
<p>We are pleased to request your best offer for the following items on behalf of our client <strong>${clientName || "[Client Name]"}</strong>.</p>
<p>Please find the item list below. Kindly provide your best FOB/FCA price, lead time, and availability at your earliest convenience.</p>`,
  },
  {
    value: "SEND_QUOTATION_CLIENT",
    label: "Gửi Báo Giá Quotation Cho Khách Hàng",
    icon: "📋",
    color: "blue",
    defaultSubject: (rfqCode: string) =>
      `[QUOTATION] Báo Giá PSBV — ${rfqCode}`,
    defaultBody: (rfqCode: string, clientName?: string) =>
      `<p>Dear ${clientName || "[Tên Khách Hàng]"},</p>
<p>Kính gửi Quý Khách, PSBV xin trân trọng gửi báo giá theo yêu cầu của Quý Công ty với mã đơn hàng <strong>${rfqCode}</strong>.</p>
<p>Vui lòng xem bảng chi tiết đính kèm và liên hệ với chúng tôi nếu có bất kỳ câu hỏi nào.</p>`,
  },
  {
    value: "SEND_INTERNAL_APPROVAL",
    label: "Gửi Mail Trình Duyệt Nội Bộ / Sếp",
    icon: "📊",
    color: "amber",
    defaultSubject: (rfqCode: string) =>
      `[APPROVAL REQUEST] Trình duyệt Báo giá — ${rfqCode}`,
    defaultBody: (rfqCode: string) =>
      `<p>Kính gửi Anh/Chị,</p>
<p>Em xin trình báo giá đơn hàng <strong>${rfqCode}</strong> để Anh/Chị xem xét và phê duyệt trước khi gửi khách hàng.</p>
<p>Vui lòng xem bảng thông số CBU và giá bán chi tiết bên dưới.</p>`,
  },
] as const;

type EmailActionValue = (typeof EMAIL_ACTIONS)[number]["value"];

interface RfqSuggestion {
  id: string;
  rfqCode: string;
  clientName: string;
  companyName: string;
}

interface RfqDetail {
  id: string;
  rfqCode: string;
  clientName: string;
  companyName: string;
  clientEmail?: string;
  supplierName?: string;
  supplierEmail?: string;
  items: {
    lineNo: number;
    rawPartNumber: string;
    standardPartNo: string | null;
    rawDescription: string;
    qty: number;
    uom: string;
    ddpPriceUsd: number | null;
  }[];
  totalRevenueUsd: number | null;
}

const PSBV_SIGNATURE_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px; border-top:2px solid #00529c; padding-top:20px;">
  <tr>
    <td style="width:80px; vertical-align:top; padding-right:16px;">
      <img src="https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/logo.png"
           alt="PSBV Logo" style="width:72px; height:auto; display:block;" />
    </td>
    <td style="vertical-align:top; font-family:Arial, sans-serif; font-size:12px; color:#334155; line-height:1.6;">
      <div style="font-weight:700; font-size:13px; color:#00529c;">PRESSURE SYSTEM BUILDERS VIETNAM CO., LTD</div>
      <div>📍 16 Yen The Street, Tan Son Hoa Ward, Ho Chi Minh City, Vietnam</div>
      <div>📞 +84 28 3547 2694 &nbsp;|&nbsp; 📠 +84 28 3547 2641</div>
      <div>📧 <a href="mailto:drilling@psbvn.com" style="color:#00529c;">drilling@psbvn.com</a> &nbsp;|&nbsp; 
           <a href="mailto:salesdir@psbvn.com" style="color:#00529c;">salesdir@psbvn.com</a></div>
      <div style="margin-top:4px; font-size:10px; color:#94a3b8; font-style:italic;">
        Authorized Distributor · Pressure & Safety Systems Specialist
      </div>
    </td>
  </tr>
</table>`;

function buildOrderTableHtml(items: RfqDetail["items"], showPrice: boolean): string {
  const rows = items
    .map(
      (item, idx) => `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafc"}">
      <td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:center; font-size:12px; color:#64748b;">${item.lineNo}</td>
      <td style="padding:8px 10px; border:1px solid #e2e8f0; font-family:monospace; font-size:12px; color:#0f172a;">${item.standardPartNo || item.rawPartNumber}</td>
      <td style="padding:8px 10px; border:1px solid #e2e8f0; font-size:12px; color:#334155;">${item.rawDescription || "—"}</td>
      <td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:center; font-size:12px;">${item.qty}</td>
      <td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:center; font-size:12px; color:#64748b;">${item.uom || "PCS"}</td>
      ${showPrice ? `<td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:right; font-size:12px; font-weight:600; color:#0f172a;">${item.ddpPriceUsd ? "$ " + item.ddpPriceUsd.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}</td>` : ""}
    </tr>`
    )
    .join("");

  const priceHeader = showPrice
    ? `<th style="padding:10px; border:1px solid #e2e8f0; text-align:right; font-weight:600; color:#334155; white-space:nowrap;">Unit Price (USD)</th>`
    : "";

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px; font-family:Arial, sans-serif; margin-top:16px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:10px; border:1px solid #e2e8f0; text-align:center; font-weight:600; color:#334155;">#</th>
        <th style="padding:10px; border:1px solid #e2e8f0; text-align:left; font-weight:600; color:#334155;">Part Number</th>
        <th style="padding:10px; border:1px solid #e2e8f0; text-align:left; font-weight:600; color:#334155;">Description</th>
        <th style="padding:10px; border:1px solid #e2e8f0; text-align:center; font-weight:600; color:#334155;">Qty</th>
        <th style="padding:10px; border:1px solid #e2e8f0; text-align:center; font-weight:600; color:#334155;">UOM</th>
        ${priceHeader}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildFullEmailHtml(body: string, orderTableHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:24px 0;">
    <tr><td align="center">
      <table width="660" cellpadding="0" cellspacing="0"
             style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; max-width:100%;">
        <tr><td style="background:#00529c; height:4px; padding:0;"></td></tr>
        <tr>
          <td style="padding:28px 32px;">
            <div style="font-size:14px; color:#1e293b; line-height:1.8;">
              ${body}
            </div>
            ${orderTableHtml}
            ${PSBV_SIGNATURE_HTML}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function QuickEmailModal() {
  const [open, setOpen] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RfqSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rfqDetail, setRfqDetail] = useState<RfqDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [selectedAction, setSelectedAction] = useState<EmailActionValue | "">("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isEditingBody, setIsEditingBody] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/rfq/search-codes?q=${searchQuery}`);
        const data = await res.json();
        if (Array.isArray(data)) setSuggestions(data);
      } catch (e) { console.error(e); }
      finally { setIsSearching(false); }
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // Load RFQ detail when code is selected
  const loadRfqDetail = useCallback(async (code: string) => {
    if (!code) return;
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/rfq/search-codes?q=${code}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const found = data.find((d: RfqSuggestion) => d.rfqCode === code);
        if (found) {
          // Load full detail
          const detailRes = await fetch(`/api/rfq/${found.id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setRfqDetail(detail);
          }
        }
      }
    } catch (e) { console.error(e); }
    finally { setIsLoadingDetail(false); }
  }, []);

  // When action changes, auto-fill subject and body
  useEffect(() => {
    if (!selectedAction || !rfqCode) return;
    const actionDef = EMAIL_ACTIONS.find((a) => a.value === selectedAction);
    if (!actionDef) return;
    setEmailSubject(actionDef.defaultSubject(rfqCode));
    setEmailBody(actionDef.defaultBody(rfqCode, rfqDetail?.clientName));
  }, [selectedAction, rfqCode, rfqDetail?.clientName]);

  const handleSend = async () => {
    if (!rfqCode) return setError("Vui lòng chọn Mã Đơn Hàng.");
    if (!selectedAction) return setError("Vui lòng chọn Mục Đích Gửi Mail.");
    if (!emailSubject.trim()) return setError("Vui lòng nhập Tiêu đề mail.");

    setIsSending(true);
    setError(null);

    const showPrice = selectedAction === "SEND_QUOTATION_CLIENT" || selectedAction === "SEND_INTERNAL_APPROVAL";
    const orderTableHtml = rfqDetail ? buildOrderTableHtml(rfqDetail.items, showPrice) : "";
    const fullHtml = buildFullEmailHtml(emailBody, orderTableHtml);

    let toEmail = "";
    if (selectedAction === "SEND_RFO_SUPPLIER") toEmail = rfqDetail?.supplierEmail || "";
    else if (selectedAction === "SEND_QUOTATION_CLIENT") toEmail = rfqDetail?.clientEmail || "";

    try {
      const res = await fetch("/api/email/send-rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfqCode,
          rfqId: rfqDetail?.id,
          action: selectedAction,
          to: toEmail,
          subject: emailSubject,
          html: fullHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Có lỗi khi gửi mail.");
      setSendSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setRfqCode(""); setSearchQuery(""); setSuggestions([]);
    setRfqDetail(null); setSelectedAction(""); setEmailSubject("");
    setEmailBody(""); setIsEditingBody(false); setError(null);
    setSendSuccess(false); setIsSending(false);
  };

  const actionDef = EMAIL_ACTIONS.find((a) => a.value === selectedAction);
  const showPrice = selectedAction === "SEND_QUOTATION_CLIENT" || selectedAction === "SEND_INTERNAL_APPROVAL";
  const orderTableHtml = rfqDetail ? buildOrderTableHtml(rfqDetail.items, showPrice) : "";
  const previewHtml = buildFullEmailHtml(emailBody, orderTableHtml);

  const actionColorMap: Record<string, string> = {
    purple: "border-purple-500 bg-purple-50 text-purple-800",
    blue: "border-blue-500 bg-blue-50 text-blue-800",
    amber: "border-amber-500 bg-amber-50 text-amber-800",
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) handleReset(); }}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-all">
        <Mail className="w-3.5 h-3.5" />
        Gửi Mail Nhanh
      </DialogTrigger>

      <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-2xl">✉️</span>
            Gửi Mail Nhanh
          </DialogTitle>
          <DialogDescription>
            Chọn đơn hàng, mục đích gửi — hệ thống tự tạo nội dung và xem trước trực tiếp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 mt-2 overflow-hidden flex-1 min-h-0">
          {/* LEFT PANEL — Controls */}
          <div className="w-[300px] shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                ⚠ {error}
              </div>
            )}
            {sendSuccess && (
              <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg font-semibold">
                ✅ Mail đã được gửi thành công!
              </div>
            )}

            {/* RFQ Code search */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">1. Mã Đơn Hàng</Label>
              <Input
                placeholder="Gõ mã... để tìm"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setRfqCode(e.target.value);
                  setShowSuggestions(true);
                  setRfqDetail(null);
                  setSendSuccess(false);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className={`text-sm ${rfqDetail ? "border-green-400 bg-green-50" : ""}`}
              />
              {isLoadingDetail && (
                <p className="text-xs text-gray-400 animate-pulse">Đang tải chi tiết đơn...</p>
              )}
              {rfqDetail && (
                <div className="text-xs text-green-700 bg-green-50 rounded-lg px-2.5 py-1.5 border border-green-200">
                  ✓ <span className="font-semibold">{rfqDetail.rfqCode}</span> — {rfqDetail.clientName}
                  <span className="ml-1 text-green-500">({rfqDetail.items.length} items)</span>
                </div>
              )}
              {showSuggestions && searchQuery.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-auto">
                  {isSearching ? (
                    <div className="p-3 text-xs text-gray-400 text-center">Đang tìm...</div>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((s) => (
                      <div
                        key={s.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors"
                        onClick={() => {
                          setSearchQuery(s.rfqCode);
                          setRfqCode(s.rfqCode);
                          setShowSuggestions(false);
                          setSendSuccess(false);
                          loadRfqDetail(s.rfqCode);
                        }}
                      >
                        <div className="font-semibold text-sm text-blue-600">{s.rfqCode}</div>
                        <div className="text-xs text-gray-500 truncate">{s.clientName} — {s.companyName}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-gray-400 text-center">Không tìm thấy.</div>
                  )}
                </div>
              )}
            </div>

            {/* Email Action */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">2. Mục Đích Gửi Mail</Label>
              <div className="flex flex-col gap-1.5">
                {EMAIL_ACTIONS.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    onClick={() => { setSelectedAction(action.value); setSendSuccess(false); }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                      selectedAction === action.value
                        ? actionColorMap[action.color] + " shadow-sm"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-base shrink-0">{action.icon}</span>
                    <span className="font-medium leading-tight">{action.label}</span>
                    {selectedAction === action.value && <span className="ml-auto shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject field */}
            {selectedAction && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">3. Tiêu Đề Mail</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="text-xs"
                  placeholder="Subject..."
                />
              </div>
            )}

            {/* Edit body toggle */}
            {selectedAction && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">4. Nội Dung</Label>
                  <button
                    onClick={() => setIsEditingBody(!isEditingBody)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {isEditingBody ? "Xem Preview" : "✏️ Chỉnh Sửa Câu Từ"}
                  </button>
                </div>
                {isEditingBody && (
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={6}
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Nhập HTML hoặc plain text..."
                  />
                )}
              </div>
            )}

            {/* Send button */}
            {!sendSuccess ? (
              <button
                onClick={handleSend}
                disabled={isSending || !rfqCode || !selectedAction}
                className="w-full flex justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-auto"
              >
                {isSending ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Đang gửi mail...
                  </>
                ) : (
                  <>✉️ BẮN MAIL NGAY</>
                )}
              </button>
            ) : (
              <button
                onClick={handleReset}
                className="w-full flex justify-center items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                + Gửi Mail Mới
              </button>
            )}
          </div>

          {/* RIGHT PANEL — Live Preview */}
          <div className="flex-1 flex flex-col min-w-0 border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            <div className="shrink-0 px-3 py-2 border-b border-gray-200 bg-white flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-500 font-medium ml-1">
                Live Email Preview
                {actionDef && <span className="ml-1 text-gray-400">— {actionDef.icon} {actionDef.label}</span>}
              </span>
            </div>
            {selectedAction ? (
              <div className="flex-1 overflow-auto">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[400px] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                <span className="text-4xl">✉️</span>
                <p className="text-sm font-medium">Chọn Mục Đích Gửi Mail để xem Preview</p>
                <p className="text-xs text-gray-300">Live preview sẽ hiển thị ở đây bao gồm bảng items và chữ ký PSBV.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
