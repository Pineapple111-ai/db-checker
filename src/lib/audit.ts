import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// 연락처·주민번호처럼 보이는 값은 감사 로그에 남기지 않음
const SENSITIVE = /(\+?82[\s-]?)?0?1[0-9][\s-]?\d{3,4}[\s-]?\d{4}|\d{6}\s*-?\s*\d{7}/g;

function scrub(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SENSITIVE, "[가림]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

export async function writeAudit(params: {
  userId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const h = await headers();
    const ip =
      h.get("x-nf-client-connection-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      user_id: params.userId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: scrub(params.metadata ?? {}),
      ip,
    });

    if (error) console.error("[audit] 기록 실패:", error.code);
  } catch {
    console.error("[audit] 기록 실패");
  }
}