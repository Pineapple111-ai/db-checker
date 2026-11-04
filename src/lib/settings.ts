import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppSettings = {
  rrn_enabled: boolean;
  rrn_legal_basis: string | null;
  rrn_purpose: string | null;
  retention_days: number;
};

export async function getAppSettings(): Promise<AppSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("rrn_enabled, rrn_legal_basis, rrn_purpose, retention_days")
    .eq("id", 1)
    .single<AppSettings>();

  if (error || !data) {
    throw new Error("환경설정을 불러오지 못했습니다.");
  }
  return data;
}