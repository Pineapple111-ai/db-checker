"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardCopy,
  Copy,
  Database,
  Loader2,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { ResultTable } from "@/components/result-table";
import type { RowStatus } from "@/lib/inspect";
import type { ResultRow } from "@/lib/inspect-types";
import { getTodayRowsAction, logDashboardCopyAction } from "./dashboard-actions";

export type TodayBatch = {
  id: string;
  createdAt: string;
  userLabel: string;
  inputLabel: string;
  total: number;
  normal: number;
  duplicate: number;
  error: number;
  registered: number;
  purged: boolean;
};

type CardKey = "total" | RowStatus;

const TITLE: Record<CardKey, string> = {
  total: "오늘 검수 기록",
  normal: "오늘 정상 DB",
  duplicate: "오늘 중복 DB",
  error: "오늘 오류 DB",
};

export function DashboardClient({
  masterCount,
  today,
  batches,
  canSeeMaster,
  kakao,
}: {
  masterCount: number;
  today: { total: number; normal: number; duplicate: number; error: number };
  batches: TodayBatch[];
  canSeeMaster: boolean;
  kakao: { unchecked: number; possibleToday: number; impossibleToday: number };
}) {
  const router = useRouter();
  const [active, setActive] = useState<CardKey | null>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [rrnEnabled, setRrnEnabled] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  const open = async (key: CardKey) => {
    if (active === key) {
      setActive(null);
      return;
    }
    setActive(key);
    setRows(null);
    setSelected(new Set());
    if (key === "total") return;

    const id = ++reqId.current;
    setLoading(true);
    const res = await getTodayRowsAction(key);
    if (id !== reqId.current) return;
    setLoading(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.data.rows);
    setRrnEnabled(res.data.rrnEnabled);
    setTruncated(res.data.truncated);
  };

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

  const copy = async (list: ResultRow[]) => {
    if (!active || active === "total" || list.length === 0) return;
    const text = list
      .map((r) => [r.name ?? "", r.phone ?? "", ...(rrnEnabled ? [r.rrn ?? ""] : [])].join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${list.length.toLocaleString("ko-KR")}건 복사했습니다.`);
      void logDashboardCopyAction({ status: active, count: list.length });
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const selectedRows = rows?.filter((r) => selected.has(r.id)) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label="기존 저장 DB"
          value={masterCount}
          icon={Database}
          onClick={canSeeMaster ? () => router.push("/master") : undefined}
        />
        <StatCard label="오늘 등록" value={today.total} icon={ScanSearch} active={active === "total"} onClick={() => open("total")} />
        <StatCard label="오늘 정상" value={today.normal} icon={CheckCircle2} tone="green" active={active === "normal"} onClick={() => open("normal")} />
        <StatCard label="오늘 중복" value={today.duplicate} icon={Copy} tone="amber" active={active === "duplicate"} onClick={() => open("duplicate")} />
        <StatCard label="오늘 오류" value={today.error} icon={AlertTriangle} tone="red" active={active === "error"} onClick={() => open("error")} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">카톡 분류</p>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="카톡 미확인"
            value={kakao.unchecked}
            icon={CircleHelp}
            onClick={() => router.push("/kakao")}
          />
          <StatCard
            label={`오늘 카톡 가능${canSeeMaster ? "" : " (내 분류)"}`}
            value={kakao.possibleToday}
            icon={CircleCheck}
            tone="green"
            onClick={() => router.push("/kakao?status=possible")}
          />
          <StatCard
            label={`오늘 카톡 불가${canSeeMaster ? "" : " (내 분류)"}`}
            value={kakao.impossibleToday}
            icon={CircleX}
            tone="red"
            onClick={() => router.push("/kakao?status=impossible")}
          />
        </div>
      </div>

      {active && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">{TITLE[active]}</p>

            {active !== "total" && rows && rows.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(rows)}>
                  <ClipboardCopy className="h-4 w-4" />
                  전체 복사
                </Button>
                <Button variant="outline" size="sm" onClick={() => copy(selectedRows)} disabled={selectedRows.length === 0}>
                  <ClipboardCopy className="h-4 w-4" />
                  선택 복사 {selectedRows.length > 0 && `(${selectedRows.length})`}
                </Button>
              </div>
            )}
          </div>

          {/* 오늘 검수 기록 목록 */}
          {active === "total" &&
            (batches.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">오늘 검수 기록이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>검수 일시</TableHead>
                      <TableHead>작업자</TableHead>
                      <TableHead>입력</TableHead>
                      <TableHead className="text-right">전체</TableHead>
                      <TableHead className="text-right">정상</TableHead>
                      <TableHead className="text-right">중복</TableHead>
                      <TableHead className="text-right">오류</TableHead>
                      <TableHead className="text-right">등록</TableHead>
                      <TableHead className="w-20 text-center">상세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap text-sm">{b.createdAt}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{b.userLabel}</TableCell>
                        <TableCell className="max-w-48 truncate text-sm text-slate-600" title={b.inputLabel}>
                          {b.inputLabel}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.total.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{b.normal.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-right tabular-nums text-amber-700">{b.duplicate.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-700">{b.error.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.registered.toLocaleString("ko-KR")}</TableCell>
                        <TableCell className="text-center">
                          {b.purged ? (
                            <span className="text-xs text-slate-400">삭제됨</span>
                          ) : (
                            <Button nativeButton={false} variant="outline" size="sm" render={<Link href={`/history/${b.id}`} />}>
                              보기
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}

          {/* 정상·중복·오류 행 */}
          {active !== "total" && (
            <>
              {loading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              )}
              {!loading && rows && (
                <>
                  {truncated && (
                    <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      5,000건까지만 표시합니다. 전체는 검수 기록의 상세 화면에서 확인·다운로드하세요.
                    </p>
                  )}
                  <ResultTable
                    key={active}
                    rows={rows}
                    kind={active}
                    rrnEnabled={rrnEnabled}
                    selected={selected}
                    onToggle={toggle}
                    onTogglePage={setMany}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}