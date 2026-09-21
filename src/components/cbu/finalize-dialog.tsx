"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CbuResult } from "@/lib/cbu/types";
import { fmtPct, fmtUsd, fmtVnd } from "@/lib/cbu/ui/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CbuResult;
  /** Reasons found by the same rule the server applies (preflight). */
  blockers: string[];
  /** Reasons the SERVER returned when it refused (422), if any. */
  serverReasons: string[];
  busy: boolean;
  /** Set after a successful finalize. */
  doneHref: string | null;
  onConfirm: () => void;
}

export function FinalizeDialog({ open, onOpenChange, result, blockers, serverReasons, busy, doneHref, onConfirm }: Props) {
  const reasons = serverReasons.length > 0 ? serverReasons : blockers;
  const blocked = reasons.length > 0;
  const t = result.totals;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{doneHref ? "Đã hoàn tất CBU" : "Hoàn tất CBU và tạo Quotation nháp"}</DialogTitle>
          <DialogDescription>
            {doneHref
              ? "Số liệu đã được lưu và chuyển sang bước Quotation."
              : "Hệ thống sẽ lưu các số liệu bên dưới và chuyển RFQ sang bước Quotation nháp."}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <dt className="text-slate-500">Số dòng hàng</dt>
          <dd className="text-right font-mono tabular-nums">{result.lines.length}</dd>
          <dt className="text-slate-500">Doanh thu</dt>
          <dd className="text-right font-mono tabular-nums">{fmtUsd(t.revenueUsd)} · {fmtVnd(t.revenueVnd)} ₫</dd>
          <dt className="text-slate-500">Giá vốn</dt>
          <dd className="text-right font-mono tabular-nums">{fmtUsd(t.costUsd)}</dd>
          <dt className="text-slate-500">Margin</dt>
          <dd className="text-right font-mono font-semibold tabular-nums">{fmtPct(t.marginPct)}</dd>
        </dl>

        {blocked && !doneHref && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <p className="flex items-center gap-2 font-medium"><TriangleAlertIcon className="size-4" aria-hidden />Chưa thể hoàn tất — cần xử lý:</p>
            <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-6 text-[13px]">
              {reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        <DialogFooter>
          {doneHref ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Ở lại trang này</Button>
              <Link href={doneHref} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80">
                Sang bước Quotation →
              </Link>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Quay lại chỉnh sửa</Button>
              <Button onClick={onConfirm} disabled={busy || (blockers.length > 0 && serverReasons.length === 0)}>
                {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                Hoàn tất
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
