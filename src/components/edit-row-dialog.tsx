"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatPhoneInput } from "@/lib/phone-input";
import type { ResultRow } from "@/lib/inspect-types";
import { reinspectRowAction } from "@/app/(app)/inspect/edit-actions";

type Props = {
  batchId: string;
  row: ResultRow;
  rrnEnabled: boolean;
  onClose: () => void;
  onSaved: (row: ResultRow) => void;
};

export function EditRowDialog({ batchId, row, rrnEnabled, onClose, onSaved }: Props) {
  const [name, setName] = useState(row.name ?? "");
  const [phone, setPhone] = useState(formatPhoneInput(row.phone ?? ""));
  const [rrn, setRrn] = useState("");
  const [error, setError] = useState<string | null>(row.errorReason);
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (pending) return;
    setPending(true);
    const res = await reinspectRowAction({ batchId, rowId: row.id, name, phone, rrn });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved(res.data);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>오류 행 수정 · {row.order}번</DialogTitle>
          <DialogDescription>수정 후 저장하면 형식 검증과 중복 검사를 다시 진행합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-500">원본 데이터</p>
            <p className="break-all">{row.raw || "-"}</p>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">이름</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              maxLength={30}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">연락처</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              disabled={pending}
              inputMode="numeric"
              placeholder="010-0000-0000"
              maxLength={13}
            />
          </div>

          {rrnEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-rrn">주민등록번호 (선택)</Label>
              <Input
                id="edit-rrn"
                value={rrn}
                onChange={(e) => setRrn(e.target.value.replace(/[^\d-]/g, "").slice(0, 14))}
                disabled={pending}
                inputMode="numeric"
                placeholder="000000-0000000"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button onClick={save} disabled={pending} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            저장 후 재검수
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}