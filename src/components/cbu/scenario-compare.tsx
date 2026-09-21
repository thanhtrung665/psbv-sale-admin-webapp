"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CbuResult } from "@/lib/cbu/types";
import type { DraftScenario } from "@/lib/cbu/ui/draft";
import { fmtPct, fmtUsd, fmtVnd, marginTone, type MarginTone } from "@/lib/cbu/ui/format";

interface Props {
  scenarios: DraftScenario[];
  results: Record<string, CbuResult>;
  chosenId: string;
  activeId: string;
  targetMarginPct: number;
  disabled?: boolean;
  onChoose: (id: string) => void;
  onView: (id: string) => void;
}

const TONE_TEXT: Record<MarginTone, string> = { good: "text-emerald-600", thin: "text-amber-600", loss: "text-red-600", none: "text-slate-400" };

/** Side by side: what each logistics option costs and earns, and which one goes into the Quotation. */
export function ScenarioCompare({ scenarios, results, chosenId, activeId, targetMarginPct, disabled, onChoose, onView }: Props) {
  const chosen = results[chosenId];
  const rows: { key: string; label: string; cell: (r: CbuResult) => React.ReactNode }[] = [
    { key: "pool", label: "Pool logistics", cell: (r) => fmtUsd(r.pools.logisticsPoolUsd) },
    { key: "cost", label: "Giá vốn", cell: (r) => fmtUsd(r.totals.costUsd) },
    { key: "revUsd", label: "Doanh thu ($)", cell: (r) => fmtUsd(r.totals.revenueUsd) },
    { key: "revVnd", label: "Doanh thu (₫)", cell: (r) => <strong className="font-semibold text-slate-900">{fmtVnd(r.totals.revenueVnd)}</strong> },
    { key: "profit", label: "Lãi ($)", cell: (r) => fmtUsd(r.totals.marginUsd) },
    {
      key: "margin",
      label: "Margin",
      cell: (r) => <span className={cn("font-semibold", TONE_TEXT[marginTone(r.totals.marginPct, r.totals.revenueUsd > 0, targetMarginPct)])}>{r.totals.revenueUsd > 0 ? fmtPct(r.totals.marginPct) : "—"}</span>,
    },
  ];

  return (
    <section aria-labelledby="compare-heading" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 id="compare-heading" className="text-sm font-semibold text-slate-800">So sánh phương án</h2>
        <p className="text-xs text-slate-400">Chọn phương án sẽ dùng cho Quotation — giá từng dòng và tổng được lưu theo phương án đó.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400" />
              {scenarios.map((s) => {
                const isChosen = s.id === chosenId;
                return (
                  <th key={s.id} className={cn("px-4 py-2 text-right align-bottom", isChosen && "bg-emerald-50/50")}>
                    <button type="button" onClick={() => onView(s.id)} className={cn("text-sm font-semibold hover:underline", s.id === activeId ? "text-blue-700" : "text-slate-700")} title="Xem phương án này ở bảng bên dưới">
                      {s.label}
                    </button>
                    <div className="mt-1">
                      {isChosen ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          <CheckIcon className="size-3" aria-hidden />Dùng cho Quotation
                        </span>
                      ) : (
                        <button type="button" onClick={() => onChoose(s.id)} disabled={disabled} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50">
                          Chọn phương án này
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-1.5 text-xs text-slate-500">{row.label}</td>
                {scenarios.map((s) => (
                  <td key={s.id} className={cn("px-4 py-1.5 text-right font-mono text-[13px] tabular-nums text-slate-700", s.id === chosenId && "bg-emerald-50/50")}>
                    {results[s.id] ? row.cell(results[s.id]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className="px-4 py-1.5 text-xs font-medium text-slate-600">Chênh lệch doanh thu so với phương án được chọn</td>
              {scenarios.map((s) => {
                const d = results[s.id] && chosen ? results[s.id].totals.revenueVnd - chosen.totals.revenueVnd : 0;
                return (
                  <td key={s.id} className={cn("px-4 py-1.5 text-right font-mono text-[13px] tabular-nums", d === 0 ? "text-slate-400" : d > 0 ? "text-emerald-700" : "text-red-600")}>
                    {s.id === chosenId ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtVnd(Math.abs(d))} ₫`}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
