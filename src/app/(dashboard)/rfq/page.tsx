"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { GenerateFileModal } from "@/components/rfq/generate-file-modal";
import { QuickEmailModal } from "@/components/rfq/quick-email-modal";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INQUIRY_RECEIVED:     { label: "Đang xử lý AI",         color: "bg-blue-50 text-blue-700 border-blue-200" },
  RFO_PENDING_ADMIN:    { label: "Chờ duyệt RFO",          color: "bg-amber-50 text-amber-700 border-amber-200" },
  RFO_SENT_TO_SUPPLIER: { label: "Đã gửi Hãng",           color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  SUPPLIER_QUOTED:      { label: "Hãng đã báo giá",        color: "bg-violet-50 text-violet-700 border-violet-200" },
  CBU_PENDING_ADMIN:    { label: "Chờ nhập phí CBU",       color: "bg-orange-50 text-orange-700 border-orange-200" },
  QUOTATION_DRAFTED:    { label: "Đã tạo Báo giá nháp",   color: "bg-teal-50 text-teal-700 border-teal-200" },
  QUOTED_TO_CLIENT:     { label: "Đã phát hành",           color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const STATUS_KEYS = Object.keys(STATUS_LABELS);

export default function RFQListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") || "";
  const [rfqs, setRfqs] = useState<{ id: string; rfqCode: string; isProcessing: boolean; extractionError: string | null; status: string; createdAt: string; client: { name: string; companyName: string } | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRfqs = useCallback(async () => {
    setLoading(true);
    const url = activeStatus ? `/api/rfq?status=${activeStatus}` : "/api/rfq";
    const res = await fetch(url);
    const data = await res.json();
    setRfqs(data);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Đơn hàng RFQ</h1>
          <p className="text-gray-500 text-sm mt-0.5">{rfqs.length} đơn hàng{activeStatus ? ` — ${STATUS_LABELS[activeStatus]?.label}` : " (tất cả)"}</p>
        </div>

        {/* ===== 4-BUTTON ACTION BAR ===== */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tiếp nhận Inquiry — Primary */}
          <Link
            href="/rfq/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all"
          >
            Tiếp nhận Inquiry
          </Link>

          {/* Xử lý Quote — Secondary (redirect to workspace) */}
          <Link
            href="/rfq/process-quote"
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 shadow-sm transition-all"
          >
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Xử lý Quote
          </Link>

          {/* Tạo file — Secondary with Dropdown Modal */}
          <GenerateFileModal />

          {/* Gửi mail — Secondary with Email Dispatch Modal */}
          <QuickEmailModal />
        </div>
      </div>


      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/rfq"
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
            !activeStatus
              ? "bg-gray-100 text-gray-900 border-gray-300 shadow-sm"
              : "bg-white text-gray-500 border-gray-200 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          Tất cả
        </Link>
        {STATUS_KEYS.map((s) => (
          <Link
            key={s}
            href={`/rfq?status=${s}`}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              activeStatus === s
                ? STATUS_LABELS[s].color + " border-current shadow-sm"
                : "bg-white text-gray-500 border-gray-200 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {STATUS_LABELS[s].label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              {["Mã RFO", "Khách hàng", "Công ty", "Trạng thái", "Ngày tạo", "Thao tác"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-16">Đang tải...</td></tr>
            ) : rfqs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">Chưa có đơn hàng nào.</p>
                    <Link href="/rfq/new" className="text-xs text-blue-600 hover:underline">
                      Tiếp nhận Inquiry đầu tiên →
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              rfqs.map((rfq) => {
                const statusInfo = STATUS_LABELS[rfq.status] || { label: rfq.status, color: "bg-gray-100 text-gray-500 border-gray-200" };
                return (
                  <tr key={rfq.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-blue-600 font-semibold">{rfq.rfqCode}</span>
                      {rfq.isProcessing && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500">
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          AI đang xử lý...
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-900 text-sm font-medium">{rfq.client?.name || "—"}</td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{rfq.client?.companyName || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold border ${statusInfo.color}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {statusInfo.label}
                      </span>
                      {rfq.extractionError && (
                        <p className="text-xs text-red-500 mt-1 truncate max-w-[160px]" title={rfq.extractionError}>
                          {rfq.extractionError.substring(0, 40)}...
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-sm">
                      {new Date(rfq.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-5 py-4">
                      {rfq.extractionError ? (
                        <button
                          onClick={() => handleRetry(rfq.id)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-all font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Thử lại
                        </button>
                      ) : (
                        <Link
                          href={`/rfq/${rfq.id}/rfo-review`}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 transition-all font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Xem RFO
                        </Link>
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
  );
}
