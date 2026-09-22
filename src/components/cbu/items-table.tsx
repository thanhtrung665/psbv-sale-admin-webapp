"use client";

import * as React from "react";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { editableColumns, getItemValue, itemErrorKey, priceErrorKey, type Draft, type FieldErrors, type ItemField } from "@/lib/cbu/ui/draft";
import { fmtNum, fmtPct, fmtUsd, fmtVnd, marginTone, type MarginTone } from "@/lib/cbu/ui/format";
import type { CbuLineResult, CbuResult } from "@/lib/cbu/types";
import { NumCell } from "./num-cell";

interface Props {
  draft: Draft;
  /** The scenario whose prices are shown / typed in PRICE_INPUT. */
  scenarioId: string;
  result: CbuResult;
  errors: FieldErrors;
  targetMarginPct: number;
  showCosts: boolean;
  showOverrides: boolean;
  expanded: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  onItemChange: (id: string, field: ItemField, value: string) => void;
  onPasteBlock: (row: number, col: number, text: string) => boolean;
}

const TONE_CLASS: Record<MarginTone, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  thin: "bg-amber-50 text-amber-700 ring-amber-200",
  loss: "bg-red-50 text-red-700 ring-red-200",
  none: "bg-slate-50 text-slate-400 ring-slate-200",
};

const th = "px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap";
const tdNum = "px-2 py-1.5 text-right font-mono text-[13px] tabular-nums";

