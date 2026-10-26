// FraudCast – shared UI pieces (Phase 9: soft cyberpunk dark / clean light). Same exports and props as before,
// so every page keeps working. Colours come from futuristic-theme.css, so both themes stay readable.
// Status is never shown by colour alone: every badge also carries a text label or icon.

import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "red" | "amber" | "blue" | "green" | "slate" | "purple";

export function Badge({ tone = "slate", children, dashed = false, title }: { tone?: Tone; children: ReactNode; dashed?: boolean; title?: string }) {
  return (
    <span
      title={title}
      data-tone={tone}
      className={`fc-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${dashed ? "outline outline-1 outline-dashed" : ""}`}
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
      <span aria-hidden="true" data-tone={tone} className={`fc-dot h-1.5 w-1.5 rounded-full ${status === "Overdue" ? "fc-pulse" : ""}`} />
      {status}
    </Badge>
  );
}

export function ForecastBadge({ status }: { status: string }) {
  if (status === "Available") return <Badge tone="green">Available</Badge>;
  if (status === "Insufficient evidence") return <Badge tone="amber">Insufficient evidence</Badge>;
  return <Badge tone="slate" title="Run the forecast from the Overview page">Not run</Badge>;
}

/** Panel with a soft gradient edge (glows faintly in dark mode). */
export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`fc-card p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="fc-title text-[15px] font-semibold tracking-tight">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Large-number tile; its edge takes the tone colour. Red tiles get a slow "live" pulse on the dot. */
export function Tile({ label, value, sub, href, tone = "slate" }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: Tone }) {
  const body = (
    <div data-tone={tone} className="fc-tile h-full p-4">
      <div className="fc-muted flex items-center justify-between gap-2 text-[12px] font-medium">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" data-tone={tone} className={`fc-dot h-2 w-2 rounded-full ${tone === "red" ? "fc-pulse" : ""}`} />
          {label}
        </span>
        {href && <span aria-hidden="true" className="opacity-60">›</span>}
      </div>
      <div className="fc-num mt-2 text-[28px] font-semibold leading-tight tracking-tight">{value}</div>
      {sub && <div className="fc-muted mt-1 text-[12px]">{sub}</div>}
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
      <dt className="fc-muted text-[12px]">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium" data-tone={warn ? "amber" : undefined} style={warn ? { color: "var(--fg)" } : { color: "var(--fc-text)" }}>
        {warn && <span aria-hidden="true">⚠ </span>}
        {value}
      </dd>
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="status" data-tone={tone} className="fc-notice flex items-start gap-2.5 px-4 py-3 text-[14px]">
      <span aria-hidden="true" data-tone={tone} className="fc-dot mt-1.5 h-2 w-2 shrink-0 rounded-full" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
