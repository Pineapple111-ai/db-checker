import { describe, expect, it } from "vitest";
import { parseText, splitFields } from "./parse-text";

describe("텍스트 파싱 — 다양한 형식", () => {
  it("공백 구분", () => {
    const [r] = parseText("김민수 01012345678 900101-1XXXXXX");
    expect(r.nameRaw).toBe("김민수");
    expect(r.phoneRaw).toBe("01012345678");
    expect(r.rrnRaw).toBe("900101-1XXXXXX");
  });

  it("슬래시 구분", () => {
    const [r] = parseText("이지은 / 010-9876-5432 / 950505-2XXXXXX");
    expect(r.nameRaw).toBe("이지은");
    expect(r.phoneRaw).toBe("010-9876-5432");
    expect(r.rrnRaw).toBe("950505-2XXXXXX");
  });

  it("세로줄 + 불필요한 정보", () => {
    const [r] = parseText("박서준 | 01055551234 | 880312-1XXXXXX | 직장인 | 3000만원");
    expect(r.nameRaw).toBe("박서준");
    expect(r.phoneRaw).toBe("01055551234");
    expect(r.parseError).toBeNull();
  });

  it("탭 구분 (엑셀 복사)", () => {
    const [r] = parseText("최유진\t010-5555-1234\t신용대출");
    expect(r.nameRaw).toBe("최유진");
    expect(r.phoneRaw).toBe("010-5555-1234");
  });

  it("띄어 쓴 번호 합치기", () => {
    const [r] = parseText("정하늘 010 1234 5678");
    expect(r.phoneRaw).toBe("010 1234 5678");
  });

  it("국가번호 띄어쓰기", () => {
    const [r] = parseText("정하늘 +82 10 1234 5678");
    expect(r.phoneRaw).toBe("+82 10 1234 5678");
  });

  it("이름이 뒤에 있어도 후보가 하나면 인식", () => {
    const [r] = parseText("01012345678 홍길동");
    expect(r.nameRaw).toBe("홍길동");
  });
});

describe("마크다운 표·헤더·빈 줄", () => {
  const input = [
    "| 이름 | 연락처 | 주민번호 | 비고 |",
    "|---|---|---|---|",
    "| 김민수 | 01012345678 | 900101-1XXXXXX | 신용대출 |",
    "",
    "| 이지은 | 01098765432 | 950505-2XXXXXX | 주부 |",
  ].join("\n");

  const rows = parseText(input);

  it("헤더·구분선·빈 줄 제외하고 2건", () => {
    expect(rows).toHaveLength(2);
  });

  it("순서와 원본 줄 번호 유지", () => {
    expect(rows[0].order).toBe(1);
    expect(rows[0].sourceRow).toBe(3);
    expect(rows[1].order).toBe(2);
    expect(rows[1].sourceRow).toBe(5);
    expect(rows[1].nameRaw).toBe("이지은");
  });
});

describe("추측 금지 — 구분 실패", () => {
  it("연락처 2개 → 오류", () => {
    const [r] = parseText("김민수 01011112222 01033334444");
    expect(r.parseError).toContain("연락처 2개 이상");
  });

  it("아무 정보 없음 → 오류", () => {
    const [r] = parseText("@@@ ###");
    expect(r.parseError).toBe("데이터 구분 실패");
  });
});

describe("splitFields", () => {
  it("번호와 주민번호를 합치지 않음", () => {
    expect(splitFields("김민수 010 1234 5678 900101-1234567")).toEqual([
      "김민수",
      "010 1234 5678",
      "900101-1234567",
    ]);
  });
});

describe("짧은 번호", () => {
  it("0101234는 연락처로 잡힘 (이후 자리 수 오류)", () => {
    const [r] = parseText("최유진 0101234");
    expect(r.nameRaw).toBe("최유진");
    expect(r.phoneRaw).toBe("0101234");
  });
});