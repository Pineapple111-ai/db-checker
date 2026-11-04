import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResultView } from "@/components/result-view";
import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBatchResult } from "@/lib/load-batch-result";
import { formatKst } from "@/lib/date";

const UUID = /^[0-9a-f-]{36}$/i;

type BatchMeta = {
  id: string;
  user_id: string;
  input_type: "text" | "file";
  source_filename: string | null;
  total_count: number;
  normal_count: number;
  duplicate_count: number;
  error_count: number;
  registered_count: number;
  rows_purged: boolean;
  created_at: string;
};

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("inspection_batches")
    .select(
      "id, user_id, input_type, source_filename, total_count, normal_count, duplicate_count, error_count, registered_count, rows_purged, created_at"
    )
    .eq("id", id)
    .maybeSingle<BatchMeta>();

  if (!batch) notFound();
  if (!isAdminRole(user.role) && batch.user_id !== user.id) redirect("/history?denied=1");

  const { data: owner } = await admin
    .from("profiles")
    .select("email, display_name")
    .eq("id", batch.user_id)
    .maybeSingle<{ email: string; display_name: string | null }>();

  const result = batch.rows_purged ? null : await loadBatchResult(id, user);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">검수 상세</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatKst(batch.created_at)} · {owner?.display_name ?? owner?.email ?? "-"} ·{" "}
            {batch.input_type === "file" ? `파일 (${batch.source_filename ?? "-"})` : "텍스트"} · 등록{" "}
            {batch.registered_count.toLocaleString("ko-KR")}건
          </p>
        </div>
        <Button nativeButton={false} variant="outline" render={<Link href="/history" />}>
          <ArrowLeft className="h-4 w-4" />
          목록
        </Button>
      </div>

      {result ? (
        <ResultView initial={result} canRegister={isAdminRole(user.role)} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p className="mb-3">보관기간이 지나 이 검수의 개인정보는 삭제되었습니다. 통계만 남아 있습니다.</p>
          <p className="tabular-nums">
            전체 {batch.total_count} · 정상 {batch.normal_count} · 중복 {batch.duplicate_count} · 오류{" "}
            {batch.error_count} · 등록 {batch.registered_count}
          </p>
        </div>
      )}
    </div>
  );
}