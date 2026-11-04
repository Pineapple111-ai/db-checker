import { cleanName, normalizePhone, normalizeRrn } from "./normalize";

export type SheetData = {
  name: string;
  matrix: string[][];
  rowOffset: number; // 시트 사용 범위 시작 행(0부터)
  colOffset: number; // 시트 사용 범위 시작 열(0부터)
  colCount: number;
};

export type ColumnMapping = {
  name: number | null;
  phone: number | null;
  rrn: number | null;
};

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  sheets: SheetData[];
  sheetIndex: number;
  hasHeader: boolean;
  mapping: ColumnMapping;
};

export type UploadRow = {
  f: number;            // files 배열 인덱스
  sheet: string | null;
  row: number;          // 실제 엑셀 행 번호
  name: string;
  phone: string;
  rrn: string;
  raw: string;
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 10;
const ALLOWED = /\.(xlsx|xls|csv)$/i;

const NAME_KEYS = ["이름", "성명", "고객명", "성함", "name"];
const PHONE_KEYS = ["연락처", "휴대폰", "전화번호", "핸드폰", "휴대전화", "mobile", "phone", "tel"];
const RRN_KEYS = ["주민등록번호", "주민번호", "주민등록", "rrn"];

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()]/g, "");

function matchHeader(h: string, keys: string[]): boolean {
  const n = norm(h);
  return !!n && keys.some((k) => n === k || n.includes(k));
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

export function encodeCol(n: number): string {
  let s = "";
  let x = n + 1;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  if (!ALLOWED.test(file.name)) throw new Error("XLSX, XLS, CSV 파일만 업로드할 수 있습니다.");
  if (file.size > MAX_FILE_SIZE) throw new Error("파일 크기는 10MB 이하만 가능합니다.");

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();

  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(decodeCsv(buf), { type: "string", raw: true })
    : XLSX.read(buf, { type: "array" });

  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (!ref) return { name, matrix: [], rowOffset: 0, colOffset: 0, colCount: 0 };

    const range = XLSX.utils.decode_range(ref);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });

    return {
      name,
      matrix: rows.map((r) => (r as unknown[]).map(cellToString)),
      rowOffset: range.s.r,
      colOffset: range.s.c,
      colCount: range.e.c - range.s.c + 1,
    };
  });
}

export function detectHeader(sheet: SheetData): boolean {
  const first = sheet.matrix[0] ?? [];
  return first.some(
    (c) => matchHeader(c, NAME_KEYS) || matchHeader(c, PHONE_KEYS) || matchHeader(c, RRN_KEYS)
  );
}

function ratio(sample: string[][], col: number, test: (v: string) => boolean): number {
  let filled = 0;
  let ok = 0;
  for (const r of sample) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    filled++;
    if (test(v)) ok++;
  }
  return filled >= 1 ? ok / filled : 0;
}

function bestColumn(
  sample: string[][],
  colCount: number,
  exclude: (number | null)[],
  test: (v: string) => boolean
): number | null {
  let best: number | null = null;
  let bestRatio = 0.6;
  for (let c = 0; c < colCount; c++) {
    if (exclude.includes(c)) continue;
    const r = ratio(sample, c, test);
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}

export function detectMapping(sheet: SheetData, hasHeader: boolean): ColumnMapping {
  const mapping: ColumnMapping = { name: null, phone: null, rrn: null };
  const header = hasHeader ? sheet.matrix[0] ?? [] : [];

  // 1) 헤더 이름으로 (주민번호 → 연락처 → 이름 순)
  if (hasHeader) {
    header.forEach((h, i) => {
      if (mapping.rrn === null && matchHeader(h, RRN_KEYS)) mapping.rrn = i;
    });
    header.forEach((h, i) => {
      if (mapping.phone === null && i !== mapping.rrn && matchHeader(h, PHONE_KEYS)) mapping.phone = i;
    });
    header.forEach((h, i) => {
      if (mapping.name === null && i !== mapping.rrn && i !== mapping.phone && matchHeader(h, NAME_KEYS)) {
        mapping.name = i;
      }
    });
  }

  // 2) 못 찾은 항목은 내용으로
  const sample = sheet.matrix.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 50);

  if (mapping.phone === null) {
    mapping.phone = bestColumn(sample, sheet.colCount, [mapping.name, mapping.rrn], (v) => normalizePhone(v).ok);
  }
  if (mapping.rrn === null) {
    mapping.rrn = bestColumn(sample, sheet.colCount, [mapping.name, mapping.phone], (v) => normalizeRrn(v).ok);
  }
  if (mapping.name === null) {
    mapping.name = bestColumn(
      sample,
      sheet.colCount,
      [mapping.phone, mapping.rrn],
      (v) => !/\d/.test(v) && v.length <= 20 && cleanName(v).ok
    );
  }

  return mapping;
}

export function columnLabel(sheet: SheetData, idx: number, hasHeader: boolean): string {
  const letter = encodeCol(sheet.colOffset + idx);
  const h = hasHeader ? (sheet.matrix[0]?.[idx] ?? "").trim() : "";
  return h ? `${letter} · ${h}` : `${letter}열`;
}

export function dataRowCount(f: UploadedFile): number {
  const sheet = f.sheets[f.sheetIndex];
  if (!sheet) return 0;
  return sheet.matrix.slice(f.hasHeader ? 1 : 0).filter((r) => r.some((c) => c !== "")).length;
}

/** 파일 순서 → 행 순서대로 서버 전송용 행 생성 (빈 행 제외) */
export function buildUploadRows(
  files: UploadedFile[],
  rrnEnabled: boolean
): { files: string[]; rows: UploadRow[] } {
  const rows: UploadRow[] = [];

  files.forEach((f, fi) => {
    const sheet = f.sheets[f.sheetIndex];
    if (!sheet) return;
    const start = f.hasHeader ? 1 : 0;

    for (let i = start; i < sheet.matrix.length; i++) {
      const r = sheet.matrix[i];
      if (!r.some((c) => c !== "")) continue;

      const pick = (col: number | null) => (col === null ? "" : (r[col] ?? "").slice(0, 100));

      rows.push({
        f: fi,
        sheet: f.sheets.length > 1 || !/\.csv$/i.test(f.name) ? sheet.name.slice(0, 100) : null,
        row: sheet.rowOffset + i + 1,
        name: pick(f.mapping.name),
        phone: pick(f.mapping.phone),
        rrn: rrnEnabled ? pick(f.mapping.rrn) : "",
        raw: r.filter((c) => c !== "").join(" | ").slice(0, 1000),
      });
    }
  });

  return { files: files.map((f) => f.name.slice(0, 255)), rows };
}