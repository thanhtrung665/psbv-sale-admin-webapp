"use client";

import { FileSpreadsheet, FileText, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RfqSelector } from "./RfqSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DOC_TYPES = [
  { id: "QUOTATION_CLIENT_PDF",   label: "File Quotation",   icon: FileText,     active: true  },
  { id: "MVPO_SUPPLIER_PDF",      label: "Đặt hàng MVPO",    icon: ShoppingCart, active: true  },
  { id: "COMMERCIAL_INVOICE_PDF", label: "File PS",           icon: FileText,     active: false },
  { id: "CERTIFICATE_COC_COO_PDF", label: "File CI",          icon: FileText,     active: false },
] as const;

type DocTypeId = (typeof DOC_TYPES)[number]["id"];

export function GenerateFileModal() {
  const [open, setOpen] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<DocTypeId>("QUOTATION_CLIENT_PDF");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleContinue = async () => {
    if (!rfqCode.trim()) {
      setError("❌ Vui lòng nhập Mã RFQ.");
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const res = await fetch(`/api/rfq/search-codes?q=${encodeURIComponent(rfqCode.trim())}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const match = data.find((d: any) => d.rfqCode.toLowerCase() === rfqCode.trim().toLowerCase());
        if (match) {
          setOpen(false);
          // Route to dedicated page per document type
          if (selectedDocType === "MVPO_SUPPLIER_PDF") {
            router.push(`/rfq/${match.id}/mvpo`);
          } else {
            // Default: Quotation preview
            router.push(`/rfq/${match.id}/quote-preview`);
          }
          return;
        }
      }

      setError("❌ Không tìm thấy mã RFQ này trong hệ thống. Vui lòng kiểm tra lại!");
    } catch {
      setError("❌ Lỗi hệ thống khi tìm kiếm. Vui lòng thử lại.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setRfqCode("");
        setError(null);
      }
    }}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-all">
        <FileText className="w-3.5 h-3.5" />
        Tạo File PDF
      </DialogTrigger>

      <DialogContent className="sm:max-w-[650px] w-[90vw] p-0 rounded-2xl overflow-hidden border border-slate-200 shadow-2xl bg-white gap-0">
        <DialogHeader className="px-8 py-6 border-b border-slate-100 bg-white">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900 tracking-tight">
            <FileSpreadsheet className="w-[22px] h-[22px] text-blue-600" />
            Tạo Tài Liệu Đơn Hàng
          </DialogTitle>
        </DialogHeader>

        <div className="px-8 py-6 flex flex-col gap-6 bg-slate-50/30">
          {/* Block 1: RFQ Code */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-800">1. Mã RFQ / Inquiry Code</label>
            <RfqSelector
              value={rfqCode}
              onChange={(code) => {
                setRfqCode(code);
                if (error) setError(null);
              }}
              placeholder="Nhập mã RFQ (ví dụ: AC0485, AC0001)..."
              className="h-11"
            />
            {error && (
              <p className="text-sm text-red-500 font-medium mt-1">{error}</p>
            )}
          </div>

          {/* Block 2: Document Type */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-800">2. Chọn loại tài liệu cần tạo</label>
            <div className="grid grid-cols-2 gap-3">
              {DOC_TYPES.map((doc) => {
                const Icon = doc.icon;
                const isSelected = selectedDocType === doc.id;

                if (doc.active) {
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocType(doc.id)}
                      className={`p-4 rounded-xl cursor-pointer flex items-center gap-3 transition-all shadow-sm ${
                        isSelected
                          ? "border-2 border-blue-600 bg-blue-50/50"
                          : "border border-slate-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                      <span className={`font-semibold text-sm ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                        {doc.label}
                      </span>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={doc.id}
                      className="border border-slate-200 bg-slate-100/60 p-4 rounded-xl cursor-not-allowed flex items-center gap-3 opacity-60"
                    >
                      <Icon className="w-5 h-5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-sm text-slate-500">{doc.label}</span>
                      <span className="bg-slate-200 text-slate-500 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ml-auto">
                        Soon
                      </span>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={() => setOpen(false)}
            className="h-10 px-5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleContinue}
            disabled={isChecking || !rfqCode.trim()}
            className="h-10 px-7 text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang kiểm tra...
              </>
            ) : (
              <>Tiếp tục ➔</>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
