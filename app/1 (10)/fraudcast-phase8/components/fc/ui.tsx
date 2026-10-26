// FraudCast – shared UI pieces, Apple-style (Phase 8). Same exports and props as before, so every page keeps working.
// Status is never shown by colour alone: every badge also carries a text label or icon.

import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "red" | "amber" | "blue" | "green" | "slate" | "purple";

// Apple system colours as soft tinted pills
const TONES: Record<Tone, string> = {
  red: "bg-[#ff3b30]/10 text-[#c4000f]",
  amber: "bg-[#ff9f0a]/[0.14] text-[#8a4b00]",
  blue: "bg-[#0a84ff]/10 text-[#0058b9]",
  green: "bg-[#34c759]/[0.14] text-[#1d7233]",
  slate: "bg-black/[0.05] text-[#48484a]",
  purple: "bg-[#5e5ce6]/10 text-[#3634a3]",
};

const DOT: Record<Tone, string> = {
  red: "bg-[#ff3b30]", amber: "bg-[#ff9f0a]", blue: "bg-[#0a84ff]", green: "bg-[#34c759]", slate: "bg-[#8e8e93]", purple: "bg-[#5e5ce6]",
};

export function Badge({ tone = "slate", children, dashed = false, title }: { tone?: Tone; children: ReactNode; dashed?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${dashed ? "outline outline-1 outline-dashed outline-current/40" : ""}`}
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
      <span aria-hidden="true" className="text-[9px]">{PRIORITY_ICON[band] ?? ""}</span>
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
  New: "blue", "In Review": "purple", "Alert Sent": "amber", Acknowledged: "green", Closed: "slate", Pending: "amber", Overdue: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "slate";
  return (
    <Badge tone={tone}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {status}
    </Badge>
  );
}

export function ForecastBadge({ status }: { status: string }) {
  if (status === "Available") return <Badge tone="green">Available</Badge>;
  if (status === "Insufficient evidence") return <Badge tone="amber">Insufficient evidence</Badge>;
  return <Badge tone="slate" title="Run the forecast from the Overview page">Not run</Badge>;
}

/** Grouped "inset" card, like macOS Settings / iOS lists. */
export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.05] ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Large-number tile with a coloured status dot. */
export function Tile({ label, value, sub, href, tone = "slate" }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: Tone }) {
  const body = (
    <div
      className={`h-full rounded-[18px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.05] ${
        href ? "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_14px_34px_rgba(0,0,0,0.08)]" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
        {label}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-slate-500">{sub}</div>}
      {href && <div aria-hidden="true" className="mt-2 text-[12px] font-medium text-blue-700">View ›</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Fact({ label, value, warn = false }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-[14px] font-medium ${warn ? "text-[#c93400]" : "text-slate-900"}`}>
        {warn && <span aria-hidden="true">⚠ </span>}
        {value}
      </dd>
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[14px] ${TONES[tone]}`}>
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
