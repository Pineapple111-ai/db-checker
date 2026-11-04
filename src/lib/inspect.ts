import { cleanName, normalizePhone, normalizeRrn } from "./normalize";
import type { ParsedRow } from "./parse-text";

export type RowStatus = "normal" | "duplicate" | "error";
export type DuplicateType = "master" | "internal";

export type InspectedRow = {
  order: number;
  sourceRow: number;
  sourceFile: string | null;
  sourceSheet: string | null;
  raw: string;

  name: string | null;
  phoneDigits: string | null;     // 01012345678
  phoneFormatted: string | null;  // 010-1234-5678
  rrnDigits: string | null;       // 전체 번호 (기능 ON + 전체 입력일 때만)
  rrnMasked: string | null;       // 900101-1******

  status: RowStatus;
  duplicateTypes: DuplicateType[];
  duplicateOfOrder: number | null;
  duplicateMasterId: string | null;
  errorReasons: string[];
};

export type RrnOptions = {
  enabled: boolean;   // 관리자 설정: 주민번호 처리 허용 여부
  required: boolean;  // 허용 + 필수 여부
};

/** 1차: 형식 검증 (중복 판정 전) */
export function validateRows(rows: ParsedRow[], rrn: RrnOptions): InspectedRow[] {
  return rows.map((r) => {
    const errorReasons: string[] = [];

    if (r.parseError) errorReasons.push(r.parseError);

    // 이름
    let name: string | null = null;
    if (!r.parseError) {
      const n = cleanName(r.nameRaw);
      if (n.ok) name = n.name;
      else errorReasons.push(n.reason);
    }

    // 연락처
    let phoneDigits: string | null = null;
    let phoneFormatted: string | null = null;
    if (!r.parseError) {
      const p = normalizePhone(r.phoneRaw);
      if (p.ok) {
        phoneDigits = p.digits;
        phoneFormatted = p.formatted;
      } else {
        errorReasons.push(p.reason);
      }
    }

    // 주민등록번호 (기능 OFF면 완전히 무시)
    let rrnDigits: string | null = null;
    let rrnMasked: string | null = null;
    if (rrn.enabled && !r.parseError) {
      if (r.rrnRaw) {
        const v = normalizeRrn(r.rrnRaw);
        if (v.ok) {
          rrnMasked = v.masked;
          if (v.kind === "full") rrnDigits = v.digits;
        } else {
          errorReasons.push(v.reason);
        }
      } else if (rrn.required) {
        errorReasons.push("주민등록번호 없음");
      }
    }

    return {
      order: r.order,
      sourceRow: r.sourceRow,
      sourceFile: r.sourceFile,
      sourceSheet: r.sourceSheet,
      raw: r.raw,
      name,
      phoneDigits,
      phoneFormatted,
      rrnDigits,
      rrnMasked,
      status: errorReasons.length > 0 ? "error" : "normal",
      duplicateTypes: [],
      duplicateOfOrder: null,
      duplicateMasterId: null,
      errorReasons,
    };
  });
}

/**
 * 2차: 중복 판정
 * masterHits: 정규화 연락처(01012345678) → 기존 DB id (서버에서 조회해 전달)
 */
export function applyDuplicates(
  rows: InspectedRow[],
  masterHits: Map<string, string>
): InspectedRow[] {
  const firstSeen = new Map<string, number>(); // digits → 첫 등장 order

  // 입력 순서대로 처리 (원본 배열 순서 보장)
  const sorted = [...rows].sort((a, b) => a.order - b.order);

  return sorted.map((row) => {
    if (row.status === "error" || !row.phoneDigits) {
      return { ...row };
    }

    const types: DuplicateType[] = [];
    let duplicateMasterId: string | null = null;
    let duplicateOfOrder: number | null = null;

    const masterId = masterHits.get(row.phoneDigits);
    if (masterId) {
      types.push("master");
      duplicateMasterId = masterId;
    }

    const prev = firstSeen.get(row.phoneDigits);
    if (prev !== undefined) {
      types.push("internal");
      duplicateOfOrder = prev;
    } else {
      firstSeen.set(row.phoneDigits, row.order);
    }

    return {
      ...row,
      status: types.length > 0 ? "duplicate" : "normal",
      duplicateTypes: types,
      duplicateMasterId,
      duplicateOfOrder,
    };
  });
}

export function duplicateTypeLabel(types: DuplicateType[]): string {
  const m = types.includes("master");
  const i = types.includes("internal");
  if (m && i) return "기존 DB + 신규 DB 내부 중복";
  if (m) return "기존 DB 중복";
  if (i) return "신규 DB 내부 중복";
  return "";
}

export type InspectSummary = {
  total: number;
  normal: number;
  duplicate: number;
  error: number;
};

export function summarize(rows: InspectedRow[]): InspectSummary {
  const s = { total: rows.length, normal: 0, duplicate: 0, error: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}

/** 탭별 목록 (원본 순서 유지) */
export function byStatus(rows: InspectedRow[], status: RowStatus): InspectedRow[] {
  return rows.filter((r) => r.status === status).sort((a, b) => a.order - b.order);
}