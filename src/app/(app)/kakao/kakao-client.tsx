"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  Undo2,
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
import { getKakaoSnapshotAction, setKakaoStatusAction, type KakaoStatus } from "./actions";

export type KakaoRow = {
  id: string;
  name: string;
  phone: string;
  phoneDigits: string;
  createdAt: string;
  kakaoStatus: KakaoStatus;
  checkedAt: string | null;
  checkedBy: string | null;
  canChange: boolean;
  memo?: string;
};

type Props = {
  rows: KakaoRow[];
  status: KakaoStatus;
  counts: Record<KakaoStatus, number>;
  countsScopeLabel: string;
  total: number;
  page: number;
  totalPages: number;
  isAdmin: boolean;
};

type RowState = { status: KakaoStatus | "taken"; canChange: boolean; checkedBy: string | null };

const TITLE: Record<KakaoStatus, string> = {
  unchecked: "미확인",
  possible: "카톡 가능",
  impossible: "카톡 불가",
};

function initState(rows: KakaoRow[]): Record<string, RowState> {
  return Object.fromEntries(
    rows.map((r) => [r.id, { status: r.kakaoStatus, canChange: r.canChange, checkedBy: r.checkedBy }])
  );
}

export function KakaoClient({
  rows: initialRows,
  status,
  counts: initialCounts,
  countsScopeLabel,
  total,
  page,
  totalPages,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [counts, setCounts] = useState(initialCounts);
  const [state, setState] = useState<Record<string, RowState>>(() => initState(initialRows));
  const pending = useRef<Set<string>>(new Set());
  const totalRef = useRef(total);

  // 서버에서 새 목록을 받으면 화면 상태 초기화
  useEffect(() => {
    setRows(initialRows);
    setCounts(initialCounts);
    setState(initState(initialRows));
  }, [initialRows, initialCounts]);

  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  // 작업 목록: 5초마다 다른 직원 분류 상태 반영
  useEffect(() => {
    if (status !== "unchecked") return;
    let stopped = false;
    let running = false;

    const tick = async () => {
      if (stopped || running || document.hidden || pending.current.size > 0) return;
      running = true;
      let res: Awaited<ReturnType<typeof getKakaoSnapshotAction>>;
      try {
        res = await getKakaoSnapshotAction(rows.map((r) => r.id));
      } catch {
        running = false;
        router.refresh(); // 로그인 만료면 로그인 화면으로
        return;
      }
      running = false;
      if (!res.ok && res.error.includes("로그인")) {
        router.refresh();
        return;
      }
      if (stopped || !res.ok || pending.current.size > 0) return;

      // 새 번호 추가·자정 경과 등 목록 자체가 바뀌면 새로고침
      if (res.data.workTotal !== totalRef.current) {
        router.refresh();
        return;
      }

      setState((prev) => {
        const next = { ...prev };
        for (const s of res.data.rows) {
          if (pending.current.has(s.id)) continue;
          next[s.id] = { status: s.status, canChange: s.canChange, checkedBy: s.checkedBy };
        }
        return next;
      });
      setCounts(res.data.counts);
    };

    const timer = setInterval(tick, 5000);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, rows, router]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} 복사: ${text}`);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const moveCount = (from: KakaoStatus, to: KakaoStatus) =>
    setCounts((c) => ({ ...c, [from]: Math.max(0, c[from] - 1), [to]: c[to] + 1 }));

  const setStatus = async (row: KakaoRow, to: KakaoStatus) => {
    if (pending.current.has(row.id)) return;
    const prev = state[row.id];
    if (!prev || prev.status === "taken") return;
    const from = prev.status as KakaoStatus;
    if (from === to) return;

    pending.current.add(row.id);

    // 1) 화면 먼저 반영
    if (status === "unchecked") {
      setState((s) => ({ ...s, [row.id]: { status: to, canChange: true, checkedBy: null } }));
    } else {
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    }
    moveCount(from, to);

    // 2) 서버 저장
    let res: Awaited<ReturnType<typeof setKakaoStatusAction>>;
    try {
      res = await setKakaoStatusAction({ id: row.id, status: to });
    } catch {
      res = { ok: false, error: "로그인이 만료되었거나 연결이 끊겼습니다. 저장되지 않았습니다." };
    }
    pending.current.delete(row.id);

    if (!res.ok) {
      toast.error(res.error);
      if (res.error.includes("로그인") || res.error.includes("연결")) {
        if (status === "unchecked") setState((s) => ({ ...s, [row.id]: prev }));
        moveCount(to, from);
        router.refresh(); // 로그인 만료면 자동으로 로그인 화면으로 이동
        return;
      }
      moveCount(to, from);

      if (res.error.includes("다른 직원")) {
        setState((s) => ({ ...s, [row.id]: { status: "taken", canChange: false, checkedBy: null } }));
        if (from === "unchecked") setCounts((c) => ({ ...c, unchecked: Math.max(0, c.unchecked - 1) }));
      } else if (status === "unchecked") {
        setState((s) => ({ ...s, [row.id]: prev }));
      } else {
        router.refresh();
      }
    }
  };

  const link = (s: KakaoStatus, p = 1) => `/kakao?status=${s}${p > 1 ? `&page=${p}` : ""}`;

  const rowClass = (id: string) => {
    const s = state[id]?.status;
    if (s === "possible") return "bg-emerald-50 hover:bg-emerald-50";
    if (s === "impossible") return "bg-red-50 hover:bg-red-50";
    if (s === "taken") return "opacity-50";
    return "";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="미확인"
          value={counts.unchecked}
          icon={CircleHelp}
          active={status === "unchecked"}
          onClick={() => router.push(link("unchecked"))}
        />
        <StatCard
          label={`카톡 가능${countsScopeLabel}`}
          value={counts.possible}
          icon={CircleCheck}
          tone="green"
          active={status === "possible"}
          onClick={() => router.push(link("possible"))}
        />
        <StatCard
          label={`카톡 불가${countsScopeLabel}`}
          value={counts.impossible}
          icon={CircleX}
          tone="red"
          active={status === "impossible"}
          onClick={() => router.push(link("impossible"))}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">
          {status === "unchecked" ? "작업 목록" : `${TITLE[status]} 전체 목록`}{" "}
          <span className="tabular-nums text-slate-500">{total.toLocaleString("ko-KR")}건</span>
          <span className="ml-2 text-xs font-normal text-slate-400">
            {status === "unchecked"
              ? "번호를 복사해 카카오톡에서 확인 후 가능/불가를 누르세요. 다시 누르면 취소됩니다. 분류한 건은 자정이 지나면 목록에서 빠집니다."
              : "지금까지 분류한 전체 이력입니다."}
          </span>
        </p>

        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {status === "unchecked" ? "확인할 번호가 없습니다." : "목록이 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>이름</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>등록일</TableHead>
                  {status !== "unchecked" && <TableHead>분류일</TableHead>}
                  {isAdmin && <TableHead>분류자</TableHead>}
                  <TableHead className="text-center">분류</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = state[r.id] ?? { status: r.kakaoStatus, canChange: r.canChange, checkedBy: r.checkedBy };
                  const cur = st.status;
                  const locked = cur === "taken" || !st.canChange;

                  return (
                    <TableRow key={r.id} className={rowClass(r.id)}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {r.name}
                          <Button variant="ghost" size="sm" onClick={() => copy(r.name, "이름")} aria-label="이름 복사">
                            <Copy className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-1.5">
                          {r.phone}
                          <Button variant="outline" size="sm" onClick={() => copy(r.phoneDigits, "번호")}>
                            <Copy className="h-3.5 w-3.5" />
                            번호 복사
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-500">{r.createdAt}</TableCell>
                      {status !== "unchecked" && (
                        <TableCell className="whitespace-nowrap text-sm text-slate-500">{r.checkedAt ?? "-"}</TableCell>
                      )}
                      {isAdmin && (
                        <TableCell className="whitespace-nowrap text-sm text-slate-500">
                          {st.checkedBy ?? (cur === "possible" || cur === "impossible" ? "나" : "-")}
                        </TableCell>
                      )}

                      <TableCell className="whitespace-nowrap text-center">
                        {status === "unchecked" &&
                          (cur === "taken" ? (
                            <span className="text-xs text-slate-500">다른 직원이 분류함</span>
                          ) : (
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStatus(r, cur === "possible" ? "unchecked" : "possible")}
                                disabled={locked}
                                aria-pressed={cur === "possible"}
                                className={
                                  cur === "possible"
                                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white disabled:opacity-100"
                                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                }
                              >
                                <CircleCheck className="h-4 w-4" />
                                가능
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStatus(r, cur === "impossible" ? "unchecked" : "impossible")}
                                disabled={locked}
                                aria-pressed={cur === "impossible"}
                                className={
                                  cur === "impossible"
                                    ? "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white disabled:opacity-100"
                                    : "border-red-300 text-red-700 hover:bg-red-50"
                                }
                              >
                                <CircleX className="h-4 w-4" />
                                불가
                              </Button>
                            </div>
                          ))}

                        {status !== "unchecked" &&
                          (st.canChange ? (
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStatus(r, status === "possible" ? "impossible" : "possible")}
                              >
                                {status === "possible" ? "불가로 변경" : "가능으로 변경"}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setStatus(r, "unchecked")}>
                                <Undo2 className="h-4 w-4" />
                                되돌리기
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">변경 권한 없음</span>
                          ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button nativeButton={false} variant="outline" size="sm" disabled={page <= 1} render={<Link href={link(status, page - 1)} />}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums text-slate-600">
              {page} / {totalPages}
            </span>
            <Button nativeButton={false} variant="outline" size="sm" disabled={page >= totalPages} render={<Link href={link(status, page + 1)} />}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}