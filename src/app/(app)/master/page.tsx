import Link from "next/link";
import { ChevronLeft, ChevronRight, ScanSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneSearchInput } from "@/components/phone-search-input";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { getAppSettings } from "@/lib/settings";
import { formatKst } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { buildMasterQuery, filtersToQuery, parseMasterFilters, phoneMode } from "@/lib/master-query";
import { MasterTable, type MasterRow } from "./master-table";

const PAGE_SIZE = 50;

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30";

type Record = {
  id: string;
  name: string;
  phone_encrypted: string;
  rrn_masked: string | null;
  created_at: string;
  created_by: string;
  source_batch_id: string | null;
};

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireRole(["super_admin", "admin"]);
  const f = parseMasterFilters(await searchParams);
  const settings = await getAppSettings();
  const admin = createAdminClient();

  const { data: users } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .order("email")
    .returns<{ id: string; email: string; display_name: string | null }[]>();
  const userLabel = new Map((users ?? []).map((u) => [u.id, u.display_name ?? u.email]));

  const pm = phoneMode(f.phone);
  let rows: MasterRow[] = [];
  let total = 0;

  if (pm.kind !== "invalid") {
    const from = (f.page - 1) * PAGE_SIZE;
    const { data, count } = await buildMasterQuery(
      admin,
      "id, name, phone_encrypted, rrn_masked, created_at, created_by, source_batch_id",
      f,
      "exact"
    )
      .order("created_at", { ascending: false })
      .order("source_seq", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<Record[]>();

    total = count ?? 0;
    rows = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      phone: formatPhone(decrypt(r.phone_encrypted)),
      rrn: settings.rrn_enabled ? r.rrn_masked : null,
      createdAt: formatKst(r.created_at),
      createdBy: userLabel.get(r.created_by) ?? "-",
      batchId: r.source_batch_id,
    }));

    await writeAudit({
      userId: user.id,
      action: "view_master",
      targetType: "master_db",
      metadata: { page: f.page, shown: rows.length, searched: !!(f.name || f.phone || f.from || f.to || f.by || f.batch) },
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDelete = user.role === "super_admin";
  const canDownload = user.role === "super_admin" || user.canDownloadMaster;
  const tableKey = filtersToQuery(f, f.page) || "all";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">기존 DB 관리</h1>
          <p className="mt-1 text-sm text-slate-500">중복 검사 기준이 되는 기존 저장 DB입니다.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/inspect" />} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
          <ScanSearch className="h-4 w-4" />
          검수 후 기존 DB 등록
        </Button>
      </div>

      {/* 검색 */}
      <form method="get" className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">이름</Label>
          <Input name="name" defaultValue={f.name} placeholder="이름" maxLength={30} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">연락처</Label>
          <PhoneSearchInput defaultValue={f.phone} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">등록일 시작</Label>
          <Input type="date" name="from" defaultValue={f.from} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">등록일 끝</Label>
          <Input type="date" name="to" defaultValue={f.to} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">등록자</Label>
          <select name="by" defaultValue={f.by} className={selectClass}>
            <option value="">전체</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name ?? u.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">등록 배치 ID</Label>
          <Input name="batch" defaultValue={f.batch} placeholder="배치 ID 전체" />
        </div>
        <div className="flex gap-2 md:col-span-6 md:justify-end">
          <Button nativeButton={false} variant="outline" render={<Link href="/master" />}>
            초기화
          </Button>
          <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#162d4a]">
            <Search className="h-4 w-4" />
            검색
          </Button>
        </div>
      </form>

      {pm.kind === "invalid" && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          연락처는 전체 번호(010-0000-0000) 또는 뒤 4자리로 검색하세요.
        </p>
      )}

      <MasterTable
        key={tableKey}
        rows={rows}
        total={total}
        rrnEnabled={settings.rrn_enabled}
        canDelete={canDelete}
        canDownload={canDownload}
        filters={{ name: f.name, phone: f.phone, from: f.from, to: f.to, by: f.by, batch: f.batch }}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            disabled={f.page <= 1}
            render={<Link href={`/master${filtersToQuery(f, f.page - 1)}`} />}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums text-slate-600">
            {f.page} / {totalPages}
          </span>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            disabled={f.page >= totalPages}
            render={<Link href={`/master${filtersToQuery(f, f.page + 1)}`} />}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}