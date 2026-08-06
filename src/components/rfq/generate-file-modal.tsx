"use client";

import { useState, useRef, useEffect } from "react";
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

const DOC_TYPES = [
  {
    value: "QUOTATION_CLIENT_PDF",
    label: "Báo Giá Commercial Quotation — Gửi Khách Hàng",
    icon: "📋",
  },
  {
    value: "MVPO_SUPPLIER_PDF",
    label: "Đơn Đặt Hàng MVPO — Gửi Hãng",
    icon: "🏭",
  },
  {
    value: "COMMERCIAL_INVOICE_PDF",
    label: "Commercial Invoice — Hóa Đơn Thương Mại [V3]",
    icon: "🧾",
  },
  {
    value: "CERTIFICATE_COC_COO_PDF",
    label: "Chứng Nhận COC / COO [V3]",
    icon: "📜",
  },
] as const;

type DocTypeValue = (typeof DOC_TYPES)[number]["value"];

interface RfqSuggestion {
  id: string;
  rfqCode: string;
  clientName: string;
  companyName: string;
}

interface GeneratedFile {
  url: string;
  fileName: string;
}

export function GenerateFileModal() {
  const [open, setOpen] = useState(false);
  const [rfqCode, setRfqCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RfqSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<DocTypeValue | "">("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedFile, setGeneratedFile] = useState<GeneratedFile | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/rfq/search-codes?q=${searchQuery}`);
        const data = await res.json();
        if (Array.isArray(data)) setSuggestions(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleGenerate = async () => {
    if (!rfqCode) return setError("Vui lòng nhập hoặc chọn Mã Đơn Hàng.");
    if (!selectedDocType) return setError("Vui lòng chọn Loại File cần tạo.");

    setIsGenerating(true);
    setError(null);
    setGeneratedFile(null);

    try {
      const res = await fetch("/api/rfq/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfqCode, docType: selectedDocType }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Có lỗi khi tạo file.");
      }

      setGeneratedFile({ url: data.url, fileName: data.fileName });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setRfqCode("");
    setSearchQuery("");
    setSuggestions([]);
    setSelectedDocType("");
    setError(null);
    setGeneratedFile(null);
    setIsGenerating(false);
  };

  const selectedDocInfo = DOC_TYPES.find((d) => d.value === selectedDocType);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) handleReset();
      }}
    >
      <DialogTrigger className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 shadow-sm transition-all">
        <span className="text-base">📄</span>
        Tạo file
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-2xl">📄</span>
            Tạo File Chứng Từ
          </DialogTitle>
          <DialogDescription>
            Chọn đơn hàng và loại file cần tạo. Hệ thống sẽ tự động render PDF
            theo template chuẩn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              ⚠ {error}
            </div>
          )}

          {/* Step 1: RFQ Code Search */}
          <div className="space-y-2 relative">
            <Label className="text-sm font-semibold text-gray-700">
              1. Mã Đơn Hàng
            </Label>
            <div className="relative">
              <Input
                placeholder="Gõ mã ACxxxx / RFO... để tìm"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setRfqCode(e.target.value);
                  setShowSuggestions(true);
                  setGeneratedFile(null);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className={`pr-8 ${rfqCode && suggestions.find((s) => s.rfqCode === rfqCode) ? "border-green-400 bg-green-50" : ""}`}
              />
              {rfqCode && suggestions.find((s) => s.rfqCode === rfqCode) && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm">
                  ✓
                </span>
              )}
            </div>

            {showSuggestions && searchQuery.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-auto">
                {isSearching ? (
                  <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Đang tìm kiếm...
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors"
                      onClick={() => {
                        setSearchQuery(s.rfqCode);
                        setRfqCode(s.rfqCode);
                        setShowSuggestions(false);
                        setGeneratedFile(null);
                      }}
                    >
                      <div className="font-semibold text-sm text-blue-600">{s.rfqCode}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {s.clientName} — {s.companyName}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-sm text-gray-400 text-center">
                    Không tìm thấy đơn hàng phù hợp.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Document Type */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">
              2. Loại File Cần Tạo
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {DOC_TYPES.map((doc) => (
                <button
                  key={doc.value}
                  type="button"
                  onClick={() => {
                    setSelectedDocType(doc.value);
                    setGeneratedFile(null);
                  }}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left text-sm transition-all ${
                    selectedDocType === doc.value
                      ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-lg shrink-0">{doc.icon}</span>
                  <span className="font-medium">{doc.label}</span>
                  {selectedDocType === doc.value && (
                    <span className="ml-auto text-blue-500 shrink-0">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Generated File Result */}
          {generatedFile && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <span>✅</span>
                <span>File đã được tạo thành công!</span>
              </div>
              <p className="text-xs text-green-600 font-mono truncate">{generatedFile.fileName}</p>
              <div className="flex gap-2">
                <a
                  href={generatedFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-green-300 text-green-700 text-xs font-semibold hover:bg-green-50 transition-all"
                >
                  👁️ Xem trước PDF
                </a>
                <a
                  href={generatedFile.url}
                  download={generatedFile.fileName}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-all"
                >
                  📥 Tải File Về Máy
                </a>
              </div>
            </div>
          )}

          {/* Generate Button */}
          {!generatedFile && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !rfqCode || !selectedDocType}
              className="w-full flex justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang tạo file{selectedDocInfo ? ` ${selectedDocInfo.icon}` : ""}...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Tiến Hành Tạo File PDF
                  {selectedDocInfo && (
                    <span className="opacity-75 ml-1">{selectedDocInfo.icon}</span>
                  )}
                </>
              )}
            </button>
          )}

          {generatedFile && (
            <button
              onClick={handleReset}
              className="w-full flex justify-center items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
            >
              + Tạo File Mới
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
