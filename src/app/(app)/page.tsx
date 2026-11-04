import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfTodayKstIso } from "@/lib/date";

type BatchStat = {
  total_count: number;
  normal_count: number;
  duplicate_count: number;
  error_count: number;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const admin = createAdminClient();

  const { count: masterCount } = await admin
    .from("master_db")
    .select("id", { count: "exact", head: true });

  let query = admin
    .from("inspection_batches")
    .select("total_count, normal_count, duplicate_count, error_count")
    .eq("purpose", "inspect")
    .gte("created_at", startOfTodayKstIso());

  if (!isAdminRole(user.role)) {
    query = query.eq("user_id", user.id);
  }

  const { data: batches } = await query.returns<BatchStat[]>();

  const today = (batches ?? []).reduce(
    (acc, b) => ({
      total: acc.total + b.total_count,
      normal: acc.normal + b.normal_count,
      duplicate: acc.duplicate + b.duplicate_count,
      error: acc.error + b.error_count,
    }),
    { total: 0, normal: 0, duplicate: 0, error: 0 }
  );

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
            {isAdminRole(user.role) ? "전체 사용자 기준 오늘 현황입니다." : "내 검수 기준 오늘 현황입니다."}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/inspect" />}
          className="bg-[#1e3a5f] hover:bg-[#162d4a]"
        >
          <ScanSearch className="h-4 w-4" />
          DB 검수 시작
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="기존 저장 DB" value={masterCount ?? 0} icon={Database} />
        <StatCard label="오늘 검수" value={today.total} icon={ScanSearch} />
        <StatCard label="오늘 정상" value={today.normal} icon={CheckCircle2} tone="green" />
        <StatCard label="오늘 중복" value={today.duplicate} icon={Copy} tone="amber" />
        <StatCard label="오늘 오류" value={today.error} icon={AlertTriangle} tone="red" />
      </div>
    </div>
  );
}