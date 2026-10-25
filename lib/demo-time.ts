// FraudCast – the demo runs on a frozen clock so synthetic cases always look "live".
// Set DEMO_NOW in .env.local and in Vercel. Falls back to the Phase 2 default.

const FALLBACK = "2026-10-22T12:00:00+05:30";

export const STALE_AFTER_MINUTES = 60; // DV-14

export function demoNow(): Date {
  const raw = process.env.DEMO_NOW ?? FALLBACK;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(FALLBACK) : d;
}
