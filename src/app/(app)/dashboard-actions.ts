"use server";

import { assertUser, AuthError, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { getAppSettings } from "@/lib/settings";
import { duplicateTypeLabel, type DuplicateType, type RowStatus } from "@/lib/inspect";
import { startOfTodayKstIso } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import type { ActionResult, ResultRow } from "@/lib/inspect-types";

const MAX_ROWS = 5000;
const PAGE = 1000;
const CHUNK = 150;
const STATUSES: RowStatus[] = ["normal", "duplicate", "error"];

type RowRecord = {
  id: string;
  original_order: number;
  source_file: string | null;
  source_sheet: string | null;
  source_row_number: number | null;
  name: string | null;
  phone_encrypted: string | null;
  rrn_masked: string | null;
  raw_encrypted: string | null;
  status: RowStatus;
  duplicate_types: DuplicateType[];
  duplicate_master_id: string | null;
  duplicate_of_order: number | null;
  error_reason: string | null;
  registered: boolean;
};

export async function getTodayRowsAction(
  status: RowStatus
): Promise<ActionResult<{ rows: ResultRow[]; truncated: boolean; rrnEnabled: boolean }>> {
  try {
    const user = await assertUser();
    if (!STATUSES.includes(status)) throw new AuthError("잘못된 요청입니다.");

    const admin = createAdminClient();

    let bq = admin
      .from("inspection_batches")
      .select("id")
      .eq("purpose", "inspect")
      .eq("rows_purged", false)
      .gte("created_at", startOfTodayKstIso())
      .order("created_at", { ascending: true });
    if (!isAdminRole(user.role)) bq = bq.eq("user_id", user.id);

    const { data: batches, error: batchError } = await bq.returns<{ id: string }[]>();
    if (batchError) throw new Error(batchError.message);

    const settings = await getAppSettings();
    const records: RowRecord[] = [];
    let truncated = false;

    outer: for (const b of batches ?? []) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("inspection_rows")
          .select(
            "id, original_order, source_file, source_sheet, source_row_number, name, phone_encrypted, rrn_masked, raw_encrypted, status, duplicate_types, duplicate_master_id, duplicate_of_order, error_reason, registered"
          )
          .eq("batch_id", b.id)
          .eq("status", status)
          .order("original_order", { ascending: true })
          .range(from, from + PAGE - 1)
          .returns<RowRecord[]>();

        if (error) throw new Error(error.message);
        for (const r of data ?? []) {
          if (records.length >= MAX_ROWS) {
            truncated = true;
            break outer;
          }
          records.push(r);
        }
        if (!data || data.length < PAGE) break;
      }
    }

    const canSeeMaster = isAdminRole(user.role);
    const masterById = new Map<string, { name: string; created_at: string }>();
    if (canSeeMaster) {
      const ids = [...new Set(records.map((r) => r.duplicate_master_id).filter((v): v is string => !!v))];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data } = await admin
          .from("master_db")
          .select("id, name, created_at")
          .in("id", ids.slice(i, i + CHUNK))
          .returns<{ id: string; name: string; created_at: string }[]>();
        for (const m of data ?? []) masterById.set(m.id, { name: m.name, created_at: m.created_at });
      }
    }

    const rows: ResultRow[] = records.map((r) => {
      const m = r.duplicate_master_id ? masterById.get(r.duplicate_master_id) : undefined;
      return {
        id: r.id,
        order: r.original_order,
        sourceRow: r.source_row_number ?? 0,
        sourceFile: r.source_file,
        sourceSheet: r.source_sheet,
        name: r.name,
        phone: r.phone_encrypted ? formatPhone(decrypt(r.phone_encrypted)) : null,
        rrn: settings.rrn_enabled ? r.rrn_masked : null,
        status: r.status,
        duplicateTypes: r.duplicate_types,
        duplicateLabel: duplicateTypeLabel(r.duplicate_types),
        duplicateOfOrder: r.duplicate_of_order,
        masterName: m?.name ?? null,
        masterCreatedAt: m?.created_at ?? null,
        errorReason: r.error_reason,
        raw: r.raw_encrypted ? decrypt(r.raw_encrypted) : "",
        registered: r.registered,
      };
    });

    await writeAudit({
      userId: user.id,
      action: "view_today_rows",
      targetType: "inspection_rows",
      metadata: { status, count: rows.length, truncated },
    });

    return { ok: true, data: { rows, truncated, rrnEnabled: settings.rrn_enabled } };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[dashboard-rows] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "목록을 불러오지 못했습니다." };
  }
}

export async function logDashboardCopyAction(input: { status: RowStatus; count: number }) {
  try {
    const user = await assertUser();
    await writeAudit({
      userId: user.id,
      action: "copy_today_rows",
      targetType: "inspection_rows",
      metadata: { status: input.status, count: Number(input.count) || 0 },
    });
  } catch {
    // 기록 실패는 무시
  }
}