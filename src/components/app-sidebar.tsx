"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  History,
  LayoutDashboard,
  LogOut,
  ScanSearch,
  Settings,
  Users,
} from "lucide-react";

type Props = {
  email: string;
  displayName: string | null;
  roleLabel: string;
  showUsers: boolean;
  showMaster: boolean;
};

export function AppSidebar({ email, displayName, roleLabel, showUsers, showMaster }: Props) {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "대시보드", icon: LayoutDashboard },
    { href: "/inspect", label: "DB 검수", icon: ScanSearch },
    ...(showMaster ? [{ href: "/master", label: "기존 DB 관리", icon: Database }] : []),
    { href: "/history", label: "검수 기록", icon: History },
    ...(showUsers ? [{ href: "/users", label: "사용자 관리", icon: Users }] : []),
    { href: "/settings", label: "환경설정", icon: Settings },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="border-b border-slate-200 bg-[#1e3a5f] text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0">
      <div className="flex items-center justify-between px-5 py-4 md:block">
        <Link href="/" className="text-base font-semibold tracking-tight">
          DB 검수 시스템
        </Link>
        <form action="/auth/signout" method="post" className="md:hidden">
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </form>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive(href)
                ? "bg-white text-[#1e3a5f] font-medium"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="hidden border-t border-white/10 px-5 py-4 md:block">
        <p className="truncate text-sm font-medium">{displayName ?? email}</p>
        <p className="truncate text-xs text-white/60">{email}</p>
        <p className="mt-1 text-xs text-white/60">{roleLabel}</p>
        <form action="/auth/signout" method="post" className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}