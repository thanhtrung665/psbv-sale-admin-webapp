"use client";

import * as React from "react";
import { CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SCENARIOS, type DraftScenario } from "@/lib/cbu/ui/draft";

interface Props {
  scenarios: DraftScenario[];
  activeId: string;
  chosenId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}

/**
 * One tab per logistics option (Air / Sea …). The active tab is what the table and parameters show; the tab with
 * the check mark is the one priced into the Quotation.
 */
export function ScenarioTabs({ scenarios, activeId, chosenId, disabled, onSelect, onAdd, onRename, onRemove }: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const canAdd = scenarios.length < MAX_SCENARIOS;
  const multiple = scenarios.length > 1;

  const startEdit = (s: DraftScenario) => {
    setEditingId(s.id);
    setText(s.label);
  };
  const commit = () => {
    if (editingId && text.trim()) onRename(editingId, text.trim().slice(0, 40));
    setEditingId(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Phương án vận chuyển">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Phương án</span>
      {scenarios.map((s) => {
        const active = s.id === activeId;
        const chosen = s.id === chosenId;
        return (
          <div
            key={s.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg border py-1 pl-3 pr-1.5 text-sm transition-colors",
              active ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                value={text}
                maxLength={40}
                aria-label="Tên phương án"
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-6 w-28 rounded border border-blue-300 bg-white px-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            ) : (
              <button type="button" role="tab" aria-selected={active} disabled={disabled} onClick={() => onSelect(s.id)} className="flex items-center gap-1.5 font-medium">
                {s.label}
                {chosen && multiple && <CheckIcon className="size-3.5 text-emerald-600" aria-label="Dùng cho Quotation" />}
              </button>
            )}
            {active && editingId !== s.id && (
              <button type="button" onClick={() => startEdit(s)} disabled={disabled} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Đổi tên ${s.label}`}>
                <PencilIcon className="size-3" aria-hidden />
              </button>
            )}
            {multiple && (
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                disabled={disabled}
                className="rounded p-1 text-slate-300 hover:bg-white hover:text-red-600"
                aria-label={`Xoá phương án ${s.label}`}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || !canAdd}
        title={canAdd ? "Thêm phương án (sao chép phương án đang xem)" : `Tối đa ${MAX_SCENARIOS} phương án`}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" aria-hidden />
        Thêm phương án
      </button>
    </div>
  );
}
