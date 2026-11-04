import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/reset-password", "/update-password", "/auth"];
const ACTIVITY_COOKIE = "last_activity";

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectTo = (path: string, reason?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = reason ? `?reason=${reason}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // 미로그인 → 로그인 페이지
  if (!user) {
    if (isPublic(pathname)) return response;
    return redirectTo("/login");
  }

  // 미사용 시간 초과 → 로그아웃
  const timeoutMin = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? "30");
  const last = Number(request.cookies.get(ACTIVITY_COOKIE)?.value ?? "0");
  const now = Date.now();

  if (last > 0 && now - last > timeoutMin * 60_000) {
    await supabase.auth.signOut();
    const res = redirectTo("/login", "idle");
    res.cookies.delete(ACTIVITY_COOKIE);
    return res;
  }

  // 로그인 상태에서 로그인 페이지 접근 → 대시보드
  if (pathname === "/login") {
    return redirectTo("/");
  }

  response.cookies.set(ACTIVITY_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};