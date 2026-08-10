"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Tab = "upload" | "email" | "manual";

type ManualItem = {
  id: string;
  lineNo: number;
  rawPartNumber: string;
  rawDescription: string;
  qty: number;
  uom: string;
};

interface SupplierSuggestion {
  id: string;
  name: string;
  companyName: string;
  email: string;
}

const INCOTERMS = ["EXW", "DDP", "DAP", "FOB", "CIF", "CIP", "FCA", "CFR"];
const PAYMENT_TERMS = [
  "100% Advance",
  "30 Days Net",
  "50% Advance / 50% Before Shipment",
  "60 Days Net",
  "LC at Sight",
];

const STATUS_COLORS: Record<string, string> = {
  upload: "from-blue-600 to-indigo-600",
  email: "from-violet-600 to-purple-600",
  manual: "from-emerald-600 to-teal-600",
};

export default function NewRFQPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── Shared Header Form ───────────────────────────────────────────────────
  const [rfqCode, setRfqCode] = useState("Đang tạo...");
  const [opportunityName, setOpportunityName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierSuggestions, setSupplierSuggestions] = useState<SupplierSuggestion[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [incoTerm, setIncoTerm] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");

  const supplierTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Tab 1: Upload ────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Tab 2: Email Text ────────────────────────────────────────────────────
  const [emailText, setEmailText] = useState("");

  // ── Tab 3: Manual Form ───────────────────────────────────────────────────
  const [manualItems, setManualItems] = useState<ManualItem[]>([
    { id: "1", lineNo: 1, rawPartNumber: "", rawDescription: "", qty: 1, uom: "PCS" },
  ]);

  // ── Auto-generate RFQ code on mount ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/rfq/search-codes?q=AC")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const nextNum = data.length + 1;
          setRfqCode(`AC${String(nextNum).padStart(4, "0")}`);
        } else {
          setRfqCode("AC0001");
        }
      })
      .catch(() => setRfqCode("AC0001"));
  }, []);

  // ── Supplier Autocomplete ────────────────────────────────────────────────
  useEffect(() => {
    if (supplierQuery.length < 1) {
      setSupplierSuggestions([]);
      return;
    }
    if (supplierTimeoutRef.current) clearTimeout(supplierTimeoutRef.current);
    supplierTimeoutRef.current = setTimeout(async () => {
      setIsSearchingSupplier(true);
      try {
        const res = await fetch(`/api/suppliers/suggest?query=${encodeURIComponent(supplierQuery)}`);
        const data = await res.json();
        if (Array.isArray(data)) setSupplierSuggestions(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingSupplier(false);
      }
    }, 250);
    return () => {
      if (supplierTimeoutRef.current) clearTimeout(supplierTimeoutRef.current);
    };
  }, [supplierQuery]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const showError = (msg: string) => { setError(msg); setSuccess(""); };
  const showSuccess = (msg: string) => { setSuccess(msg); setError(""); };

  const addItem = () => {
    const next = manualItems.length + 1;
    setManualItems((prev) => [
      ...prev,
      { id: String(Date.now()), lineNo: next, rawPartNumber: "", rawDescription: "", qty: 1, uom: "PCS" },
    ]);
  };

  const removeItem = (id: string) => {
    setManualItems((prev) =>
      prev.filter((i) => i.id !== id).map((item, idx) => ({ ...item, lineNo: idx + 1 }))
    );
  };

  const updateItem = (id: string, field: keyof ManualItem, value: string | number) => {
    setManualItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  // Build common header fields for FormData
  const appendHeaderToFormData = (form: FormData) => {
    form.append("rfqCode", rfqCode);
    form.append("opportunityName", opportunityName);
    form.append("supplierName", supplierName);
    form.append("clientName", clientName);
    form.append("clientEmail", clientEmail);
    form.append("clientPhone", clientPhone);
    form.append("companyName", companyName);
    form.append("incoTerm", incoTerm);
    form.append("paymentTerm", paymentTerm);
  };

  // ─── Submit handlers ──────────────────────────────────────────────────────

  const handleFileUpload = async () => {
    if (!rfqCode.trim()) return showError("Vui lòng nhập Mã Inquiry (RFO).");
    if (!selectedFile) return showError("Vui lòng chọn file trước.");
    setLoading(true); setError(""); setSuccess("");
    const form = new FormData();
    form.append("file", selectedFile);
    appendHeaderToFormData(form);
    const res = await fetch("/api/rfq/parse-inquiry", { method: "POST", body: form });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      showSuccess(`Đang xử lý AI cho ${data.rfqCode}. Chuyển sang RFO Review...`);
      setTimeout(() => router.push(`/rfq/${data.rfqId}/rfo-review`), 1500);
    } else {
      const d = await res.json();
      showError(d.error || "Có lỗi xảy ra.");
    }
  };

  const handleEmailParse = async () => {
    if (!rfqCode.trim()) return showError("Vui lòng nhập Mã Inquiry (RFO).");
    if (!emailText.trim()) return showError("Vui lòng dán nội dung email.");
    setLoading(true); setError(""); setSuccess("");
    const form = new FormData();
    form.append("emailText", emailText);
    appendHeaderToFormData(form);
    const res = await fetch("/api/rfq/parse-inquiry", { method: "POST", body: form });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      showSuccess(`Đang xử lý AI cho ${data.rfqCode}. Chuyển sang RFO Review...`);
      setTimeout(() => router.push(`/rfq/${data.rfqId}/rfo-review`), 1500);
    } else {
      const d = await res.json();
      showError(d.error || "Có lỗi xảy ra.");
    }
  };

  const handleManualCreate = async () => {
    if (!rfqCode.trim()) return showError("Vui lòng nhập Mã Inquiry (RFO).");
    if (!clientName || !clientEmail) return showError("Vui lòng điền Tên khách và Email.");
    if (manualItems.some((i) => !i.rawPartNumber)) return showError("Vui lòng điền Part Number cho tất cả dòng sản phẩm.");
    setLoading(true); setError(""); setSuccess("");
    const res = await fetch("/api/rfq/create-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rfqCode, clientName, clientEmail, companyName, clientPhone,
        opportunityName, supplierName, incoTerm, paymentTerm,
        items: manualItems,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      showSuccess(`Tạo đơn ${data.rfqCode} thành công! Đang chuyển...`);
      setTimeout(() => router.push(`/rfq/${data.rfqId}/rfo-review`), 1200);
    } else {
      const d = await res.json();
      showError(d.error || "Có lỗi xảy ra.");
    }
  };

  // ─── File drag/drop ───────────────────────────────────────────────────────
  const ACCEPTED_EXT = ".pdf, .png, .jpg, .jpeg, .xlsx";

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "upload",
      label: "Upload File",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      key: "email",
      label: "Dán Email Text",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: "manual",
      label: "Nhập Tay",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
  ];

  // ── Shared input styles ──────────────────────────────────────────────────
  const inputClass = "w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide";
  const selectClass = "w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📥 Tiếp nhận Inquiry Mới</h1>
        <p className="text-gray-500 text-sm mt-0.5">Điền thông tin chung, chọn phương thức nhập sản phẩm, và khởi tạo đơn hàng.</p>
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
          SHARED HEADER FORM — Thông tin chung (Pinned Top)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Thông Tin Chung Đơn Hàng</h2>
            <p className="text-xs text-gray-400">Thông tin này sẽ được sử dụng cho tất cả phương thức nhập liệu.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
          {/* 1. Mã Inquiry */}
          <div>
            <label className={labelClass}>Mã Inquiry (RFO) *</label>
            <input
              type="text"
              value={rfqCode}
              onChange={(e) => setRfqCode(e.target.value)}
              placeholder="Nhập mã Inquiry (vd: AC0485)..."
              className={`${inputClass} font-mono font-bold`}
            />
          </div>

          {/* 2. Tên cơ hội */}
          <div>
            <label className={labelClass}>Tên Cơ Hội</label>
            <input
              type="text"
              value={opportunityName}
              onChange={(e) => setOpportunityName(e.target.value)}
              placeholder="Gói thầu van cho Dự án VSP 2026"
              className={inputClass}
            />
          </div>

          {/* 3. Supplier / Hãng — Autocomplete */}
          <div className="relative">
            <label className={labelClass}>Supplier / Hãng</label>
            <input
              type="text"
              value={supplierQuery}
              onChange={(e) => {
                setSupplierQuery(e.target.value);
                setSupplierName(e.target.value);
                setShowSupplierDropdown(true);
              }}
              onFocus={() => setShowSupplierDropdown(true)}
              onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
              placeholder="Keystone, NOV, Cameron..."
              className={`${inputClass} ${supplierName && supplierSuggestions.find(s => s.name === supplierName || s.companyName === supplierName) ? "border-green-400 bg-green-50" : ""}`}
            />
            {showSupplierDropdown && supplierQuery.length >= 1 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto">
                {isSearchingSupplier ? (
                  <div className="p-3 text-xs text-gray-400 text-center">Đang tìm...</div>
                ) : supplierSuggestions.length > 0 ? (
                  supplierSuggestions.map((s) => (
                    <div
                      key={s.id}
                      className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors"
                      onClick={() => {
                        setSupplierQuery(s.companyName);
                        setSupplierName(s.companyName);
                        setShowSupplierDropdown(false);
                      }}
                    >
                      <div className="font-semibold text-sm text-blue-600">{s.companyName}</div>
                      <div className="text-xs text-gray-500">{s.name} · {s.email}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-xs text-gray-400 text-center">Không tìm thấy hãng — nhập tên tự do.</div>
                )}
              </div>
            )}
          </div>

          {/* 4. Tên khách hàng */}
          <div>
            <label className={labelClass}>Tên Khách Hàng *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className={inputClass}
            />
          </div>

          {/* 5. Email khách hàng */}
          <div>
            <label className={labelClass}>Email Khách Hàng *</label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@company.com"
              className={inputClass}
            />
          </div>

          {/* 6. Số điện thoại */}
          <div>
            <label className={labelClass}>Số Điện Thoại</label>
            <input
              type="text"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+84 xxx xxx xxx"
              className={inputClass}
            />
          </div>

          {/* 7. Tên công ty */}
          <div>
            <label className={labelClass}>Tên Công Ty</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="ACME Corporation"
              className={inputClass}
            />
          </div>

          {/* 8. IncoTerm */}
          <div>
            <label className={labelClass}>IncoTerm</label>
            <div className="relative">
              <select
                value={incoTerm}
                onChange={(e) => setIncoTerm(e.target.value)}
                className={selectClass}
              >
                <option value="">— Chọn IncoTerm —</option>
                {INCOTERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* 9. Payment Term */}
          <div>
            <label className={labelClass}>Payment Term</label>
            <div className="relative">
              <select
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                className={selectClass}
              >
                <option value="">— Chọn Payment Term —</option>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          3 TABS — Phương Thức Nhập Sản Phẩm
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setError(""); setSuccess(""); }}
            className={`flex items-center gap-2 flex-1 justify-center py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === t.key
                ? `bg-gradient-to-r ${STATUS_COLORS[t.key]} text-white shadow-md`
                : "text-gray-500 hover:text-gray-900 hover:bg-white shadow-sm"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: File Upload ── */}
      {activeTab === "upload" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-gray-900 font-semibold mb-1">Upload File Inquiry</h2>
            <p className="text-gray-500 text-sm">Hỗ trợ: PDF, PNG, JPG/JPEG, XLSX</p>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : selectedFile
                ? "border-emerald-500/50 bg-emerald-50"
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXT}
              className="hidden"
              onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
            />
            {selectedFile ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-emerald-600 font-semibold">{selectedFile.name}</p>
                <p className="text-gray-500 text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                  Đổi file
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-gray-900 text-sm font-medium">Kéo thả file vào đây</p>
                  <p className="text-gray-500 text-xs mt-0.5">hoặc click để chọn file</p>
                </div>
              </div>
            )}
          </div>

          <button
            id="upload-parse-btn"
            onClick={handleFileUpload}
            disabled={loading || !selectedFile}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang gửi...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                ⚡ Khởi Tạo & Bóc Tách File
              </>
            )}
          </button>
        </div>
      )}

      {/* ── TAB 2: Email Text ── */}
      {activeTab === "email" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-gray-900 font-semibold mb-1">Dán Nội dung Email</h2>
            <p className="text-gray-500 text-sm">Copy toàn bộ email Inquiry của khách và dán vào đây</p>
          </div>
          <textarea
            id="email-text-input"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder={`From: John Doe <john@company.com>\nSubject: Parts Inquiry\n\nPlease quote the following parts:\n1. Part# ABC-123, Qty: 5\n2. Part# XYZ-456, Qty: 2`}
            rows={12}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
          />
          <button
            id="email-parse-btn"
            onClick={handleEmailParse}
            disabled={loading || !emailText.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-violet-500/20"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang gửi...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                ⚡ Khởi Tạo & Bóc Tách Email
              </>
            )}
          </button>
        </div>
      )}

      {/* ── TAB 3: Manual Form ── */}
      {activeTab === "manual" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-sm">
          <div>
            <h2 className="text-gray-900 font-semibold mb-1">Bảng Sản Phẩm Nhập Tay</h2>
            <p className="text-gray-500 text-sm">Điền thông tin sản phẩm trực tiếp — không cần AI bóc tách</p>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Danh sách Sản phẩm</p>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 font-semibold transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Thêm dòng
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs text-gray-500 font-semibold px-3 py-2.5 w-12">#</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-3 py-2.5">Part Number *</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-3 py-2.5">Mô tả</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-3 py-2.5 w-20">Qty</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-3 py-2.5 w-24">UOM</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {manualItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-gray-500 text-xs font-mono">{item.lineNo}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.rawPartNumber}
                          onChange={(e) => updateItem(item.id, "rawPartNumber", e.target.value)}
                          placeholder="ABC-12345"
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.rawDescription}
                          onChange={(e) => updateItem(item.id, "rawDescription", e.target.value)}
                          placeholder="Mô tả chi tiết..."
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, "qty", Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.uom}
                          onChange={(e) => updateItem(item.id, "uom", e.target.value)}
                          placeholder="PCS"
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs text-center placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {manualItems.length > 1 && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            id="manual-create-btn"
            onClick={handleManualCreate}
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang tạo...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                ⚡ Khởi Tạo Đơn Hàng
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
