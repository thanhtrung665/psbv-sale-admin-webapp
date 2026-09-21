"use client";

import * as React from "react";
import { CircleCheckIcon, Loader2Icon, RotateCcwIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateCbu } from "@/lib/cbu";
import { finalizeBlockers } from "@/lib/cbu/finalize";
import type { CbuMode, CbuResult } from "@/lib/cbu/types";
import type { CbuSheet } from "@/lib/cbu/db/service";
import {
  addScenario,
  allErrors,
  applyPaste,
  draftToEngine,
  draftToSaveInput,
  editableColumns,
  isDirty,
  numToStr,
  parseClipboardMatrix,
  removeScenario,
  renameScenario,
  setChosen,
  setItemValue,
  setScenarioField,
  sheetToDraft,
  type Draft,
  type EngineInput,
  type ItemField,
} from "@/lib/cbu/ui/draft";
import { fmtNum } from "@/lib/cbu/ui/format";
import { FinalizeDialog } from "./finalize-dialog";
import { ItemsTable } from "./items-table";
import { ParamsPanel } from "./params-panel";
import { ScenarioCompare } from "./scenario-compare";
import { ScenarioTabs } from "./scenario-tabs";
import { WorkspaceBar } from "./workspace-bar";

interface Notice {
  tone: "success" | "error" | "info";
  text: string;
  details?: string[];
}

