/** 한국시간 오늘 0시를 UTC ISO 문자열로 */
export function startOfTodayKstIso(): string {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET);
  const startUtc =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST_OFFSET;
  return new Date(startUtc).toISOString();
}

/** 화면 표시용 한국시간 */
export function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 파일명용 20261104_103000 */
export function fileStampKst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}