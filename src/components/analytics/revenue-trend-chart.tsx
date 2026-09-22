"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyRevenuePoint } from "@/lib/analytics/types";

const REVENUE_COLOR = "#2a78d6"; // dataviz categorical slot 1 (blue)
const MARGIN_COLOR = "#1baf7a"; // dataviz categorical slot 3 (aqua)

const fmtUSD = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toFixed(0)}`;

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: p.color }} />{" "}
          {p.name}: <span className="font-mono font-semibold text-slate-900">{fmtUSD(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: MonthlyRevenuePoint[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Biểu đồ doanh thu và lợi nhuận theo tháng">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" strokeDasharray="0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} tickFormatter={fmtUSD} width={48} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "#f9f9f7" }} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#52514e" }}
            formatter={(value) => <span className="text-slate-600">{value}</span>}
          />
          <Bar dataKey="revenueUsd" name="Doanh thu" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Line dataKey="marginUsd" name="Lợi nhuận" stroke={MARGIN_COLOR} strokeWidth={2} dot={{ r: 3, fill: MARGIN_COLOR }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
