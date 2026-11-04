"use server";

import { assertUser, AuthError, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/inspect-types";

const UUID = /^[0-9a-f-]{36}$/i;
export type KakaoStatus = "unchecked" | "possible" | "impossible";
const STATUSES: KakaoStatus[] = ["unchecked", "possible", "impossible"];

const ERROR_MESSAGE: Record<string, string> = {
  invalid: "잘못된 요청입니다.",
  not_found: "삭제되었거나 없는 DB입니다.",
  not_target: "카톡 분류 대상이 아닌 DB입니다.",
  taken: "다른 직원이 먼저 분류했습니다.",
};

export async function setKakaoStatusAction(input: {
  id: string;
  status: KakaoStatus;
}): Promise<ActionResult<{ from: KakaoStatus; to: KakaoStatus }>> {
  try {
    const user = await assertUser();
    if (!UUID.test(input.id) || !STATUSES.includes(input.status)) {
      throw new AuthError("잘못된 요청입니다.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("set_kakao_status", {
      p_id: input.id,
      p_status: input.status,
      p_user: user.id,
      p_is_admin: isAdminRole(user.role),
    });
    if (error) throw new Error(error.message);

    const result = String(data);
    if (result.startsWith("error:")) {
      return { ok: false, error: ERROR_MESSAGE[result.slice(6)] ?? "처리에 실패했습니다." };
    }

    const from = result.slice(3) as KakaoStatus;

    await writeAudit({
      userId: user.id,
      action: "kakao_set_status",
      targetType: "master_db",
      targetId: input.id,
      metadata: { from, to: input.status },
    });

    return { ok: true, data: { from, to: input.status } };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[kakao-set] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "처리에 실패했습니다." };
  }
}

export async function setKakaoMemoAction(input: { id: string; memo: string }): Promise<ActionResult<null>> {
  try {
    const user = await assertUser();
    if (!UUID.test(input.id)) throw new AuthError("잘못된 요청입니다.");

    const memo = String(input.memo ?? "").trim().slice(0, 200);
    const admin = createAdminClient();

    let q = admin
      .from("master_db")
      .update({ kakao_memo: memo || null })
      .eq("id", input.id)
      .eq("kakao_target", true);

    // 직원: 미확인 건 또는 본인이 분류한 건만
    if (!isAdminRole(user.role)) {
      q = q.or(`kakao_status.eq.unchecked,kakao_checked_by.eq.${user.id}`);
    }

    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return { ok: false, error: "비고를 수정할 권한이 없습니다." };
    }

    await writeAudit({
      userId: user.id,
      action: "kakao_set_memo",
      targetType: "master_db",
      targetId: input.id,
      metadata: { length: memo.length },
    });

    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[kakao-memo] 실패:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "비고 저장에 실패했습니다." };
  }
}