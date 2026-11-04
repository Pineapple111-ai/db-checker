"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MAX_FILES,
  columnLabel,
  dataRowCount,
  detectHeader,
  detectMapping,
  encodeCol,
  readSpreadsheet,
  type ColumnMapping,
  type UploadedFile,
} from "@/lib/file-parse";

type Props = {
  files: UploadedFile[];
  onChange: (updater: (prev: UploadedFile[]) => UploadedFile[]) => void;
  rrnEnabled: boolean;
  disabled: boolean;
};

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 disabled:opacity-50";

function formatSize(n: number) {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function FileUploadPanel({ files, onChange, rrnEnabled, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    if (files.length + list.length > MAX_FILES) {
      toast.error(`파일은 최대 ${MAX_FILES}개까지 추가할 수 있습니다.`);
      return;
    }

    setReading(true);
    const added: UploadedFile[] = [];

    for (const file of Array.from(list)) {
      try {
        const sheets = await readSpreadsheet(file);
        const firstIdx = Math.max(0, sheets.findIndex((s) => s.matrix.length > 0));
        const sheet = sheets[firstIdx];
        if (!sheet || sheet.matrix.length === 0) {
          toast.error(`${file.name}: 데이터가 없습니다.`);
          continue;
        }
        const hasHeader = detectHeader(sheet);
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          sheets,
          sheetIndex: firstIdx,
          hasHeader,
          mapping: detectMapping(sheet, hasHeader),
        });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "파일을 읽을 수 없습니다."}`);
      }
    }

    onChange((prev) => [...prev, ...added]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const update = (id: string, fn: (f: UploadedFile) => UploadedFile) =>
    onChange((prev) => prev.map((f) => (f.id === id ? fn(f) : f)));

  const move = (idx: number, dir: -1 | 1) =>
    onChange((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const remove = (id: string) => onChange((prev) => prev.filter((f) => f.id !== id));

  const setSheet = (id: string, sheetIndex: number) =>
    update(id, (f) => {
      const sheet = f.sheets[sheetIndex];
      const hasHeader = detectHeader(sheet);
      return { ...f, sheetIndex, hasHeader, mapping: detectMapping(sheet, hasHeader) };
    });

  const setHeader = (id: string, hasHeader: boolean) =>
    update(id, (f) => ({ ...f, hasHeader, mapping: detectMapping(f.sheets[f.sheetIndex], hasHeader) }));

  const setMap = (id: string, key: keyof ColumnMapping, value: string) =>
    update(id, (f) => ({ ...f, mapping: { ...f.mapping, [key]: value === "" ? null : Number(value) } }));

  return (
    <div className="space-y-4">
      {/* 드롭존 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && !reading) void addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver ? "border-[#1e3a5f] bg-[#1e3a5f]/5" : "border-slate-200 bg-slate-50"
        }`}
      >
        {reading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : (
          <Upload className="h-6 w-6 text-slate-400" />
        )}
        <p className="text-sm text-slate-600">파일을 여기로 끌어다 놓거나</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || reading}
        >
          파일 선택
        </Button>
        <p className="text-xs text-slate-400">XLSX · XLS · CSV / 파일당 10MB / 최대 {MAX_FILES}개</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />
      </div>

      {/* 파일 목록 */}
      {files.map((f, idx) => {
        const sheet = f.sheets[f.sheetIndex];
        const cols = Array.from({ length: sheet.colCount }, (_, i) => i);
        const mapped = new Set([f.mapping.name, f.mapping.phone, rrnEnabled ? f.mapping.rrn : null]);
        const preview = sheet.matrix.slice(0, 6);
        const missing = f.mapping.name === null || f.mapping.phone === null;

        return (
          <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#1e3a5f] text-xs text-white">
                  {idx + 1}
                </span>
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate text-sm font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatSize(f.size)} · 데이터 {dataRowCount(f).toLocaleString("ko-KR")}행
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => move(idx, -1)} disabled={disabled || idx === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => move(idx, 1)}
                  disabled={disabled || idx === files.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(f.id)} disabled={disabled}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">시트</Label>
                <select
                  className={selectClass}
                  value={f.sheetIndex}
                  onChange={(e) => setSheet(f.id, Number(e.target.value))}
                  disabled={disabled || f.sheets.length < 2}
                >
                  {f.sheets.map((s, i) => (
                    <option key={s.name + i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">헤더</Label>
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id={`header-${f.id}`}
                    checked={f.hasHeader}
                    onCheckedChange={(c) => setHeader(f.id, !!c)}
                    disabled={disabled}
                  />
                  <Label htmlFor={`header-${f.id}`} className="text-sm">
                    첫 행이 헤더
                  </Label>
                </div>
              </div>

              {(
                [
                  ["name", "이름 *"],
                  ["phone", "연락처 *"],
                  ...(rrnEnabled ? [["rrn", "주민등록번호"]] : []),
                ] as [keyof ColumnMapping, string][]
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-slate-500">{label}</Label>
                  <select
                    className={`${selectClass} ${f.mapping[key] === null && key !== "rrn" ? "border-red-300" : ""}`}
                    value={f.mapping[key] ?? ""}
                    onChange={(e) => setMap(f.id, key, e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">선택 안 함</option>
                    {cols.map((c) => (
                      <option key={c} value={c}>
                        {columnLabel(sheet, c, f.hasHeader)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {missing && (
              <p className="mt-2 text-xs text-red-600">이름과 연락처 컬럼을 지정해야 검수할 수 있습니다.</p>
            )}

            {/* 미리보기 */}
            <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="w-12 px-2 py-1.5 text-left font-normal">행</th>
                    {cols.map((c) => (
                      <th
                        key={c}
                        className={`px-2 py-1.5 text-left font-normal ${mapped.has(c) ? "bg-blue-50 text-[#1e3a5f]" : ""}`}
                      >
                        {encodeCol(sheet.colOffset + c)}
                        {c === f.mapping.name && " (이름)"}
                        {c === f.mapping.phone && " (연락처)"}
                        {rrnEnabled && c === f.mapping.rrn && " (주민번호)"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr
                      key={ri}
                      className={`border-t border-slate-100 ${f.hasHeader && ri === 0 ? "bg-slate-50 font-medium" : ""}`}
                    >
                      <td className="px-2 py-1 text-slate-400">{sheet.rowOffset + ri + 1}</td>
                      {cols.map((c) => (
                        <td
                          key={c}
                          className={`max-w-40 truncate whitespace-nowrap px-2 py-1 ${mapped.has(c) ? "bg-blue-50/50" : ""}`}
                        >
                          {!rrnEnabled && c === f.mapping.rrn ? "" : r[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}