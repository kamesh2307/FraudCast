// FraudCast – display helpers (Indian currency grouping, IST timestamps, durations).

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹6,85,000 – or "Not available" when the value is missing (never a fabricated 0). */
export function inr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not available";
  return inrFormatter.format(Number(value));
}

/** Short form for graph labels: ₹6.85 L, ₹1.2 Cr, ₹9,500 */
export function inrShort(value: number): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  return inrFormatter.format(v);
}

/** 22 Oct, 09:31 IST */
export function dt(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Invalid date";
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " IST"
  );
}

/** 09:31 (IST, time only) */
export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 95 -> "1h 35m", 3000 -> "2d 2h" */
export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "Not available";
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function minutesBetween(from: string | Date, to: string | Date): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 60000;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
