import { requireUser, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSettings } from "@/lib/settings";
import { InspectClient } from "./inspect-client";

export default async function InspectPage() {
  const user = await requireUser();

  const admin = createAdminClient();
  const [{ count }, settings] = await Promise.all([
    admin.from("master_db").select("id", { count: "exact", head: true }),
    getAppSettings(),
  ]);

  return (
    <InspectClient
      masterCount={count ?? 0}
      rrnEnabled={settings.rrn_enabled}
      canRegister={isAdminRole(user.role)}
    />
  );
}