"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { saveBase64File } from "@/lib/download-client";
import { deleteAllMasterAction, deleteMasterRowsAction, exportMasterAction } from "./actions";

export type MasterRow = {
  id: string;
  name: string;
  phone: string;
  rrn: string | null;
  createdAt: string;
  createdBy: string;
  batchId: string | null;
};

type Props = {
  rows: MasterRow[];
  total: number;
  rrnEnabled: boolean;
  canDelete: boolean;
  canDownload: boolean;
  filters: Record<string, string | number>;
};

export function MasterTable({ rows, total, rrnEnabled, canDelete, canDownload, filters }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<string[] | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());

  const runDelete = async () => {
    if (!targets || pending) return;
    setPending(true);
    const res = await deleteMasterRowsAction(targets);
    setPending(false);
    setTargets(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.data.deleted}건 삭제했습니다.`);
    setSelected(new Set());
    router.refresh();
  };

  const runDeleteAll = async () => {
    if (pending) return;
    setPending(true);
    const res = await deleteAllMasterAction(confirmText);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDeleteAllOpen(false);
    setConfirmText("");
    toast.success(`기존 DB ${res.data.deleted.toLocaleString("ko-KR")}건을 전체 삭제했습니다.`);
    setSelected(new Set());
    router.refresh();
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    const res = await exportMasterAction(filters);
    setDownloading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    saveBase64File(res.data);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          검색 결과 <b className="tabular-nums">{total.toLocaleString("ko-KR")}</b>건
        </p>
        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <Button variant="outline" size="sm" onClick={download} disabled={downloading || total === 0}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              검색 결과 엑셀 다운로드
            </Button>
          )}
          {canDelete && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargets([...selected])}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
                선택 삭제 {selected.size > 0 && `(${selected.size})`}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteAllOpen(true)}>
                <Trash2 className="h-4 w-4 text-red-600" />
                전체 삭제
              </Button>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          조회된 자료가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                {canDelete && (
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(!!c)} aria-label="전체 선택" />
                  </TableHead>
                )}
                <TableHead>이름</TableHead>
                <TableHead>연락처</TableHead>
                {rrnEnabled && <TableHead>주민등록번호</TableHead>}
                <TableHead>등록일</TableHead>
                <TableHead>등록자</TableHead>
                <TableHead>등록 배치</TableHead>
                {canDelete && <TableHead className="w-16 text-center">삭제</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  {canDelete && (
                    <TableCell>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{r.phone}</TableCell>
                  {rrnEnabled && <TableCell className="whitespace-nowrap tabular-nums">{r.rrn ?? "-"}</TableCell>}
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">{r.createdAt}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">{r.createdBy}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {r.batchId ? (
                      <Link href={`/master?batch=${r.batchId}`} className="text-[#1e3a5f] underline-offset-2 hover:underline">
                        {r.batchId.slice(0, 8)}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-center">
                      <Button variant="outline" size="sm" onClick={() => setTargets([r.id])}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 선택/개별 삭제 확인 */}
      <AlertDialog open={!!targets} onOpenChange={(o) => !o && !pending && setTargets(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 DB 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {targets?.length ?? 0}건을 기존 DB에서 삭제하시겠습니까? 삭제 후에는 같은 연락처가 중복으로 걸리지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <Button onClick={runDelete} disabled={pending} className="bg-red-600 hover:bg-red-700">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 전체 삭제 확인 */}
      <AlertDialog
        open={deleteAllOpen}
        onOpenChange={(o) => {
          if (pending) return;
          setDeleteAllOpen(o);
          if (!o) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 DB 전체 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              검색 조건과 관계없이 기존 DB 전체가 삭제되며 되돌릴 수 없습니다. 계속하려면 아래에{" "}
              <b>전체 삭제</b>를 입력하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="전체 삭제" disabled={pending} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <Button
              onClick={runDeleteAll}
              disabled={pending || confirmText !== "전체 삭제"}
              className="bg-red-600 hover:bg-red-700"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              전체 삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}