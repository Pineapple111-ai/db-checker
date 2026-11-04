"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailHash } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS ?? "5");
  const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES ?? "15");

  const admin = createAdminClient();
  const key = emailHash(email);
  const now = new Date();

  const { data: attempt } = await admin
    .from("login_attempts")
    .select("fail_count, locked_until")
    .eq("email_hash", key)
    .maybeSingle<{ fail_count: number; locked_until: string | null }>();

  // 잠금 중
  if (attempt?.locked_until && new Date(attempt.locked_until) > now) {
    const remain = Math.ceil((new Date(attempt.locked_until).getTime() - now.getTime()) / 60_000);
    return { error: `로그인 시도가 잠겨 있습니다. 약 ${remain}분 후 다시 시도하세요.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // 실패
  if (error || !data.user) {
    const lockExpired = attempt?.locked_until && new Date(attempt.locked_until) <= now;
    const count = (lockExpired ? 0 : attempt?.fail_count ?? 0) + 1;
    const locked = count >= maxAttempts;

    await admin.from("login_attempts").upsert({
      email_hash: key,
      fail_count: locked ? 0 : count,
      locked_until: locked ? new Date(now.getTime() + lockMinutes * 60_000).toISOString() : null,
      updated_at: now.toISOString(),
    });

    await writeAudit({ userId: null, action: "login_failed", metadata: { locked } });

    return {
      error: locked
        ? `로그인 ${maxAttempts}회 실패로 ${lockMinutes}분간 잠겼습니다.`
        : `이메일 또는 비밀번호가 올바르지 않습니다. (${count}/${maxAttempts})`,
    };
  }

  // 계정 상태 확인
  const { data: profile } = await admin
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle<{ status: string }>();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    await writeAudit({ userId: data.user.id, action: "login_blocked_disabled" });
    return { error: "비활성화된 계정입니다. 관리자에게 문의하세요." };
  }

  // 성공
  await admin.from("login_attempts").delete().eq("email_hash", key);
  await admin.from("profiles").update({ last_login_at: now.toISOString() }).eq("id", data.user.id);
  await writeAudit({ userId: data.user.id, action: "login" });

  const cookieStore = await cookies();
  cookieStore.set("last_activity", String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/");
}