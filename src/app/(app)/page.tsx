import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst, startOfTodayKstIso } from "@/lib/date";
import { DashboardClient, type TodayBatch } from "./dashboard-client";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const admin = createAdminClient();
  const isAdmin = isAdminRole(user.role);

  const todayIso = startOfTodayKstIso();

  const kakaoCount = (s: "unchecked" | "possible" | "impossible", todayOnly: boolean) => {
    let q = admin
      .from("master_db")
      .select("id", { count: "exact", head: true })
      .eq("kakao_target", true)
      .eq("kakao_status", s);
    if (todayOnly) q = q.gte("kakao_checked_at", todayIso);
    if (s !== "unchecked" && !isAdmin) q = q.eq("kakao_checked_by", user.id);
    return q;
  };

  const [{ count: masterCount }, k1, k2, k3, reg] = await Promise.all([
    admin.from("master_db").select("id", { count: "exact", head: true }),
    kakaoCount("unchecked", false),
    kakaoCount("possible", true),
    kakaoCount("impossible", true),
        admin
      .from("master_db")
      .select("id", { count: "exact", head: true })
      .eq("kakao_target", true)
      .gte("created_at", todayIso),
  ]);

  const kakao = {
    unchecked: k1.count ?? 0,
    possibleToday: k2.count ?? 0,
    impossibleToday: k3.count ?? 0,
  };

  let query = admin
    .from("inspection_batches")
    .select(
      "id, user_id, input_type, source_filename, total_count, normal_count, duplicate_count, error_count, registered_count, rows_purged, created_at"
    )
    .eq("purpose", "inspect")
    .gte("created_at", startOfTodayKstIso())
    .order("created_at", { ascending: false });

  if (!isAdmin) query = query.eq("user_id", user.id);

  const { data } = await query.returns<BatchRecord[]>();
  const records = data ?? [];

  const userIds = [...new Set(records.map((b) => b.user_id))];
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", userIds)
        .returns<{ id: string; email: string; display_name: string | null }[]>()
    : { data: [] };
  const userLabel = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));

  const today = records.reduce(
    (acc, b) => ({
      total: acc.total + b.total_count,
      normal: acc.normal + b.normal_count,
      duplicate: acc.duplicate + b.duplicate_count,
      error: acc.error + b.error_count,
    }),
    { total: 0, normal: 0, duplicate: 0, error: 0 }
  );

  const batches: TodayBatch[] = records.map((b) => ({
    id: b.id,
    createdAt: formatKst(b.created_at),
    userLabel: userLabel.get(b.user_id) ?? "-",
    inputLabel: b.input_type === "file" ? `파일 · ${b.source_filename ?? "-"}` : "텍스트",
    total: b.total_count,
    normal: b.normal_count,
    duplicate: b.duplicate_count,
    error: b.error_count,
    registered: b.registered_count,
    purged: b.rows_purged,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {denied && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          해당 메뉴에 접근할 권한이 없습니다.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? "전체 사용자 기준 오늘 현황입니다." : "내 검수 기준 오늘 현황입니다."} 카드를 누르면 아래에 목록이 표시됩니다.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/inspect" />} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
          <ScanSearch className="h-4 w-4" />
          DB 검수 시작
        </Button>
      </div>

      <DashboardClient
        masterCount={masterCount ?? 0}
        today={today}
        batches={batches}
        canSeeMaster={isAdmin}
        kakao={kakao}
      />
    </div>
  );
}