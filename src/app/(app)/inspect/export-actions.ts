"use server";

import { assertUser, AuthError, isAdminRole, type CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { duplicateTypeLabel, type DuplicateType, type RowStatus } from "@/lib/inspect";
import { getAppSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { fileStampKst } from "@/lib/date";
import { CSV_MIME, XLSX_MIME, toCsvBase64, toXlsxBase64 } from "@/lib/export";
import type { ActionResult } from "@/lib/inspect-types";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES: RowStatus[] = ["normal", "duplicate", "error"];
const LABEL: Record<RowStatus, string> = { normal: "정상", duplicate: "중복", error: "오류" };
const PAGE = 1000;

type RowRecord = {
  original_order: number;
  source_file: string | null;
  source_sheet: string | null;
  source_row_number: number | null;
  name: string | null;
  phone_encrypted: string | null;
  rrn_encrypted: string | null;
  rrn_masked: string | null;
  raw_encrypted: string | null;
  duplicate_types: DuplicateType[];
  duplicate_of_order: number | null;
  error_reason: string | null;
};

async function assertBatchAccess(batchId: string, user: CurrentUser) {
  if (!UUID.test(batchId)) throw new AuthError("잘못된 요청입니다.");

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("inspection_batches")
    .select("id, user_id, rows_purged")
    .eq("id", batchId)
    .maybeSingle<{ id: string; user_id: string; rows_purged: boolean }>();

  if (!batch) throw new AuthError("검수 기록을 찾을 수 없습니다.");
  if (!isAdminRole(user.role) && batch.user_id !== user.id) throw new AuthError();
  if (batch.rows_purged) throw new AuthError("보관기간이 지나 개인정보가 삭제된 검수입니다.");
}

function sourceLabel(r: RowRecord): string {
  const n = r.source_row_number ?? "";
  if (r.source_file) return `${r.source_file}${r.source_sheet ? ` / ${r.source_sheet}` : ""} ${n}행`;
  return `${n}행`;
}

function duplicateReason(r: RowRecord): string {
  const parts: string[] = [];
  if (r.duplicate_types.includes("master")) parts.push("기존 DB 연락처 일치");
  if (r.duplicate_types.includes("internal") && r.duplicate_of_order) {
    parts.push(`입력 ${r.duplicate_of_order}번과 연락처 동일`);
  }
  return parts.join(" / ");
}

export async function exportRowsAction(input: {
  batchId: string;
  status: RowStatus;
  format: "xlsx" | "csv";
  bom: boolean;
}): Promise<ActionResult<{ filename: string; base64: string; mime: string }>> {
  try {
    const user = await assertUser();
    if (!STATUSES.includes(input.status)) throw new AuthError("잘못된 요청입니다.");
    if (input.format !== "xlsx" && input.format !== "csv") throw new AuthError("잘못된 요청입니다.");

    await assertBatchAccess(input.batchId, user);

    const settings = await getAppSettings();
    const rrnOn = settings.rrn_enabled;
    const fullRrn = rrnOn && user.canViewRrn;

    // 원본 순서대로 전부 조회 (1000건씩)
    const admin = createAdminClient();
    const records: RowRecord[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("inspection_rows")
        .select(
          "original_order, source_file, source_sheet, source_row_number, name, phone_encrypted, rrn_encrypted, rrn_masked, raw_encrypted, duplicate_types, duplicate_of_order, error_reason"
        )
        .eq("batch_id", input.batchId)
        .eq("status", input.status)
        .order("original_order", { ascending: true })
        .range(from, from + PAGE - 1)
        .returns<RowRecord[]>();

      if (error) throw new Error("다운로드 자료 조회에 실패했습니다.");
      records.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    if (records.length === 0) {
      return { ok: false, error: "다운로드할 자료가 없습니다." };
    }

    const phoneOf = (r: RowRecord) => (r.phone_encrypted ? formatPhone(decrypt(r.phone_encrypted)) : "");
    const rrnOf = (r: RowRecord) => {
      if (fullRrn && r.rrn_encrypted) {
        const d = decrypt(r.rrn_encrypted);
        return `${d.slice(0, 6)}-${d.slice(6)}`;
      }
      return r.rrn_masked ?? "";
    };

    const base = ["이름", "연락처", ...(rrnOn ? ["주민등록번호"] : [])];
    const baseRow = (r: RowRecord) => [r.name ?? "", phoneOf(r), ...(rrnOn ? [rrnOf(r)] : [])];

    let header: string[];
    let rows: string[][];

    if (input.status === "normal") {
      header = base;
      rows = records.map(baseRow);
    } else if (input.status === "duplicate") {
      header = [...base, "중복 유형", "중복 사유", "원본 행 번호"];
      rows = records.map((r) => [
        ...baseRow(r),
        duplicateTypeLabel(r.duplicate_types),
        duplicateReason(r),
        sourceLabel(r),
      ]);
    } else {
      header = [...base, "오류 사유", "원본 행 번호", "원본 데이터"];
      rows = records.map((r) => [
        ...baseRow(r),
        r.error_reason ?? "",
        sourceLabel(r),
        r.raw_encrypted ? decrypt(r.raw_encrypted) : "",
      ]);
    }

    const label = LABEL[input.status];
    const filename = `DB_${label}_${fileStampKst()}.${input.format}`;
    const base64 =
      input.format === "xlsx"
        ? toXlsxBase64(header, rows, label)
        : toCsvBase64(header, rows, input.bom);

    await writeAudit({
      userId: user.id,
      action: "export_inspection",
      targetType: "inspection_batch",
      targetId: input.batchId,
      metadata: { status: input.status, format: input.format, count: rows.length, fullRrn },
    });

    return {
      ok: true,
      data: { filename, base64, mime: input.format === "xlsx" ? XLSX_MIME : CSV_MIME },
    };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[export] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "다운로드 파일 생성에 실패했습니다." };
  }
}

export async function logCopyAction(input: {
  batchId: string;
  status: RowStatus;
  count: number;
  selectedOnly: boolean;
}): Promise<ActionResult<null>> {
  try {
    const user = await assertUser();
    await assertBatchAccess(input.batchId, user);
    await writeAudit({
      userId: user.id,
      action: "copy_inspection",
      targetType: "inspection_batch",
      targetId: input.batchId,
      metadata: {
        status: input.status,
        count: Number(input.count) || 0,
        selectedOnly: !!input.selectedOnly,
      },
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "기록 실패" };
  }
}