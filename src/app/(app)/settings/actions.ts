"use server";

import { z } from "zod";
import { assertRole, assertUser, AuthError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordProblem } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/inspect-types";

function fail(e: unknown, tag: string): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  console.error(`[${tag}] 실패:`, e instanceof Error ? e.message : "unknown");
  return { ok: false, error: "처리에 실패했습니다." };
}

/* ========== 내 비밀번호 변경 ========== */

export async function changePasswordAction(input: {
  current: string;
  next: string;
}): Promise<ActionResult<null>> {
  try {
    const user = await assertUser();
    const current = String(input.current ?? "");
    const next = String(input.next ?? "");

    if (!current) return { ok: false, error: "현재 비밀번호를 입력하세요." };
    const problem = passwordProblem(next);
    if (problem) return { ok: false, error: problem };
    if (current === next) return { ok: false, error: "현재 비밀번호와 다른 비밀번호를 사용하세요." };

    const supabase = await createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signError) return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { ok: false, error: "비밀번호 변경에 실패했습니다. 다른 비밀번호로 시도하세요." };

    await writeAudit({ userId: user.id, action: "change_own_password", targetType: "profile", targetId: user.id });
    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "change-password");
  }
}

/* ========== 주민등록번호 처리 설정 ========== */

const rrnSchema = z.object({
  enabled: z.boolean(),
  legalBasis: z.string().max(500),
  purpose: z.string().max(300),
  confirmed: z.boolean(),
});

export async function updateRrnSettingsAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const user = await assertRole(["super_admin"]);
    const parsed = rrnSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "입력값을 확인하세요." };

    const v = parsed.data;
    const legalBasis = v.legalBasis.trim();
    const purpose = v.purpose.trim();

    if (v.enabled) {
      if (legalBasis.length < 10) return { ok: false, error: "법적 처리 근거를 구체적으로 입력하세요. (10자 이상)" };
      if (purpose.length < 5) return { ok: false, error: "업무 목적을 입력하세요." };
      if (!v.confirmed) return { ok: false, error: "법적 근거 확인 항목에 체크하세요." };
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("app_settings")
      .update({
        rrn_enabled: v.enabled,
        rrn_legal_basis: legalBasis || null,
        rrn_purpose: purpose || null,
        rrn_enabled_by: v.enabled ? user.id : null,
        rrn_enabled_at: v.enabled ? now : null,
        updated_at: now,
      })
      .eq("id", 1);

    if (error) throw new Error(error.message);

    await writeAudit({
      userId: user.id,
      action: v.enabled ? "enable_rrn_processing" : "disable_rrn_processing",
      targetType: "app_settings",
      targetId: "1",
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "rrn-settings");
  }
}

/* ========== 저장된 주민번호 일괄 파기 ========== */

export async function purgeRrnDataAction(confirmText: string): Promise<ActionResult<{ master: number; rows: number }>> {
  try {
    const user = await assertRole(["super_admin"]);
    if (confirmText !== "주민번호 파기") throw new AuthError("확인 문구가 일치하지 않습니다.");

    const admin = createAdminClient();
    const filter = "rrn_encrypted.not.is.null,rrn_masked.not.is.null";

    const { data: m, error: e1 } = await admin
      .from("master_db")
      .update({ rrn_encrypted: null, rrn_masked: null })
      .or(filter)
      .select("id");
    if (e1) throw new Error(e1.message);

    const { data: r, error: e2 } = await admin
      .from("inspection_rows")
      .update({ rrn_encrypted: null, rrn_masked: null })
      .or(filter)
      .select("id");
    if (e2) throw new Error(e2.message);

    const result = { master: m?.length ?? 0, rows: r?.length ?? 0 };

    await writeAudit({
      userId: user.id,
      action: "purge_rrn_data",
      targetType: "app_settings",
      targetId: "1",
      metadata: result,
    });

    return { ok: true, data: result };
  } catch (e) {
    return fail(e, "rrn-purge");
  }
}

/* ========== 보관기간 ========== */

export async function updateRetentionAction(days: number): Promise<ActionResult<null>> {
  try {
    const user = await assertRole(["super_admin"]);
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return { ok: false, error: "보관기간은 1~365일 사이로 입력하세요." };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("app_settings")
      .update({ retention_days: n, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);

    await writeAudit({
      userId: user.id,
      action: "update_retention_days",
      targetType: "app_settings",
      targetId: "1",
      metadata: { days: n },
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "retention");
  }
}