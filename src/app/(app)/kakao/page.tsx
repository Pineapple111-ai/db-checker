import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { formatKst, startOfTodayKstIso } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { KakaoClient, type KakaoRow } from "./kakao-client";
import type { KakaoStatus } from "./actions";

const PAGE_SIZE = 100;
const STATUSES: KakaoStatus[] = ["unchecked", "possible", "impossible"];

type MasterRecord = {
  id: string;
  name: string;
  phone_encrypted: string;
  created_at: string;
  kakao_status: KakaoStatus;
  kakao_checked_at: string | null;
  kakao_checked_by: string | null;
  kakao_memo: string | null;
};

export default async function KakaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  const sp = await searchParams;
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status: KakaoStatus = STATUSES.includes(rawStatus as KakaoStatus) ? (rawStatus as KakaoStatus) : "unchecked";
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);

  const admin = createAdminClient();

  // 상단 건수: 미확인은 전체, 가능/불가는 관리자=전체 / 직원=본인 분류
  const countFor = (s: KakaoStatus) => {
    let q = admin
      .from("master_db")
      .select("id", { count: "exact", head: true })
      .eq("kakao_target", true)
      .eq("kakao_status", s);
    if (s !== "unchecked" && !isAdmin) q = q.eq("kakao_checked_by", user.id);
    return q;
  };
  const [c1, c2, c3] = await Promise.all(STATUSES.map(countFor));
  const counts = { unchecked: c1.count ?? 0, possible: c2.count ?? 0, impossible: c3.count ?? 0 };

  // 목록
  let q = admin
    .from("master_db")
    .select("id, name, phone_encrypted, created_at, kakao_status, kakao_checked_at, kakao_checked_by, kakao_memo", {
      count: "exact",
    })
    .eq("kakao_target", true);

  if (status === "unchecked") {
    // 작업 목록: 미확인 + 오늘(한국시간) 분류한 건, 붙여넣은 순서
    const todayIso = startOfTodayKstIso();
    q = q
      .or(`kakao_status.eq.unchecked,kakao_checked_at.gte."${todayIso}"`)
      .order("source_seq", { ascending: true })
      .order("id", { ascending: true });
  } else {
    // 가능/불가 전체 이력
    q = q.eq("kakao_status", status);
    if (!isAdmin) q = q.eq("kakao_checked_by", user.id);
    q = q.order("kakao_checked_at", { ascending: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await q.range(from, from + PAGE_SIZE - 1).returns<MasterRecord[]>();
  const records = data ?? [];

  const checkerIds = [...new Set(records.map((r) => r.kakao_checked_by).filter((v): v is string => !!v))];
  const { data: profiles } = checkerIds.length
    ? await admin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", checkerIds)
        .returns<{ id: string; email: string; display_name: string | null }[]>()
    : { data: [] };
  const label = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));

  const rows: KakaoRow[] = records.map((r) => {
    const digits = decrypt(r.phone_encrypted);
    return {
      id: r.id,
      name: r.name,
      phone: formatPhone(digits),
      phoneDigits: digits,
      createdAt: formatKst(r.created_at),
      kakaoStatus: r.kakao_status,
      checkedAt: r.kakao_checked_at ? formatKst(r.kakao_checked_at) : null,
      checkedBy: r.kakao_checked_by ? label.get(r.kakao_checked_by) ?? "-" : null,
      canChange: isAdmin || r.kakao_status === "unchecked" || r.kakao_checked_by === user.id,
      memo: r.kakao_memo ?? "",
    };
  });

  await writeAudit({
    userId: user.id,
    action: "view_kakao_list",
    targetType: "master_db",
    metadata: { status, page, shown: rows.length },
  });

  const total = count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">카톡 분류</h1>
        <p className="mt-1 text-sm text-slate-500">
          DB 검수에서 등록한 번호를 붙여넣은 순서대로 카카오톡 친구 추가 가능 / 불가로 분류합니다.
        </p>
      </div>

      <KakaoClient
        key={`${status}-${page}`}
        rows={rows}
        status={status}
        counts={counts}
        countsScopeLabel={isAdmin ? "" : " (내 분류)"}
        total={total}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        isAdmin={isAdmin}
      />
    </div>
  );
}