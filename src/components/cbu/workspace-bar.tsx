"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CbuCheck, CbuMode, CbuProfile, CbuResult, QuoteBasis } from "@/lib/cbu/types";
import { fmtNum, fmtPct, fmtUsd, fmtVnd, marginTone, type MarginTone } from "@/lib/cbu/ui/format";

const STATUS_LABEL: Record<string, string> = {
  INQUIRY_RECEIVED: "Mới nhận",
  RFO_PENDING_ADMIN: "Chờ duyệt RFO",
  RFO_SENT_TO_SUPPLIER: "Đã gửi hãng",
  SUPPLIER_QUOTED: "Hãng đã báo giá",
  CBU_PENDING_ADMIN: "Đang tính CBU",
  QUOTATION_DRAFTED: "Đã có Quotation nháp",
  QUOTED_TO_CLIENT: "Đã gửi khách",
};

// ─── Mode switch ─────────────────────────────────────────────────────────────

export function ModeSwitch({ mode, onChange, disabled }: { mode: CbuMode; onChange: (m: CbuMode) => void; disabled?: boolean }) {
  const opts: { value: CbuMode; label: string; hint: string }[] = [
    { value: "MARGIN_INPUT", label: "Nhập margin", hint: "Nhập % margin mục tiêu → hệ thống tính giá bán" },
    { value: "PRICE_INPUT", label: "Nhập giá bán", hint: "Nhập giá bán từng dòng → hệ thống tính ngược margin" },
  ];
  return (
    <div role="radiogroup" aria-label="Chế độ tính giá" className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mode === o.value}
          title={o.hint}
          disabled={disabled}
          onClick={() => mode !== o.value && onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            disabled && "opacity-50"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Model (profile) and quote basis ─────────────────────────────────────────

export function ProfileSwitch({ profile, onChange, disabled }: { profile: CbuProfile; onChange: (p: CbuProfile) => void; disabled?: boolean }) {
  const opts: { value: CbuProfile; label: string; hint: string }[] = [
    { value: "DDP_IMPORT", label: "DDP nhập khẩu", hint: "Mô hình Hoàng Sơn: logistics, thuế nhập khẩu, hoa hồng, giá DDP USD/VND" },
    { value: "FCA_DAP", label: "FCA / DAP", hint: "Mô hình Baker Hughes: giá FCA và giá DAP, điều khoản thanh toán (Payment with Order / Net 60)" },
  ];
  return (
    <div role="radiogroup" aria-label="Mô hình CBU" className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={profile === o.value}
          title={o.hint}
          disabled={disabled}
          onClick={() => profile !== o.value && onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", profile === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800", disabled && "opacity-50")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BasisSwitch({ basis, onChange, disabled }: { basis: QuoteBasis; onChange: (b: QuoteBasis) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Báo giá theo" className="inline-flex items-center gap-2 text-xs text-slate-500">
      <span>Quotation theo</span>
      <span className="inline-flex rounded-lg bg-slate-100 p-0.5">
        {(["FCA", "DAP"] as const).map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={basis === b}
            disabled={disabled}
            title={b === "FCA" ? "Unit Cost và Sales Price lưu trên từng dòng = Block FCA" : "Unit Cost và Sales Price lưu trên từng dòng = Block DAP; tổng RFQ cộng Freight (quoted)"}
            onClick={() => basis !== b && onChange(b)}
            className={cn("rounded-md px-3 py-1 font-medium transition-colors", basis === b ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800", disabled && "opacity-50")}
          >
            {b}
          </button>
        ))}
      </span>
    </div>
  );
}

// ─── Self-check chip ─────────────────────────────────────────────────────────

export function ChecksBadge({ checks, invalidInputs }: { checks: CbuCheck[]; invalidInputs: number }) {
  const failed = checks.filter((c) => !c.ok);
  if (invalidInputs > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
        <TriangleAlertIcon className="size-3.5" aria-hidden />
        {invalidInputs} ô nhập chưa hợp lệ
      </span>
    );
  }
  if (failed.length > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
        title={failed.map((c) => `${c.id}: ${c.label} (lệch ${c.delta})`).join("\n")}
      >
        <TriangleAlertIcon className="size-3.5" aria-hidden />
        Đối soát lệch: {failed.map((c) => c.id).join(", ")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
      title={checks.map((c) => `${c.id}: ${c.label}`).join("\n")}
    >
      <CircleCheckIcon className="size-3.5" aria-hidden />
      Đối soát khớp
    </span>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

const TONE_TEXT: Record<MarginTone, string> = { good: "text-emerald-600", thin: "text-amber-600", loss: "text-red-600", none: "text-slate-400" };

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cn("truncate font-mono text-base font-semibold tabular-nums text-slate-900", tone)}>{value}</div>
      {sub && <div className="truncate text-[11px] tabular-nums text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

interface BarProps {
  rfqCode: string;
  clientName: string | null;
  incoTerm: string | null;
  paymentTerm: string | null;
  status: string;
  route: string;
  mode: CbuMode;
  onModeChange: (m: CbuMode) => void;
  result: CbuResult;
  targetMarginPct: number;
  invalidInputs: number;
  dirty: boolean;
  savedAt: string | null;
  busy: boolean;
  /** Set when the sheet has several scenarios: which one the KPIs and the table show. */
  scenarioLabel?: string;
  scenarioChosen?: boolean;
  /** CBU model. FCA_DAP shows the FCA and DAP offers instead of VND revenue and weight. */
  profile?: CbuProfile;
}

export function WorkspaceBar({ rfqCode, clientName, incoTerm, paymentTerm, status, route, mode, onModeChange, result, targetMarginPct, invalidInputs, dirty, savedAt, busy, scenarioLabel, scenarioChosen, profile = "DDP_IMPORT" }: BarProps) {
  const t = result.totals;
  const hasRevenue = t.revenueUsd > 0;
  const tone = marginTone(t.marginPct, hasRevenue, targetMarginPct);
  const chip = "rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600";
  // FCA_DAP: the FCA block's own totals (the primary totals follow the quote basis)
  const fcaRevenue = result.lines.reduce((s, l) => s + (l.fca?.totalRevenueUsd ?? 0), 0);
  const fcaCost = result.lines.reduce((s, l) => s + (l.fca?.totalCostUsd ?? 0), 0);
  const fcaMargin = fcaRevenue > 0 ? ((fcaRevenue - fcaCost) / fcaRevenue) * 100 : 0;

  return (
    <header className="sticky top-0 z-30 -mx-6 -mt-6 border-b border-slate-200 bg-slate-50/95 px-6 pb-3 pt-4 backdrop-blur md:-mx-8 md:-mt-8 md:px-8 md:pt-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link href="/rfq" className="rounded-md p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" aria-label="Quay lại danh sách RFQ">
          <ArrowLeftIcon className="size-4" aria-hidden />
        </Link>
        <h1 className="text-base font-semibold tracking-tight text-slate-900">Tính CBU</h1>
        <code className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-700">{rfqCode}</code>
        {clientName && <span className="text-sm text-slate-600">{clientName}</span>}
        <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
        {incoTerm && <span className={chip} title="Incoterm">{incoTerm}</span>}
        {paymentTerm && <span className={chip} title="Điều khoản thanh toán">{paymentTerm}</span>}
        <span className={chip} title="Nguồn hàng → quốc gia đích">{route}</span>
        <span className={cn(chip, "bg-blue-50 text-blue-700")}>{STATUS_LABEL[status] ?? status}</span>

        <div className="ml-auto flex items-center gap-3 text-xs">
          {busy ? (
            <span className="text-slate-400">Đang xử lý…</span>
          ) : dirty ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="size-1.5 rounded-full bg-amber-500" aria-hidden />Chưa lưu</span>
          ) : savedAt ? (
            <span className="text-slate-400">Đã lưu {savedAt}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3" aria-live="polite">
        <ModeSwitch mode={mode} onChange={onModeChange} disabled={busy} />
        {scenarioLabel && (
          <span className="self-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700" title="Phương án đang xem — KPI và bảng bên dưới theo phương án này">
            Đang xem: {scenarioLabel}{scenarioChosen ? " ✓ dùng cho Quotation" : ""}
          </span>
        )}
        {profile === "FCA_DAP" && result.dap ? (
          <>
            <Kpi label="Incoterm 1 — FCA" value={fmtUsd(fcaRevenue)} sub={`Total Cost ${fmtUsd(fcaCost)}`} />
            <Kpi label="Incoterm 2 — DAP" value={fmtUsd(result.dap.totalUsd)} sub={`Sales Price × Q'ty ${fmtUsd(result.dap.goodsRevenueUsd)} + Freight ${fmtUsd(result.dap.freightUsd)}`} />
            <Kpi label="% Margin (FCA)" value={fcaRevenue > 0 ? fmtPct(fcaMargin) : "—"} sub={result.dap.goodsRevenueUsd > 0 ? `DAP ${fmtPct(result.dap.marginPct)}` : undefined} tone={TONE_TEXT[marginTone(fcaMargin, fcaRevenue > 0, targetMarginPct)]} />
            <Kpi label="TOTAL BANK FEE" value={fmtUsd(result.pools.bankTotalUsd)} sub={`Q'ty ${fmtNum(t.qty, 0)}`} />
          </>
        ) : (
          <>
            <Kpi label="Total Revenue (VND)" value={<>{fmtVnd(t.revenueVnd)} <span className="text-xs font-normal text-slate-400">₫</span></>} sub={`Revenue in USD ${fmtUsd(t.revenueUsd)}`} />
            <Kpi label="Total Cost (USD)" value={fmtUsd(t.costUsd)} sub={`Material Cost ${fmtUsd(t.materialUsd)}`} />
            <Kpi label="Nominal Margin %" value={hasRevenue ? fmtPct(t.marginPct) : "—"} sub={hasRevenue ? `Total Margin ${fmtUsd(t.marginUsd)}` : undefined} tone={TONE_TEXT[tone]} />
            <Kpi label="Total Weight (kg)" value={`${fmtNum(t.weightKg, 1)} kg`} sub={`Q'ty ${fmtNum(t.qty, 0)}`} />
          </>
        )}
        <div className="ml-auto self-center"><ChecksBadge checks={result.checks} invalidInputs={invalidInputs} /></div>
      </div>
    </header>
  );
}