/** Reads `{ error, details }` (or a validation body) out of a failed response. */
async function readError(res: Response): Promise<{ message: string; details: string[] }> {
  try {
    const j = await res.json();
    const validation: string[] = Array.isArray(j?.errors) ? j.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`) : [];
    const details: string[] = Array.isArray(j?.details) ? j.details : validation;
    return { message: j?.error ?? j?.message ?? `Lỗi ${res.status}`, details };
  } catch {
    return { message: `Lỗi ${res.status}`, details: [] };
  }
}

export function CbuWorkspace({ rfqId, initialType }: { rfqId: string; initialType?: string }) {
  const [sheet, setSheet] = React.useState<CbuSheet | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [activeId, setActiveId] = React.useState("");
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"save" | "finalize" | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [showCosts, setShowCosts] = React.useState(false);
  const [showOverrides, setShowOverrides] = React.useState(false);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const [finalizeOpen, setFinalizeOpen] = React.useState(false);
  const [serverReasons, setServerReasons] = React.useState<string[]>([]);
  const [doneHref, setDoneHref] = React.useState<string | null>(null);

  // ── load ────────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/rfq/${rfqId}/cbu`, { cache: "no-store" });
      if (!res.ok) throw new Error((await readError(res)).message);
      const { sheet: s } = (await res.json()) as { sheet: CbuSheet };
      const d = sheetToDraft(s);
      // Entered from the "Input Price" choice on a sheet that was never calculated → start in price mode.
      if (initialType === "price" && s.saved.calculatedAt === null && d.mode === "MARGIN_INPUT") d.mode = "PRICE_INPUT";
      setSheet(s);
      setDraft(d);
      setActiveId(s.chosenScenarioId);
      setShowOverrides(d.items.some((i) => i.marginPctOverride !== "" || i.marginUsdOverride !== ""));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được dữ liệu CBU.");
    }
  }, [rfqId, initialType]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // ── derived: every scenario is calculated in the browser with the same engine the server runs ──
  const baseDraft = React.useMemo(() => (sheet ? sheetToDraft(sheet) : null), [sheet]);
  const computed = React.useMemo(() => {
    if (!draft) return null;
    const engines: Record<string, EngineInput> = {};
    const results: Record<string, CbuResult> = {};
    for (const s of draft.scenarios) {
      engines[s.id] = draftToEngine(draft, s.id);
      results[s.id] = calculateCbu(engines[s.id].lines, engines[s.id].params);
    }
    return { engines, results, errors: allErrors(draft) };
  }, [draft]);

  const dirty = !!(draft && baseDraft && isDirty(draft, baseDraft));
  const invalidInputs = computed ? Object.keys(computed.errors).length : 0;
  const active = draft ? (draft.scenarios.find((s) => s.id === activeId) ?? draft.scenarios[0]) : null;
  const chosenEngine = draft && computed ? computed.engines[draft.chosenId] : null;
  const chosenResult = draft && computed ? computed.results[draft.chosenId] : null;
  const blockers = React.useMemo(() => (chosenEngine && chosenResult ? finalizeBlockers(chosenEngine.lines, chosenResult) : []), [chosenEngine, chosenResult]);

  // Leaving with unsaved edits loses them — let the browser ask.
  React.useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // ── edits ───────────────────────────────────────────────────────────────────
  const edit = React.useCallback((fn: (d: Draft) => Draft) => {
    setNotice(null);
    setDraft((d) => (d ? fn(d) : d));
  }, []);

  const onParamChange = React.useCallback((path: string, value: string) => edit((d) => ({ ...d, params: { ...d.params, [path]: value } })), [edit]);
  const onScenarioChange = (path: string, value: string) => active && edit((d) => setScenarioField(d, active.id, path, value));
  const onItemChange = (id: string, field: ItemField, value: string) => active && edit((d) => setItemValue(d, active.id, id, field, value));

  const onModeChange = (mode: CbuMode) => {
    if (!computed) return;
    edit((d) => {
      if (mode !== "PRICE_INPUT") return { ...d, mode };
      // Switching to "enter the price": every scenario starts each EMPTY price from the price it gives right now,
      // so nothing jumps to zero.
      const scenarios = d.scenarios.map((s) => {
        const res = computed.results[s.id];
        const prices = { ...s.prices };
        d.items.forEach((it, i) => {
          const p = res?.lines[i]?.ddpPriceUsd ?? 0;
          if ((prices[it.id] ?? "") === "" && p > 0) prices[it.id] = numToStr(p);
        });
        return { ...s, prices };
      });
      return { ...d, mode, scenarios };
    });
  };

  const onPasteBlock = (row: number, col: number, text: string): boolean => {
    if (!draft || !active) return false;
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 1)) return false;
    edit((d) => applyPaste(d, active.id, row, col, matrix, editableColumns(d.mode, showOverrides)));
    return true;
  };

  // ── scenarios ───────────────────────────────────────────────────────────────
  const onAddScenario = () => {
    if (!draft || !active) return;
    const r = addScenario(draft, active.id);
    if (!r) return;
    edit(() => r.draft);
    setActiveId(r.id);
  };
  const onRemoveScenario = (id: string) => {
    if (!draft) return;
    const next = removeScenario(draft, id);
    edit(() => next);
    if (id === activeId) setActiveId(next.scenarios[0].id);
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── save / finalize ─────────────────────────────────────────────────────────
  const adopt = (s: CbuSheet) => {
    setSheet(s);
    setDraft(sheetToDraft(s));
    setActiveId((cur) => (s.scenarios.some((x) => x.id === cur) ? cur : s.chosenScenarioId));
  };

  const saveDraft = async () => {
    if (!draft || invalidInputs > 0) return;
    setBusy("save");
    setNotice(null);
    try {
      const res = await fetch(`/api/rfq/${rfqId}/cbu`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftToSaveInput(draft)) });
      if (!res.ok) {
        const e = await readError(res);
        setNotice({ tone: "error", text: e.message, details: e.details });
        return;
      }
      const j = (await res.json()) as { sheet: CbuSheet; notes?: string[] };
      adopt(j.sheet);
      setNotice({ tone: "success", text: "Đã lưu nháp CBU.", details: j.notes });
    } catch {
      setNotice({ tone: "error", text: "Không kết nối được máy chủ. Thay đổi chưa được lưu." });
    } finally {
      setBusy(null);
    }
  };

  const finalize = async () => {
    if (!draft) return;
    setBusy("finalize");
    setServerReasons([]);
    try {
      const res = await fetch(`/api/rfq/${rfqId}/cbu/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftToSaveInput(draft)) });
      if (!res.ok) {
        const e = await readError(res);
        setServerReasons(e.details.length > 0 ? e.details : [e.message]);
        return;
      }
      const j = (await res.json()) as { sheet: CbuSheet; notes?: string[] };
      adopt(j.sheet);
      setDoneHref(`/rfq/${rfqId}/quote-preview`);
      setNotice({ tone: "success", text: "Đã hoàn tất CBU.", details: j.notes });
    } catch {
      setServerReasons(["Không kết nối được máy chủ. Chưa hoàn tất."]);
    } finally {
      setBusy(null);
    }
  };

  const openFinalize = () => {
    setServerReasons([]);
    setDoneHref(null);
    setFinalizeOpen(true);
  };

  const revert = () => {
    if (baseDraft) {
      setDraft(baseDraft);
      setActiveId((cur) => (baseDraft.scenarios.some((x) => x.id === cur) ? cur : baseDraft.chosenId));
    }
    setNotice(null);
  };

  // ── render ──────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
        <TriangleAlertIcon className="size-8 text-red-500" aria-hidden />
        <p className="font-medium text-slate-800">Không tải được bảng CBU</p>
        <p className="text-sm text-slate-500">{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>Thử lại</Button>
      </div>
    );
  }

  if (!sheet || !draft || !computed || !active || !chosenResult) return <WorkspaceSkeleton />;

  const engine = computed.engines[active.id];
  const result = computed.results[active.id];
  const savedAt = sheet.saved.calculatedAt ? new Date(sheet.saved.calculatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : null;
  const route = `${draft.params["goodsOrigin"] || "Oversea"} → ${draft.params["destinationCountry"] || "VN"}`;
  const targetMargin = Number(engine.params.targetMarginPct ?? 25);
  const canSave = dirty && invalidInputs === 0 && !busy;
  const multiple = draft.scenarios.length > 1;
  const chosenLabel = draft.scenarios.find((s) => s.id === draft.chosenId)?.label ?? "";

  return (
    <div className="space-y-4">
      <WorkspaceBar
        rfqId={rfqId}
        rfqCode={sheet.rfq.rfqCode}
        clientName={sheet.rfq.clientName}
        incoTerm={sheet.rfq.incoTerm}
        paymentTerm={sheet.rfq.paymentTerm}
        status={sheet.rfq.status}
        route={route}
        mode={draft.mode}
        onModeChange={onModeChange}
        result={result}
        targetMarginPct={targetMargin}
        invalidInputs={invalidInputs}
        dirty={dirty}
        savedAt={savedAt}
        busy={busy !== null}
        scenarioLabel={multiple ? active.label : undefined}
        scenarioChosen={active.id === draft.chosenId}
      />

      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium"><TriangleAlertIcon className="size-4" aria-hidden />Lưu ý{multiple ? ` — ${active.label}` : ""} ({result.warnings.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6 text-[13px]">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <ScenarioTabs
        scenarios={draft.scenarios}
        activeId={active.id}
        chosenId={draft.chosenId}
        disabled={busy !== null}
        onSelect={setActiveId}
        onAdd={onAddScenario}
        onRename={(id, label) => edit((d) => renameScenario(d, id, label))}
        onRemove={onRemoveScenario}
      />

      {multiple && (
        <ScenarioCompare
          scenarios={draft.scenarios}
          results={computed.results}
          chosenId={draft.chosenId}
          activeId={active.id}
          targetMarginPct={targetMargin}
          disabled={busy !== null}
          onChoose={(id) => edit((d) => setChosen(d, id))}
          onView={setActiveId}
        />
      )}

      <ParamsPanel draft={draft} scenario={active} errors={engine.errors} result={result} onChange={onParamChange} onScenarioChange={onScenarioChange} />

      <section aria-labelledby="items-heading" className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="items-heading" className="text-sm font-semibold text-slate-800">
            Dòng hàng <span className="font-normal text-slate-400">({draft.items.length}){multiple && ` · đang xem ${active.label}`}</span>
          </h2>
          <p className="hidden text-xs text-slate-400 md:block">Enter / ↑↓ để chuyển dòng · dán nhiều ô từ Excel để điền nhanh</p>
          <div className="ml-auto flex items-center gap-2">
            <ToggleChip pressed={showCosts} onClick={() => setShowCosts((v) => !v)}>Chi phí chi tiết</ToggleChip>
            {draft.mode === "MARGIN_INPUT" && <ToggleChip pressed={showOverrides} onClick={() => setShowOverrides((v) => !v)}>Ghi đè margin</ToggleChip>}
          </div>
        </div>

        {draft.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            RFQ này chưa có dòng hàng. Hãy hoàn tất bước bóc tách báo giá của hãng trước khi tính CBU.
          </div>
        ) : (
          <ItemsTable
            draft={draft}
            scenarioId={active.id}
            result={result}
            errors={engine.errors}
            targetMarginPct={targetMargin}
            showCosts={showCosts}
            showOverrides={showOverrides}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            onItemChange={onItemChange}
            onPasteBlock={onPasteBlock}
          />
        )}
      </section>

      <footer className="sticky bottom-0 z-30 -mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur md:-mx-8 md:-mb-8 md:px-8">
        <p className="text-xs text-slate-500">
          {invalidInputs > 0 ? (
            <span className="text-red-600">Sửa {invalidInputs} ô nhập chưa hợp lệ trước khi lưu.</span>
          ) : dirty ? (
            "Bạn có thay đổi chưa lưu."
          ) : multiple ? (
            <>Quotation dùng phương án <strong className="font-semibold text-slate-700">{chosenLabel}</strong></>
          ) : (
            <>Trọng lượng {fmtNum(result.totals.weightKg, 1)} kg · {fmtNum(result.totals.qty, 0)} đơn vị</>
          )}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={revert} disabled={!dirty || busy !== null}>
            <RotateCcwIcon aria-hidden /> Hoàn tác
          </Button>
          <Button variant="outline" onClick={() => void saveDraft()} disabled={!canSave}>
            {busy === "save" ? <Loader2Icon className="animate-spin" aria-hidden /> : <SaveIcon aria-hidden />} Lưu nháp
          </Button>
          <Button onClick={openFinalize} disabled={invalidInputs > 0 || busy !== null || draft.items.length === 0}>
            Hoàn tất & tạo Quotation
          </Button>
        </div>
      </footer>

      <FinalizeDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        result={chosenResult}
        scenarioLabel={multiple ? chosenLabel : undefined}
        blockers={blockers}
        serverReasons={serverReasons}
        busy={busy === "finalize"}
        doneHref={doneHref}
        onConfirm={() => void finalize()}
      />
    </div>
  );
}

// ─── small pieces ─────────────────────────────────────────────────────────────

function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (pressed ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  }[notice.tone];
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {notice.tone === "success" ? <CircleCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{notice.text}</p>
        {notice.details && notice.details.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">{notice.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
        )}
      </div>
      <button type="button" onClick={onClose} className="text-xs underline-offset-2 hover:underline" aria-label="Đóng thông báo">Đóng</button>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải bảng CBU">
      <div className="h-24 animate-pulse rounded-xl bg-slate-200/60" />
      <div className="h-40 animate-pulse rounded-xl bg-slate-200/60" />
      <div className="h-72 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}
