"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Database, Loader2, RotateCcw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { ResultView } from "@/components/result-view";
import { buildUploadRows, type UploadedFile } from "@/lib/file-parse";
import type { ActionResult, InspectResult } from "@/lib/inspect-types";
import { inspectRowsAction, inspectTextAction } from "./actions";

const PLACEHOLDER = `여러 줄을 한 번에 붙여넣으세요. 예)
김민수 01012345678
이지은 / 010-9876-5432
박서준 | 010 5555 1234 | 직장인
엑셀에서 복사한 데이터도 그대로 붙여넣을 수 있습니다.`;

type InputMode = "text" | "file";

export function InspectClient({
  masterCount: initialMasterCount,
  rrnEnabled,
  canRegister,
}: {
  masterCount: number;
  rrnEnabled: boolean;
  canRegister: boolean;
}) {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [result, setResult] = useState<InspectResult | null>(null);
  const [masterCount, setMasterCount] = useState(initialMasterCount);
  const [pending, startTransition] = useTransition();

  const lineCount = useMemo(
    () => text.split(/\r?\n/).filter((l) => l.trim()).length,
    [text]
  );

  const handleResult = (res: ActionResult<InspectResult>) => {
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data);
    const s = res.data.summary;
    toast.success(`검수 완료: 정상 ${s.normal} / 중복 ${s.duplicate} / 오류 ${s.error}`);
  };

  const run = () => {
    if (pending) return;

    if (inputMode === "text") {
      if (!text.trim()) {
        toast.error("검수할 DB를 입력하세요.");
        return;
      }
      startTransition(async () => handleResult(await inspectTextAction(text)));
      return;
    }

    if (files.length === 0) {
      toast.error("업로드할 파일을 추가하세요.");
      return;
    }
    const missing = files.find((f) => f.mapping.name === null || f.mapping.phone === null);
    if (missing) {
      toast.error(`${missing.name}: 이름·연락처 컬럼을 지정하세요.`);
      return;
    }
    const payload = buildUploadRows(files, rrnEnabled);
    if (payload.rows.length === 0) {
      toast.error("검수할 데이터 행이 없습니다.");
      return;
    }
    startTransition(async () => handleResult(await inspectRowsAction(payload)));
  };

  const reset = () => {
    setText("");
    setFiles([]);
    setResult(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 상단 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">DB 검수</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <Database className="h-4 w-4" />
            기존 저장 DB {masterCount.toLocaleString("ko-KR")}건 기준으로 중복 검사합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="h-4 w-4" />
            초기화
          </Button>
          <Button onClick={run} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {pending ? "검수 중..." : "검수 실행"}
          </Button>
        </div>
      </div>

      {/* 입력 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
          <TabsList>
            <TabsTrigger value="text">텍스트 붙여넣기</TabsTrigger>
            <TabsTrigger value="file">
              엑셀·CSV 업로드 {files.length > 0 && `(${files.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4">
            <div className="mb-2 flex justify-end">
              <p className="text-xs text-slate-500">입력 {lineCount.toLocaleString("ko-KR")}줄</p>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              disabled={pending}
              spellCheck={false}
              className="h-80 overflow-y-auto field-sizing-fixed resize-y font-mono text-sm"
            />
          </TabsContent>

          <TabsContent value="file" className="mt-4">
            <FileUploadPanel files={files} onChange={setFiles} rrnEnabled={rrnEnabled} disabled={pending} />
          </TabsContent>
        </Tabs>

        {!rrnEnabled && (
          <p className="mt-3 text-xs text-slate-500">
            주민등록번호 처리 기능이 꺼져 있어 주민등록번호는 수집·저장·출력되지 않습니다.
          </p>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <ResultView
          key={result.batchId}
          initial={result}
          canRegister={canRegister}
          onRegistered={(n) => {
            setMasterCount((c) => c + n);
            setText("");
            setFiles([]);
            toast.info("등록 완료: 입력칸을 비웠습니다.");
          }}
        />
      )}
    </div>
  );
}