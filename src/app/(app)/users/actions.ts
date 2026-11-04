"use server";

import { z } from "zod";
import { assertUser, AuthError, type CurrentUser, type Role } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/inspect-types";

const UUID = /^[0-9a-f-]{36}$/i;

type TargetProfile = { id: string; role: Role; status: "active" | "disabled" };

async function assertManager(): Promise<CurrentUser> {
  const u = await assertUser();
  if (u.role === "super_admin") return u;
  if (u.role === "admin" && u.canManageStaff) return u;
  throw new AuthError();
}

function passwordProblem(p: string): string | null {
  if (p.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return "비밀번호는 대문자·소문자·숫자·특수문자를 모두 포함해야 합니다.";
  }
  return null;
}

async function loadTarget(id: string): Promise<TargetProfile> {
  if (!UUID.test(id)) throw new AuthError("잘못된 요청입니다.");
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", id)
    .maybeSingle<TargetProfile>();
  if (!data) throw new AuthError("사용자를 찾을 수 없습니다.");
  return data;
}

function assertCanManageTarget(actor: CurrentUser, target: TargetProfile) {
  if (actor.role === "super_admin") return;
  if (target.role !== "staff") throw new AuthError("일반 직원 계정만 관리할 수 있습니다.");
}

async function otherActiveSuperAdmins(excludeId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "active")
    .neq("id", excludeId);
  return count ?? 0;
}

function fail(e: unknown, tag: string): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  console.error(`[${tag}] 실패:`, e instanceof Error ? e.message : "unknown");
  return { ok: false, error: "처리에 실패했습니다." };
}

/* ========== 생성 ========== */

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(72),
  displayName: z.string().trim().max(30),
  role: z.enum(["super_admin", "admin", "staff"]),
  canViewRrn: z.boolean(),
  canDownloadMaster: z.boolean(),
  canManageStaff: z.boolean(),
});

export async function createUserAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await assertManager();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "입력값을 확인하세요." };

    const v = parsed.data;
    const pwErr = passwordProblem(v.password);
    if (pwErr) return { ok: false, error: pwErr };

    // 관리자는 일반 직원만, 세부 권한 없이
    const role: Role = actor.role === "super_admin" ? v.role : "staff";
    const flags =
      actor.role === "super_admin"
        ? { can_view_rrn: v.canViewRrn, can_download_master: v.canDownloadMaster, can_manage_staff: v.canManageStaff }
        : { can_view_rrn: false, can_download_master: false, can_manage_staff: false };

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      app_metadata: { role },
    });

    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        return { ok: false, error: "이미 등록된 이메일입니다." };
      }
      throw new Error(error?.message ?? "계정 생성 실패");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ display_name: v.displayName || null, role, status: "active", ...flags })
      .eq("id", data.user.id);

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new Error(profileError.message);
    }

    await writeAudit({
      userId: actor.id,
      action: "create_user",
      targetType: "profile",
      targetId: data.user.id,
      metadata: { role, ...flags },
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "user-create");
  }
}

/* ========== 수정 ========== */

const updateSchema = z.object({
  id: z.string(),
  displayName: z.string().trim().max(30),
  role: z.enum(["super_admin", "admin", "staff"]),
  canViewRrn: z.boolean(),
  canDownloadMaster: z.boolean(),
  canManageStaff: z.boolean(),
});

export async function updateUserAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await assertManager();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "입력값을 확인하세요." };

    const v = parsed.data;
    const target = await loadTarget(v.id);
    assertCanManageTarget(actor, target);

    const admin = createAdminClient();

    if (actor.role !== "super_admin") {
      // 관리자는 직원 이름만 수정
      const { error } = await admin
        .from("profiles")
        .update({ display_name: v.displayName || null })
        .eq("id", target.id);
      if (error) throw new Error(error.message);
    } else {
      if (target.role === "super_admin" && v.role !== "super_admin") {
        if ((await otherActiveSuperAdmins(target.id)) === 0) {
          return { ok: false, error: "마지막 최고 관리자는 역할을 변경할 수 없습니다." };
        }
      }
      const { error } = await admin
        .from("profiles")
        .update({
          display_name: v.displayName || null,
          role: v.role,
          can_view_rrn: v.canViewRrn,
          can_download_master: v.canDownloadMaster,
          can_manage_staff: v.canManageStaff,
        })
        .eq("id", target.id);
      if (error) throw new Error(error.message);

      await admin.auth.admin.updateUserById(target.id, { app_metadata: { role: v.role } });
    }

    await writeAudit({
      userId: actor.id,
      action: "update_user",
      targetType: "profile",
      targetId: target.id,
      metadata: {
        fromRole: target.role,
        toRole: actor.role === "super_admin" ? v.role : target.role,
        canViewRrn: v.canViewRrn,
        canDownloadMaster: v.canDownloadMaster,
        canManageStaff: v.canManageStaff,
      },
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "user-update");
  }
}

/* ========== 활성 / 비활성 ========== */

export async function setUserStatusAction(input: {
  id: string;
  status: "active" | "disabled";
}): Promise<ActionResult<null>> {
  try {
    const actor = await assertManager();
    if (input.status !== "active" && input.status !== "disabled") throw new AuthError("잘못된 요청입니다.");

    const target = await loadTarget(input.id);
    assertCanManageTarget(actor, target);

    if (target.id === actor.id) return { ok: false, error: "본인 계정은 비활성화할 수 없습니다." };

    if (input.status === "disabled" && target.role === "super_admin") {
      if ((await otherActiveSuperAdmins(target.id)) === 0) {
        return { ok: false, error: "마지막 최고 관리자는 비활성화할 수 없습니다." };
      }
    }

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ status: input.status }).eq("id", target.id);
    if (error) throw new Error(error.message);

    await admin.auth.admin.updateUserById(target.id, {
      ban_duration: input.status === "disabled" ? "876000h" : "none",
    });

    await writeAudit({
      userId: actor.id,
      action: input.status === "disabled" ? "disable_user" : "enable_user",
      targetType: "profile",
      targetId: target.id,
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "user-status");
  }
}

/* ========== 비밀번호 재설정 ========== */

export async function resetPasswordAction(input: { id: string; password: string }): Promise<ActionResult<null>> {
  try {
    const actor = await assertManager();
    const target = await loadTarget(input.id);
    assertCanManageTarget(actor, target);

    const pw = String(input.password ?? "");
    const pwErr = passwordProblem(pw);
    if (pwErr) return { ok: false, error: pwErr };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(target.id, { password: pw });
    if (error) throw new Error(error.message);

    await writeAudit({
      userId: actor.id,
      action: "reset_user_password",
      targetType: "profile",
      targetId: target.id,
    });

    return { ok: true, data: null };
  } catch (e) {
    return fail(e, "user-reset-password");
  }
}