export function ItemsTable({ draft, scenarioId, result, errors, targetMarginPct, showCosts, showOverrides, expanded, onToggleExpanded, onItemChange, onPasteBlock }: Props) {
  const mode = draft.mode;
  const columns = editableColumns(mode, showOverrides);
  const colOf = (f: ItemField) => columns.indexOf(f);
  const overrides = mode === "MARGIN_INPUT" && showOverrides;
  const priceInput = mode === "PRICE_INPUT";

  // Column groups for the band above the header (SPEC §11.9-4: structure instead of a rainbow of colours).
  const inputCols = 3 + (overrides ? 2 : 0) + (priceInput ? 1 : 0);
  const costCols = showCosts ? 4 : 0;
  const resultCols = 5 + (priceInput ? 0 : 1) - 1; // unit cost, price $, price ₫, margin/unit, margin %  (price $ is an input in PRICE mode)
  const totalCols = 2 + 1 + inputCols + costCols + resultCols + 1;

  const t = result.totals;
  const totalWeightLb = draft.items.reduce((s, it) => s + (Number(it.totalWeightLb.replace(",", ".")) || 0), 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-cbu-grid>
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            <th colSpan={3} className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left">ITEM</th>
            <th colSpan={inputCols} className="bg-blue-50/40 px-2 py-1.5 text-center text-blue-500">INPUT</th>
            {showCosts && <th colSpan={costCols} className="px-2 py-1.5 text-center">COST BUILD-UP (per unit)</th>}
            <th colSpan={resultCols + 1} className="bg-slate-50 px-2 py-1.5 text-center">COMPUTED</th>
          </tr>
          <tr className="border-b border-slate-200 bg-white">
            <th className={cn(th, "sticky left-0 z-10 w-10 bg-white text-center")}>#</th>
            <th className={cn(th, "sticky left-10 z-10 min-w-[210px] bg-white text-left")}>Part No. / Description</th>
            <th className={cn(th, "text-right")}>Q'ty</th>
            <th className={cn(th, "min-w-[96px] text-right")}>Total Weight (lb)</th>
            <th className={cn(th, "min-w-[96px] text-right")}>Material Cost</th>
            <th className={cn(th, "min-w-[72px] text-right")}>%Duty</th>
            {overrides && (
              <>
                <th className={cn(th, "min-w-[96px] text-right")} title="Để trống = dùng margin mục tiêu">Margin % override</th>
                <th className={cn(th, "min-w-[104px] text-right")} title="Ưu tiên cao nhất: giá bán = giá vốn + số tiền này">Margin $/unit override</th>
              </>
            )}
            {showCosts && (
              <>
                <th className={cn(th, "text-right")}>Bank fee</th>
                <th className={cn(th, "text-right")}>Logistics</th>
                <th className={cn(th, "text-right")}>Duty</th>
                <th className={cn(th, "text-right")}>Commission + CIT</th>
              </>
            )}
            <th className={cn(th, "bg-slate-50/60 text-right")}>Unit Cost</th>
            <th className={cn(th, "min-w-[104px] bg-slate-50/60 text-right")}>DDP Price (USD)</th>
            <th className={cn(th, "bg-slate-50/60 text-right")}>DDP Price (VND)</th>
            <th className={cn(th, "bg-slate-50/60 text-right")}>Margin per unit</th>
            <th className={cn(th, "bg-slate-50/60 text-right")}>% Margin</th>
            <th className={cn(th, "w-8")} aria-label="Chi tiết" />
          </tr>
        </thead>

        <tbody>
          {draft.items.map((item, idx) => {
            const line = result.lines[idx];
            const open = expanded.has(item.id);
            const hasPrice = line.ddpPriceUsd > 0;
            const tone = marginTone(line.marginPct, hasPrice, targetMarginPct);
            const err = (f: ItemField) => errors[f === "ddpPriceUsdInput" ? priceErrorKey(scenarioId, item.id) : itemErrorKey(item.id, f)];
            const cell = (f: ItemField, label: string, placeholder?: string) => (
              <NumCell
                value={getItemValue(draft, scenarioId, item, f)}
                onChange={(v) => onItemChange(item.id, f, v)}
                label={`${label} — dòng ${item.lineNo}`}
                error={err(f)}
                placeholder={placeholder}
                row={idx}
                col={colOf(f)}
                onPasteBlock={onPasteBlock}
              />
            );
            return (
              <React.Fragment key={item.id}>
                <tr className={cn("group border-b border-slate-100 transition-colors hover:bg-slate-50/70", tone === "loss" && "bg-red-50/50 hover:bg-red-50")}>
                  <td className="sticky left-0 z-10 bg-inherit px-1 py-1.5 text-center">
                    <span className="inline-flex items-center justify-center gap-1 text-xs tabular-nums text-slate-400">
                      {line.warnings.length > 0 && (
                        <span title={line.warnings.join("\n")} className="text-amber-500">
                          <TriangleAlertIcon className="size-3.5" aria-label="Có cảnh báo" />
                        </span>
                      )}
                      {item.lineNo}
                    </span>
                  </td>
                  <td className="sticky left-10 z-10 max-w-[260px] bg-inherit px-2 py-1.5">
                    <div className="truncate font-mono text-[13px] font-medium text-slate-800" title={item.rawPartNumber}>{item.rawPartNumber}</div>
                    {item.rawDescription && <div className="truncate text-[11px] text-slate-400" title={item.rawDescription}>{item.rawDescription}</div>}
                  </td>
                  <td className={cn(tdNum, "text-slate-600")}>{fmtNum(item.qty, 0)}</td>
                  <td className="px-1.5 py-1">{cell("totalWeightLb", "Total Weight (lb)", "0")}</td>
                  <td className="px-1.5 py-1">{cell("materialUsd", "Material Cost", "0")}</td>
                  <td className="px-1.5 py-1">{cell("dutyPct", "%Duty", "0")}</td>
                  {overrides && (
                    <>
                      <td className="px-1.5 py-1">{cell("marginPctOverride", "Margin % override", fmtNum(targetMarginPct, 0))}</td>
                      <td className="px-1.5 py-1">{cell("marginUsdOverride", "Margin $/unit override", "—")}</td>
                    </>
                  )}
                  {showCosts && (
                    <>
                      <td className={cn(tdNum, "text-slate-500")}>{fmtNum(line.bankFeeUsd, 3)}</td>
                      <td className={cn(tdNum, "text-slate-500")}>{fmtNum(line.logisticsUsd, 3)}</td>
                      <td className={cn(tdNum, "text-slate-500")}>{fmtNum(line.dutyUsd, 3)}</td>
                      <td className={cn(tdNum, "text-slate-500")}>{fmtNum(line.commissionUsd + line.citUsd, 3)}</td>
                    </>
                  )}
                  <td className={cn(tdNum, "bg-slate-50/50 font-medium text-slate-900")}>{fmtNum(line.unitCostUsd)}</td>
                  {priceInput ? (
                    <td className="bg-slate-50/50 px-1.5 py-1">{cell("ddpPriceUsdInput", "DDP Price (USD)", "0")}</td>
                  ) : (
                    <td className={cn(tdNum, "bg-slate-50/50 font-semibold text-slate-900")}>{hasPrice ? fmtNum(line.ddpPriceUsd) : "—"}</td>
                  )}
                  <td className={cn(tdNum, "bg-slate-50/50 text-slate-700")}>{hasPrice ? fmtVnd(line.ddpPriceVnd) : "—"}</td>
                  <td className={cn(tdNum, "bg-slate-50/50", line.marginPerUnitUsd < 0 ? "text-red-600" : "text-slate-700")}>{hasPrice ? fmtNum(line.marginPerUnitUsd) : "—"}</td>
                  <td className="bg-slate-50/50 px-2 py-1.5 text-right">
                    <span className={cn("inline-block min-w-[64px] rounded-md px-2 py-0.5 text-center font-mono text-xs font-semibold tabular-nums ring-1 ring-inset", TONE_CLASS[tone])}>
                      {hasPrice ? fmtPct(line.marginPct) : "—"}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => onToggleExpanded(item.id)}
                      aria-expanded={open}
                      aria-label={`${open ? "Đóng" : "Xem"} cấu trúc giá dòng ${item.lineNo}`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={totalCols} className="px-4 py-3">
                      <PriceBreakdown line={line} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <td colSpan={2} className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">TOTAL</td>
            <td className={tdNum}>{fmtNum(t.qty, 0)}</td>
            <td className={tdNum}>{fmtNum(totalWeightLb, 1)}</td>
            <td className={tdNum}>{fmtNum(t.materialUsd)}</td>
            <td className={tdNum} />
            {overrides && <><td /><td /></>}
            {showCosts && (
              <>
                <td className={tdNum}>{fmtNum(t.bankFeeUsd)}</td>
                <td className={tdNum}>{fmtNum(t.logisticsUsd)}</td>
                <td className={tdNum}>{fmtNum(t.dutyUsd)}</td>
                <td className={tdNum}>{fmtNum(t.commissionUsd + t.citUsd)}</td>
              </>
            )}
            <td className={tdNum}>{fmtNum(t.costUsd)}</td>
            <td className={tdNum}>{fmtNum(t.revenueUsd)}</td>
            <td className={tdNum}>{fmtVnd(t.revenueVnd)}</td>
            <td className={tdNum}>{fmtNum(t.marginUsd)}</td>
            <td className="px-2 py-2 text-right font-mono text-[13px] tabular-nums">{fmtPct(t.marginPct)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Price structure of one line ──────────────────────────────────────────────

const SEGMENTS: { key: string; label: string; color: string; pick: (l: CbuLineResult) => number }[] = [
  { key: "material", label: "Material Cost", color: "bg-slate-400", pick: (l) => l.materialUsd },
  { key: "bank", label: "Bank fee", color: "bg-amber-400", pick: (l) => l.bankFeeUsd },
  { key: "logistics", label: "Logistics", color: "bg-sky-400", pick: (l) => l.logisticsUsd },
  { key: "duty", label: "Duty", color: "bg-violet-400", pick: (l) => l.dutyUsd + l.customUsd },
  { key: "commission", label: "Commission + CIT", color: "bg-rose-300", pick: (l) => l.commissionUsd + l.citUsd },
  { key: "margin", label: "Margin per unit", color: "bg-emerald-500", pick: (l) => Math.max(0, l.marginPerUnitUsd) },
];

function PriceBreakdown({ line }: { line: CbuLineResult }) {
  if (line.ddpPriceUsd <= 0) {
    return <p className="text-sm text-slate-500">Chưa có giá bán nên chưa dựng được cấu trúc giá.{line.warnings.length > 0 && ` ${line.warnings.join(" ")}`}</p>;
  }
  const values = SEGMENTS.map((s) => ({ ...s, value: s.pick(line) }));
  const base = Math.max(line.ddpPriceUsd, values.reduce((s, v) => s + v.value, 0)); // a loss makes the parts exceed the price
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label="Cấu trúc giá bán">
        {values.map((v) => (
          <span key={v.key} className={v.color} style={{ width: `${(v.value / base) * 100}%` }} title={`${v.label}: ${fmtUsd(v.value, 3)}`} />
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
        {values.map((v) => (
          <div key={v.key} className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", v.color)} aria-hidden />
            <dt className="text-slate-500">{v.label}</dt>
            <dd className="ml-auto font-mono tabular-nums text-slate-800">
              {fmtUsd(v.value, 3)} <span className="text-slate-400">· {fmtNum((v.value / line.ddpPriceUsd) * 100, 1)}%</span>
            </dd>
          </div>
        ))}
      </dl>
      {line.marginPerUnitUsd < 0 && (
        <p className="mt-2 text-xs font-medium text-red-600">DDP Price thấp hơn Unit Cost {fmtUsd(-line.marginPerUnitUsd)} / đơn vị.</p>
      )}
    </div>
  );
}
