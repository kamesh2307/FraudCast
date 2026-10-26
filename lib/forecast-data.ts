// FraudCast – Phase 4 database layer: load forecast inputs, save runs, read the latest run.
// Server-side only (uses the secret Supabase key through db()).

import { db } from "./supabase";
import { demoNow } from "./demo-time";
import {
  buildContext, CONFIG, forecast, inputForCase, MODEL_VERSION, WEIGHTS,
  type Factors, type ForecastContext, type ForecastResult, type ZoneScore,
} from "./forecast";
import type { AccountRow, CaseRow, CashPointRow, HistoryRow, StoredPrediction, TxnRow, ZoneRow } from "./types";

/* ------------------------------------------------------------------ */
/* Loading                                                              */
/* ------------------------------------------------------------------ */

function toNum<T>(rows: unknown[] | null, fields: string[]): T[] {
  return (rows ?? []).map((r) => {
    const o = { ...(r as Record<string, unknown>) };
    for (const f of fields) if (o[f] !== null && o[f] !== undefined) o[f] = Number(o[f]);
    return o as T;
  });
}

function check(table: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not read "${table}" from Supabase: ${error.message}`);
}

export type OutcomeFull = {
  outcome_id: string;
  case_id: string;
  actual_cashout_zone: string | null;
  actual_cashout_timestamp: string | null;
  forecast_rank: number | null;
  amount_protected: number;
  amount_withdrawn: number;
  amount_unresolved: number;
  original_amount_at_risk: number;
};

export type ForecastData = {
  zones: ZoneRow[];
  points: CashPointRow[];
  history: HistoryRow[];
  accounts: Map<string, AccountRow>;
  cases: CaseRow[];
  txns: TxnRow[];
  outcomes: OutcomeFull[];
  ctx: ForecastContext;
};

export async function loadForecastData(): Promise<ForecastData> {
  const s = db();
  const [z, p, h, a, c, t, o] = await Promise.all([
    s.from("zones").select("zone_id,h3_index,zone_name,jurisdiction,centroid_latitude,centroid_longitude,approximate_area,historical_synthetic_cashout_count"),
    s.from("cash_out_points").select("location_id,zone_id,location_type,synthetic_bank_code,latitude,longitude,operating_status,availability_window"),
    s.from("historical_cashout_events").select("*"),
    s.from("accounts").select("*"),
    s.from("cases").select("*"),
    s.from("transactions").select("*"),
    s.from("outcomes").select("*"),
  ]);
  check("zones", z.error);
  check("cash_out_points", p.error);
  check("historical_cashout_events", h.error);
  check("accounts", a.error);
  check("cases", c.error);
  check("transactions", t.error);
  check("outcomes", o.error);

  const zones = toNum<ZoneRow>(z.data, ["centroid_latitude", "centroid_longitude", "approximate_area", "historical_synthetic_cashout_count"])
    .sort((x, y) => x.zone_id.localeCompare(y.zone_id));
  const points = toNum<CashPointRow>(p.data, ["latitude", "longitude"]);
  const history = toNum<HistoryRow>(h.data, ["amount_withdrawn", "transfer_hop_count", "minutes_to_cashout"]);
  const accounts = toNum<AccountRow>(a.data, ["current_balance", "previous_synthetic_alert_count", "previous_confirmed_synthetic_link_count"]);
  const cases = toNum<CaseRow>(c.data, ["original_amount", "current_amount_at_risk", "reporting_delay_minutes", "priority_score", "data_quality"]);
  const txns = toNum<TxnRow>(t.data, ["amount", "transfer_hop", "minutes_since_previous_transfer"]);
  const outcomes = toNum<OutcomeFull>(o.data, ["forecast_rank", "amount_protected", "amount_withdrawn", "amount_unresolved", "original_amount_at_risk"]);

  return {
    zones, points, history, cases, txns, outcomes,
    accounts: new Map(accounts.map((x) => [x.account_id, x])),
    ctx: buildContext(zones, points, history, txns),
  };
}

export function forecastCase(data: ForecastData, caseId: string, now = demoNow()): ForecastResult | null {
  const c = data.cases.find((x) => x.case_id === caseId);
  if (!c) return null;
  const input = inputForCase(c, data.txns.filter((t) => t.case_id === caseId), data.accounts, now);
  return forecast(input, data.ctx);
}

/* ------------------------------------------------------------------ */
/* Saving                                                               */
/* ------------------------------------------------------------------ */

const r4 = (x: number) => Math.round(x * 10000) / 10000;

function zoneFeatures(z: ZoneScore) {
  return {
    factors: z.factors, raw: z.raw, adjusted: z.adjusted, probability: z.probability,
    linkedEvents: z.linkedEvents, typeMatchEvents: z.typeMatchEvents, totalEvents: z.totalEvents,
    graphDistance: z.graphDistance, availablePoints: z.availablePoints, homeBranchMatch: z.homeBranchMatch,
  };
}

/** Convert one engine result into prediction rows (top 3 + "Other", or one "insufficient" row). */
export function resultToRows(r: ForecastResult, runId: string, medianGap: number | null) {
  const run = {
    mode: r.mode, asOf: r.asOf, insufficientReason: r.insufficientReason, eligibleZones: r.eligibleZones,
    windowNote: r.windowNote, windowEvents: r.window?.basedOnEvents ?? 0, typicalWindowPassed: r.window?.typicalWindowPassed ?? false,
    baselineTop3: r.baseline.top3, baselineBasis: r.baseline.basis, stale: r.stale, medianGapMinutes: medianGap,
    weights: WEIGHTS, temperature: CONFIG.temperature, minTopScore: CONFIG.minTopScore, minTopProbability: CONFIG.minTopProbability,
    candidates: r.candidates.map((z) => ({ zone_id: z.zone_id, ...zoneFeatures(z) })),
  };
  const common = {
    run_id: runId, case_id: r.caseId, amount_exposed: r.amountExposed, missing_data_flags: r.missing,
    data_quality: r.dataQuality, baseline_zone: r.baseline.top, model_version: r.modelVersion,
    forecast_window_start: r.window?.start ?? null, forecast_window_end: r.window?.end ?? null,
  };
  if (r.insufficient) {
    return [{ ...common, prediction_id: `${runId}-0`, predicted_zone_id: "NONE", rank: 0, normalized_confidence: 0,
      insufficient_evidence: true, forecast_window_start: null, forecast_window_end: null, contributing_features: { run } }];
  }
  const probs = r.top3.map((z) => r4(z.probability));
  const other = r4(Math.max(0, 1 - probs.reduce((a, b) => a + b, 0)));
  return [
    ...r.top3.map((z, i) => ({
      ...common, prediction_id: `${runId}-${i + 1}`, predicted_zone_id: z.zone_id, rank: i + 1,
      normalized_confidence: probs[i], insufficient_evidence: false,
      contributing_features: i === 0 ? { ...zoneFeatures(z), run } : zoneFeatures(z),
    })),
    { ...common, prediction_id: `${runId}-99`, predicted_zone_id: "OTHER", rank: 99, normalized_confidence: other,
      insufficient_evidence: false, contributing_features: { note: "Combined probability of all other eligible zones" } },
  ];
}

/** Run the engine for the given cases (or all cases), store predictions, audit events and closed-case accuracy. */
export async function runAndSaveForecasts(caseIds: string[] | null, reason: string, userId = "DEMO-USER-ANALYST-01") {
  const data = await loadForecastData();
  const now = demoNow();
  const s = db();
  const targets = caseIds ? data.cases.filter((c) => caseIds.includes(c.case_id)) : data.cases;
  if (!targets.length) throw new Error("No matching case to forecast.");

  const stamp = Date.now().toString(36).toUpperCase();
  const predRows: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];
  const outcomeUpdates: { case_id: string; forecast_rank: number | null; top1: boolean; top3: boolean }[] = [];

  for (const c of targets) {
    const caseTxns = data.txns.filter((t) => t.case_id === c.case_id);
    const input = inputForCase(c, caseTxns, data.accounts, now);
    const r = forecast(input, data.ctx);
    const runId = `SYN-PRED-${stamp}-${c.case_id.slice(-4)}`;
    predRows.push(...resultToRows(r, runId, input.medianGapMinutes).map((row) => ({ ...row, created_at: now.toISOString() })));
    auditRows.push({
      event_id: `SYN-EVT-FC-${stamp}-${c.case_id.slice(-4)}`, user_id: userId, case_id: c.case_id, action_type: "FORECAST_CREATED",
      previous_value: null,
      new_value: { run_id: runId, insufficient: r.insufficient, top_zone: r.top3[0]?.zone_id ?? null, top_probability: r.top3[0]?.probability ?? null, mode: r.mode },
      reason, model_version: MODEL_VERSION, timestamp: now.toISOString(),
    });
    const o = data.outcomes.find((x) => x.case_id === c.case_id);
    if (o?.actual_cashout_zone) {
      const idx = r.insufficient ? -1 : r.top3.findIndex((z) => z.zone_id === o.actual_cashout_zone);
      outcomeUpdates.push({ case_id: c.case_id, forecast_rank: idx >= 0 ? idx + 1 : null, top1: idx === 0, top3: idx >= 0 });
    }
  }

  // Keep only the latest run per case in "predictions" (every run stays recorded in audit_events).
  const del = await s.from("predictions").delete().in("case_id", targets.map((c) => c.case_id));
  if (del.error) throw new Error(`Could not clear previous forecasts: ${del.error.message}`);
  const ins = await s.from("predictions").insert(predRows);
  if (ins.error) throw new Error(`Could not save forecasts: ${ins.error.message}`);
  const aud = await s.from("audit_events").insert(auditRows);
  if (aud.error) throw new Error(`Could not write audit events: ${aud.error.message}`);
  for (const u of outcomeUpdates) {
    const up = await s.from("outcomes")
      .update({ forecast_rank: u.forecast_rank, forecast_correct_top_one: u.top1, forecast_correct_top_three: u.top3 })
      .eq("case_id", u.case_id);
    if (up.error) throw new Error(`Could not update outcome for ${u.case_id}: ${up.error.message}`);
  }
  return { cases: targets.length, rows: predRows.length };
}

/* ------------------------------------------------------------------ */
/* Reading the latest stored run                                        */
/* ------------------------------------------------------------------ */

export type StoredZone = {
  zone_id: string;
  rank: number;
  probability: number;
  factors: Factors | null;
  raw: number | null;
  adjusted: number | null;
  linkedEvents: number;
  typeMatchEvents: number;
  totalEvents: number;
  graphDistance: number | null;
  availablePoints: number;
  homeBranchMatch: boolean;
};

export type StoredRun = {
  runId: string;
  caseId: string;
  createdAt: string;
  modelVersion: string;
  mode: string;
  asOf: string | null;
  insufficient: boolean;
  insufficientReason: string | null;
  top3: StoredZone[];
  other: number;
  candidates: StoredZone[];
  window: { start: string; end: string } | null;
  windowNote: string;
  typicalWindowPassed: boolean;
  dataQuality: number;
  missing: string[];
  stale: boolean;
  amountExposed: number;
  baselineTop: string | null;
  baselineTop3: string[];
  baselineBasis: string;
  medianGapMinutes: number | null;
  eligibleZones: number;
  valid: boolean;
  validationError: string | null;
};

type Json = Record<string, unknown>;
const num = (v: unknown, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));

function storedZone(zone_id: string, rank: number, probability: number, f: Json): StoredZone {
  return {
    zone_id, rank, probability,
    factors: (f.factors as Factors) ?? null,
    raw: f.raw === undefined ? null : num(f.raw),
    adjusted: f.adjusted === undefined ? null : num(f.adjusted),
    linkedEvents: num(f.linkedEvents), typeMatchEvents: num(f.typeMatchEvents), totalEvents: num(f.totalEvents),
    graphDistance: f.graphDistance === null || f.graphDistance === undefined ? null : num(f.graphDistance),
    availablePoints: num(f.availablePoints), homeBranchMatch: Boolean(f.homeBranchMatch),
  };
}

/** DV-08 / DV-15: never display an invalid forecast. */
function validate(run: StoredRun): string | null {
  if (run.insufficient) return null;
  const ranks = run.top3.map((z) => z.rank).sort();
  if (ranks.join(",") !== "1,2,3") return "Forecast does not contain exactly ranks 1, 2 and 3.";
  const all = [...run.top3.map((z) => z.probability), run.other];
  if (all.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) return "Forecast contains an invalid probability.";
  if (Math.abs(all.reduce((a, b) => a + b, 0) - 1) > 0.002) return "Forecast probabilities do not add up to 100%.";
  if (run.window && new Date(run.window.end) <= new Date(run.window.start)) return "Forecast window ends before it starts.";
  return null;
}

export async function loadLatestRun(caseId: string): Promise<StoredRun | null> {
  const res = await db().from("predictions").select("*").eq("case_id", caseId).order("created_at", { ascending: false });
  if (res.error) throw new Error(`Could not read predictions: ${res.error.message}`);
  const rows = toNum<StoredPrediction>(res.data, ["rank", "normalized_confidence", "amount_exposed", "data_quality"]);
  if (!rows.length) return null;
  const runId = rows[0].run_id;
  const runRows = rows.filter((r) => r.run_id === runId);
  const head = runRows.find((r) => r.rank === 1 || r.rank === 0) ?? runRows[0];
  const meta = ((head.contributing_features ?? {}) as Json).run as Json | undefined ?? {};
  const insufficient = runRows.some((r) => r.insufficient_evidence);

  const run: StoredRun = {
    runId, caseId, createdAt: head.created_at, modelVersion: head.model_version,
    mode: String(meta.mode ?? "live"),
    asOf: (meta.asOf as string) ?? null,
    insufficient,
    insufficientReason: (meta.insufficientReason as string) ?? null,
    top3: insufficient ? [] : runRows.filter((r) => r.rank >= 1 && r.rank <= 3).sort((a, b) => a.rank - b.rank)
      .map((r) => storedZone(r.predicted_zone_id, r.rank, r.normalized_confidence, (r.contributing_features ?? {}) as Json)),
    other: runRows.find((r) => r.rank === 99)?.normalized_confidence ?? 0,
    candidates: ((meta.candidates as Json[]) ?? []).map((c, i) => storedZone(String(c.zone_id), i + 1, num(c.probability), c)),
    window: head.forecast_window_start && head.forecast_window_end ? { start: head.forecast_window_start, end: head.forecast_window_end } : null,
    windowNote: String(meta.windowNote ?? ""),
    typicalWindowPassed: Boolean(meta.typicalWindowPassed),
    dataQuality: head.data_quality,
    missing: Array.isArray(head.missing_data_flags) ? head.missing_data_flags : [],
    stale: Boolean(meta.stale),
    amountExposed: head.amount_exposed,
    baselineTop: head.baseline_zone,
    baselineTop3: (meta.baselineTop3 as string[]) ?? [],
    baselineBasis: String(meta.baselineBasis ?? ""),
    medianGapMinutes: meta.medianGapMinutes === null || meta.medianGapMinutes === undefined ? null : num(meta.medianGapMinutes),
    eligibleZones: num(meta.eligibleZones),
    valid: true,
    validationError: null,
  };
  run.validationError = validate(run);
  run.valid = run.validationError === null;
  return run;
}
