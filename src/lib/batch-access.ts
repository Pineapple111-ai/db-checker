import "server-only";
import { AuthError, isAdminRole, type CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const UUID_RE = /^[0-9a-f-]{36}$/i;

/** 본인 검수이거나 관리자 이상인지, 개인정보가 아직 보관 중인지 */
export async function assertBatchAccess(batchId: string, user: CurrentUser) {
  if (!UUID_RE.test(batchId)) throw new AuthError("잘못된 요청입니다.");

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("inspection_batches")
    .select("id, user_id, rows_purged")
    .eq("id", batchId)
    .maybeSingle<{ id: string; user_id: string; rows_purged: boolean }>();

  if (!batch) throw new AuthError("검수 기록을 찾을 수 없습니다.");
  if (!isAdminRole(user.role) && batch.user_id !== user.id) throw new AuthError();
  if (batch.rows_purged) throw new AuthError("보관기간이 지나 개인정보가 삭제된 검수입니다.");
}