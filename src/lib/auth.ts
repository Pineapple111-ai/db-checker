import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "super_admin" | "admin" | "staff";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  canViewRrn: boolean;
  canDownloadMaster: boolean;
  canManageStaff: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "최고 관리자",
  admin: "관리자",
  staff: "일반 직원",
};

export class AuthError extends Error {
  constructor(message = "권한이 없습니다.") {
    super(message);
    this.name = "AuthError";
  }
}

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  status: "active" | "disabled";
  can_view_rrn: boolean;
  can_download_master: boolean;
  can_manage_staff: boolean;
};

type LoadResult =
  | { state: "ok"; user: CurrentUser }
  | { state: "anonymous" }
  | { state: "disabled" };

const loadUser = cache(async (): Promise<LoadResult> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { state: "anonymous" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email, display_name, role, status, can_view_rrn, can_download_master, can_manage_staff")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (!data || data.status !== "active") return { state: "disabled" };

  return {
    state: "ok",
    user: {
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      role: data.role,
      canViewRrn: data.can_view_rrn,
      canDownloadMaster: data.can_download_master,
      canManageStaff: data.can_manage_staff,
    },
  };
});

/** 현재 사용자 (없거나 비활성이면 null) */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const r = await loadUser();
  return r.state === "ok" ? r.user : null;
}

/** 페이지용: 로그인 필수 (아니면 리다이렉트) */
export async function requireUser(): Promise<CurrentUser> {
  const r = await loadUser();
  if (r.state === "anonymous") redirect("/login");
  if (r.state === "disabled") redirect("/auth/signout?reason=disabled");
  return r.user;
}

/** 페이지용: 역할 필수 */
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/?denied=1");
  return user;
}

/** 서버 액션·API용: 리다이렉트 대신 에러 */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("로그인이 필요합니다.");
  return user;
}

export async function assertRole(roles: Role[]): Promise<CurrentUser> {
  const user = await assertUser();
  if (!roles.includes(user.role)) throw new AuthError();
  return user;
}

export function isAdminRole(role: Role): boolean {
  return role === "super_admin" || role === "admin";
}