"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const REASON_MESSAGE: Record<string, string> = {
  idle: "장시간 사용하지 않아 자동 로그아웃되었습니다.",
  disabled: "비활성화된 계정입니다. 관리자에게 문의하세요.",
};

export function LoginForm({ reason }: { reason?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  const notice = reason ? REASON_MESSAGE[reason] : undefined;

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1e3a5f] text-white">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">DB 검수 시스템</h1>
        <p className="text-sm text-slate-500">등록된 계정으로 로그인하세요.</p>
      </div>

      {notice && !state?.error && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>
      )}

      {state?.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-[#1e3a5f] hover:bg-[#162d4a]"
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "로그인"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        계정은 관리자만 발급할 수 있습니다.
      </p>
    </div>
  );
}