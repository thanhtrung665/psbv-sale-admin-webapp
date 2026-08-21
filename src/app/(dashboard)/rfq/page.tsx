"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Calculator, Search, Inbox, Eye, FileSearch, Trash2 } from "lucide-react";

import { GenerateFileModal } from "@/components/rfq/generate-file-modal";
import { QuickEmailModal } from "@/components/rfq/quick-email-modal";
import { ProcessFileModal } from "@/components/rfq/process-file-modal";
import { RfqSelector } from "@/components/rfq/RfqSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  INQUIRY_RECEIVED:     { label: "Yêu cầu Mới",          bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200" },
  RFO_PENDING_ADMIN:    { label: "Chờ duyệt RFO",        bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200" },
  RFO_SENT_TO_SUPPLIER: { label: "Gửi hỏi giá Hãng",     bg: "bg-sky-50",      text: "text-sky-700",     border: "border-sky-200" },
  SUPPLIER_QUOTED:      { label: "Đã có phí Hãng",       bg: "bg-indigo-50",   text: "text-indigo-700",  border: "border-indigo-200" },
  CBU_PENDING_ADMIN:    { label: "Chờ tính CBU",         bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200" },
  QUOTATION_DRAFTED:    { label: "Báo giá Nháp",         bg: "bg-teal-50",     text: "text-teal-700",    border: "border-teal-200" },
  QUOTED_TO_CLIENT:     { label: "Đã gửi Khách",         bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
};

const STATUS_KEYS = Object.keys(STATUS_LABELS);

const fmtUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (dString: string) => {
  const d = new Date(dString);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function RFQListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") || "";
  
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRfqs = useCallback(async () => {
    setLoading(true);
    const url = activeStatus ? `/api/rfq?status=${activeStatus}` : "/api/rfq";
    const res = await fetch(url);
    const data = await res.json();
    setRfqs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [activeStatus]);

  useEffect(() => {
    fetchRfqs();
  }, [fetchRfqs]);

  const handleRetry = async (id: string) => {
    if (confirm("Thao tác này sẽ xoá bản nháp bị lỗi để bạn có thể thử lại. Bạn có chắc chắn?")) {
      const res = await fetch(`/api/rfq/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/rfq/new");
      } else {
        alert("Có lỗi khi xoá bản nháp. Vui lòng thử lại.");
      }
    }
  };

  const filteredRfqs = useMemo(() => {
    if (!searchQuery.trim()) return rfqs;
    const lowerQ = searchQuery.toLowerCase();
    return rfqs.filter(rfq => 
      (rfq.rfqCode || "").toLowerCase().includes(lowerQ) ||
      (rfq.client?.companyName || "").toLowerCase().includes(lowerQ) ||
      (rfq.client?.name || "").toLowerCase().includes(lowerQ)
    );
  }, [rfqs, searchQuery]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header & Compact Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Đơn hàng RFQ</h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý và theo dõi toàn bộ quy trình báo giá B2B</p>
        </div>

        {/* ── 5-Button Compact Action Toolbar ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1 — Tiếp nhận Inquiry (Primary Dark) */}
          <Link
            href="/rfq/new"
            className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-900 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Tiếp nhận Inquiry
          </Link>

          {/* 2 — Xử lý File (Quote & PO) */}
          <ProcessFileModal />

          {/* 3 — Tính CBU */}
          <CbuCalcModal />

          {/* 4 — Tạo File PDF */}
          <GenerateFileModal />

          {/* 5 — Soạn / Gửi Mail */}
          <QuickEmailModal />
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="relative w-full md:w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Tìm theo Mã RFO / Tên Khách hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <Link
            href="/rfq"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
              !activeStatus
                ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Tất cả
          </Link>
          {STATUS_KEYS.map((s) => {
            const st = STATUS_LABELS[s];
            return (
              <Link
                key={s}
                href={`/rfq?status=${s}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                  activeStatus === s
                    ? `${st.bg} ${st.text} border-${st.bg.replace("bg-", "")} shadow-sm`
                    : "bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {st.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Historical RFQ Data Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Mã RFO</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Dự án / Khách hàng</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Hãng Cung Cấp</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Ngày tạo</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Tổng Giá Trị ($)</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Trạng thái</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-500 animate-pulse">Đang tải dữ liệu...</td></tr>
              ) : filteredRfqs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Inbox className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-sm font-medium mb-4 text-slate-500">Chưa có đơn hàng nào.</p>
                      <Link href="/rfq/new" className="inline-flex h-9 items-center px-4 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs transition-colors">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Tạo Inquiry đầu tiên
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRfqs.map((rfq) => {
                  const st = STATUS_LABELS[rfq.status] || { label: rfq.status || "Unknown", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
                  return (
                    <tr key={rfq.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-slate-900 font-semibold bg-slate-100 px-2 py-1 rounded">{rfq.rfqCode || "—"}</span>
                        {rfq.isProcessing && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase font-bold text-blue-500">
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            AI Processing
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-slate-900 font-medium text-sm">{rfq.opportunityName || rfq.client?.name || "—"}</div>
                        <div className="text-slate-500 text-xs truncate max-w-[200px]">{rfq.client?.companyName || "—"}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-sm">{rfq.supplierName || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-sm font-medium">
                        {rfq.createdAt ? fmtDate(rfq.createdAt) : "N/A"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-900 font-mono text-sm font-semibold">
                          {(rfq.totalRevenueUsd || 0) > 0 ? fmtUSD(rfq.totalRevenueUsd) : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md font-medium border ${st.bg} ${st.text} ${st.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.text.replace("text-", "bg-")}`} />
                            {st.label}
                          </span>
                          {rfq.extractionError && (
                            <span className="text-[10px] text-red-500 truncate max-w-[150px] font-medium" title={rfq.extractionError}>
                              ⚠ Lỗi: {rfq.extractionError.substring(0, 30)}...
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {rfq.extractionError ? (
                          <button
                            onClick={() => handleRetry(rfq.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                            title="Thử lại"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end">
                            <Link
                              href={`/rfq/${rfq.id}/cbu-calc`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-sm transition-all"
                              title="Tính CBU"
                            >
                              <Calculator className="w-4 h-4" />
                            </Link>
                            <Link
                              href={rfq.status === 'QUOTATION_DRAFTED' || rfq.status === 'QUOTED_TO_CLIENT' 
                                ? `/rfq/${rfq.id}/quote-preview` 
                                : rfq.status === 'CBU_PENDING_ADMIN'
                                ? `/rfq/${rfq.id}/cbu-calc`
                                : `/rfq/${rfq.id}/rfo-review`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-sm transition-all"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CbuCalcModal() {
  const [open, setOpen] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const router = useRouter();

  const [navigating, setNavigating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!rfqCode.trim()) return;
    setNavigating(true);
    setNavError(null);
    try {
      const res = await fetch(`/api/rfq/search-codes?q=${encodeURIComponent(rfqCode.trim())}`);
      const data = await res.json();
      const match = Array.isArray(data)
        ? data.find((r: any) => r.rfqCode?.toLowerCase() === rfqCode.trim().toLowerCase())
        : null;
      if (match?.id) {
        setOpen(false);
        setRfqCode("");
        router.push(`/rfq/${match.id}/cbu-calc`);
      } else {
        setNavError(`Không tìm thấy RFQ: ${rfqCode.trim()}`);
      }
    } catch {
      setNavError("Lỗi kết nối, vui lòng thử lại.");
    } finally {
      setNavigating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) setRfqCode("");
    }}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-all">
        <Calculator className="w-3.5 h-3.5" />
        Tính CBU
      </DialogTrigger>

      <DialogContent className="sm:max-w-[450px] p-0 rounded-2xl overflow-hidden border border-slate-200 shadow-2xl bg-white">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-white">
          <DialogTitle className="text-lg font-semibold text-slate-900 tracking-tight">
            Tính toán CBU &amp; DDP
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-6 bg-slate-50/30">
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Mã RFQ / Inquiry Code
          </label>
          <div className="w-full">
            <RfqSelector
              value={rfqCode}
              onChange={(v) => { setRfqCode(v); setNavError(null); }}
              placeholder="Nhập hoặc chọn mã RFQ..."
            />
          </div>
          {navError && (
            <p className="mt-2 text-xs text-red-600 font-medium">{navError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 bg-slate-50/30 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!rfqCode.trim() || navigating}
            className="w-full h-11 text-sm font-bold bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Calculator size={16} />
            {navigating ? "Đang tìm kiếm..." : "Tính CBU & DDP"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full h-9 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Hủy
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
