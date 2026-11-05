"use server";

import { assertRole, assertUser, AuthError, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { getAppSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { fileStampKst, formatKst } from "@/lib/date";
import { XLSX_MIME, toXlsxBase64 } from "@/lib/export";
import { buildMasterQuery, parseMasterFilters, phoneMode } from "@/lib/master-query";
import type { ActionResult } from "@/lib/inspect-types";

const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = 1000;
const EXPORT_MAX = 50_000;

function fail(e: unknown, tag: string): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  console.error(`[${tag}] 실패:`, e instanceof Error ? e.message : "unknown");
  return { ok: false, error: "처리에 실패했습니다." };
}

export async function deleteMasterRowsAction(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const user = await assertRole(["super_admin"]);
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || ids.some((id) => !UUID.test(id))) {
      throw new AuthError("잘못된 요청입니다.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("master_db").delete().in("id", ids).select("id");
    if (error) throw new Error(error.message);

    const deleted = data?.length ?? 0;
    await writeAudit({
      userId: user.id,
      action: "delete_master_rows",
      targetType: "master_db",
      metadata: { requested: ids.length, deleted },
    });

    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e, "master-delete");
  }
}

export async function deleteAllMasterAction(confirmText: string): Promise<ActionResult<{ deleted: number }>> {
  try {
    const user = await assertRole(["super_admin"]);
    if (confirmText !== "전체 삭제") throw new AuthError("확인 문구가 일치하지 않습니다.");

    const admin = createAdminClient();
    const { count } = await admin.from("master_db").select("id", { count: "exact", head: true });

    const { error } = await admin.from("master_db").delete().not("id", "is", null);
    if (error) throw new Error(error.message);

    await writeAudit({
      userId: user.id,
      action: "delete_master_all",
      targetType: "master_db",
      metadata: { deleted: count ?? 0 },
    });

    return { ok: true, data: { deleted: count ?? 0 } };
  } catch (e) {
    return fail(e, "master-delete-all");
  }
}

type ExportRecord = {
  name: string;
  phone_encrypted: string;
  rrn_encrypted: string | null;
  rrn_masked: string | null;
  created_at: string;
  created_by: string;
  source_batch_id: string | null;
};

export async function exportMasterAction(
  rawFilters: Record<string, unknown>
): Promise<ActionResult<{ filename: string; base64: string; mime: string }>> {
  try {
    const user = await assertUser();
    const allowed = user.role === "super_admin" || (isAdminRole(user.role) && user.canDownloadMaster);
    if (!allowed) throw new AuthError("기존 DB 다운로드 권한이 없습니다.");

    const f = parseMasterFilters(rawFilters ?? {});
    if (phoneMode(f.phone).kind === "invalid") {
      return { ok: false, error: "연락처 검색 형식이 올바르지 않습니다." };
    }

    const admin = createAdminClient();

    const { count } = await buildMasterQuery(admin, "id", f, "exact").limit(1);
    if ((count ?? 0) === 0) return { ok: false, error: "다운로드할 자료가 없습니다." };
    if ((count ?? 0) > EXPORT_MAX) {
      return {
        ok: false,
        error: `한 번에 최대 ${EXPORT_MAX.toLocaleString()}건까지 다운로드할 수 있습니다. 검색 조건으로 범위를 좁혀주세요.`,
      };
    }

    const settings = await getAppSettings();
    const rrnOn = settings.rrn_enabled;
    const fullRrn = rrnOn && user.canViewRrn;

    const { data: users } = await admin
      .from("profiles")
      .select("id, email, display_name")
      .returns<{ id: string; email: string; display_name: string | null }[]>();
    const userLabel = new Map((users ?? []).map((u) => [u.id, u.display_name ?? u.email]));

    const records: ExportRecord[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await buildMasterQuery(
        admin,
        "name, phone_encrypted, rrn_encrypted, rrn_masked, created_at, created_by, source_batch_id",
        f
      )
        .order("created_at", { ascending: false })
        .order("source_seq", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
        .returns<ExportRecord[]>();

      if (error) throw new Error(error.message);
      records.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const header = ["이름", "연락처", ...(rrnOn ? ["주민등록번호"] : []), "등록일", "등록자", "등록 배치"];
    const rows = records.map((r) => {
      let rrn = r.rrn_masked ?? "";
      if (fullRrn && r.rrn_encrypted) {
        const d = decrypt(r.rrn_encrypted);
        rrn = `${d.slice(0, 6)}-${d.slice(6)}`;
      }
      return [
        r.name,
        formatPhone(decrypt(r.phone_encrypted)),
        ...(rrnOn ? [rrn] : []),
        formatKst(r.created_at),
        userLabel.get(r.created_by) ?? "",
        r.source_batch_id ?? "",
      ];
    });

    const filename = `DB_기존DB_${fileStampKst()}.xlsx`;
    const base64 = toXlsxBase64(header, rows, "기존DB");

    await writeAudit({
      userId: user.id,
      action: "export_master",
      targetType: "master_db",
      metadata: {
        count: rows.length,
        fullRrn,
        filters: { name: !!f.name, phone: !!f.phone, from: f.from, to: f.to, by: f.by, batch: f.batch },
      },
    });

    return { ok: true, data: { filename, base64, mime: XLSX_MIME } };
  } catch (e) {
    return fail(e, "master-export");
  }
}