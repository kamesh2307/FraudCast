// FraudCast – small shared UI pieces (server-safe, no hooks).
// Status is never shown by colour alone: every badge also carries a text label.

import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "red" | "amber" | "blue" | "green" | "slate" | "purple";

const TONES: Record<Tone, string> = {
  red: "bg-red-50 text-red-800 border-red-300",
  amber: "bg-amber-50 text-amber-900 border-amber-300",
  blue: "bg-blue-50 text-blue-800 border-blue-300",
  green: "bg-emerald-50 text-emerald-800 border-emerald-300",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
  purple: "bg-violet-50 text-violet-800 border-violet-300",
};

export function Badge({ tone = "slate", children, dashed = false, title }: { tone?: Tone; children: ReactNode; dashed?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${dashed ? "border-dashed" : ""}`}
    >
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<string, Tone> = { Critical: "red", High: "amber", Medium: "blue", Low: "slate" };
const PRIORITY_ICON: Record<string, string> = { Critical: "▲▲", High: "▲", Medium: "■", Low: "▽" };

export function PriorityBadge({ band, title }: { band: string; title?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[band] ?? "slate"} title={title}>
      <span aria-hidden="true">{PRIORITY_ICON[band] ?? ""}</span>
      {band}
    </Badge>
  );
}

export function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const tone: Tone = level === "High" ? "green" : level === "Medium" ? "amber" : "red";
  const icon = level === "High" ? "✓" : level === "Medium" ? "!" : "✕";
  return (
    <Badge tone={tone} title="Data confidence: High ≥ 0.75, Medium 0.50–0.74, Low < 0.50">
      <span aria-hidden="true">{icon}</span>
      {level}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  New: "blue",
  "In Review": "purple",
  "Alert Sent": "amber",
  Acknowledged: "green",
  Closed: "slate",
  Pending: "amber",
  Overdue: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{status}</Badge>;
}

export function ForecastBadge({ status }: { status: string }) {
  if (status === "Available") return <Badge tone="green">Available</Badge>;
  if (status === "Insufficient evidence") return <Badge tone="amber">Insufficient evidence</Badge>;
  return <Badge tone="slate" title="The forecast engine is added in Phase 4">Not run</Badge>;
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, href, tone = "slate" }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: Tone }) {
  const accent: Record<Tone, string> = {
    red: "border-l-red-500", amber: "border-l-amber-500", blue: "border-l-blue-500",
    green: "border-l-emerald-500", slate: "border-l-slate-400", purple: "border-l-violet-500",
  };
  const body = (
    <div className={`h-full rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${accent[tone]} ${href ? "transition hover:border-slate-300 hover:shadow" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Fact({ label, value, warn = false }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${warn ? "text-amber-800" : "text-slate-900"}`}>
        {warn && <span aria-hidden="true">⚠ </span>}
        {value}
      </dd>
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="status" className={`rounded-md border px-3 py-2 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
