"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CbuProfile, CbuResult } from "@/lib/cbu/types";
import type { DraftScenario } from "@/lib/cbu/ui/draft";
import { fmtPct, fmtUsd, fmtVnd, marginTone, type MarginTone } from "@/lib/cbu/ui/format";

interface Props {
  scenarios: DraftScenario[];
  results: Record<string, CbuResult>;
  chosenId: string;
  activeId: string;
  targetMarginPct: number;
  /** FCA_DAP compares payment terms: FCA offer, DAP offer, freight — instead of logistics pool and VND. */
  profile?: CbuProfile;
  disabled?: boolean;
  onChoose: (id: string) => void;
  onView: (id: string) => void;
}

const TONE_TEXT: Record<MarginTone, string> = { good: "text-emerald-600", thin: "text-amber-600", loss: "text-red-600", none: "text-slate-400" };

/** Side by side: what each logistics option costs and earns, and which one goes into the Quotation. */
export function ScenarioCompare({ scenarios, results, chosenId, activeId, targetMarginPct, profile = "DDP_IMPORT", disabled, onChoose, onView }: Props) {
  const chosen = results[chosenId];
  const fcaRev = (r: CbuResult) => r.lines.reduce((s, l) => s + (l.fca?.totalRevenueUsd ?? 0), 0);
  const fcaCost = (r: CbuResult) => r.lines.reduce((s, l) => s + (l.fca?.totalCostUsd ?? 0), 0);
  const bakerRows: { key: string; label: string; cell: (r: CbuResult) => React.ReactNode }[] = [
    { key: "bank", label: "TOTAL BANK FEE", cell: (r) => fmtUsd(r.pools.bankTotalUsd) },
    { key: "fcaCost", label: "Total Cost — FCA", cell: (r) => fmtUsd(fcaCost(r)) },
    { key: "fca", label: "Incoterm 1 — FCA", cell: (r) => fmtUsd(fcaRev(r)) },
    { key: "dapCost", label: "Total Cost — DAP", cell: (r) => fmtUsd(r.dap?.costUsd ?? 0) },
    { key: "dapGoods", label: "Sales Price × Q'ty (excl. freight)", cell: (r) => fmtUsd(r.dap?.goodsRevenueUsd ?? 0) },
    { key: "freight", label: "Freight (quoted)", cell: (r) => fmtUsd(r.dap?.freightUsd ?? 0) },
    { key: "dapTotal", label: "Incoterm 2 — DAP", cell: (r) => <strong className="font-semibold text-slate-900">{fmtUsd(r.dap?.totalUsd ?? 0)}</strong> },
    {
      key: "margin",
      label: "% Margin (FCA / DAP)",
      cell: (r) => {
        const f = fcaRev(r) > 0 ? ((fcaRev(r) - fcaCost(r)) / fcaRev(r)) * 100 : 0;
        return <span className="font-semibold text-slate-800">{fcaRev(r) > 0 ? fmtPct(f) : "—"} / {(r.dap?.goodsRevenueUsd ?? 0) > 0 ? fmtPct(r.dap!.marginPct) : "—"}</span>;
      },
    },
  ];
  const ddpRows: { key: string; label: string; cell: (r: CbuResult) => React.ReactNode }[] = [
    { key: "pool", label: "Total Logistic + Insurance", cell: (r) => fmtUsd(r.pools.logisticsPoolUsd) },
    { key: "cost", label: "Total Cost (USD)", cell: (r) => fmtUsd(r.totals.costUsd) },
    { key: "revUsd", label: "Revenue in USD @ quote rate", cell: (r) => fmtUsd(r.totals.revenueUsd) },
    { key: "revVnd", label: "Total Revenue (VND)", cell: (r) => <strong className="font-semibold text-slate-900">{fmtVnd(r.totals.revenueVnd)}</strong> },
    { key: "profit", label: "Total Margin", cell: (r) => fmtUsd(r.totals.marginUsd) },
    {
      key: "margin",
      label: "Nominal Margin %",
      cell: (r) => <span className={cn("font-semibold", TONE_TEXT[marginTone(r.totals.marginPct, r.totals.revenueUsd > 0, targetMarginPct)])}>{r.totals.revenueUsd > 0 ? fmtPct(r.totals.marginPct) : "—"}</span>,
    },
  ];

  const rows = profile === "FCA_DAP" ? bakerRows : ddpRows;
  // the difference row compares the figure the customer sees: VND revenue (DDP) or the DAP total (Baker)
  const headline = (r: CbuResult) => (profile === "FCA_DAP" ? (r.dap?.totalUsd ?? 0) : r.totals.revenueVnd);
  const fmtDelta = (d: number) => (profile === "FCA_DAP" ? fmtUsd(Math.abs(d)) : `${fmtVnd(Math.abs(d))} ₫`);

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
              <td className="px-4 py-1.5 text-xs font-medium text-slate-600">{profile === "FCA_DAP" ? "Incoterm 2 — DAP difference vs chosen scenario" : "Revenue difference vs chosen scenario (VND)"}</td>
              {scenarios.map((s) => {
                const d = results[s.id] && chosen ? headline(results[s.id]) - headline(chosen) : 0;
                return (
                  <td key={s.id} className={cn("px-4 py-1.5 text-right font-mono text-[13px] tabular-nums", d === 0 ? "text-slate-400" : d > 0 ? "text-emerald-700" : "text-red-600")}>
                    {s.id === chosenId ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtDelta(d)}`}
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
