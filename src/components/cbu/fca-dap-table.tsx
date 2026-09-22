"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dapPriceErrorKey, editableColumns, getItemValue, itemErrorKey, priceErrorKey, type Draft, type FieldErrors, type ItemField } from "@/lib/cbu/ui/draft";
import { fmtNum, fmtPct, fmtUsd, marginTone, type MarginTone } from "@/lib/cbu/ui/format";
import type { CbuBasisBlock, CbuResult } from "@/lib/cbu/types";
import { NumCell } from "./num-cell";

interface Props {
  draft: Draft;
  scenarioId: string;
  result: CbuResult;
  errors: FieldErrors;
  targetMarginPct: number;
  onItemChange: (id: string, field: ItemField, value: string) => void;
  onPasteBlock: (row: number, col: number, text: string) => boolean;
}

const TONE_CLASS: Record<MarginTone, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  thin: "bg-amber-50 text-amber-700 ring-amber-200",
  loss: "bg-red-50 text-red-700 ring-red-200",
  none: "bg-slate-50 text-slate-400 ring-slate-200",
};

const th = "px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap text-right";
const tdNum = "px-2 py-1.5 text-right font-mono text-[13px] tabular-nums";

/**
 * Baker Hughes (FCA_DAP): every line has two price blocks over the same material cost — FCA (ex works) and DAP
 * (delivered; carries the credit interest of the payment terms). The DAP offer adds one lump-sum freight at order level.
 */
