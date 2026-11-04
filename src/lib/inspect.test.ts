import { describe, expect, it } from "vitest";
import { parseText } from "./parse-text";
import { applyDuplicates, byStatus, summarize, validateRows } from "./inspect";

const RRN_OFF = { enabled: false, required: false };
const RRN_ON = { enabled: true, required: false };

function run(text: string, master: Record<string, string> = {}, rrn = RRN_OFF) {
  const validated = validateRows(parseText(text), rrn);
  return applyDuplicates(validated, new Map(Object.entries(master)));
}

describe("기존 DB 중복", () => {
  it("기존 DB 연락처와 동일 → 중복", () => {
    const [r] = run("박서준 010-1234-5678", { "01012345678": "m1" });
    expect(r.status).toBe("duplicate");
    expect(r.duplicateTypes).toEqual(["master"]);
    expect(r.duplicateMasterId).toBe("m1");
  });

  it("이름이 달라도 연락처 같으면 중복", () => {
    const rows = run("김민수 01012345678\n박서준 +82 10 1234 5678", { "01012345678": "m1" });
    expect(rows.every((r) => r.status === "duplicate")).toBe(true);
  });

  it("연락처가 다르면 이름이 같아도 정상", () => {
    const rows = run("김민수 01011112222\n김민수 01033334444");
    expect(rows.map((r) => r.status)).toEqual(["normal", "normal"]);
  });
});

describe("신규 내부 중복", () => {
  it("첫 등장 정상, 이후 중복", () => {
    const rows = run("김민수 010-1111-2222\n이지은 010-3333-4444\n박서준 01011112222");
    expect(rows.map((r) => r.status)).toEqual(["normal", "normal", "duplicate"]);
    expect(rows[2].duplicateTypes).toEqual(["internal"]);
    expect(rows[2].duplicateOfOrder).toBe(1);
  });

  it("표기만 다른 동일 번호 → 중복", () => {
    const rows = run("가나 010 1111 2222\n다라 +821011112222");
    expect(rows[1].status).toBe("duplicate");
  });

  it("첫 데이터가 기존 DB에 있으면 첫 데이터도 중복, 이후는 사유 2개", () => {
    const rows = run("김민수 01011112222\n박서준 01011112222", { "01011112222": "m9" });
    expect(rows[0].duplicateTypes).toEqual(["master"]);
    expect(rows[1].duplicateTypes).toEqual(["master", "internal"]);
  });
});

describe("오류 처리", () => {
  it("오류 행은 중복 검사 제외, 상태는 오류 하나", () => {
    const rows = run("01012345678\n김민수 0101234567");
    expect(rows[0].status).toBe("error");
    expect(rows[0].errorReasons).toContain("이름 없음");
    expect(rows[1].status).toBe("error");
    expect(rows[1].errorReasons).toContain("연락처 자리 수 오류");
  });

  it("011 번호 → 오류", () => {
    const [r] = run("김민수 01112345678");
    expect(r.status).toBe("error");
  });
});

describe("주민등록번호 옵션", () => {
  it("기능 OFF면 주민번호 버림", () => {
    const [r] = run("김민수 01012345678 900101-1234567");
    expect(r.rrnDigits).toBeNull();
    expect(r.rrnMasked).toBeNull();
    expect(r.status).toBe("normal");
  });

  it("기능 ON이면 마스킹 보관", () => {
    const [r] = run("김민수 01012345678 900101-1234567", {}, RRN_ON);
    expect(r.rrnMasked).toBe("900101-1******");
    expect(r.rrnDigits).toBe("9001011234567");
  });

  it("기능 ON + 형식 오류 → 오류", () => {
    const [r] = run("김민수 01012345678 901399-1234567", {}, RRN_ON);
    expect(r.status).toBe("error");
  });
});

describe("순서 유지 + 합계", () => {
  const text = [
    "김민수 01011112222",
    "이지은 01033334444",
    "박서준 01011112222",
    "최유진 0101234",
    "정하늘 01055556666",
  ].join("\n");
  const rows = run(text, { "01033334444": "m1" });

  it("탭별 원본 상대 순서 유지", () => {
    expect(byStatus(rows, "normal").map((r) => r.name)).toEqual(["김민수", "정하늘"]);
    expect(byStatus(rows, "duplicate").map((r) => r.name)).toEqual(["이지은", "박서준"]);
    expect(byStatus(rows, "error").map((r) => r.name)).toEqual(["최유진"]);
  });

  it("전체 = 정상 + 중복 + 오류", () => {
    const s = summarize(rows);
    expect(s.total).toBe(5);
    expect(s.normal + s.duplicate + s.error).toBe(s.total);
  });
});