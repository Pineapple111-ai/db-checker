import type { DuplicateType, InspectSummary, RowStatus } from "./inspect";

export type ResultRow = {
  id: string;
  order: number;
  sourceRow: number;
  sourceFile: string | null;
  sourceSheet: string | null;
  name: string | null;
  phone: string | null;
  rrn: string | null; // 마스킹 값
  status: RowStatus;
  duplicateTypes: DuplicateType[];
  duplicateLabel: string;
  duplicateOfOrder: number | null;
  masterName: string | null;      // 관리자 이상만
  masterCreatedAt: string | null; // 관리자 이상만
  errorReason: string | null;
  raw: string;
  registered: boolean;
};

export type InspectResult = {
  batchId: string;
  summary: InspectSummary;
  rows: ResultRow[];
  rrnEnabled: boolean;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };