// FraudCast – evaluation of the engine against the simple baseline (PRD Section 17).
// Pure functions. Results on synthetic data prove the pipeline works, NOT that the method works in reality.

import { forecast, haversineKm, inputForCase, inputForHistory, type ForecastContext } from "./forecast";
import type { AccountRow, CaseRow, HistoryRow, TxnRow, ZoneRow } from "./types";

export type EvalRow = {
  id: string;
  label: string;
  actualZone: string;
  actualTime: string | null;
  enhancedTop: string | null;
  enhancedRank: number | null; // null = not in top 3 (or insufficient evidence)
  insufficient: boolean;
  baselineTop: string | null;
  baselineRank: number | null;
  geoErrorKm: number | null;
  windowHit: boolean | null; // null = no window produced
};

export type EvalSummary = {
  n: number;
  enhancedTop1: number;
  enhancedTop3: number;
  baselineTop1: number;
  baselineTop3: number;
  upliftTop1: number; // percentage points
  upliftTop3: number;
  medianGeoErrorKm: number | null;
  windowAccuracy: number | null;
  windowsProduced: number;
  insufficient: number;
};

type OutcomeLite = { case_id: string; actual_cashout_zone: string | null; actual_cashout_timestamp: string | null };

function geo(zones: Map<string, ZoneRow>, a: string | null, b: string): number | null {
  const za = a ? zones.get(a) : undefined;
  const zb = zones.get(b);
  if (!za || !zb) return null;
  return Math.round(haversineKm([za.centroid_latitude, za.centroid_longitude], [zb.centroid_latitude, zb.centroid_longitude]) * 100) / 100;
}

export function evaluateClosedCases(
  cases: CaseRow[], txns: TxnRow[], outcomes: OutcomeLite[], accounts: Map<string, AccountRow>,
  ctx: ForecastContext, zones: ZoneRow[], now: Date,
): EvalRow[] {
  const zmap = new Map(zones.map((z) => [z.zone_id, z]));
  const rows: EvalRow[] = [];
  for (const o of outcomes) {
    const c = cases.find((x) => x.case_id === o.case_id);
    if (!c || !o.actual_cashout_zone) continue;
    const r = forecast(inputForCase(c, txns.filter((t) => t.case_id === c.case_id), accounts, now), ctx);
    const idx = r.insufficient ? -1 : r.top3.findIndex((z) => z.zone_id === o.actual_cashout_zone);
    const bIdx = r.baseline.top3.indexOf(o.actual_cashout_zone);
    const top = r.insufficient ? null : r.top3[0]?.zone_id ?? null;
    rows.push({
      id: c.case_id, label: c.fraud_type, actualZone: o.actual_cashout_zone, actualTime: o.actual_cashout_timestamp,
      enhancedTop: top, enhancedRank: idx >= 0 ? idx + 1 : null, insufficient: r.insufficient,
      baselineTop: r.baseline.top, baselineRank: bIdx >= 0 ? bIdx + 1 : null,
      geoErrorKm: geo(zmap, top, o.actual_cashout_zone),
      windowHit: r.window && o.actual_cashout_timestamp
        ? new Date(o.actual_cashout_timestamp) >= new Date(r.window.start) && new Date(o.actual_cashout_timestamp) <= new Date(r.window.end)
        : null,
    });
  }
  return rows;
}

export function evaluateHistory(history: HistoryRow[], accounts: Map<string, AccountRow>, ctx: ForecastContext, zones: ZoneRow[]): EvalRow[] {
  const zmap = new Map(zones.map((z) => [z.zone_id, z]));
  return history.map((h) => {
    const r = forecast(inputForHistory(h, accounts), ctx);
    const idx = r.insufficient ? -1 : r.top3.findIndex((z) => z.zone_id === h.cashout_zone_id);
    const bIdx = r.baseline.top3.indexOf(h.cashout_zone_id);
    const top = r.insufficient ? null : r.top3[0]?.zone_id ?? null;
    return {
      id: h.historical_event_id, label: h.fraud_type, actualZone: h.cashout_zone_id, actualTime: h.cashout_timestamp,
      enhancedTop: top, enhancedRank: idx >= 0 ? idx + 1 : null, insufficient: r.insufficient,
      baselineTop: r.baseline.top, baselineRank: bIdx >= 0 ? bIdx + 1 : null,
      geoErrorKm: geo(zmap, top, h.cashout_zone_id),
      windowHit: r.window
        ? new Date(h.cashout_timestamp) >= new Date(r.window.start) && new Date(h.cashout_timestamp) <= new Date(r.window.end)
        : null,
    };
  });
}

export function summarise(rows: EvalRow[]): EvalSummary {
  const n = rows.length;
  const share = (k: number) => (n ? k / n : 0);
  const e1 = share(rows.filter((r) => r.enhancedRank === 1).length);
  const e3 = share(rows.filter((r) => r.enhancedRank !== null).length);
  const b1 = share(rows.filter((r) => r.baselineRank === 1).length);
  const b3 = share(rows.filter((r) => r.baselineRank !== null).length);
  const geoVals = rows.map((r) => r.geoErrorKm).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const median = geoVals.length
    ? geoVals.length % 2 ? geoVals[(geoVals.length - 1) / 2] : (geoVals[geoVals.length / 2 - 1] + geoVals[geoVals.length / 2]) / 2
    : null;
  const withWindow = rows.filter((r) => r.windowHit !== null);
  return {
    n,
    enhancedTop1: e1, enhancedTop3: e3, baselineTop1: b1, baselineTop3: b3,
    upliftTop1: Math.round((e1 - b1) * 1000) / 10,
    upliftTop3: Math.round((e3 - b3) * 1000) / 10,
    medianGeoErrorKm: median === null ? null : Math.round(median * 100) / 100,
    windowAccuracy: withWindow.length ? withWindow.filter((r) => r.windowHit).length / withWindow.length : null,
    windowsProduced: withWindow.length,
    insufficient: rows.filter((r) => r.insufficient).length,
  };
}
