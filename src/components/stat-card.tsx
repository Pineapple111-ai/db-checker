import type { LucideIcon } from "lucide-react";

type Tone = "default" | "green" | "amber" | "red";

type Props = {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
};

const TONE: Record<Tone, string> = {
  default: "bg-slate-100 text-[#1e3a5f]",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
};

const ACTIVE_RING: Record<Tone, string> = {
  default: "border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20",
  green: "border-emerald-500 ring-2 ring-emerald-500/20",
  amber: "border-amber-500 ring-2 ring-amber-500/20",
  red: "border-red-500 ring-2 ring-red-500/20",
};

export function StatCard({ label, value, icon: Icon, tone = "default", onClick, active }: Props) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${TONE[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
        {value.toLocaleString("ko-KR")}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`rounded-lg border bg-white p-4 text-left transition-colors hover:bg-slate-50 ${
          active ? ACTIVE_RING[tone] : "border-slate-200"
        }`}
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-lg border border-slate-200 bg-white p-4">{body}</div>;
}