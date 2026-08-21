"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type RFQDetail = {
  id: string;
  rfqCode: string;
  status: string;
  totalCostUsd: number;
  totalRevenueUsd: number;
  totalRevenueVnd: number;
  totalMarginUsd: number;
  actualMarginPct: number;
  client: { name: string; email: string; companyName: string };
};

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

export default function QuotePreviewPage() {
  const params = useParams();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<RFQDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [senderName, setSenderName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const fetchRFQ = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}`);
    if (res.ok) {
      const data: RFQDetail = await res.json();
      setRfq(data);
      setTo(data.client.email);
      setSubject(`[Quotation] ${data.rfqCode} - PSBV Trading & Service Co., Ltd`);
      setFileName(`Quotation_${data.rfqCode}_${data.client.companyName.replace(/\s+/g, '_')}.pdf`);
      setBodyHtml(`<p>Dear ${data.client.name},</p><p>Thank you for your inquiry.</p><p>Please find our official quotation attached below.</p>`);
    }
  }, [rfqId]);

  const generatePreviewPdf = useCallback(async () => {
    const res = await fetch(`/api/rfq/${rfqId}/generate-pdf`);
    if (res.ok) {
      const data = await res.json();
      setPdfUrl(data.fileUrl);
    }
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchRFQ().then(() => generatePreviewPdf());
  }, [fetchRFQ, generatePreviewPdf]);

  const handleApproveAndSend = async () => {
    if (!confirm("Xác nhận phê duyệt & gửi báo giá cho khách hàng?")) return;
    
    setSending(true);
    const res = await fetch(`/api/rfq/${rfqId}/send-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        to, 
        cc, 
        bcc, 
        senderName, 
        subject, 
        bodyHtml,
        attachmentUrl: pdfUrl,
        fileName 
      }),
    });
    
    const data = await res.json();
    setSending(false);
    
    if (res.ok) {
      alert("Đã duyệt & Gửi báo giá thành công!");
      fetchRFQ(); // refresh status
    } else {
      alert(data.error || "Có lỗi khi gửi báo giá.");
    }
  };

  // ── Blob PDF download (forces application/pdf MIME, no .txt garbage) ────────
  const handleDownloadPdf = async () => {
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
      link.download = fileName || `Quotation_${rfq?.rfqCode || "Document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      setDownloadStatus("✅ Đã tải Báo giá PDF!");
      setTimeout(() => setDownloadStatus(null), 3000);
    } catch (err: any) {
      setDownloadStatus(`❌ Lỗi: ${err.message}`);
      setTimeout(() => setDownloadStatus(null), 4000);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-gray-500">Đang tải...</div>;
  }

  if (!rfq) return <div className="text-center py-10">Không tìm thấy RFQ.</div>;

  return (
    <div className="max-w-[1600px] mx-auto h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {rfq.rfqCode}
            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${
              rfq.status === 'QUOTED_TO_CLIENT' 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-teal-50 text-teal-700 border-teal-200"
            }`}>
              {rfq.status === 'QUOTED_TO_CLIENT' ? "Đã Gửi Báo Giá" : "Báo Giá Nháp"}
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Khách hàng: {rfq.client.companyName} ({rfq.client.email})</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/rfq/${rfqId}/cbu-calc`} className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2">
            ← Quay lại CBU
          </Link>
          {pdfUrl && (
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {downloading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              )}
              {downloading ? "Đang tải..." : "Tải File PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Main Content: 2 Columns */}
      <div className="flex gap-6 flex-1 min-h-0">
        
        {/* LEFT COL: Financials & Email Form */}
        <div className="w-[45%] flex flex-col gap-6 overflow-y-auto pr-2 pb-6 custom-scrollbar">
          
          {/* Email Draft Form */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex-1 flex flex-col shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              Email Dispatch Draft
            </h2>
            <div className="flex flex-col gap-4 flex-1">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Người nhận (To)</label>
                <input 
                  type="text" 
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 shadow-sm"
                  placeholder="client@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="block text-xs text-gray-500 mb-1.5 font-medium">CC</label>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 shadow-sm"
                    placeholder="cc@company.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="block text-xs text-gray-500 mb-1.5 font-medium">BCC</label>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 shadow-sm"
                    placeholder="bcc@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Người gửi (Sender Name)</label>
                <input 
                  type="text" 
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 shadow-sm"
                  placeholder="Vũ Trọng Hùng - Sales Dept"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Tiêu đề (Subject)</label>
                <input 
                  type="text" 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 shadow-sm"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Nội dung (Body HTML)</label>
                <textarea 
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  className="w-full flex-1 min-h-[250px] p-3 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 resize-none shadow-sm"
                  placeholder="<p>Dear Client...</p>"
                />
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-gray-200">
              <button
                onClick={handleApproveAndSend}
                disabled={sending || rfq.status === 'QUOTED_TO_CLIENT'}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Đang tạo PDF & Gửi Email MS Graph...
                  </>
                ) : rfq.status === 'QUOTED_TO_CLIENT' ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    ĐÃ GỬI BÁO GIÁ
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    🚀 DUYỆT & BẮN MAIL MS GRAPH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COL: PDF Preview Viewer */}
        <div className="w-[55%] bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              PDF Live Preview
            </h2>
            {pdfUrl && (
              <div className="flex items-center gap-2">
                {downloadStatus && (
                  <span className="text-xs font-medium text-slate-600 px-1">{downloadStatus}</span>
                )}
                {/* Open in new tab — for viewing */}
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded transition-colors shadow-sm"
                >
                  🔗 Mở tab mới
                </a>
                {/* Blob download — forces application/pdf MIME type */}
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 px-2.5 py-1.5 rounded transition-colors shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  {downloading ? "Đang tải..." : "📥 Tải PDF xuống"}
                </button>
              </div>
            )}
          </div>
          
          {pdfUrl && (
            <div className="px-4 py-3 border-b border-gray-200 bg-white">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">📄 Tên file PDF đính kèm:</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
            </div>
          )}

          <div className="flex-1 bg-gray-100 flex items-center justify-center p-4">
            {pdfUrl ? (
              <iframe 
                src={pdfUrl} 
                className="w-full h-full rounded-xl border border-gray-200 bg-white shadow-sm"
                title="Quotation PDF Viewer"
              />
            ) : (
              <div className="text-center text-gray-500 max-w-sm">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-4 border border-gray-200 shadow-sm animate-pulse">
                  <svg className="animate-spin w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Đang khởi tạo PDF...</p>
                <p className="text-xs mt-2 text-gray-500">Hệ thống đang gọi API sang APITemplate.io để sinh file Quotation PDF tự động.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
