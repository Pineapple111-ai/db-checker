"use server";

import { z } from "zod";
import { assertUser, AuthError } from "@/lib/auth";
import { parseText, type ParsedRow } from "@/lib/parse-text";
import { runInspection } from "@/lib/inspect-service";
import type { ActionResult, InspectResult } from "@/lib/inspect-types";

const MAX_CHARS = 3_000_000;
const MAX_ROWS = 10_000;

function fail(e: unknown, tag: string): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  console.error(`[${tag}] 실패:`, e instanceof Error ? e.message : "unknown");
  return { ok: false, error: e instanceof Error ? e.message : "검수 중 오류가 발생했습니다." };
}

export async function inspectTextAction(text: string): Promise<ActionResult<InspectResult>> {
  try {
    const user = await assertUser();

    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "검수할 DB를 입력하세요." };
    }
    if (text.length > MAX_CHARS) {
      return { ok: false, error: "입력 내용이 너무 큽니다. 나눠서 검수하세요." };
    }

    const parsed = parseText(text);

    if (parsed.length === 0) {
      return { ok: false, error: "인식할 수 있는 데이터가 없습니다." };
    }
    if (parsed.length > MAX_ROWS) {
      return { ok: false, error: `한 번에 최대 ${MAX_ROWS.toLocaleString()}건까지 검수할 수 있습니다.` };
    }

    const result = await runInspection({ parsed, user, inputType: "text", sourceFilename: null });
    return { ok: true, data: result };
  } catch (e) {
    return fail(e, "inspect-text");
  }
}

const uploadSchema = z.object({
  files: z.array(z.string().min(1).max(255)).min(1).max(10),
  rows: z
    .array(
      z.object({
        f: z.number().int().min(0).max(9),
        sheet: z.string().max(100).nullable(),
        row: z.number().int().min(1).max(10_000_000),
        name: z.string().max(200),
        phone: z.string().max(100),
        rrn: z.string().max(100),
        raw: z.string().max(1000),
      })
    )
    .min(1)
    .max(MAX_ROWS),
});

export async function inspectRowsAction(input: unknown): Promise<ActionResult<InspectResult>> {
  try {
    const user = await assertUser();

    const parsedInput = uploadSchema.safeParse(input);
    if (!parsedInput.success) {
      return { ok: false, error: `업로드 데이터 형식이 올바르지 않습니다. (최대 ${MAX_ROWS.toLocaleString()}행)` };
    }

    const { files, rows } = parsedInput.data;
    if (rows.some((r) => r.f >= files.length)) {
      return { ok: false, error: "업로드 데이터 형식이 올바르지 않습니다." };
    }

    const parsed: ParsedRow[] = rows.map((r, i) => ({
      order: i + 1,
      sourceRow: r.row,
      sourceFile: files[r.f],
      sourceSheet: r.sheet,
      raw: r.raw,
      nameRaw: r.name.trim() || null,
      phoneRaw: r.phone.trim() || null,
      rrnRaw: r.rrn.trim() || null,
      parseError: null,
    }));

    const sourceFilename = files.join(", ").slice(0, 500);

    const result = await runInspection({ parsed, user, inputType: "file", sourceFilename });
    return { ok: true, data: result };
  } catch (e) {
    return fail(e, "inspect-file");
  }
}