// 이름·연락처·주민등록번호 정규화 (순수 함수, 서버/클라이언트 공용)
// 원칙: 추측하지 않는다. 확실하지 않으면 오류로 돌린다.

export type Ok<T> = { ok: true } & T;
export type Fail = { ok: false; reason: string };

/* =========================
   연락처
   ========================= */

export type PhoneResult = Ok<{ digits: string; formatted: string }> | Fail;

export function formatPhone(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function normalizePhone(input: string | null | undefined): PhoneResult {
  const raw = (input ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

  if (!raw) return { ok: false, reason: "연락처 없음" };

  // 숫자, +, 하이픈, 공백, 괄호, 점 외의 문자가 있으면 추측하지 않음
  if (/[^0-9+\-\s().]/.test(raw)) {
    return { ok: false, reason: "잘못된 연락처 형식" };
  }
  // +는 맨 앞에만 허용
  if (raw.indexOf("+") > 0 || (raw.match(/\+/g)?.length ?? 0) > 1) {
    return { ok: false, reason: "잘못된 연락처 형식" };
  }

  let d = raw.replace(/\D/g, "");

  // 국가번호 82 (8210XXXXXXXX 또는 82010XXXXXXXX)
  if (d.startsWith("82") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
    if (!d.startsWith("0")) d = "0" + d;
  } else if (raw.startsWith("+")) {
    return { ok: false, reason: "잘못된 연락처 형식 (한국 번호 아님)" };
  }

  // 맨 앞 0이 빠진 10자리 (10XXXXXXXX)
  if (d.length === 10 && d.startsWith("10")) {
    d = "0" + d;
  }

  if (d.length !== 11) {
    return { ok: false, reason: "연락처 자리 수 오류" };
  }
  if (!d.startsWith("010")) {
    return { ok: false, reason: "잘못된 연락처 형식 (010 번호 아님)" };
  }

  return { ok: true, digits: d, formatted: formatPhone(d) };
}

/* =========================
   이름
   ========================= */

export type NameResult = Ok<{ name: string }> | Fail;

const EDGE_CHARS = /^[\s|,/\\;:·•"'`()[\]{}<>\-_=~]+|[\s|,/\\;:·•"'`()[\]{}<>\-_=~]+$/g;

export function cleanName(input: string | null | undefined): NameResult {
  let s = (input ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(EDGE_CHARS, "").replace(/\s+/g, " ").trim();

  if (!s) return { ok: false, reason: "이름 없음" };
  if (/\d/.test(s)) return { ok: false, reason: "이름에 숫자 포함" };
  if (s.length > 30) return { ok: false, reason: "이름 길이 초과" };
  if (!/^[가-힣a-zA-Z][가-힣a-zA-Z .'\-]*$/.test(s)) {
    return { ok: false, reason: "이름 형식 오류" };
  }

  return { ok: true, name: s };
}

/* =========================
   주민등록번호 (형식 검증만 — 실재 여부와 무관)
   ========================= */

export type RrnResult =
  | Ok<{ kind: "full"; digits: string; masked: string }>
  | Ok<{ kind: "masked"; masked: string }>
  | Fail;

function centuryOf(genderDigit: number): number | null {
  if ([1, 2, 5, 6].includes(genderDigit)) return 1900;
  if ([3, 4, 7, 8].includes(genderDigit)) return 2000;
  if ([9, 0].includes(genderDigit)) return 1800;
  return null;
}

function isValidBirth(front6: string, genderDigit: number): boolean {
  const century = centuryOf(genderDigit);
  if (century === null) return false;

  const yy = Number(front6.slice(0, 2));
  const mm = Number(front6.slice(2, 4));
  const dd = Number(front6.slice(4, 6));
  const year = century + yy;

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;

  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return false;
  }

  // 미래 날짜 불가
  return date.getTime() <= Date.now();
}

export function maskRrn(front6: string, genderDigit: string): string {
  return `${front6}-${genderDigit}******`;
}

/**
 * 2020년 10월 이후 발급번호는 검증번호 규칙이 없으므로 체크섬 검사는 하지 않음
 */
export function normalizeRrn(input: string | null | undefined): RrnResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "주민등록번호 없음" };

  const compact = raw.replace(/[\s-]/g, "");

  // 전체 13자리
  if (/^\d{13}$/.test(compact)) {
    const front6 = compact.slice(0, 6);
    const g = compact[6];
    if (!isValidBirth(front6, Number(g))) {
      return { ok: false, reason: "주민등록번호 형식 오류" };
    }
    return { ok: true, kind: "full", digits: compact, masked: maskRrn(front6, g) };
  }

  // 뒷자리 마스킹된 입력 (900101-1XXXXXX / 900101-1******)
  if (/^\d{7}[xX*]{6}$/.test(compact)) {
    const front6 = compact.slice(0, 6);
    const g = compact[6];
    if (!isValidBirth(front6, Number(g))) {
      return { ok: false, reason: "주민등록번호 형식 오류" };
    }
    return { ok: true, kind: "masked", masked: maskRrn(front6, g) };
  }

  return { ok: false, reason: "주민등록번호 형식 오류" };
}

/* =========================
   엑셀·CSV 수식 주입 방지
   ========================= */

export function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}