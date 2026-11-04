import { describe, expect, it } from "vitest";
import { cleanName, normalizePhone, normalizeRrn, sanitizeCell } from "./normalize";

describe("연락처 정규화", () => {
  const okCases: [string, string][] = [
    ["01012345678", "010-1234-5678"],
    ["010-1234-5678", "010-1234-5678"],
    ["010 1234 5678", "010-1234-5678"],
    ["1012345678", "010-1234-5678"],
    ["+821012345678", "010-1234-5678"],
    ["+82 10 1234 5678", "010-1234-5678"],
    ["821012345678", "010-1234-5678"],
    ["+82 010-1234-5678", "010-1234-5678"],
    ["(010) 1234-5678", "010-1234-5678"],
  ];

  it.each(okCases)("%s → %s", (input, expected) => {
    const r = normalizePhone(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formatted).toBe(expected);
  });

  const errorCases = [
    "0101234567",
    "010123456789",
    "01112345678",
    "",
    "010-1234-567a",
    "+1 202 555 0100",
  ];

  it.each(errorCases)("%s → 오류", (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });

  it("표기만 다른 동일 번호는 같은 digits", () => {
    const a = normalizePhone("010-1234-5678");
    const b = normalizePhone("+82 10 1234 5678");
    expect(a.ok && b.ok && a.digits === b.digits).toBe(true);
  });
});

describe("이름 정리", () => {
  it("앞뒤 공백·구분문자 제거, 내부 공백 유지", () => {
    const r = cleanName("  | 남궁 민수 / ");
    expect(r.ok && r.name).toBe("남궁 민수");
  });

  it("이름 없음 → 오류", () => {
    expect(cleanName("   ").ok).toBe(false);
  });

  it("숫자·전화번호는 이름 불가", () => {
    expect(cleanName("01012345678").ok).toBe(false);
    expect(cleanName("김민수1").ok).toBe(false);
  });

  it("영문 이름 허용", () => {
    expect(cleanName("John Smith").ok).toBe(true);
  });
});

describe("주민등록번호 형식", () => {
  it("하이픈 유무 무관 전체 번호", () => {
    const a = normalizeRrn("900101-1234567");
    const b = normalizeRrn("9001011234567");
    expect(a.ok && a.kind === "full").toBe(true);
    expect(b.ok && b.kind === "full" && b.masked).toBe("900101-1******");
  });

  it("마스킹 입력 인식", () => {
    const r = normalizeRrn("900101-1XXXXXX");
    expect(r.ok && r.kind === "masked" && r.masked).toBe("900101-1******");
  });

  it("잘못된 생년월일 → 오류", () => {
    expect(normalizeRrn("901301-1234567").ok).toBe(false);
    expect(normalizeRrn("900230-1234567").ok).toBe(false);
  });

  it("2000년대 성별 코드", () => {
    expect(normalizeRrn("050505-3234567").ok).toBe(true);
    expect(normalizeRrn("050505-1234567").ok).toBe(true);
  });

  it("자리 수 오류", () => {
    expect(normalizeRrn("900101-123456").ok).toBe(false);
  });
});

describe("수식 주입 방지", () => {
  it("=, +, -, @ 시작 셀 무력화", () => {
    expect(sanitizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sanitizeCell("@cmd")).toBe("'@cmd");
    expect(sanitizeCell("김민수")).toBe("김민수");
  });
});