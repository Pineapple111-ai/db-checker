"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Pencil, Power, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createUserAction, resetPasswordAction, setUserStatusAction, updateUserAction } from "./actions";

type Role = "super_admin" | "admin" | "staff";

export type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  status: "active" | "disabled";
  canViewRrn: boolean;
  canDownloadMaster: boolean;
  canManageStaff: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "최고 관리자",
  admin: "관리자",
  staff: "일반 직원",
};

const selectClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 disabled:opacity-50";

function generatePassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%^&*"];
  const all = sets.join("");
  const rand = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < 14) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

type FormState = {
  id?: string;
  email: string;
  password: string;
  displayName: string;
  role: Role;
  canViewRrn: boolean;
  canDownloadMaster: boolean;
  canManageStaff: boolean;
};

export function UsersClient({
  users,
  actorId,
  isSuper,
}: {
  users: UserRow[];
  actorId: string;
  isSuper: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);

  const canManage = (u: UserRow) => isSuper || u.role === "staff";

  const openCreate = () =>
    setForm({
      email: "",
      password: generatePassword(),
      displayName: "",
      role: "staff",
      canViewRrn: false,
      canDownloadMaster: false,
      canManageStaff: false,
    });

  const openEdit = (u: UserRow) =>
    setForm({
      id: u.id,
      email: u.email,
      password: "",
      displayName: u.displayName ?? "",
      role: u.role,
      canViewRrn: u.canViewRrn,
      canDownloadMaster: u.canDownloadMaster,
      canManageStaff: u.canManageStaff,
    });

  const submitForm = async () => {
    if (!form || pending) return;
    setPending(true);
    const payload = {
      displayName: form.displayName,
      role: form.role,
      canViewRrn: form.canViewRrn,
      canDownloadMaster: form.canDownloadMaster,
      canManageStaff: form.canManageStaff,
    };
    const res = form.id
      ? await updateUserAction({ id: form.id, ...payload })
      : await createUserAction({ email: form.email, password: form.password, ...payload });
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(form.id ? "수정했습니다." : `계정을 만들었습니다. 임시 비밀번호를 직원에게 전달하세요.`);
    setForm(null);
    router.refresh();
  };

  const toggleStatus = async (u: UserRow) => {
    if (pending) return;
    const next = u.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !confirm(`${u.email} 계정을 비활성화할까요? 즉시 로그인이 차단됩니다.`)) return;
    setPending(true);
    const res = await setUserStatusAction({ id: u.id, status: next });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(next === "disabled" ? "비활성화했습니다." : "다시 활성화했습니다.");
    router.refresh();
  };

  const submitReset = async () => {
    if (!resetTarget || pending) return;
    setPending(true);
    const res = await resetPasswordAction({ id: resetTarget.id, password: newPassword });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("비밀번호를 재설정했습니다. 새 비밀번호를 직원에게 전달하세요.");
    setResetTarget(null);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
          <UserPlus className="h-4 w-4" />
          계정 추가
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>이메일</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>세부 권한</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 로그인</TableHead>
              <TableHead className="text-center">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {u.email}
                  {u.id === actorId && <span className="ml-1 text-xs text-slate-400">(나)</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{u.displayName ?? "-"}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{ROLE_LABEL[u.role]}</TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {u.canViewRrn && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">주민번호 원문</span>}
                    {u.canDownloadMaster && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">기존 DB 다운로드</span>
                    )}
                    {u.canManageStaff && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">직원 관리</span>
                    )}
                    {!u.canViewRrn && !u.canDownloadMaster && !u.canManageStaff && (
                      <span className="text-slate-400">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {u.status === "active" ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">활성</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">비활성</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-slate-600">{u.lastLoginAt ?? "-"}</TableCell>
                <TableCell className="whitespace-nowrap text-center">
                  {canManage(u) ? (
                    <div className="flex justify-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)} disabled={pending}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewPassword(generatePassword());
                          setResetTarget(u);
                        }}
                        disabled={pending}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      {u.id !== actorId && (
                        <Button variant="outline" size="sm" onClick={() => toggleStatus(u)} disabled={pending}>
                          <Power className={`h-3.5 w-3.5 ${u.status === "active" ? "text-red-600" : "text-emerald-600"}`} />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">권한 없음</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 생성 / 수정 */}
      <Dialog open={!!form} onOpenChange={(o) => !o && !pending && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "계정 수정" : "계정 추가"}</DialogTitle>
            <DialogDescription>
              {form?.id ? form.email : "임시 비밀번호로 생성되며, 직원이 로그인 후 직접 변경합니다."}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              {!form.id && (
                <>
                  <div className="space-y-1.5">
                    <Label>이메일</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      disabled={pending}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>임시 비밀번호</Label>
                    <div className="flex gap-2">
                      <Input
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        disabled={pending}
                        className="font-mono"
                        autoComplete="off"
                      />
                      <Button variant="outline" size="sm" onClick={() => setForm({ ...form, password: generatePassword() })}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyText(form.password)}>
                        복사
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>이름</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  disabled={pending}
                  maxLength={30}
                />
              </div>

              <div className="space-y-1.5">
                <Label>역할</Label>
                <select
                  className={selectClass}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  disabled={pending || !isSuper}
                >
                  <option value="staff">일반 직원</option>
                  <option value="admin">관리자</option>
                  <option value="super_admin">최고 관리자</option>
                </select>
              </div>

              {isSuper && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">세부 권한</p>
                  {(
                    [
                      ["canDownloadMaster", "기존 DB 다운로드"],
                      ["canManageStaff", "일반 직원 관리 (관리자용)"],
                      ["canViewRrn", "주민등록번호 원문 조회·다운로드"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`perm-${key}`}
                        checked={form[key]}
                        onCheckedChange={(c) => setForm({ ...form, [key]: !!c })}
                        disabled={pending}
                      />
                      <Label htmlFor={`perm-${key}`} className="text-sm">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={submitForm} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {form?.id ? "저장" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 비밀번호 재설정 */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && !pending && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>비밀번호 재설정</DialogTitle>
            <DialogDescription>{resetTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={pending}
              className="font-mono"
              autoComplete="off"
            />
            <Button variant="outline" size="sm" onClick={() => setNewPassword(generatePassword())}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyText(newPassword)}>
              복사
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={submitReset} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              재설정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}