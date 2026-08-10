"use client";

import { useState } from "react";
import { Loader2, Download, Send } from "lucide-react";

interface EmailReviewCardProps {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  attachmentUrl: string;
  suggestedFileName?: string;
  onDispatchComplete?: () => void;
}

export function EmailReviewCard({
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  attachmentUrl,
  suggestedFileName = "Quotation.pdf",
  onDispatchComplete,
}: EmailReviewCardProps) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [pdfName, setPdfName] = useState(suggestedFileName);

  const handleSendEmail = async () => {
    setIsSending(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/rfq/send-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          bodyHtml: body, // Assume body is already HTML as requested
          attachmentUrl,
          fileName: pdfName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to send email");
      }

      setSuccess(true);
      if (onDispatchComplete) onDispatchComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden w-full max-w-6xl mx-auto my-4">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          Agent Task: Email Review & Dispatch
        </h3>
        <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded border border-slate-200">
          Status: {success ? "Dispatched" : "Pending Review"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* LEFT COLUMN: Email Editor */}
        <div className="p-5 flex flex-col gap-4 bg-white">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase">To</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="client@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">CC</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="cc@company.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">BCC</label>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="bcc@company.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Quotation Attached"
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Body HTML</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full h-full min-h-[200px] p-3 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
              placeholder="<p>Dear Client...</p>"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}

          {success && (
            <div className="px-3 py-2 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Email dispatched successfully via MS Graph.
            </div>
          )}

          <button
            onClick={handleSendEmail}
            disabled={isSending || success || !to || !subject}
            className="mt-2 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : success ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <Send className="w-4 h-4" />
            )}
            {success ? "ĐÃ DUYỆT & GỬI" : "🚀 DUYỆT & BẮN MAIL NGAY"}
          </button>
        </div>

        {/* RIGHT COLUMN: PDF Live Preview */}
        <div className="p-5 flex flex-col gap-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.536 3.464a5 5 0 017.071 7.072l-8 8a5 5 0 01-7.07-7.072v-1h1v1a4 4 0 005.656 5.656l8-8a4 4 0 00-5.656-5.656l-8 8a4 4 0 005.656 5.656l1-1h1l-1 1a5 5 0 01-7.071-7.071l8-8z"/>
              </svg>
              PDF Live Preview
            </label>
            <a 
              href={`/api/download-pdf?url=${encodeURIComponent(attachmentUrl)}&filename=${encodeURIComponent(pdfName)}`}
              download
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              📥 Tải PDF xuống
            </a>
          </div>

          <div className="flex flex-col gap-1.5 mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">📄 Tên file đính kèm:</label>
            <input
              type="text"
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
            />
          </div>

          <div className="flex-1 min-h-[400px] lg:min-h-[500px]">
            {attachmentUrl ? (
              <iframe 
                src={`${attachmentUrl}#toolbar=0`} 
                className="w-full h-full border border-slate-200 rounded-lg shadow-sm bg-white"
                title="PDF Preview"
              />
            ) : (
              <div className="w-full h-full border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 bg-white">
                No Attachment URL provided
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
