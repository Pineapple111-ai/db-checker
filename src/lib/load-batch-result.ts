import "server-only";
import { isAdminRole, type CurrentUser } from "@/lib/auth";
import { assertBatchAccess } from "@/lib/batch-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/normalize";
import { getAppSettings } from "@/lib/settings";
import { duplicateTypeLabel, summarize, type DuplicateType, type RowStatus } from "@/lib/inspect";
import { writeAudit } from "@/lib/audit";
import type { InspectResult, ResultRow } from "@/lib/inspect-types";

const PAGE = 1000;
const CHUNK = 150;

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

export async function loadBatchResult(batchId: string, user: CurrentUser): Promise<InspectResult> {
  await assertBatchAccess(batchId, user);

  const admin = createAdminClient();
  const settings = await getAppSettings();

  const records: RowRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("inspection_rows")
      .select(
        "id, original_order, source_file, source_sheet, source_row_number, name, phone_encrypted, rrn_masked, raw_encrypted, status, duplicate_types, duplicate_master_id, duplicate_of_order, error_reason, registered"
      )
      .eq("batch_id", batchId)
      .order("original_order", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<RowRecord[]>();

    if (error) throw new Error("검수 결과를 불러오지 못했습니다.");
    records.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // 기존 DB 등록자 정보 (관리자 이상만)
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
    action: "view_inspection",
    targetType: "inspection_batch",
    targetId: batchId,
    metadata: { rows: rows.length },
  });

  return {
    batchId,
    summary: summarize(rows.map((r) => ({ status: r.status }) as never)),
    rows,
    rrnEnabled: settings.rrn_enabled,
  };
}