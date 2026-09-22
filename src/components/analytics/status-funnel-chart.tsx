"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// dataviz sequential ordinal ramp (blue), one step per lifecycle stage — see references/palette.md
// "for an ordinal ramp (discrete ordered marks - funnel stages, tiers)".
const STAGE_RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab"];

export interface StatusChartRow {
  status: string;
  label: string;
  count: number;
}

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as StatusChartRow;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-700">{row.label}</p>
      <p className="font-mono text-slate-900">{row.count} đơn</p>
    </div>
  );
}

/** Single-series horizontal bar, one bar per pipeline stage in lifecycle order (SPEC.md §12). */
export function StatusFunnelChart({ data }: { data: StatusChartRow[] }) {
  const height = Math.max(160, data.length * 34);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Biểu đồ số lượng đơn hàng theo trạng thái">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            dataKey="label"
            type="category"
            width={140}
            tick={{ fontSize: 11, fill: "#52514e" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<FunnelTooltip />} cursor={{ fill: "#f9f9f7" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: "right", fontSize: 11, fill: "#52514e" }}>
            {data.map((row, i) => (
              <Cell key={row.status} fill={STAGE_RAMP[i % STAGE_RAMP.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
