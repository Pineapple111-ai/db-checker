import "server-only";
import * as XLSX from "xlsx";
import { sanitizeCell } from "@/lib/normalize";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_MIME = "text/csv;charset=utf-8";

/** 모든 셀을 문자열(텍스트 서식)로 저장 */
export function toXlsxBase64(header: string[], rows: string[][], sheetName: string): string {
  const aoa = [header, ...rows].map((r) => r.map((v) => sanitizeCell(v ?? "")));
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cell = ws[addr] as XLSX.CellObject;
    cell.t = "s";
    cell.z = "@";
  }

  ws["!cols"] = header.map((h, i) => {
    const sample = rows.slice(0, 300).map((r) => (r[i] ?? "").length);
    return { wch: Math.min(60, Math.max(h.length * 2, ...sample) + 2) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

export function toCsvBase64(header: string[], rows: string[][], bom: boolean): string {
  const esc = (v: string) => {
    const s = sanitizeCell(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return Buffer.from((bom ? "\uFEFF" : "") + body, "utf8").toString("base64");
}