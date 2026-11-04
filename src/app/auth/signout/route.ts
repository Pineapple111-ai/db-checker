import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handle(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const reason = request.nextUrl.searchParams.get("reason");
  const url = new URL("/login", request.url);
  if (reason) url.searchParams.set("reason", reason);

  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.delete("last_activity");
  return res;
}

export const GET = handle;
export const POST = handle;