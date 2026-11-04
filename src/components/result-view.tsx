"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, ScanSearch } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { ResultTable } from "@/components/result-table";
import { ResultToolbar } from "@/components/result-toolbar";
import { RegisterDialog } from "@/components/register-dialog";
import { EditRowDialog } from "@/components/edit-row-dialog";
import { duplicateTypeLabel, type RowStatus } from "@/lib/inspect";
import type { InspectResult, ResultRow } from "@/lib/inspect-types";
import type { RegisterOutcome } from "@/app/(app)/inspect/register-actions";

const TABS: { value: RowStatus; label: string }[] = [
  { value: "normal", label: "정상" },
  { value: "duplicate", label: "중복" },
  { value: "error", label: "오류" },
];

function recount(rows: ResultRow[]) {
  return {
    total: rows.length,
    normal: rows.filter((r) => r.status === "normal").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    error: rows.filter((r) => r.status === "error").length,
  };
}

export function ResultView({
  initial,
  canRegister,
  onRegistered,
}: {
  initial: InspectResult;
  canRegister: boolean;
  onRegistered?: (count: number) => void;
}) {
  const [result, setResult] = useState<InspectResult>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<ResultRow | null>(null);
  const [tab, setTab] = useState<RowStatus>("normal");

  const groups = useMemo<Record<RowStatus, ResultRow[]>>(
    () => ({
      normal: result.rows.filter((r) => r.status === "normal"),
      duplicate: result.rows.filter((r) => r.status === "duplicate"),
      error: result.rows.filter((r) => r.status === "error"),
    }),
    [result]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const applyRegister = (outcome: RegisterOutcome) => {
    const map = new Map(outcome.updates.map((u) => [u.id, u]));
    setResult((prev) => {
      const rows = prev.rows.map((r) => {
        const u = map.get(r.id);
        if (!u) return r;
        return {
          ...r,
          status: u.status,
          registered: u.registered,
          duplicateTypes: u.duplicateTypes,
          duplicateLabel: duplicateTypeLabel(u.duplicateTypes),
        };
      });
      return { ...prev, rows, summary: recount(rows) };
    });
    setSelected(new Set());
    onRegistered?.(outcome.registered);
  };

  const applyEdit = (updated: ResultRow) => {
    setResult((prev) => {
      const rows = prev.rows.map((r) => (r.id === updated.id ? updated : r));
      return { ...prev, rows, summary: recount(rows) };
    });
    setEditRow(null);
    toast.success(
      updated.status === "normal" ? "수정 완료: 정상으로 이동했습니다." : `수정 완료: ${updated.duplicateLabel}`
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="전체 입력" value={result.summary.total} icon={ScanSearch} />
        <StatCard
          label="정상"
          value={result.summary.normal}
          icon={CheckCircle2}
          tone="green"
          active={tab === "normal"}
          onClick={() => setTab("normal")}
        />
        <StatCard
          label="중복"
          value={result.summary.duplicate}
          icon={Copy}
          tone="amber"
          active={tab === "duplicate"}
          onClick={() => setTab("duplicate")}
        />
        <StatCard
          label="오류"
          value={result.summary.error}
          icon={AlertTriangle}
          tone="red"
          active={tab === "error"}
          onClick={() => setTab("error")}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RowStatus)}>
          <p className="mb-3 text-sm font-medium text-slate-700">
            {TABS.find((t) => t.value === tab)?.label} DB{" "}
            <span className="tabular-nums text-slate-500">{groups[tab].length.toLocaleString("ko-KR")}건</span>
          </p>

          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {t.value === "normal" && canRegister && (
                <RegisterDialog
                  batchId={result.batchId}
                  normalRows={groups.normal}
                  selected={selected}
                  onDone={applyRegister}
                />
              )}
              <ResultToolbar
                batchId={result.batchId}
                status={t.value}
                rows={groups[t.value]}
                rrnEnabled={result.rrnEnabled}
                selected={selected}
                onSelectAll={() => setMany(groups[t.value].map((r) => r.id), true)}
                onClearSelection={() => setMany(groups[t.value].map((r) => r.id), false)}
              />
              <ResultTable
                rows={groups[t.value]}
                kind={t.value}
                rrnEnabled={result.rrnEnabled}
                selected={selected}
                onToggle={toggle}
                onTogglePage={setMany}
                onEdit={t.value === "error" ? setEditRow : undefined}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {editRow && (
        <EditRowDialog
          key={editRow.id}
          batchId={result.batchId}
          row={editRow}
          rrnEnabled={result.rrnEnabled}
          onClose={() => setEditRow(null)}
          onSaved={applyEdit}
        />
      )}
    </div>
  );
}