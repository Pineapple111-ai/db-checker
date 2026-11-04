import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/normalize";
import { phoneLookupKey } from "@/lib/crypto";

export type MasterFilters = {
  name: string;
  phone: string;
  from: string;
  to: string;
  by: string;
  batch: string;
  page: number;
};

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMasterFilters(sp: Record<string, unknown>): MasterFilters {
  const g = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" ? s.trim() : typeof s === "number" ? String(s) : "";
  };
  const page = Math.max(1, Math.min(100_000, Number(g("page")) || 1));

  return {
    name: g("name").slice(0, 30),
    phone: g("phone").slice(0, 20),
    from: DATE.test(g("from")) ? g("from") : "",
    to: DATE.test(g("to")) ? g("to") : "",
    by: UUID.test(g("by")) ? g("by") : "",
    batch: UUID.test(g("batch")) ? g("batch") : "",
    page,
  };
}

export type PhoneMode =
  | { kind: "none" }
  | { kind: "full"; key: string }
  | { kind: "last4"; last4: string }
  | { kind: "invalid" };

export function phoneMode(phone: string): PhoneMode {
  if (!phone) return { kind: "none" };
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 4) return { kind: "last4", last4: digits };
  const p = normalizePhone(phone);
  if (p.ok) return { kind: "full", key: phoneLookupKey(p.digits) };
  return { kind: "invalid" };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function buildMasterQuery(
  admin: SupabaseClient,
  select: string,
  f: MasterFilters,
  count?: "exact"
) {
  let q = admin.from("master_db").select(select, count ? { count } : undefined);

  if (f.name) q = q.ilike("name", `%${escapeLike(f.name)}%`);

  const pm = phoneMode(f.phone);
  if (pm.kind === "full") q = q.eq("phone_lookup_key", pm.key);
  if (pm.kind === "last4") q = q.eq("phone_last4", pm.last4);

  if (f.from) q = q.gte("created_at", new Date(`${f.from}T00:00:00+09:00`).toISOString());
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00+09:00`).getTime() + 86_400_000;
    q = q.lt("created_at", new Date(end).toISOString());
  }
  if (f.by) q = q.eq("created_by", f.by);
  if (f.batch) q = q.eq("source_batch_id", f.batch);

  return q;
}

export function filtersToQuery(f: MasterFilters, page?: number): string {
  const p = new URLSearchParams();
  if (f.name) p.set("name", f.name);
  if (f.phone) p.set("phone", f.phone);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.by) p.set("by", f.by);
  if (f.batch) p.set("batch", f.batch);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}