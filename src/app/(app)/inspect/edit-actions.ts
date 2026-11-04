"use server";

import { assertUser, AuthError, isAdminRole } from "@/lib/auth";
import { assertBatchAccess, UUID_RE } from "@/lib/batch-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentKeyVersion, decrypt, encrypt, encryptNullable, phoneLookupKey } from "@/lib/crypto";
import { getAppSettings } from "@/lib/settings";
import { duplicateTypeLabel, validateRows, type DuplicateType, type RowStatus } from "@/lib/inspect";
import { writeAudit } from "@/lib/audit";
import type { ActionResult, ResultRow } from "@/lib/inspect-types";

type RowRecord = {
  id: string;
  original_order: number;
  source_file: string | null;
  source_sheet: string | null;
  source_row_number: number | null;
  status: RowStatus;
  raw_encrypted: string | null;
};

const RRN_IN_TEXT = /\d{6}\s*-?\s*\d[\dxX*]{6}/g;

export async function reinspectRowAction(input: {
  batchId: string;
  rowId: string;
  name: string;
  phone: string;
  rrn: string;
}): Promise<ActionResult<ResultRow>> {
  try {
    const user = await assertUser();
    if (!UUID_RE.test(input.rowId)) throw new AuthError("잘못된 요청입니다.");
    await assertBatchAccess(input.batchId, user);

    const name = String(input.name ?? "").slice(0, 100);
    const phone = String(input.phone ?? "").slice(0, 50);
    const rrn = String(input.rrn ?? "").slice(0, 50);

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("inspection_rows")
      .select("id, original_order, source_file, source_sheet, source_row_number, status, raw_encrypted")
      .eq("id", input.rowId)
      .eq("batch_id", input.batchId)
      .maybeSingle<RowRecord>();

    if (!row) throw new AuthError("대상 행을 찾을 수 없습니다.");
    if (row.status !== "error") throw new AuthError("오류 행만 수정할 수 있습니다.");

    const settings = await getAppSettings();

    // 1) 형식 재검증
    const [v] = validateRows(
      [
        {
          order: row.original_order,
          sourceRow: row.source_row_number ?? 0,
          sourceFile: row.source_file,
          sourceSheet: row.source_sheet,
          raw: "",
          nameRaw: name.trim() || null,
          phoneRaw: phone.trim() || null,
          rrnRaw: settings.rrn_enabled ? rrn.trim() || null : null,
          parseError: null,
        },
      ],
      { enabled: settings.rrn_enabled, required: false }
    );

    if (v.status === "error") {
      await admin
        .from("inspection_rows")
        .update({ error_reason: v.errorReasons.join(", ") })
        .eq("id", row.id);
      return { ok: false, error: `수정 후에도 오류: ${v.errorReasons.join(", ")}` };
    }

    const digits = v.phoneDigits!;
    const key = phoneLookupKey(digits);

    // 2) 기존 DB 중복
    const { data: master } = await admin
      .from("master_db")
      .select("id, name, created_at")
      .eq("phone_lookup_key", key)
      .maybeSingle<{ id: string; name: string; created_at: string }>();

    // 3) 같은 검수 내 중복 (이미 정상/중복으로 확정된 다른 행)
    const { data: prev } = await admin
      .from("inspection_rows")
      .select("original_order")
      .eq("batch_id", input.batchId)
      .eq("phone_lookup_key", key)
      .neq("status", "error")
      .neq("id", row.id)
      .order("original_order", { ascending: true })
      .limit(1)
      .maybeSingle<{ original_order: number }>();

    const types: DuplicateType[] = [];
    if (master) types.push("master");
    if (prev) types.push("internal");
    const status: RowStatus = types.length > 0 ? "duplicate" : "normal";

    const { error: updateError } = await admin
      .from("inspection_rows")
      .update({
        name: v.name,
        phone_encrypted: encrypt(digits),
        phone_lookup_key: key,
        phone_last4: digits.slice(-4),
        rrn_encrypted: settings.rrn_enabled ? encryptNullable(v.rrnDigits) : null,
        rrn_masked: settings.rrn_enabled ? v.rrnMasked : null,
        status,
        duplicate_types: types,
        duplicate_master_id: master?.id ?? null,
        duplicate_of_order: prev?.original_order ?? null,
        error_reason: null,
        key_version: currentKeyVersion(),
      })
      .eq("id", row.id)
      .eq("status", "error");

    if (updateError) throw new Error("수정 내용 저장에 실패했습니다.");

    // 4) 검수 기록 건수 갱신
    const statuses: RowStatus[] = ["normal", "duplicate", "error"];
    const counts = await Promise.all(
      statuses.map((s) =>
        admin
          .from("inspection_rows")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", input.batchId)
          .eq("status", s)
      )
    );
    await admin
      .from("inspection_batches")
      .update({
        normal_count: counts[0].count ?? 0,
        duplicate_count: counts[1].count ?? 0,
        error_count: counts[2].count ?? 0,
      })
      .eq("id", input.batchId);

    await writeAudit({
      userId: user.id,
      action: "edit_error_row",
      targetType: "inspection_row",
      targetId: row.id,
      metadata: { batchId: input.batchId, newStatus: status },
    });

    const canSeeMaster = isAdminRole(user.role);
    const rawPlain = row.raw_encrypted ? decrypt(row.raw_encrypted) : "";

    return {
      ok: true,
      data: {
        id: row.id,
        order: row.original_order,
        sourceRow: row.source_row_number ?? 0,
        sourceFile: row.source_file,
        sourceSheet: row.source_sheet,
        name: v.name,
        phone: v.phoneFormatted,
        rrn: settings.rrn_enabled ? v.rrnMasked : null,
        status,
        duplicateTypes: types,
        duplicateLabel: duplicateTypeLabel(types),
        duplicateOfOrder: prev?.original_order ?? null,
        masterName: canSeeMaster ? master?.name ?? null : null,
        masterCreatedAt: canSeeMaster ? master?.created_at ?? null : null,
        errorReason: null,
        raw: settings.rrn_enabled ? rawPlain : rawPlain.replace(RRN_IN_TEXT, "[주민번호 제외]"),
        registered: false,
      },
    };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[edit-row] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "수정 처리에 실패했습니다." };
  }
}