import { AppSidebar } from "@/components/app-sidebar";
import { requireUser, ROLE_LABEL, isAdminRole } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const showUsers =
    user.role === "super_admin" || (isAdminRole(user.role) && user.canManageStaff);

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar
        email={user.email}
        displayName={user.displayName}
        roleLabel={ROLE_LABEL[user.role]}
        showUsers={showUsers}
        showMaster={isAdminRole(user.role)}
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}