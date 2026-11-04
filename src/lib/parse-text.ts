import { cleanName } from "./normalize";

export type ParsedRow = {
  order: number;            // 전체 입력 기준 순서 (1부터)
  sourceRow: number;        // 원본 줄/행 번호
  sourceFile: string | null;
  sourceSheet: string | null;
  raw: string;              // 원본 줄 전체
  nameRaw: string | null;
  phoneRaw: string | null;
  rrnRaw: string | null;
  parseError: string | null;
};

const STRONG_DELIMITER = /[\t|,;/]/;
const MD_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const NUMERIC_TOKEN = /^[+\d().\-]+$/;
const RRN_LIKE = /^\d{6}\s*-?\s*\d[\dxX*]{6}$/;

const HEADER_WORDS = new Set([
  "이름", "성명", "고객명", "name",
  "연락처", "휴대폰", "전화번호", "핸드폰", "mobile", "phone",
  "주민등록번호", "주민번호", "주민등록", "rrn",
  "no", "번호", "순번",
]);

function digitCount(s: string): number {
  return s.replace(/\D/g, "").length;
}

/** 한 줄을 칸 단위로 분리 */
export function splitFields(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");

  if (STRONG_DELIMITER.test(t)) {
    return t
      .split(/[\t|,;/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 공백 구분 모드: 띄어 쓴 숫자 묶음(010 1234 5678 등)은 하나로 합침
  const tokens = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (NUMERIC_TOKEN.test(tok) && digitCount(tok) < 10) {
      let group = tok;
      let j = i + 1;
      while (
        j < tokens.length &&
        NUMERIC_TOKEN.test(tokens[j]) &&
        digitCount(tokens[j]) <= 7 &&
        digitCount(group) + digitCount(tokens[j]) <= 13
      ) {
        group += " " + tokens[j];
        j++;
      }
      out.push(group);
      i = j;
    } else {
      out.push(tok);
      i++;
    }
  }

  return out;
}

function isRrnLike(field: string): boolean {
  const f = field.trim();
  if (f.startsWith("+")) return false;
  if (!RRN_LIKE.test(f)) return false;
  // 하이픈 없는 13자리가 82010으로 시작하면 국가번호 포함 전화번호로 봄
  const compact = f.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(compact) && compact.startsWith("82010")) return false;
  return true;
}

function isPhoneLike(field: string): boolean {
  const compact = field.replace(/\s/g, "");
  if (!NUMERIC_TOKEN.test(compact)) return false;
  const n = digitCount(compact);
  return n >= 9 && n <= 13 && !isRrnLike(field);
}

function isNameCandidate(field: string): boolean {
  if (/\d/.test(field)) return false;
  if (field.length > 20) return false;
  if (HEADER_WORDS.has(field.trim().toLowerCase())) return false;
  return cleanName(field).ok;
}

function isHeaderLine(fields: string[]): boolean {
  const hits = fields.filter((f) => HEADER_WORDS.has(f.trim().toLowerCase())).length;
  return hits >= 1 && !fields.some(isPhoneLike);
}

/** 한 줄 분석 (빈 줄·헤더·구분선이면 null) */
export function parseLine(line: string): Omit<ParsedRow, "order" | "sourceRow" | "sourceFile" | "sourceSheet"> | null {
  const trimmed = line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!trimmed) return null;
  if (MD_SEPARATOR.test(trimmed)) return null;

  const fields = splitFields(trimmed);
  if (fields.length === 0) return null;
  if (isHeaderLine(fields)) return null;

  const phoneIdx = fields.map((f, i) => (isPhoneLike(f) ? i : -1)).filter((i) => i >= 0);
  const rrnIdx = fields.map((f, i) => (isRrnLike(f) ? i : -1)).filter((i) => i >= 0);
  const nameIdx = fields.map((f, i) => (isNameCandidate(f) ? i : -1)).filter((i) => i >= 0);

  let parseError: string | null = null;
  if (phoneIdx.length > 1) parseError = "데이터 구분 실패 (연락처 2개 이상)";
  else if (rrnIdx.length > 1) parseError = "데이터 구분 실패 (주민등록번호 2개 이상)";

  // 자리 수가 모자란 휴대폰 번호도 연락처로 잡아서 '자리 수 오류'로 보이게
  if (phoneIdx.length === 0) {
    const shortIdx = fields
      .map((f, i) => {
        const c = f.replace(/\s/g, "");
        const n = digitCount(c);
        return NUMERIC_TOKEN.test(c) && c.replace(/\D/g, "").startsWith("01") && n >= 6 && n <= 8 ? i : -1;
      })
      .filter((i) => i >= 0);
    if (shortIdx.length === 1) phoneIdx.push(shortIdx[0]);
  }
  const phoneRaw = phoneIdx.length === 1 ? fields[phoneIdx[0]] : null;
  const rrnRaw = rrnIdx.length === 1 ? fields[rrnIdx[0]] : null;

  // 이름: 첫 칸 → 연락처 바로 앞 칸 → 후보가 정확히 1개일 때만
  let nameRaw: string | null = null;
  if (nameIdx.includes(0)) {
    nameRaw = fields[0];
  } else if (phoneIdx.length === 1 && nameIdx.includes(phoneIdx[0] - 1)) {
    nameRaw = fields[phoneIdx[0] - 1];
  } else if (nameIdx.length === 1) {
    nameRaw = fields[nameIdx[0]];
  }

  if (!parseError && !nameRaw && !phoneRaw && !rrnRaw) {
    parseError = "데이터 구분 실패";
  }

  return {
    raw: trimmed,
    nameRaw: parseError ? null : nameRaw,
    phoneRaw: parseError ? null : phoneRaw,
    rrnRaw: parseError ? null : rrnRaw,
    parseError,
  };
}

/** 붙여넣은 텍스트 전체 → 행 목록 (입력 순서 유지) */
export function parseText(text: string, startOrder = 1): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let order = startOrder;

  lines.forEach((line, idx) => {
    const parsed = parseLine(line);
    if (!parsed) return;
    rows.push({
      order: order++,
      sourceRow: idx + 1,
      sourceFile: null,
      sourceSheet: null,
      ...parsed,
    });
  });

  return rows;
}