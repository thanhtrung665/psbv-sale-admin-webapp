"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileSearch, FileUp, X, Zap, CheckCircle2, AlertCircle,
  FileSpreadsheet, FileText, Loader2, FileCheck, Save, ArrowRight, Calculator,
} from "lucide-react";
import { RfqSelector } from "./RfqSelector";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = "quote" | "po" | "split";

interface UploadedFile {
  id: string;
  file: File;
  status: "ready" | "parsing" | "done" | "error";
  error?: string;
}

interface QuoteRow {
  lineNo: number;
  partNumber: string;
  brand: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  leadtime: string;
  rfqItemId: string | null;
  matched: boolean;
}

interface PoRow {
  lineNo: number;
  partNumber: string;
  description: string;
  qty: number;
  uom: string;
  agreedDdpPrice: number;
  deliveryDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBytes = (b: number) =>
  b < 1024 ? `${b}B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 ** 2).toFixed(1)}MB`;

const fmtUSD = (n: number) =>
  n > 0 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (["xlsx", "xls", "csv"].includes(ext || ""))
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  return <FileUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
};

const ACCEPT = ".pdf,.xlsx,.xls,.csv";

// ─── Inline cell editor ───────────────────────────────────────────────────────

function Cell({
  value, onChange, align = "left", numeric = false, mono = false,
}: {
  value: string | number; onChange: (v: string) => void;
  align?: "left" | "right"; numeric?: boolean; mono?: boolean;
}) {
  return (
    <input
      type={numeric ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-blue-50/30 focus:outline-none px-0.5 py-px text-xs transition-colors ${align === "right" ? "text-right" : ""} ${mono ? "font-mono" : ""}`}
    />
  );
}

// ─── Mini toast ───────────────────────────────────────────────────────────────

function Toast({ t }: { t: { type: "success" | "error"; msg: string } | null }) {
  if (!t) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
      {t.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      {t.msg}
    </div>
  );
}

// ─── Compact Drop Zone ────────────────────────────────────────────────────────

function DropZone({ onAdd, files, onRemove }: {
  onAdd: (f: File[]) => void;
  files: UploadedFile[];
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) onAdd(dropped);
  }, [onAdd]);

  return (
    <div className="space-y-2">
      {/* Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => ref.current?.click()}
        className={`flex-1 h-20 border border-dashed rounded-xl flex items-center justify-center gap-2.5 cursor-pointer transition-all ${drag ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-500 bg-slate-50/30 hover:bg-blue-50/30"}`}
      >
        <FileUp size={18} className={`transition-colors ${drag ? "text-blue-500" : "text-slate-400"}`} />
        <span className="text-xs font-medium text-slate-600">Kéo thả hoặc chọn file</span>
        <input ref={ref} type="file" accept={ACCEPT} multiple onChange={(e) => { if (e.target.files) onAdd(Array.from(e.target.files)); e.target.value = ""; }} className="hidden" />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${f.status === "done" ? "bg-emerald-50/60 border-emerald-200" : f.status === "error" ? "bg-red-50/60 border-red-200" : f.status === "parsing" ? "bg-blue-50/60 border-blue-200" : "bg-white border-slate-200"}`}>
              {fileIcon(f.file.name)}
              <span className="flex-1 truncate font-medium text-slate-700">{f.file.name}</span>
              <span className="text-slate-400 shrink-0">{fmtBytes(f.file.size)}</span>
              {f.status === "parsing" && <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />}
              {f.status === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
              {f.status === "error" && <span title={f.error} className="flex"><AlertCircle className="w-3 h-3 text-red-500 shrink-0" /></span>}
              {f.status !== "parsing" && (
                <button onClick={(e) => { e.stopPropagation(); onRemove(f.id); }} className="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quote Tab ────────────────────────────────────────────────────────────────

function QuoteTab({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [rfq, setRfq] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [meta, setMeta] = useState<{ rfqId: string | null; quoteCode: string; supplier: string; matched: number; total: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toast$ = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const addFiles = (fs: File[]) => {
    setFiles((p) => [...p, ...fs.map((f) => ({ id: crypto.randomUUID(), file: f, status: "ready" as const }))]);
    setRows(null); setMeta(null); setSaved(false);
  };
  const removeFile = (id: string) => setFiles((p) => p.filter((f) => f.id !== id));

  const updateRow = (lineNo: number, field: keyof QuoteRow, v: string) =>
    setRows((p) => p ? p.map((r) => r.lineNo === lineNo ? { ...r, [field]: (field === "qty" || field === "unitPrice") ? parseFloat(v) || 0 : v } : r) : p);

  const parse = async () => {
    if (!files.length) return;
    setParsing(true); setRows(null); setMeta(null); setSaved(false);
    setFiles((p) => p.map((f) => ({ ...f, status: "parsing" as const })));
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f.file));
    if (rfq.trim()) fd.append("rfqCode", rfq.trim());
    try {
      const res = await fetch("/api/parse-quote", { method: "POST", body: fd });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("Raw response from server:", rawText);
        throw new Error("Server không trả về định dạng JSON. Vui lòng kiểm tra Terminal của Server.");
      }
      if (!res.ok || !data.success) throw new Error(data.error || data.message || "Lỗi bóc tách.");
      setFiles((p) => p.map((f) => ({ ...f, status: "done" as const })));
      setRows((data.rows || []).map((r: any) => ({
        lineNo: r.lineNo, partNumber: r.partNumber || "", brand: r.brand || "",
        description: r.description || "", qty: r.qty || 1, uom: r.uom || "PCS",
        unitPrice: r.unitPrice || 0, leadtime: r.leadtime || "",
        rfqItemId: r.rfqItemId || null, matched: r.matched || false,
      })));
      setMeta({
        rfqId: data.rfqId || null, quoteCode: data.supplierQuoteCode || "",
        supplier: data.supplierName || "",
        matched: data.matchSummary?.matched ?? 0, total: data.matchSummary?.total ?? 0,
      });
    } catch (err: any) {
      setFiles((p) => p.map((f) => ({ ...f, status: "error" as const, error: err.message })));
      toast$("error", err.message || "Lỗi bóc tách.");
    } finally { setParsing(false); }
  };

  const save$ = async () => {
    const res = await fetch("/api/rfq/save-supplier-quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfqCode: rfq.trim() || undefined, rfqId: meta?.rfqId || undefined, supplierQuoteCode: meta?.quoteCode || undefined, supplierName: meta?.supplier || undefined, rows }),
    });
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("Raw response from server:", rawText);
      throw new Error("Server không trả về định dạng JSON. Vui lòng kiểm tra Terminal của Server.");
    }
    if (!res.ok || !data.success) throw new Error(data.error || data.message || "Lỗi khi lưu.");
    return data;
  };

  const handleSave = async () => {
    if (!rows) return;
    setSaving(true);
    try { await save$(); setSaved(true); toast$("success", "Đã lưu dữ liệu vào RFQ."); }
    catch (err: any) { toast$("error", err.message); }
    finally { setSaving(false); }
  };

  const handleCBU = async () => {
    if (!rows) return;
    setNavigating(true);
    try {
      const data = await save$();
      setSaved(true);
      toast$("success", "✅ Đã lưu dữ liệu! Chuyển sang CBU Calc...");
      await new Promise((r) => setTimeout(r, 800));
      onClose();
      const id = meta?.rfqId || data.rfqId;
      router.push(id ? `/rfq/${id}/cbu-calc` : `/rfq?highlight=${rfq.trim()}`);
    } catch (err: any) { toast$("error", err.message); setNavigating(false); }
  };

  const total = rows?.reduce((s, r) => s + r.unitPrice * r.qty, 0) ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-5 py-3 border-b border-slate-200/80 flex items-center gap-3 bg-white">
        <div className="w-64 shrink-0">
          <RfqSelector 
            value={rfq} 
            onChange={(code) => setRfq(code)} 
            placeholder="Mã RFQ (vd: AC0485)..."
            className="h-9 text-xs rounded-lg border-slate-200"
          />
        </div>
        <div className="flex-1">
          {!rows ? (
            <DropZone files={files} onAdd={addFiles} onRemove={removeFile} />
          ) : (
            <button onClick={() => { setRows(null); setMeta(null); setSaved(false); setFiles([]); }} className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors">
              ↩ Tải lại file khác
            </button>
          )}
        </div>
        {files.length > 0 && !rows && (
          <button
            onClick={parse} disabled={parsing}
            className="shrink-0 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {parsing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang xử lý...</> : <><Zap className="w-3.5 h-3.5" />Bóc tách</>}
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="shrink-0 px-5 pt-3"><Toast t={toast} /></div>}

      {/* Meta badges */}
      {meta && (
        <div className="shrink-0 px-5 py-2 flex flex-wrap gap-1.5 border-b border-slate-100">
          {meta.supplier && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">🏭 {meta.supplier}</span>}
          {meta.quoteCode && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 text-[11px] font-mono text-slate-700">#{meta.quoteCode}</span>}
          {meta.total > 0 && (
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium border ${meta.matched === meta.total ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {meta.matched}/{meta.total} khớp RFQ
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
        {rows ? (
          <div className="rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80">
                    {["#", "Part Number", "Brand", "Description", "Qty", "UOM", "Unit Price", "Total", "Lead Time"].map((h, i) => (
                      <th key={h} className={`text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2.5 whitespace-nowrap ${i === 0 ? "pl-4 w-10" : ""} ${i === 8 ? "pr-4" : ""} ${[4, 6, 7].includes(i) ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const lt = r.unitPrice * r.qty;
                    return (
                      <tr key={r.lineNo} className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs text-slate-700 ${!r.matched ? "bg-amber-50/20" : ""}`}>
                        <td className="px-3 py-2 pl-4 text-slate-400 font-mono">{r.lineNo}{!r.matched && <span className="ml-1 w-1 h-1 rounded-full bg-amber-400 inline-block align-middle" />}</td>
                        <td className="px-3 py-2"><Cell value={r.partNumber} onChange={(v) => updateRow(r.lineNo, "partNumber", v)} mono /></td>
                        <td className="px-3 py-2"><Cell value={r.brand} onChange={(v) => updateRow(r.lineNo, "brand", v)} /></td>
                        <td className="px-3 py-2"><Cell value={r.description} onChange={(v) => updateRow(r.lineNo, "description", v)} /></td>
                        <td className="px-3 py-2"><Cell value={r.qty} onChange={(v) => updateRow(r.lineNo, "qty", v)} numeric align="right" /></td>
                        <td className="px-3 py-2"><Cell value={r.uom} onChange={(v) => updateRow(r.lineNo, "uom", v)} /></td>
                        <td className="px-3 py-2"><Cell value={r.unitPrice} onChange={(v) => updateRow(r.lineNo, "unitPrice", v)} numeric align="right" /></td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{fmtUSD(lt)}</td>
                        <td className="px-3 py-2 pr-4"><Cell value={r.leadtime} onChange={(v) => updateRow(r.lineNo, "leadtime", v)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                {total > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50/80 border-t border-slate-200">
                      <td colSpan={7} className="px-3 py-2 pl-4 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng cộng</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtUSD(total)}</td>
                      <td className="pr-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          !files.length && (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Nhập mã RFQ và tải lên file để bắt đầu
            </div>
          )
        )}
      </div>

      {/* Sticky footer */}
      {rows && (
        <div className="shrink-0 p-4 bg-white border-t border-slate-200/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 font-mono">
            {saved ? "✓ Đã lưu" : `${rows.length} items · ${fmtUSD(total)}`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => onClose()} className="h-9 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Hủy
            </button>
            <button onClick={handleSave} disabled={saving || navigating || saved} className="h-9 px-4 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Lưu RFQ
            </button>
            <button onClick={handleCBU} disabled={saving || navigating} className="h-9 px-6 text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2">
              {navigating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator size={15} />}
              Lưu &amp; Tính CBU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PO Tab ───────────────────────────────────────────────────────────────────

function PoTab() {
  const [rfq, setRfq] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PoRow[] | null>(null);
  const [meta, setMeta] = useState<{ rfqId: string | null; poNumber: string; company: string; delivery: string; currency: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toast$ = (type: "success" | "error", msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000);
  };

  const addFiles = (fs: File[]) => {
    setFiles((p) => [...p, ...fs.map((f) => ({ id: crypto.randomUUID(), file: f, status: "ready" as const }))]);
    setRows(null); setMeta(null); setSaved(false);
  };
  const removeFile = (id: string) => setFiles((p) => p.filter((f) => f.id !== id));

  const updateRow = (lineNo: number, field: keyof PoRow, v: string) =>
    setRows((p) => p ? p.map((r) => r.lineNo === lineNo ? { ...r, [field]: (field === "qty" || field === "agreedDdpPrice") ? parseFloat(v) || 0 : v } : r) : p);

  const parse = async () => {
    if (!files.length) return;
    setParsing(true); setRows(null); setMeta(null); setSaved(false);
    setFiles((p) => p.map((f) => ({ ...f, status: "parsing" as const })));
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f.file));
    if (rfq.trim()) fd.append("rfqCode", rfq.trim());
    try {
      const res = await fetch("/api/rfq/parse-customer-po", { method: "POST", body: fd });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("Raw response from server:", rawText);
        throw new Error("Server không trả về định dạng JSON. Vui lòng kiểm tra Terminal của Server.");
      }
      if (!res.ok || !data.success) throw new Error(data.error || data.message || "Lỗi bóc tách PO.");
      setFiles((p) => p.map((f) => ({ ...f, status: "done" as const })));
      setRows(data.rows || []);
      setMeta({ rfqId: data.rfqId || null, poNumber: data.poNumber || "", company: data.customerName || "", delivery: data.deliveryDate || "", currency: data.currency || "USD" });
    } catch (err: any) {
      setFiles((p) => p.map((f) => ({ ...f, status: "error" as const, error: err.message })));
      toast$("error", err.message);
    } finally { setParsing(false); }
  };

  const handleSave = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rfq/save-customer-po", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfqCode: rfq.trim() || undefined, rfqId: meta?.rfqId || undefined, poNumber: meta?.poNumber, customerName: meta?.company, deliveryDate: meta?.delivery, currency: meta?.currency, rows }),
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("Raw response from server:", rawText);
        throw new Error("Server không trả về định dạng JSON. Vui lòng kiểm tra Terminal của Server.");
      }
      if (!res.ok || !data.success) throw new Error(data.error || data.message || "Lỗi khi lưu.");
      setSaved(true); toast$("success", data.message || "Lưu PO thành công.");
    } catch (err: any) { toast$("error", err.message); }
    finally { setSaving(false); }
  };

  const total = rows?.reduce((s, r) => s + r.agreedDdpPrice * r.qty, 0) ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-5 py-3 border-b border-slate-200/80 flex items-center gap-3 bg-white">
        <div className="w-64 shrink-0">
          <RfqSelector 
            value={rfq} 
            onChange={(code) => setRfq(code)} 
            placeholder="Mã RFQ (vd: AC0485)..."
            className="h-9 text-xs rounded-lg border-slate-200"
          />
        </div>
        <div className="flex-1">
          {!rows ? (
            <DropZone files={files} onAdd={addFiles} onRemove={removeFile} />
          ) : (
            <button onClick={() => { setRows(null); setMeta(null); setSaved(false); setFiles([]); }} className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors">
              ↩ Tải lại file khác
            </button>
          )}
        </div>
        {files.length > 0 && !rows && (
          <button onClick={parse} disabled={parsing} className="shrink-0 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm">
            {parsing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang xử lý...</> : <><Zap className="w-3.5 h-3.5" />Bóc tách</>}
          </button>
        )}
      </div>

      {toast && <div className="shrink-0 px-5 pt-3"><Toast t={toast} /></div>}

      {/* PO meta badges */}
      {meta && (
        <div className="shrink-0 px-5 py-2 flex flex-wrap gap-1.5 border-b border-slate-100">
          {meta.poNumber && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-mono font-semibold text-violet-700">PO# {meta.poNumber}</span>}
          {meta.company && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">{meta.company}</span>}
          {meta.delivery && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-700">📅 {meta.delivery}</span>}
          {meta.currency !== "USD" && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-semibold text-blue-700">{meta.currency}</span>}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
        {rows ? (
          <div className="rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80">
                    {["#", "Part Number", "Description", "Qty", "UOM", "Giá DDP", "Thành tiền", "Ngày giao"].map((h, i) => (
                      <th key={h} className={`text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2.5 whitespace-nowrap ${i === 0 ? "pl-4 w-10" : ""} ${i === 7 ? "pr-4" : ""} ${[3, 5, 6].includes(i) ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const lt = r.agreedDdpPrice * r.qty;
                    return (
                      <tr key={r.lineNo} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs text-slate-700">
                        <td className="px-3 py-2 pl-4 text-slate-400 font-mono">{r.lineNo}</td>
                        <td className="px-3 py-2"><Cell value={r.partNumber} onChange={(v) => updateRow(r.lineNo, "partNumber", v)} mono /></td>
                        <td className="px-3 py-2"><Cell value={r.description} onChange={(v) => updateRow(r.lineNo, "description", v)} /></td>
                        <td className="px-3 py-2"><Cell value={r.qty} onChange={(v) => updateRow(r.lineNo, "qty", v)} numeric align="right" /></td>
                        <td className="px-3 py-2"><Cell value={r.uom} onChange={(v) => updateRow(r.lineNo, "uom", v)} /></td>
                        <td className="px-3 py-2"><Cell value={r.agreedDdpPrice} onChange={(v) => updateRow(r.lineNo, "agreedDdpPrice", v)} numeric align="right" /></td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{fmtUSD(lt)}</td>
                        <td className="px-3 py-2 pr-4"><Cell value={r.deliveryDate} onChange={(v) => updateRow(r.lineNo, "deliveryDate", v)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                {total > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50/80 border-t border-slate-200">
                      <td colSpan={6} className="px-3 py-2 pl-4 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng cộng</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtUSD(total)}</td>
                      <td className="pr-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          !files.length && (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Nhập mã RFQ và tải lên file PO để bắt đầu
            </div>
          )
        )}
      </div>

      {/* Sticky footer */}
      {rows && (
        <div className="shrink-0 p-4 bg-white border-t border-slate-200/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 font-mono">
            {saved ? "✓ Đã lưu" : `${rows.length} items · ${fmtUSD(total)}`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving || saved} className="h-9 px-5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Lưu &amp; Cập nhật RFQ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF Blob download from base64 ───────────────────────────────────────────

const downloadPdfFromBase64 = async (base64Data: string | undefined, fileName: string) => {
  if (!base64Data) {
    alert("❌ File này không có dữ liệu (0 trang) nên không thể tải.");
    return;
  }

  try {
    // Dùng native fetch() để chuyển Base64 sang Blob. Tránh dùng atob() dễ gây lỗi RAM và sai mã hóa.
    const dataUrl = base64Data.startsWith('data:')
      ? base64Data
      : `data:application/pdf;base64,${base64Data.replace(/[^A-Za-z0-9+/=]/g, "")}`;

    const response = await fetch(dataUrl);
    const blob = await response.blob();

    if (blob.size === 0) throw new Error("File PDF tạo ra bị rỗng (0 byte).");

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    alert(`❌ Lỗi tải file: ${err.message}`);
  }
};

// ─── Split Tab ────────────────────────────────────────────────────────────────

interface SplitResult {
  totalPages: number;
  splitPageIndex: number;
  file1: { defaultName: string; label: string; pageRange: string; pageCount: number; base64: string };
  file2: { defaultName: string; label: string; pageRange: string; pageCount: number; base64: string };
}

function SplitTab() {
  const [rfq, setRfq] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toast$ = (type: "success" | "error", msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4500);
  };

  const onFileSelected = (f: File) => { setFile(f); setResult(null); setError(null); };

  const handleSplit = async () => {
    if (!file) return;
    setSplitting(true); setResult(null); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    if (rfq.trim()) fd.append("rfqCode", rfq.trim());
    try {
      const res = await fetch("/api/pdf/split-cipl", { method: "POST", body: fd });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { throw new Error("Server trả về phản hồi không hợp lệ."); }
      if (!res.ok || !data.success) throw new Error(data.error || "Lỗi tách file.");
      setResult(data);
      setName1(data.file1.defaultName);
      setName2(data.file2.defaultName);
      toast$("success", `✅ Tách thành công! Điểm tách: Trang ${data.splitPageIndex} / ${data.totalPages} trang.`);
    } catch (err: any) {
      setError(err.message);
      toast$("error", err.message);
    } finally { setSplitting(false); }
  };

  const downloadBoth = () => {
    if (!result) return;
    downloadPdfFromBase64(result.file1.base64, name1);
    setTimeout(() => downloadPdfFromBase64(result.file2.base64, name2), 600);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-5 py-3 border-b border-slate-200/80 flex items-center gap-3 bg-white">
        <div className="w-64 shrink-0">
          <RfqSelector value={rfq} onChange={setRfq} placeholder="Mã RFQ (tùy chọn)..." className="h-9 text-xs rounded-lg" />
        </div>

        {/* Single-file drop zone */}
        <div className="flex-1">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFileSelected(f); }}
            onClick={() => inputRef.current?.click()}
            className={`h-10 border border-dashed rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all px-4 ${
              drag ? "border-violet-500 bg-violet-50" : file ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 hover:border-violet-400 bg-slate-50/30"
            }`}
          >
            <FileText size={14} className={file ? "text-emerald-500" : "text-slate-400"} />
            <span className="text-xs font-medium text-slate-600 truncate max-w-[300px]">
              {file ? file.name : "Kéo thả hoặc chọn file PDF bộ chứng từ..."}
            </span>
            {file && (
              <X size={12} className="text-slate-400 hover:text-red-500 shrink-0"
                onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }} />
            )}
            <input ref={inputRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = ""; }} />
          </div>
        </div>

        <button
          onClick={handleSplit}
          disabled={!file || splitting}
          className="shrink-0 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {splitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang tách...</> : <>✂️ Cắt & Tách PDF</>}
        </button>
      </div>

      {/* Toast */}
      {toast && <div className="shrink-0 px-5 pt-3"><Toast t={toast} /></div>}

      {/* Error detail */}
      {error && !toast && (
        <div className="shrink-0 mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 whitespace-pre-wrap">{error}</div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
        {result ? (
          <div className="flex flex-col gap-4 max-w-2xl mx-auto">
            {/* Info banner */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700 font-medium">
              ✅ Đã tách thành công · Tổng {result.totalPages} trang · Điểm tách: Trang {result.splitPageIndex}
            </div>

            {/* File 1 — CIPL */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                    <FileCheck className="w-4 h-4" />
                    File 1 · CIPL
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">{result.file1.label}</p>
                </div>
                <span className="shrink-0 inline-flex items-center h-6 px-2.5 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-semibold text-blue-700 font-mono">
                  {result.file1.pageRange} · {result.file1.pageCount} trang
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input type="text" value={name1} onChange={(e) => setName1(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                <button
                  onClick={() => downloadPdfFromBase64(result.file1.base64, name1)}
                  className="shrink-0 h-8 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm"
                >
                  📥 Tải CIPL
                </button>
              </div>
            </div>

            {/* File 2 — COO/COC */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    <FileCheck className="w-4 h-4" />
                    File 2 · COO & COC
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">{result.file2.label}</p>
                </div>
                <span className="shrink-0 inline-flex items-center h-6 px-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700 font-mono">
                  {result.file2.pageRange} · {result.file2.pageCount} trang
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input type="text" value={name2} onChange={(e) => setName2(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all" />
                <button
                  onClick={() => downloadPdfFromBase64(result.file2.base64, name2)}
                  className="shrink-0 h-8 inline-flex items-center gap-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-sm"
                >
                  📥 Tải COO/COC
                </button>
              </div>
            </div>

            {/* Bulk download */}
            <button
              onClick={downloadBoth}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-md"
            >
              📦 Tải Cả 2 File PDF
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-3xl">✂️</div>
            <p className="text-sm font-semibold text-slate-600">Tách CIPL / COO-COC</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Tải lên file PDF bộ chứng từ tổng hợp (CIPL + COO + COC). Hệ thống sẽ tự động tìm trang{" "}
              <strong className="font-semibold text-slate-600">&quot;Certificate of Compliance&quot;</strong>{" "}
              và tách thành 2 file riêng biệt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ProcessFileModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("quote");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "quote", label: "Báo giá Hãng" },
    { key: "po",    label: "Đơn hàng PO" },
    { key: "split", label: "✂️ Tách CIPL" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-all">
        <FileSearch className="w-3.5 h-3.5" />
        Xử lý File
      </DialogTrigger>

      <DialogContent
        className="
          !w-[92vw] !max-w-none
          sm:!w-[92vw] sm:!max-w-[1100px]
          !h-[85vh] !max-h-[85vh]
          flex flex-col !p-0 !gap-0
          !rounded-2xl overflow-hidden
          border border-slate-200/80 shadow-2xl bg-white
        "
      >
        {/* Header */}
        <div className="shrink-0 p-5 border-b border-slate-200/80 flex items-center justify-between bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900 tracking-tight">
              Xử lý File
            </DialogTitle>
          </DialogHeader>

          {/* Segmented control */}
          <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  tab === t.key
                    ? "bg-white shadow-sm text-blue-600 font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className={`h-full ${tab === "quote" ? "flex flex-col" : "hidden"}`}>
            <QuoteTab onClose={() => setOpen(false)} />
          </div>
          <div className={`h-full ${tab === "po" ? "flex flex-col" : "hidden"}`}>
            <PoTab />
          </div>
          <div className={`h-full ${tab === "split" ? "flex flex-col" : "hidden"}`}>
            <SplitTab />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
