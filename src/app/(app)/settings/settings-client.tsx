"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  changePasswordAction,
  purgeRrnDataAction,
  updateRetentionAction,
  updateRrnSettingsAction,
} from "./actions";

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ========== 비밀번호 변경 (모든 사용자) ========== */

export function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    if (next !== confirm) {
      toast.error("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setPending(true);
    const res = await changePasswordAction({ current, next });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("비밀번호를 변경했습니다.");
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <Section title="내 비밀번호 변경" desc="10자 이상, 대문자·소문자·숫자·특수문자를 모두 포함해야 합니다.">
      <div className="grid max-w-md gap-3">
        <div className="space-y-1.5">
          <Label>현재 비밀번호</Label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" disabled={pending} />
        </div>
        <div className="space-y-1.5">
          <Label>새 비밀번호</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" disabled={pending} />
        </div>
        <div className="space-y-1.5">
          <Label>새 비밀번호 확인</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" disabled={pending} />
        </div>
        <div>
          <Button onClick={submit} disabled={pending || !current || !next} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            변경
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ========== 주민등록번호 처리 (최고 관리자) ========== */

export function RrnSection({
  enabled,
  legalBasis,
  purpose,
  enabledInfo,
}: {
  enabled: boolean;
  legalBasis: string;
  purpose: string;
  enabledInfo: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [basis, setBasis] = useState(legalBasis);
  const [purp, setPurp] = useState(purpose);
  const [confirmed, setConfirmed] = useState(false);
  const [purgeText, setPurgeText] = useState("");
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (pending) return;
    setPending(true);
    const res = await updateRrnSettingsAction({ enabled: on, legalBasis: basis, purpose: purp, confirmed });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(on ? "주민등록번호 처리를 활성화했습니다." : "주민등록번호 처리를 비활성화했습니다.");
    setConfirmed(false);
    router.refresh();
  };

  const purge = async () => {
    if (pending) return;
    setPending(true);
    const res = await purgeRrnDataAction(purgeText);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`파기 완료: 기존 DB ${res.data.master}건, 검수 행 ${res.data.rows}건`);
    setPurgeText("");
  };

  return (
    <Section
      title="주민등록번호 처리"
      desc="주민등록번호는 법령상 처리 근거가 있는 경우에만 수집·처리할 수 있습니다. 근거가 없으면 반드시 꺼두세요."
    >
      <div className="space-y-4">
        <div
          className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
            enabled ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600"
          }`}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            현재 상태: <b>{enabled ? "활성" : "비활성"}</b>
            {enabled && enabledInfo && ` · ${enabledInfo}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="rrn-on" checked={on} onCheckedChange={(c) => setOn(!!c)} disabled={pending} />
          <Label htmlFor="rrn-on">주민등록번호 처리 사용</Label>
        </div>

        {on && (
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>법적 처리 근거 (법령명·조항)</Label>
              <Textarea
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                maxLength={500}
                disabled={pending}
                placeholder="예: ○○법 제○조 제○항에 따른 본인확인"
              />
            </div>
            <div className="space-y-1.5">
              <Label>업무 목적</Label>
              <Input value={purp} onChange={(e) => setPurp(e.target.value)} maxLength={300} disabled={pending} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="rrn-confirm" checked={confirmed} onCheckedChange={(c) => setConfirmed(!!c)} disabled={pending} />
              <Label htmlFor="rrn-confirm" className="text-sm leading-snug">
                위 법적 근거를 확인했으며, 전체 번호가 필요한 업무에만 사용하겠습니다.
              </Label>
            </div>
          </div>
        )}

        <Button onClick={save} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          설정 저장
        </Button>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">저장된 주민등록번호 일괄 파기</p>
          <p className="mt-1 text-xs text-slate-500">
            기존 DB와 검수 행에 저장된 주민등록번호(암호문·마스킹값)를 모두 삭제합니다. 되돌릴 수 없습니다. 계속하려면{" "}
            <b>주민번호 파기</b>를 입력하세요.
          </p>
          <div className="mt-2 flex max-w-md gap-2">
            <Input value={purgeText} onChange={(e) => setPurgeText(e.target.value)} placeholder="주민번호 파기" disabled={pending} />
            <Button
              onClick={purge}
              disabled={pending || purgeText !== "주민번호 파기"}
              className="bg-red-600 hover:bg-red-700"
            >
              파기
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ========== 보관기간 (최고 관리자) ========== */

export function RetentionSection({ days }: { days: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(days));
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (pending) return;
    setPending(true);
    const res = await updateRetentionAction(Number(value));
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("보관기간을 저장했습니다.");
    router.refresh();
  };

  return (
    <Section
      title="검수 개인정보 보관기간"
      desc="검수 원본·결과의 개인정보는 기간이 지나면 자동 삭제되고 통계만 남습니다. 새로 진행하는 검수부터 적용됩니다."
    >
      <div className="flex max-w-xs items-end gap-2">
        <div className="space-y-1.5">
          <Label>보관 일수</Label>
          <Input
            type="number"
            min={1}
            max={365}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
          />
        </div>
        <Button onClick={save} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          저장
        </Button>
      </div>
    </Section>
  );
}

/* ========== 배포 전 점검 ========== */

const CHECKLIST = [
  "실제 업무에서 주민등록번호를 처리할 법령상 근거가 있는지 확인 (없으면 기능 OFF 유지)",
  "개인정보 처리방침에 수집 항목·목적·보유기간·파기 방법 반영",
  "Supabase 리전이 국내(서울)인지 확인 — 국외 이전 해당 여부 점검",
  "DATA_ENCRYPTION_KEY · PHONE_HMAC_KEY 별도 안전한 곳에 백업, 소스코드·깃에 없음 확인",
  "관리자 계정 다중요소 인증(OTP) 등록",
  "공개 회원가입 OFF, 퇴사자 계정 즉시 비활성화 절차 마련",
  "접근 기록(감사 로그) 정기 점검 담당자 지정",
  "보관기간 자동 삭제 스케줄 동작 확인",
];

export function ChecklistSection() {
  return (
    <Section title="배포 전 점검 항목" desc="실제 업무 적용 전에 아래 항목을 확인하세요.">
      <ul className="space-y-2 text-sm text-slate-700">
        {CHECKLIST.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">
              {i + 1}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}