"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClientRevenue } from "@/lib/analytics/types";

const BAR_COLOR = "#2a78d6"; // dataviz categorical slot 1 (blue) — same hue as "revenue" in the trend chart

const fmtUSD = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toFixed(0)}`;

function ClientTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ClientRevenue;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-700">{row.name}</p>
      <p className="font-mono text-slate-900">{fmtUSD(row.revenueUsd)}</p>
    </div>
  );
}

/** Single-series horizontal bar ranking clients by total priced revenue, descending (SPEC.md §12). */
export function TopClientsChart({ data }: { data: ClientRevenue[] }) {
  const height = Math.max(120, data.length * 34);
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Chưa có đơn hàng đã tính giá</p>;
  }
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Biểu đồ top khách hàng theo doanh thu">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis type="number" hide tickFormatter={fmtUSD} />
          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: "#52514e" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ClientTooltip />} cursor={{ fill: "#f9f9f7" }} />
          <Bar dataKey="revenueUsd" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
