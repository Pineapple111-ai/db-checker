import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/date";
import { UsersClient, type UserRow } from "./users-client";

type ProfileRecord = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRow["role"];
  status: UserRow["status"];
  can_view_rrn: boolean;
  can_download_master: boolean;
  can_manage_staff: boolean;
  last_login_at: string | null;
  created_at: string;
};

export default async function UsersPage() {
  const user = await requireUser();
  const allowed = user.role === "super_admin" || (user.role === "admin" && user.canManageStaff);
  if (!allowed) redirect("/?denied=1");

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(
      "id, email, display_name, role, status, can_view_rrn, can_download_master, can_manage_staff, last_login_at, created_at"
    )
    .order("created_at", { ascending: true })
    .returns<ProfileRecord[]>();

  const users: UserRow[] = (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    displayName: p.display_name,
    role: p.role,
    status: p.status,
    canViewRrn: p.can_view_rrn,
    canDownloadMaster: p.can_download_master,
    canManageStaff: p.can_manage_staff,
    lastLoginAt: p.last_login_at ? formatKst(p.last_login_at) : null,
    createdAt: formatKst(p.created_at),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">사용자 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === "super_admin"
            ? "모든 계정의 역할과 세부 권한을 관리합니다."
            : "일반 직원 계정을 관리할 수 있습니다."}
        </p>
      </div>

      <UsersClient users={users} actorId={user.id} isSuper={user.role === "super_admin"} />
    </div>
  );
}