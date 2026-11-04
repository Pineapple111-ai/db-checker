"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKst } from "@/lib/date";
import type { ResultRow } from "@/lib/inspect-types";

const PAGE_SIZE = 100;

type Kind = "normal" | "duplicate" | "error";

function sourceLabel(r: ResultRow): string {
  if (r.sourceFile) {
    return `${r.sourceFile}${r.sourceSheet ? ` / ${r.sourceSheet}` : ""} ${r.sourceRow}행`;
  }
  return `${r.sourceRow}행`;
}

function duplicateTarget(r: ResultRow): string {
  const parts: string[] = [];
  if (r.duplicateTypes.includes("master")) {
    parts.push(
      r.masterName
        ? `기존 DB: ${r.masterName} (${r.masterCreatedAt ? formatKst(r.masterCreatedAt).slice(0, 12) : "-"})`
        : "기존 DB 등록 번호"
    );
  }
  if (r.duplicateTypes.includes("internal") && r.duplicateOfOrder) {
    parts.push(`입력 ${r.duplicateOfOrder}번과 동일`);
  }
  return parts.join(" / ");
}

export function ResultTable({
  rows,
  kind,
  rrnEnabled,
  selected,
  onToggle,
  onTogglePage,
  onEdit,
}: {
  rows: ResultRow[];
  kind: Kind;
  rrnEnabled: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTogglePage: (ids: string[], checked: boolean) => void;
  onEdit?: (row: ResultRow) => void;
}) {
  const [page, setPage] = useState(1);

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-500">해당하는 자료가 없습니다.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const view = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const pageIds = view.map((r) => r.id);
  const pageAllChecked = pageIds.every((id) => selected.has(id));
  const showEdit = kind === "error" && !!onEdit;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={pageAllChecked}
                  onCheckedChange={(c) => onTogglePage(pageIds, !!c)}
                  aria-label="현재 페이지 전체 선택"
                />
              </TableHead>
              <TableHead className="w-16 text-center">순서</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>연락처</TableHead>
              {rrnEnabled && <TableHead>주민등록번호</TableHead>}
              {kind === "duplicate" && <TableHead>중복 유형</TableHead>}
              {kind === "duplicate" && <TableHead>중복 대상</TableHead>}
              {kind === "error" && <TableHead>오류 사유</TableHead>}
              {kind !== "normal" && <TableHead>원본 행</TableHead>}
              {kind === "error" && <TableHead>원본 데이터</TableHead>}
              {showEdit && <TableHead className="w-20 text-center">수정</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => onToggle(r.id)}
                    aria-label={`${r.order}번 선택`}
                  />
                </TableCell>
                <TableCell className="text-center tabular-nums text-slate-500">{r.order}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.name ?? <span className="text-slate-400">-</span>}
                  {r.registered && (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
                      등록됨
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.phone ?? <span className="text-slate-400">-</span>}
                </TableCell>
                {rrnEnabled && (
                  <TableCell className="whitespace-nowrap tabular-nums">{r.rrn ?? "-"}</TableCell>
                )}
                {kind === "duplicate" && (
                  <TableCell className="whitespace-nowrap">
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      {r.duplicateLabel}
                    </span>
                  </TableCell>
                )}
                {kind === "duplicate" && (
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">{duplicateTarget(r)}</TableCell>
                )}
                {kind === "error" && (
                  <TableCell className="whitespace-nowrap text-sm text-red-700">{r.errorReason}</TableCell>
                )}
                {kind !== "normal" && (
                  <TableCell className="whitespace-nowrap text-sm text-slate-500">{sourceLabel(r)}</TableCell>
                )}
                {kind === "error" && (
                  <TableCell className="max-w-xs truncate text-xs text-slate-500" title={r.raw}>
                    {r.raw}
                  </TableCell>
                )}
                {showEdit && (
                  <TableCell className="text-center">
                    <Button variant="outline" size="sm" onClick={() => onEdit!(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums text-slate-600">
            {current} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}