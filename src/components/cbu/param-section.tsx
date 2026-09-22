"use client";

import * as React from "react";
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParamField } from "@/lib/cbu/ui/draft";

// ─── One parameter input ──────────────────────────────────────────────────────

interface ParamInputProps {
  field: ParamField;
  /** The text in the input (the caller decides where it lives: shared params or a scenario). */
  value: string;
  error?: string;
  /** Differs from the default — shows the "Đã sửa" reset button. Omit for fields without a default badge. */
  modified?: boolean;
  /** The default of THIS profile, as the input text: the reset value and the placeholder. */
  defaultValue?: string;
  onChange: (path: string, value: string) => void;
  /** Show the hint as a visible line (used in the always-open sections). */
  showHint?: boolean;
}

const UNIT_LABEL: Record<string, string> = { "%": "%", $: "$", kg: "kg", "₫": "₫", ngày: "ngày", x: "×", "": "" };

export function ParamInput({ field, value, error, modified, defaultValue = "", onChange, showHint }: ParamInputProps) {
  const uid = React.useId().replace(/:/g, "");
  const id = `param-${field.path.replace(/\./g, "-")}-${uid}`;
  const unit = UNIT_LABEL[field.unit];

  const inputClass = cn(
    "h-9 w-full rounded-lg border bg-white px-2.5 text-[13px] text-slate-900 outline-none transition-colors",
    "border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
    field.kind === "number" && "text-right font-mono tabular-nums text-blue-700",
    unit && field.kind === "number" && "pr-8",
    error && "border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20"
  );

  return (
    <div className="min-w-0" title={field.hint}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="truncate text-xs font-medium text-slate-600">
          {field.label}
        </label>
        {modified && (
          <button
            type="button"
            onClick={() => onChange(field.path, defaultValue)}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-[10px] font-medium text-amber-700 hover:bg-amber-50"
            title={`Khôi phục mặc định (${defaultValue})`}
          >
            <RotateCcwIcon className="size-3" aria-hidden />
            Đã sửa
          </button>
        )}
      </div>

      <div className="relative">
        {field.kind === "select" ? (
          <select id={id} value={value} onChange={(e) => onChange(field.path, e.target.value)} className={inputClass}>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type="text"
            inputMode={field.kind === "number" ? "decimal" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={field.kind === "number" ? defaultValue : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => onChange(field.path, e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className={inputClass}
          />
        )}
        {unit && field.kind === "number" && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-slate-400">{unit}</span>
        )}
      </div>

      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[11px] text-red-600">
          {error}
        </p>
      ) : showHint && field.hint ? (
        <p className="mt-1 truncate text-[11px] text-slate-400">{field.hint}</p>
      ) : null}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

interface ParamSectionProps {
  title: string;
  /** Short live summary shown on the header while collapsed (e.g. "Pool $4,015"). */
  summary?: React.ReactNode;
  /** Number of fields whose value differs from the default; 0 shows "Mặc định". Omit to hide the badge. */
  modified?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function ParamSection({ title, summary, modified, defaultOpen = false, children }: ParamSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50"
      >
        <ChevronDownIcon className={cn("size-4 shrink-0 text-slate-400 transition-transform", !open && "-rotate-90")} aria-hidden />
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {modified !== undefined && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              modified === 0 ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"
            )}
          >
            {modified === 0 ? "Mặc định" : `Đã sửa ${modified}`}
          </span>
        )}
        {summary && <span className="ml-auto truncate text-xs text-slate-500 tabular-nums">{summary}</span>}
      </button>
      {open && (
        <div id={panelId} className="border-t border-slate-100 px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}
