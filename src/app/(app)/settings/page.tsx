import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/date";
import {
  ChecklistSection,
  PasswordSection,
  RetentionSection,
  RrnSection,
} from "./settings-client";

type SettingsRecord = {
  rrn_enabled: boolean;
  rrn_legal_basis: string | null;
  rrn_purpose: string | null;
  rrn_enabled_by: string | null;
  rrn_enabled_at: string | null;
  retention_days: number;
};

export default async function SettingsPage() {
  const user = await requireUser();
  const isSuper = user.role === "super_admin";

  let settings: SettingsRecord | null = null;
  let enabledInfo: string | null = null;

  if (isSuper) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("rrn_enabled, rrn_legal_basis, rrn_purpose, rrn_enabled_by, rrn_enabled_at, retention_days")
      .eq("id", 1)
      .single<SettingsRecord>();
    settings = data;

    if (data?.rrn_enabled && data.rrn_enabled_by) {
      const { data: p } = await admin
        .from("profiles")
        .select("email, display_name")
        .eq("id", data.rrn_enabled_by)
        .maybeSingle<{ email: string; display_name: string | null }>();
      enabledInfo = `${p?.display_name ?? p?.email ?? "-"} · ${data.rrn_enabled_at ? formatKst(data.rrn_enabled_at) : "-"}`;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">환경설정</h1>
        <p className="mt-1 text-sm text-slate-500">{user.email}</p>
      </div>

      <PasswordSection />

      {isSuper && settings && (
        <>
          <RrnSection
            enabled={settings.rrn_enabled}
            legalBasis={settings.rrn_legal_basis ?? ""}
            purpose={settings.rrn_purpose ?? ""}
            enabledInfo={enabledInfo}
          />
          <RetentionSection days={settings.retention_days} />
          <ChecklistSection />
        </>
      )}
    </div>
  );
}