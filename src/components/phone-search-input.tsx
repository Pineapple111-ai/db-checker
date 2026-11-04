"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone-input";

/** 010으로 시작하면 자동 하이픈, 그 외엔 뒤 4자리 검색용 숫자 */
export function PhoneSearchInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  const onChange = (raw: string) => {
    const d = raw.replace(/\D/g, "");
    setValue(d.startsWith("010") || d.length > 4 ? formatPhoneInput(d) : d);
  };

  return (
    <Input
      name="phone"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="numeric"
      placeholder="010-0000-0000 또는 뒤 4자리"
      maxLength={13}
    />
  );
}