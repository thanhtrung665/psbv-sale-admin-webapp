"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ExtractedItem {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  supplierUnitPrice: number;
  netWeightLbs: number;
  uom: string;
  qty: number;
  matched: boolean;
}

export default function ProcessQuotePage() {
  const router = useRouter();

  // ── Search State ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [rfqCode, setRfqCode] = useState("");
  const [rfqId, setRfqId] = useState("");
  const [clientInfo, setClientInfo] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── File Upload State ─────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Extraction State ──────────────────────────────────────────────────
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [supplierQuoteCode, setSupplierQuoteCode] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);

  // ── Save State ────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── RFQ Code Search ──────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/rfq/search-codes?q=${encodeURIComponent(searchQuery)}`);
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

  // ── File Drag & Drop ─────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  // ── Extract with AI ──────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!rfqCode) return setError("Vui lòng chọn mã đơn hàng (ACxxxx).");
    if (!file) return setError("Vui lòng upload file báo giá hãng.");

    setIsExtracting(true);
    setError("");
    setSuccess("");
    setExtractionDone(false);

    const formData = new FormData();
    formData.append("rfqCode", rfqCode);
    formData.append("file", file);

    try {
      const res = await fetch("/api/rfq/extract-quote-data", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Có lỗi xảy ra khi bóc tách.");
      }

      setRfqId(data.rfqId);
      setSupplierQuoteCode(data.supplierQuoteCode || "");
      setSupplierName(data.supplierName || "");
      setItems(data.items || []);
      setExtractionDone(true);
      setSuccess(`Bóc tách thành công ${data.items?.length || 0} dòng sản phẩm.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Update extracted item ────────────────────────────────────────────
  const updateItem = (id: string, field: keyof ExtractedItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // ── Save to DB & Redirect ────────────────────────────────────────────
  const handleSaveAndProceed = async () => {
    setIsSaving(true);
    setError("");

    try {
      const res = await fetch("/api/rfq/save-parsed-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfqId,
          rfqCode,
          supplierQuoteCode,
          items: items.map((item) => ({
            id: item.id,
            lineNo: item.lineNo,
            rawPartNumber: item.rawPartNumber,
            rawDescription: item.rawDescription,
            supplierUnitPrice: Number(item.supplierUnitPrice) || 0,
            netWeightLbs: Number(item.netWeightLbs) || 0,
            uom: item.uom || "PCS",
            qty: Number(item.qty) || 1,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Lỗi khi lưu.");
      }

      setSuccess("Lưu thành công! Đang chuyển sang trang tính CBU...");
      setTimeout(() => router.push(`/rfq/${rfqId}/cbu-calc`), 1200);
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/rfq" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Xử Lý Báo Giá Hãng</h1>
          </div>
          <p className="text-gray-500 text-sm">Tải lên file báo giá hãng, hệ thống sẽ tự động bóc tách dữ liệu để bạn đối chiếu và chỉnh sửa trước khi lưu.</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHẦN 1: KHỐI FORM TRA CỨU & UPLOAD
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Tra Cứu Đơn Hàng & Upload File Báo Giá</h2>
            <p className="text-xs text-gray-400">Chọn mã ACxxxx và tải lên file PDF/Image/XLSX từ nhà cung cấp.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RFQ Code Search */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Mã Inquiry (RFQ Code)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setRfqCode(e.target.value);
                  setShowSuggestions(true);
                  setClientInfo("");
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Gõ ACxxxx để tìm..."
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-all"
              />
              {showSuggestions && searchQuery.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                  {isSearching ? (
                    <div className="p-3 text-sm text-gray-400 text-center">Đang tìm...</div>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((s) => (
                      <div
                        key={s.id}
                        className="px-3 py-2.5 hover:bg-amber-50 cursor-pointer border-b last:border-0 transition-colors"
                        onClick={() => {
                          setSearchQuery(s.rfqCode);
                          setRfqCode(s.rfqCode);
                          setRfqId(s.id);
                          setClientInfo(`${s.clientName} — ${s.companyName}`);
                          setShowSuggestions(false);
                        }}
                      >
                        <div className="font-semibold text-sm text-amber-600">{s.rfqCode}</div>
                        <div className="text-xs text-gray-500 truncate">{s.clientName} — {s.companyName}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-gray-400 text-center">Không tìm thấy mã đơn.</div>
                  )}
                </div>
              )}
            </div>
            {clientInfo && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{clientInfo}</span>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Supplier Quote File (PDF / Image / XLSX)
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-amber-500 bg-amber-50"
                  : file
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                className="hidden"
                onChange={(e) => e.target.files && setFile(e.target.files[0])}
              />
              {file ? (
                <div className="space-y-1">
                  <div className="text-emerald-600 font-semibold text-sm">{file.name}</div>
                  <div className="text-gray-500 text-xs">{(file.size / 1024).toFixed(1)} KB</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Đổi file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg className="w-8 h-8 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-gray-500 text-sm">Kéo thả file vào đây hoặc click để chọn</p>
                  <p className="text-gray-400 text-xs">PDF, PNG, JPG, XLSX (max 10MB)</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Extract Button */}
        <div className="mt-5">
          <button
            onClick={handleExtract}
            disabled={isExtracting || !rfqCode || !file}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200"
          >
            {isExtracting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang xử lý dữ liệu từ file {file?.name}...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Bóc tách dữ liệu từ file
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PHẦN 2: BẢNG KẾT QUẢ BÓC TÁCH (Editable)
          ══════════════════════════════════════════════════════════════════════ */}
      {extractionDone && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Supplier Quote Extraction Review</h2>
                <p className="text-xs text-gray-400">Kiểm tra & chỉnh sửa trực tiếp trước khi lưu vào Database.</p>
              </div>
            </div>

            {/* Supplier Quote Ref */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Quote Ref:</label>
              <input
                type="text"
                value={supplierQuoteCode}
                onChange={(e) => setSupplierQuoteCode(e.target.value)}
                placeholder="Quote 67373"
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/40 w-48"
              />
            </div>
          </div>

          {/* Editable Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs text-gray-500 font-semibold px-3 py-3 w-14">#</th>
                  <th className="text-left text-xs text-gray-500 font-semibold px-3 py-3 w-40">Part Number</th>
                  <th className="text-left text-xs text-gray-500 font-semibold px-3 py-3">Raw Description</th>
                  <th className="text-right text-xs text-gray-500 font-semibold px-3 py-3 w-32">Supplier Price ($)</th>
                  <th className="text-right text-xs text-gray-500 font-semibold px-3 py-3 w-32">Net Weight (lbs)</th>
                  <th className="text-center text-xs text-gray-500 font-semibold px-3 py-3 w-20">UOM</th>
                  <th className="text-center text-xs text-gray-500 font-semibold px-3 py-3 w-16">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className={`transition-colors ${item.matched ? "hover:bg-gray-50" : "bg-yellow-50/50 hover:bg-yellow-50"}`}>
                    <td className="px-3 py-2.5">
                      <span className="text-gray-400 text-xs font-mono">{item.lineNo}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.rawPartNumber}
                        onChange={(e) => updateItem(item.id, "rawPartNumber", e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50 shadow-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.rawDescription}
                        onChange={(e) => updateItem(item.id, "rawDescription", e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-violet-500/50 shadow-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.supplierUnitPrice}
                        onChange={(e) => updateItem(item.id, "supplierUnitPrice", Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 text-right font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50 shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.netWeightLbs}
                        onChange={(e) => updateItem(item.id, "netWeightLbs", Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 text-right font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50 shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.uom}
                        onChange={(e) => updateItem(item.id, "uom", e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-violet-500/50 shadow-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.matched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                          New
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>
              {items.filter((i) => i.matched).length} / {items.length} dòng matched với DB
              {supplierName && <> · Hãng: <span className="font-semibold text-gray-700">{supplierName}</span></>}
            </span>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              PHẦN 3: NÚT LƯU & CHUYỂN SANG CBU
              ══════════════════════════════════════════════════════════════════ */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveAndProceed}
              disabled={isSaving || items.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang lưu...
                </>
              ) : (
                <>
                  Lưu vào Hệ thống & Tiếp tục tính CBU
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
