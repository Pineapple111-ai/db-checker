"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckSquare, ClipboardCopy, FileDown, FileSpreadsheet, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { saveBase64File } from "@/lib/download-client";
import type { RowStatus } from "@/lib/inspect";
import type { ResultRow } from "@/lib/inspect-types";
import { exportRowsAction, logCopyAction } from "@/app/(app)/inspect/export-actions";

type Props = {
  batchId: string;
  status: RowStatus;
  rows: ResultRow[];
  rrnEnabled: boolean;
  selected: Set<string>;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

export function ResultToolbar({
  batchId,
  status,
  rows,
  rrnEnabled,
  selected,
  onSelectAll,
  onClearSelection,
}: Props) {
  const [bom, setBom] = useState(true);
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const copy = async (list: ResultRow[], selectedOnly: boolean) => {
    if (list.length === 0) {
      toast.error(selectedOnly ? "선택한 자료가 없습니다." : "복사할 자료가 없습니다.");
      return;
    }
    const text = list
      .map((r) => [r.name ?? "", r.phone ?? "", ...(rrnEnabled ? [r.rrn ?? ""] : [])].join("\t"))
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${list.length.toLocaleString("ko-KR")}건 복사했습니다.`);
      void logCopyAction({ batchId, status, count: list.length, selectedOnly });
    } catch {
      toast.error("복사에 실패했습니다. 브라우저 권한을 확인하세요.");
    }
  };

  const download = async (format: "xlsx" | "csv") => {
    if (downloading) return;
    if (rows.length === 0) {
      toast.error("다운로드할 자료가 없습니다.");
      return;
    }
    setDownloading(format);
    const res = await exportRowsAction({ batchId, status, format, bom });
    setDownloading(null);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    saveBase64File(res.data);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onSelectAll} disabled={rows.length === 0}>
        <CheckSquare className="h-4 w-4" />
        전체 선택
      </Button>
      <Button variant="outline" size="sm" onClick={onClearSelection} disabled={selectedRows.length === 0}>
        <Square className="h-4 w-4" />
        선택 해제
      </Button>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Button variant="outline" size="sm" onClick={() => copy(rows, false)} disabled={rows.length === 0}>
        <ClipboardCopy className="h-4 w-4" />
        전체 복사
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => copy(selectedRows, true)}
        disabled={selectedRows.length === 0}
      >
        <ClipboardCopy className="h-4 w-4" />
        선택 복사 {selectedRows.length > 0 && `(${selectedRows.length.toLocaleString("ko-KR")})`}
      </Button>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Button variant="outline" size="sm" onClick={() => download("xlsx")} disabled={!!downloading || rows.length === 0}>
        {downloading === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        엑셀 다운로드
      </Button>
      <Button variant="outline" size="sm" onClick={() => download("csv")} disabled={!!downloading || rows.length === 0}>
        {downloading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        CSV 다운로드
      </Button>

      <div className="ml-1 flex items-center gap-1.5">
        <Checkbox id={`bom-${status}`} checked={bom} onCheckedChange={(c) => setBom(!!c)} />
        <Label htmlFor={`bom-${status}`} className="text-xs text-slate-600">
          CSV 한글 깨짐 방지(BOM)
        </Label>
      </div>
    </div>
  );
}