export function FcaDapTable({ draft, scenarioId, result, errors, targetMarginPct, onItemChange, onPasteBlock }: Props) {
  const priceMode = draft.mode === "PRICE_INPUT";
  const columns = editableColumns(draft.mode, false, "FCA_DAP");
  const colOf = (f: ItemField) => columns.indexOf(f);
  const t = result.totals;
  const dap = result.dap;

  const blockCells = (b: CbuBasisBlock | undefined, priceEditable: React.ReactNode) => {
    const has = !!b && b.priceUsd > 0;
    const tone = marginTone(b?.marginPct ?? 0, has, targetMarginPct);
    return (
      <>
        <td className={cn(tdNum, "text-slate-500")}>{fmtNum(b?.financialUsd ?? 0, 3)}</td>
        <td className={cn(tdNum, "font-medium text-slate-900")}>{fmtNum(b?.unitCostUsd ?? 0)}</td>
        {priceEditable ?? <td className={cn(tdNum, "font-semibold text-slate-900")}>{has ? fmtNum(b!.priceUsd, 0) : "—"}</td>}
        <td className="px-2 py-1.5 text-right">
          <span className={cn("inline-block min-w-[64px] rounded-md px-2 py-0.5 text-center font-mono text-xs font-semibold tabular-nums ring-1 ring-inset", TONE_CLASS[tone])}>
            {has ? fmtPct(b!.marginPct) : "—"}
          </span>
        </td>
      </>
    );
  };

  const sum = (pick: (l: CbuResult["lines"][number]) => number) => result.lines.reduce((s, l) => s + pick(l), 0);
  const fcaCost = sum((l) => l.fca?.totalCostUsd ?? 0);
  const fcaRev = sum((l) => l.fca?.totalRevenueUsd ?? 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-cbu-grid>
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <th colSpan={3} className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left">ITEM</th>
              <th colSpan={priceMode ? 1 : 2} className="bg-blue-50/40 px-2 py-1.5 text-center text-blue-500">INPUT</th>
              <th colSpan={4} className="bg-slate-50 px-2 py-1.5 text-center">Incoterm 1 — FCA</th>
              <th colSpan={4} className="bg-emerald-50/50 px-2 py-1.5 text-center text-emerald-700">Incoterm 2 — DAP</th>
            </tr>
            <tr className="border-b border-slate-200 bg-white">
              <th className={cn(th, "sticky left-0 z-10 w-10 bg-white text-center")}>#</th>
              <th className={cn(th, "sticky left-10 z-10 min-w-[210px] bg-white text-left")}>Part No. / Description</th>
              <th className={th}>Q'ty</th>
              <th className={cn(th, "min-w-[104px]")}>Material Cost</th>
              {!priceMode && <th className={cn(th, "min-w-[104px]")} title="Để trống = dùng margin mục tiêu">% Margin</th>}
              <th className={cn(th, "bg-slate-50/60")}>Financial Cost</th>
              <th className={cn(th, "bg-slate-50/60")}>Unit Cost</th>
              <th className={cn(th, "min-w-[104px] bg-slate-50/60")}>Sales Price</th>
              <th className={cn(th, "bg-slate-50/60")}>% Margin</th>
              <th className={cn(th, "bg-emerald-50/40")}>Financial Cost</th>
              <th className={cn(th, "bg-emerald-50/40")}>Unit Cost</th>
              <th className={cn(th, "min-w-[104px] bg-emerald-50/40")}>Sales Price</th>
              <th className={cn(th, "bg-emerald-50/40")}>% Margin</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, idx) => {
              const line = result.lines[idx];
              const loss = (line.fca?.marginPct ?? 0) < 0 || (line.dap?.marginPct ?? 0) < 0;
              const cell = (f: ItemField, label: string, error: string | undefined, placeholder?: string) => (
                <NumCell
                  value={getItemValue(draft, scenarioId, item, f)}
                  onChange={(v) => onItemChange(item.id, f, v)}
                  label={`${label} — dòng ${item.lineNo}`}
                  error={error}
                  placeholder={placeholder}
                  row={idx}
                  col={colOf(f)}
                  onPasteBlock={onPasteBlock}
                />
              );
              return (
                <tr key={item.id} className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/70", loss && "bg-red-50/50 hover:bg-red-50")}>
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
                  <td className="px-1.5 py-1">{cell("materialUsd", "Material Cost", errors[itemErrorKey(item.id, "materialUsd")], "0")}</td>
                  {!priceMode && <td className="px-1.5 py-1">{cell("marginPctOverride", "% Margin", errors[itemErrorKey(item.id, "marginPctOverride")], fmtNum(targetMarginPct, 0))}</td>}
                  {blockCells(line.fca, priceMode ? <td className="bg-slate-50/50 px-1.5 py-1">{cell("ddpPriceUsdInput", "Sales Price (FCA)", errors[priceErrorKey(scenarioId, item.id)], "0")}</td> : undefined)}
                  {blockCells(line.dap, priceMode ? <td className="bg-emerald-50/30 px-1.5 py-1">{cell("dapPriceUsdInput", "Sales Price (DAP)", errors[dapPriceErrorKey(scenarioId, item.id)], "0")}</td> : undefined)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <td colSpan={2} className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">TOTAL</td>
              <td className={tdNum}>{fmtNum(t.qty, 0)}</td>
              <td className={tdNum}>{fmtNum(t.materialUsd)}</td>
              {!priceMode && <td />}
              <td className={tdNum} />
              <td className={tdNum}>{fmtNum(fcaCost)}</td>
              <td className={tdNum}>{fmtNum(fcaRev)}</td>
              <td className={tdNum}>{fcaRev > 0 ? fmtPct(((fcaRev - fcaCost) / fcaRev) * 100) : "—"}</td>
              <td className={tdNum} />
              <td className={tdNum}>{fmtNum(dap?.costUsd ?? 0)}</td>
              <td className={tdNum}>{fmtNum(dap?.goodsRevenueUsd ?? 0)}</td>
              <td className={tdNum}>{dap && dap.goodsRevenueUsd > 0 ? fmtPct(dap.marginPct) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {dap && (
        <dl className="grid gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng hợp chào giá">
          <Sum label="Incoterm 1 — FCA" value={fmtUsd(fcaRev)} />
          <Sum label="Sales Price × Q'ty (excl. freight)" value={fmtUsd(dap.goodsRevenueUsd)} />
          <Sum label="Freight (quoted)" value={fmtUsd(dap.freightUsd)} warn={dap.freightMismatchUsd > 0.005 ? `Khác Freight per Logistic (reference) ${fmtUsd(dap.freightReferenceUsd)} (chênh ${fmtUsd(dap.freightMismatchUsd)})` : undefined} />
          <Sum label="Incoterm 2 — DAP" value={fmtUsd(dap.totalUsd)} strong hint={`Chênh so với FCA ${fmtUsd(dap.totalUsd - fcaRev)}`} />
        </dl>
      )}
    </div>
  );
}

function Sum({ label, value, strong, warn, hint }: { label: string; value: string; strong?: boolean; warn?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={cn("font-mono tabular-nums", strong ? "text-base font-semibold text-slate-900" : "text-sm text-slate-700")}>{value}</dd>
      {warn && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700"><TriangleAlertIcon className="size-3" aria-hidden />{warn}</p>}
      {hint && !warn && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
