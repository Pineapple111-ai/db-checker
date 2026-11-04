import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentKeyVersion, encrypt, encryptNullable, phoneLookupKey } from "@/lib/crypto";
import { getAppSettings } from "@/lib/settings";
import { applyDuplicates, duplicateTypeLabel, summarize, validateRows } from "@/lib/inspect";
import { isAdminRole, type CurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { ParsedRow } from "@/lib/parse-text";
import type { InspectResult, ResultRow } from "@/lib/inspect-types";

const INSERT_CHUNK = 500;
const LOOKUP_CHUNK = 1000;

type MasterHit = {
  id: string;
  name: string;
  created_at: string;
  phone_lookup_key: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const RRN_IN_TEXT = /\d{6}\s*-?\s*\d[\dxX*]{6}/g;

/** 원본 문자열의 주민번호: 기능 OFF면 제거, ON이면 뒷자리 마스킹 */
function scrubRaw(raw: string, rrnEnabled: boolean): string {
  return raw.replace(RRN_IN_TEXT, (m) => {
    if (!rrnEnabled) return "[주민번호 제외]";
    const d = m.replace(/[\s-]/g, "");
    return `${d.slice(0, 6)}-${d[6]}******`;
  });
}

export async function runInspection(params: {
  parsed: ParsedRow[];
  user: CurrentUser;
  inputType: "text" | "file";
  sourceFilename: string | null;
}): Promise<InspectResult> {
  const { parsed, user, inputType, sourceFilename } = params;

  const settings = await getAppSettings();
  const admin = createAdminClient();

  // 1) 형식 검증
  const validated = validateRows(parsed, { enabled: settings.rrn_enabled, required: false });

  // 2) 연락처 검색 키
  const keyByDigits = new Map<string, string>();
  for (const r of validated) {
    if (r.phoneDigits && !keyByDigits.has(r.phoneDigits)) {
      keyByDigits.set(r.phoneDigits, phoneLookupKey(r.phoneDigits));
    }
  }

  // 3) 기존 DB 조회 (서버·DB에서만)
  const masterByKey = new Map<string, MasterHit>();
  for (const keys of chunk([...keyByDigits.values()], LOOKUP_CHUNK)) {
    const { data, error } = await admin.rpc("lookup_master_by_keys", { p_keys: keys });

    if (error) throw new Error("기존 DB 조회에 실패했습니다.");
    for (const m of (data as MasterHit[] | null) ?? []) masterByKey.set(m.phone_lookup_key, m);
  }

  const masterHits = new Map<string, string>();
  for (const [digits, key] of keyByDigits) {
    const m = masterByKey.get(key);
    if (m) masterHits.set(digits, m.id);
  }

  // 4) 중복 판정
  const finalRows = applyDuplicates(validated, masterHits);
  const summary = summarize(finalRows);

  // 5) 검수 기록 저장
  const { data: batch, error: batchError } = await admin
    .from("inspection_batches")
    .insert({
      user_id: user.id,
      input_type: inputType,
      purpose: "inspect",
      source_filename: sourceFilename,
      total_count: summary.total,
      normal_count: summary.normal,
      duplicate_count: summary.duplicate,
      error_count: summary.error,
    })
    .select("id")
    .single<{ id: string }>();

  if (batchError || !batch) throw new Error("검수 기록 생성에 실패했습니다.");

  const expiresAt = new Date(Date.now() + settings.retention_days * 86_400_000).toISOString();
  const keyVersion = currentKeyVersion();

  const records = finalRows.map((r) => ({
    batch_id: batch.id,
    original_order: r.order,
    source_file: r.sourceFile,
    source_sheet: r.sourceSheet,
    source_row_number: r.sourceRow,
    name: r.name,
    phone_encrypted: r.phoneDigits ? encrypt(r.phoneDigits) : null,
    phone_lookup_key: r.phoneDigits ? keyByDigits.get(r.phoneDigits)! : null,
    phone_last4: r.phoneDigits ? r.phoneDigits.slice(-4) : null,
    rrn_encrypted: settings.rrn_enabled ? encryptNullable(r.rrnDigits) : null,
    rrn_masked: settings.rrn_enabled ? r.rrnMasked : null,
    raw_encrypted: encrypt(scrubRaw(r.raw, settings.rrn_enabled)),
    status: r.status,
    duplicate_types: r.duplicateTypes,
    duplicate_master_id: r.duplicateMasterId,
    duplicate_of_order: r.duplicateOfOrder,
    error_reason: r.errorReasons.join(", ") || null,
    key_version: keyVersion,
    expires_at: expiresAt,
  }));

  // 6) 검수 행 저장 (실패 시 기록 전체 롤백)
  const idByOrder = new Map<number, string>();
  try {
    for (const part of chunk(records, INSERT_CHUNK)) {
      const { data, error } = await admin
        .from("inspection_rows")
        .insert(part)
        .select("id, original_order")
        .returns<{ id: string; original_order: number }[]>();

      if (error) throw error;
      for (const d of data ?? []) idByOrder.set(d.original_order, d.id);
    }
  } catch {
    await admin.from("inspection_batches").delete().eq("id", batch.id);
    throw new Error("검수 결과 저장에 실패했습니다.");
  }

  await writeAudit({
    userId: user.id,
    action: "inspect",
    targetType: "inspection_batch",
    targetId: batch.id,
    metadata: { inputType, ...summary },
  });

  // 7) 화면용 결과
  const parsedByOrder = new Map(parsed.map((p) => [p.order, p]));
  const masterById = new Map([...masterByKey.values()].map((m) => [m.id, m]));
  const canSeeMaster = isAdminRole(user.role);

  const rows: ResultRow[] = finalRows.map((r) => {
    const p = parsedByOrder.get(r.order);
    const m = r.duplicateMasterId ? masterById.get(r.duplicateMasterId) : undefined;

    return {
      id: idByOrder.get(r.order)!,
      order: r.order,
      sourceRow: r.sourceRow,
      sourceFile: r.sourceFile,
      sourceSheet: r.sourceSheet,
      name: r.name ?? p?.nameRaw ?? null,
      phone: r.phoneFormatted ?? p?.phoneRaw ?? null,
      rrn: settings.rrn_enabled ? r.rrnMasked : null,
      status: r.status,
      duplicateTypes: r.duplicateTypes,
      duplicateLabel: duplicateTypeLabel(r.duplicateTypes),
      duplicateOfOrder: r.duplicateOfOrder,
      masterName: canSeeMaster ? m?.name ?? null : null,
      masterCreatedAt: canSeeMaster ? m?.created_at ?? null : null,
      errorReason: r.errorReasons.join(", ") || null,
      raw: scrubRaw(r.raw, settings.rrn_enabled),
      registered: false,
    };
  });

  return { batchId: batch.id, summary, rows, rrnEnabled: settings.rrn_enabled };
}