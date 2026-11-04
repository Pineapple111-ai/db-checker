"use server";

import { assertRole, AuthError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import type { DuplicateType, RowStatus } from "@/lib/inspect";
import type { ActionResult } from "@/lib/inspect-types";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_IDS = 20_000;
const PAGE = 1000;
const CHUNK = 150;

export type RegisterOutcome = {
  registered: number;
  duplicate: number;
  error: number;
  updates: {
    id: string;
    status: RowStatus;
    registered: boolean;
    duplicateTypes: DuplicateType[];
  }[];
};

export async function registerRowsAction(input: {
  batchId: string;
  rowIds: string[] | null; // null = 정상 전체
}): Promise<ActionResult<RegisterOutcome>> {
  try {
    const user = await assertRole(["super_admin", "admin"]);

    if (!UUID.test(input.batchId)) throw new AuthError("잘못된 요청입니다.");

    const admin = createAdminClient();

    const { data: batch } = await admin
      .from("inspection_batches")
      .select("id, rows_purged")
      .eq("id", input.batchId)
      .maybeSingle<{ id: string; rows_purged: boolean }>();

    if (!batch) throw new AuthError("검수 기록을 찾을 수 없습니다.");
    if (batch.rows_purged) throw new AuthError("보관기간이 지나 개인정보가 삭제된 검수입니다.");

    // 대상 행 결정
    let ids: string[];
    if (input.rowIds) {
      if (!Array.isArray(input.rowIds) || input.rowIds.length > MAX_IDS || input.rowIds.some((id) => !UUID.test(id))) {
        throw new AuthError("잘못된 요청입니다.");
      }
      ids = [...new Set(input.rowIds)];
    } else {
      ids = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("inspection_rows")
          .select("id")
          .eq("batch_id", input.batchId)
          .eq("status", "normal")
          .eq("registered", false)
          .order("original_order", { ascending: true })
          .range(from, from + PAGE - 1)
          .returns<{ id: string }[]>();

        if (error) throw new Error("등록 대상 조회에 실패했습니다.");
        ids.push(...(data ?? []).map((d) => d.id));
        if (!data || data.length < PAGE) break;
      }
    }

    if (ids.length === 0) {
      return { ok: false, error: "등록할 정상 DB가 없습니다." };
    }

    // 트랜잭션 등록 (DB 함수 내부에서 UNIQUE 충돌 시 중복 재분류)
    const { data: counts, error: rpcError } = await admin.rpc("register_rows_to_master", {
      p_batch_id: input.batchId,
      p_row_ids: ids,
      p_user_id: user.id,
    });

    if (rpcError || !counts) throw new Error("기존 DB 등록에 실패했습니다.");

    const result = counts as { registered: number; duplicate: number; error: number };

    // 변경된 상태 다시 읽기
    const updates: RegisterOutcome["updates"] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from("inspection_rows")
        .select("id, status, registered, duplicate_types")
        .eq("batch_id", input.batchId)
        .in("id", part)
        .returns<{ id: string; status: RowStatus; registered: boolean; duplicate_types: DuplicateType[] }[]>();

      if (error) throw new Error("등록 결과 조회에 실패했습니다.");
      for (const d of data ?? []) {
        updates.push({
          id: d.id,
          status: d.status,
          registered: d.registered,
          duplicateTypes: d.duplicate_types,
        });
      }
    }

    await writeAudit({
      userId: user.id,
      action: "register_master",
      targetType: "inspection_batch",
      targetId: input.batchId,
      metadata: { requested: ids.length, ...result, selectedOnly: !!input.rowIds },
    });

    return { ok: true, data: { ...result, updates } };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[register] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: e instanceof Error ? e.message : "기존 DB 등록에 실패했습니다." };
  }
}