import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/date";

const PAGE_SIZE = 30;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30";

type BatchRecord = {
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

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const g = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v ?? "").trim();
  };

  const isAdmin = isAdminRole(user.role);
  const page = Math.max(1, Number(g("page")) || 1);
  const from = DATE.test(g("from")) ? g("from") : "";
  const to = DATE.test(g("to")) ? g("to") : "";
  const by = isAdmin && UUID.test(g("by")) ? g("by") : "";

  const admin = createAdminClient();

  const { data: users } = isAdmin
    ? await admin
        .from("profiles")
        .select("id, email, display_name")
        .order("email")
        .returns<{ id: string; email: string; display_name: string | null }[]>()
    : { data: [{ id: user.id, email: user.email, display_name: user.displayName }] };

  const userLabel = new Map((users ?? []).map((u) => [u.id, u.display_name ?? u.email]));

  let q = admin
    .from("inspection_batches")
    .select(
      "id, user_id, input_type, source_filename, total_count, normal_count, duplicate_count, error_count, registered_count, rows_purged, created_at",
      { count: "exact" }
    )
    .eq("purpose", "inspect")
    .order("created_at", { ascending: false });

  if (!isAdmin) q = q.eq("user_id", user.id);
  else if (by) q = q.eq("user_id", by);
  if (from) q = q.gte("created_at", new Date(`${from}T00:00:00+09:00`).toISOString());
  if (to) {
    q = q.lt("created_at", new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000).toISOString());
  }

  const start = (page - 1) * PAGE_SIZE;
  const { data, count } = await q.range(start, start + PAGE_SIZE - 1).returns<BatchRecord[]>();
  const batches = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (by) params.set("by", by);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/history${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">검수 기록</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdmin ? "전체 사용자의 검수 이력입니다." : "내가 수행한 검수 이력입니다."}
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">시작일</Label>
          <Input type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">종료일</Label>
          <Input type="date" name="to" defaultValue={to} />
        </div>
        {isAdmin ? (
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">작업자</Label>
            <select name="by" defaultValue={by} className={selectClass}>
              <option value="">전체</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ?? u.email}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-end justify-end gap-2">
          <Button nativeButton={false} variant="outline" render={<Link href="/history" />}>
            초기화
          </Button>
          <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#162d4a]">
            <Search className="h-4 w-4" />
            검색
          </Button>
        </div>
      </form>

      <p className="text-sm text-slate-600">
        총 <b className="tabular-nums">{total.toLocaleString("ko-KR")}</b>건
      </p>

      {batches.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          검수 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>검수 일시</TableHead>
                <TableHead>작업자</TableHead>
                <TableHead>입력</TableHead>
                <TableHead>파일명</TableHead>
                <TableHead className="text-right">전체</TableHead>
                <TableHead className="text-right">정상</TableHead>
                <TableHead className="text-right">중복</TableHead>
                <TableHead className="text-right">오류</TableHead>
                <TableHead className="text-right">등록</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-20 text-center">상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatKst(b.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{userLabel.get(b.user_id) ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{b.input_type === "file" ? "파일" : "텍스트"}</TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-slate-600" title={b.source_filename ?? ""}>
                    {b.source_filename ?? "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{b.total_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{b.normal_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{b.duplicate_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">{b.error_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.registered_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {b.rows_purged ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">개인정보 삭제됨</span>
                    ) : (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">보관 중</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link href={`/history/${b.id}`} />}
                    >
                      보기
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button nativeButton={false} variant="outline" size="sm" disabled={page <= 1} render={<Link href={pageLink(page - 1)} />}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums text-slate-600">
            {page} / {totalPages}
          </span>
          <Button nativeButton={false} variant="outline" size="sm" disabled={page >= totalPages} render={<Link href={pageLink(page + 1)} />}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}