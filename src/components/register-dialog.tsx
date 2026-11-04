"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DatabaseZap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ResultRow } from "@/lib/inspect-types";
import { registerRowsAction, type RegisterOutcome } from "@/app/(app)/inspect/register-actions";

type Props = {
  batchId: string;
  normalRows: ResultRow[];
  selected: Set<string>;
  onDone: (outcome: RegisterOutcome) => void;
};

export function RegisterDialog({ batchId, normalRows, selected, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<RegisterOutcome | null>(null);

  const unregistered = normalRows.filter((r) => !r.registered);
  const selectedTargets = unregistered.filter((r) => selected.has(r.id));
  const selectedMode = selectedTargets.length > 0;
  const targets = selectedMode ? selectedTargets : unregistered;

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    const res = await registerRowsAction({
      batchId,
      rowIds: selectedMode ? selectedTargets.map((r) => r.id) : null,
    });
    setPending(false);
    setOpen(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    setLast(res.data);
    onDone(res.data);
    toast.success(
      `등록 ${res.data.registered}건 / 중복 제외 ${res.data.duplicate}건 / 오류 제외 ${res.data.error}건`
    );
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-[#1e3a5f]/15 bg-[#1e3a5f]/5 px-3 py-2">
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={targets.length === 0 || pending}
        className="bg-[#1e3a5f] hover:bg-[#162d4a]"
      >
        <DatabaseZap className="h-4 w-4" />
        {selectedMode
          ? `선택 ${targets.length.toLocaleString("ko-KR")}건 기존 DB 등록`
          : `정상 전체 ${targets.length.toLocaleString("ko-KR")}건 기존 DB 등록`}
      </Button>

      {last ? (
        <p className="text-sm text-slate-700">
          최근 등록 결과: <b className="text-emerald-700">성공 {last.registered}</b> ·{" "}
          <b className="text-amber-700">중복 제외 {last.duplicate}</b> ·{" "}
          <b className="text-red-700">오류 제외 {last.error}</b>
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          체크한 행이 있으면 선택한 행만 등록합니다. 등록 직전 서버에서 중복을 다시 확인합니다.
        </p>
      )}

      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 DB 등록</AlertDialogTitle>
            <AlertDialogDescription>
              정상 DB {targets.length.toLocaleString("ko-KR")}건을 기존 DB에 등록하시겠습니까?
              <br />
              등록 직전 다른 사용자가 먼저 등록한 연락처는 중복으로 제외됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <Button onClick={confirm} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              등록
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}