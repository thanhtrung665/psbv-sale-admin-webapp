"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface NumCellProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name — there is no visible label inside a table cell. */
  label: string;
  error?: string;
  placeholder?: string;
  /** Position in the editable grid, used for Enter/Arrow navigation and paste. */
  row?: number;
  col?: number;
  /** Called for a multi-cell clipboard (Excel). Return true when handled. */
  onPasteBlock?: (row: number, col: number, text: string) => boolean;
  className?: string;
  width?: string;
}

/**
 * A numeric input that behaves like a spreadsheet cell:
 *  - Enter / ↓ moves to the same column of the next line, ↑ / Shift+Enter to the previous one;
 *  - the whole value is selected on focus, so typing replaces it;
 *  - pasting several cells from Excel fills the grid downwards / rightwards.
 * The value stays a string while typing; parsing happens where it is used (see lib/cbu/ui/draft.ts).
 */
export function NumCell({ value, onChange, label, error, placeholder, row, col, onPasteBlock, className, width = "w-full" }: NumCellProps) {
  const gridPos = row !== undefined && col !== undefined;

  const focusCell = (r: number, c: number, from: HTMLElement) => {
    const grid = from.closest("[data-cbu-grid]");
    const target = grid?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`);
    if (target) {
      target.focus();
      return true;
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!gridPos) return;
    const up = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey);
    const down = e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey);
    if (!up && !down) return;
    e.preventDefault();
    focusCell((row as number) + (down ? 1 : -1), col as number, e.currentTarget);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!gridPos || !onPasteBlock) return;
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.replace(/\s+$/, ""))) return; // a single value pastes normally
    if (onPasteBlock(row as number, col as number, text)) e.preventDefault();
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      title={error}
      data-cell={gridPos ? `${row}:${col}` : undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "h-8 rounded-md border bg-white px-2 text-right font-mono text-[13px] tabular-nums text-blue-700 outline-none transition-colors",
        "border-slate-200 placeholder:text-slate-300 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
        error && "border-red-400 bg-red-50/50 text-red-700 focus:border-red-500 focus:ring-red-500/20",
        width,
        className
      )}
    />
  );
}
