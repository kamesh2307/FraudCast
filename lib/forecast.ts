// FraudCast – cash-out forecasting engine (PRD Sections 16 and 17).
// Plain maths, NOT AI and NOT a trained model. Same inputs + same version = same output.
// Pure functions only: no database, no UI. All tunable numbers live in CONFIG.

import type { AccountRow, CaseRow, CashPointRow, HistoryRow, TxnRow, ZoneRow } from "./types";

export const MODEL_VERSION = "scoring-v0.1.0";

/** PRD 16: Zone Score = 35% history + 25% velocity + 20% proximity + 10% time + 10% access */
export const WEIGHTS = { history: 0.35, velocity: 0.25, proximity: 0.2, time: 0.1, access: 0.1 } as const;
export type FactorKey = keyof typeof WEIGHTS;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  history: "Linked cash-out history",
  velocity: "Transaction velocity",
  proximity: "Graph proximity",
  time: "Time-pattern similarity",
  access: "ATM/branch accessibility",
};

/** Every value here is a buildathon assumption (PRD A-09, A-10). Changing one = new MODEL_VERSION. */
export const CONFIG = {
  temperature: 0.12, // softmax sharpness (PRD suggested 0.5; tuned so the top zone can clear the 25% threshold among ~20 zones)
  minTopScore: 0.4, // insufficient evidence if the best adjusted zone score is below this
  minTopProbability: 0.25, // ... or if the best zone's probability is below this
  historyCap: 3, // linked events needed for a full history score
  fraudTypeMatchWeight: 0.25, // an unlinked past event with the same fraud type counts as a quarter of a linked one
  linkHops: 2, // accounts reachable within this many transfers count as "connected"
  homeBranchBonus: 0.05, // weak signal only (PRD Section 13)
  timeToleranceHours: 3,
  accessCap: 8, // 8+ available points = full accessibility
  projectAheadMinutes: 30,
  minWindowMinutes: 30,
  minWindowEvents: 3,
  penaltyPerMissingField: 0.15,
  stalePenalty: 0.1,
  staleAfterMinutes: 60,
  candidatesToKeep: 6,
} as const;

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type Factors = Record<FactorKey, number>;

export type ZoneScore = {
  zone_id: string;
  factors: Factors;
  raw: number; // weighted score before data-quality adjustment
  adjusted: number; // raw × data quality
  probability: number; // relative probability among eligible zones
  linkedEvents: number;
  typeMatchEvents: number;
  totalEvents: number;
  graphDistance: number | null;
  availablePoints: number;
  homeBranchMatch: boolean;
  related: boolean;
};

export type ForecastWindow = { start: string; end: string; basedOnEvents: number; typicalWindowPassed: boolean };

export type Baseline = { top: string | null; top3: string[]; basis: string };

export type ForecastInput = {
  caseId: string;
  fraudType: string;
  fraudTime: string;
  asOf: string; // the moment the forecast is made
  caseAccounts: string[]; // non-victim accounts that received money in this case
  exposed: string[]; // accounts currently holding case funds
  homeBranches: string[]; // home-branch zones of exposed accounts (weak signal)
  medianGapMinutes: number | null;
  recentDestinationZones: string[];
  amountExposed: number;
  missing: string[]; // critical missing fields
  stale: boolean;
  excludeHistoryId?: string; // leave-one-out evaluation
  mode: "live" | "retrospective" | "leave-one-out";
};

export type ForecastResult = {
  caseId: string;
  modelVersion: string;
  mode: ForecastInput["mode"];
  asOf: string;
  insufficient: boolean;
  insufficientReason: string | null;
  top3: ZoneScore[];
  otherProbability: number;
  candidates: ZoneScore[];
  eligibleZones: number;
  dataQuality: number;
  missing: string[];
  stale: boolean;
  amountExposed: number;
  window: ForecastWindow | null;
  windowNote: string;
  baseline: Baseline;
};

export type ForecastContext = {
  zones: ZoneRow[];
  points: CashPointRow[];
  history: HistoryRow[];
  adjacency: Map<string, Set<string>>; // directed: who sent money to whom, across all cases
  pointsByZone: Map<string, CashPointRow[]>;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const isWithdrawal = (t: TxnRow) => t.destination_account_id === null || t.destination_account_id === undefined;
const addMinutes = (iso: string, m: number) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/** Minutes after midnight in IST (UTC+5:30). */
export function istMinuteOfDay(iso: string): number {
  const m = Math.floor(new Date(iso).getTime() / 60000) + 330;
  return ((m % 1440) + 1440) % 1440;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function isAvailable(p: CashPointRow, iso: string): boolean {
  if (p.operating_status !== "Operational") return false;
  const w = (p.availability_window ?? "").trim();
  if (!w || /24\s*x\s*7/i.test(w)) return true;
  const m = w.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return true; // unknown format: treat as available rather than invent a closure
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  const now = istMinuteOfDay(iso);
  return open <= close ? now >= open && now < close : now >= open || now < close;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function dataQuality(missingCount: number, stale: boolean): number {
  return round(Math.max(0, 1 - CONFIG.penaltyPerMissingField * missingCount - (stale ? CONFIG.stalePenalty : 0)), 2);
}

/* ------------------------------------------------------------------ */
/* Context + input builders                                             */
/* ------------------------------------------------------------------ */

export function buildContext(zones: ZoneRow[], points: CashPointRow[], history: HistoryRow[], allTxns: TxnRow[]): ForecastContext {
  const adjacency = new Map<string, Set<string>>();
  for (const t of allTxns) {
    if (isWithdrawal(t) || t.status === "Reversed") continue; // withdrawals are outcomes, never features
    if (!adjacency.has(t.source_account_id)) adjacency.set(t.source_account_id, new Set());
    adjacency.get(t.source_account_id)!.add(t.destination_account_id as string);
  }
  const pointsByZone = new Map<string, CashPointRow[]>();
  for (const p of points) pointsByZone.set(p.zone_id, [...(pointsByZone.get(p.zone_id) ?? []), p]);
  return { zones, points, history, adjacency, pointsByZone };
}

/**
 * Turn a case into engine input.
 * live          – active case, forecast as of "now", using every recorded transaction.
 * retrospective – closed case, forecast as of the last account-to-account transfer, ignoring
 *                 the withdrawals (they are the answer we are testing against).
 */
export function inputForCase(c: CaseRow, caseTxns: TxnRow[], accounts: Map<string, AccountRow>, now: Date): ForecastInput {
  const retrospective = c.status === "Closed";
  const transfers = caseTxns.filter((t) => !isWithdrawal(t) && t.status !== "Reversed");
  const used = retrospective ? transfers : caseTxns.filter((t) => t.status !== "Reversed");

  const flow = new Map<string, number>();
  for (const t of used) {
    flow.set(t.source_account_id, (flow.get(t.source_account_id) ?? 0) - Number(t.amount));
    if (!isWithdrawal(t)) flow.set(t.destination_account_id as string, (flow.get(t.destination_account_id as string) ?? 0) + Number(t.amount));
  }
  const exposed = [...flow.entries()].filter(([a, v]) => a !== c.victim_account_id && v > 0.5).map(([a]) => a).sort();
  const amountExposed = round([...flow.entries()].filter(([a, v]) => a !== c.victim_account_id && v > 0).reduce((s, [, v]) => s + v, 0), 2);

  const caseAccounts = [...new Set(transfers.map((t) => t.destination_account_id as string))].sort();
  const gaps = transfers
    .map((t) => t.minutes_since_previous_transfer)
    .filter((g): g is number => g !== null && g !== undefined && Number.isFinite(Number(g)))
    .map(Number)
    .sort((a, b) => a - b);
  const medianGapMinutes = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  const recentDestinationZones = [
    ...new Set(transfers.filter((t) => exposed.includes(t.destination_account_id as string) && t.destination_zone).map((t) => t.destination_zone as string)),
  ];

  const lastTransfer = [...transfers].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const missing: string[] = [];
  if (!c.payment_channel) missing.push("payment_channel");
  if (lastTransfer && !lastTransfer.destination_zone) missing.push("destination_zone (last hop)");
  if (exposed.some((a) => !accounts.get(a)?.account_age_band)) missing.push("account_age_band (exposed account)");
  const stale = !retrospective && minutesBetween(c.data_as_of, now.toISOString()) > CONFIG.staleAfterMinutes;

  const asOf = retrospective ? (lastTransfer?.timestamp ?? c.report_timestamp) : now.toISOString();
  return {
    caseId: c.case_id,
    fraudType: c.fraud_type,
    fraudTime: c.fraud_timestamp,
    asOf: new Date(asOf).toISOString(),
    caseAccounts,
    exposed,
    homeBranches: exposed.map((a) => accounts.get(a)?.home_branch_zone).filter((z): z is string => !!z),
    medianGapMinutes,
    recentDestinationZones,
    amountExposed,
    missing,
    stale,
    mode: retrospective ? "retrospective" : "live",
  };
}

/** Leave-one-out input for a past cash-out event (PRD 17): hide the event, then try to predict it. */
export function inputForHistory(h: HistoryRow, accounts: Map<string, AccountRow>): ForecastInput {
  const fraudTime = addMinutes(h.cashout_timestamp, -Number(h.minutes_to_cashout));
  const reach = Math.min(Number(h.transfer_hop_count) * 15, Number(h.minutes_to_cashout) - 1);
  const home = accounts.get(h.final_account_id)?.home_branch_zone;
  return {
    caseId: h.historical_event_id,
    fraudType: h.fraud_type,
    fraudTime,
    asOf: addMinutes(fraudTime, Math.max(0, reach)),
    caseAccounts: [h.final_account_id],
    exposed: [h.final_account_id],
    homeBranches: home ? [home] : [],
    medianGapMinutes: null,
    recentDestinationZones: [],
    amountExposed: Number(h.amount_withdrawn),
    missing: [],
    stale: false,
    excludeHistoryId: h.historical_event_id,
    mode: "leave-one-out",
  };
}

/* ------------------------------------------------------------------ */
/* Baseline (PRD 17)                                                    */
/* ------------------------------------------------------------------ */

const timeBand = (iso: string) => Math.floor(istMinuteOfDay(iso) / 360); // 00-06, 06-12, 12-18, 18-24

export function baseline(input: ForecastInput, history: HistoryRow[]): Baseline {
  const hist = history.filter((h) => h.historical_event_id !== input.excludeHistoryId);
  const band = timeBand(addMinutes(input.asOf, CONFIG.projectAheadMinutes));
  const tiers: { rows: HistoryRow[]; basis: string }[] = [
    { rows: hist.filter((h) => h.fraud_type === input.fraudType && timeBand(h.cashout_timestamp) === band), basis: "same fraud type and time band" },
    { rows: hist.filter((h) => h.fraud_type === input.fraudType), basis: "same fraud type (any time band)" },
    { rows: hist, basis: "all past cash-outs" },
  ];
  const tier = tiers.find((t) => t.rows.length > 0);
  if (!tier) return { top: null, top3: [], basis: "no history" };
  const stats = new Map<string, { n: number; last: string }>();
  for (const h of tier.rows) {
    const s = stats.get(h.cashout_zone_id) ?? { n: 0, last: "" };
    s.n += 1;
    if (h.cashout_timestamp > s.last) s.last = h.cashout_timestamp;
    stats.set(h.cashout_zone_id, s);
  }
  const ranked = [...stats.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last) || a[0].localeCompare(b[0]))
    .map(([z]) => z);
  return { top: ranked[0] ?? null, top3: ranked.slice(0, 3), basis: tier.basis };
}

/* ------------------------------------------------------------------ */
/* The engine                                                           */
/* ------------------------------------------------------------------ */

export function forecast(input: ForecastInput, ctx: ForecastContext): ForecastResult {
  const W = WEIGHTS;
  const history = ctx.history.filter((h) => h.historical_event_id !== input.excludeHistoryId);
  const projected = addMinutes(input.asOf, CONFIG.projectAheadMinutes);
  const projMin = istMinuteOfDay(projected);
  const dq = dataQuality(input.missing.length, input.stale);

  // Graph distances: follow money forward from every account currently holding funds
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const a of input.exposed) {
    dist.set(a, 0);
    queue.push(a);
  }
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of ctx.adjacency.get(a) ?? []) {
      if (!dist.has(b)) {
        dist.set(b, dist.get(a)! + 1);
        queue.push(b);
      }
    }
  }
  const connected = new Set<string>(input.caseAccounts);
  for (const [a, d] of dist) if (d <= CONFIG.linkHops) connected.add(a);

  const velocityBase = input.medianGapMinutes === null ? 0.5 : Math.max(0, 1 - input.medianGapMinutes / 120);

  const scores: ZoneScore[] = [];
  for (const z of ctx.zones) {
    const pts = ctx.pointsByZone.get(z.zone_id) ?? [];
    if (!pts.some((p) => p.operating_status === "Operational")) continue; // not eligible
    const evs = history.filter((h) => h.cashout_zone_id === z.zone_id);
    const linkedEvents = evs.filter((h) => connected.has(h.final_account_id)).length;
    const typeMatchEvents = evs.filter((h) => !connected.has(h.final_account_id) && h.fraud_type === input.fraudType).length;

    const distances = evs.map((h) => dist.get(h.final_account_id)).filter((d): d is number => d !== undefined);
    const graphDistance = distances.length ? Math.min(...distances) : null;
    const homeBranchMatch = input.homeBranches.includes(z.zone_id);
    const related = linkedEvents > 0 || input.recentDestinationZones.includes(z.zone_id);
    const availablePoints = pts.filter((p) => isAvailable(p, projected)).length;
    const timeHits = evs.filter((h) => {
      const diff = Math.abs(istMinuteOfDay(h.cashout_timestamp) - projMin);
      return Math.min(diff, 1440 - diff) <= CONFIG.timeToleranceHours * 60;
    }).length;

    const factors: Factors = {
      history: Math.min(1, (linkedEvents + CONFIG.fraudTypeMatchWeight * typeMatchEvents) / CONFIG.historyCap),
      velocity: related ? velocityBase : velocityBase / 2,
      proximity: Math.min(1, (graphDistance === null ? 0 : 1 / (1 + graphDistance)) + (homeBranchMatch ? CONFIG.homeBranchBonus : 0)),
      time: evs.length ? timeHits / evs.length : 0,
      access: Math.min(1, availablePoints / CONFIG.accessCap),
    };
    const raw = (Object.keys(W) as FactorKey[]).reduce((s, k) => s + W[k] * factors[k], 0);
    scores.push({
      zone_id: z.zone_id,
      factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, round(v)])) as Factors,
      raw: round(raw),
      adjusted: round(raw * dq),
      probability: 0,
      linkedEvents, typeMatchEvents, totalEvents: evs.length,
      graphDistance, availablePoints, homeBranchMatch, related,
    });
  }

  // Normalise into relative probabilities (softmax). Sum = 1 across all eligible zones.
  const maxAdj = Math.max(0, ...scores.map((s) => s.adjusted));
  const exps = scores.map((s) => Math.exp((s.adjusted - maxAdj) / CONFIG.temperature));
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  scores.forEach((s, i) => (s.probability = exps[i] / total));
  scores.sort((a, b) => b.probability - a.probability || a.zone_id.localeCompare(b.zone_id));

  const top3 = scores.slice(0, 3);
  const otherProbability = Math.max(0, 1 - top3.reduce((s, z) => s + z.probability, 0));
  const best = top3[0];
  const anyLink = scores.some((s) => s.linkedEvents > 0 || s.graphDistance !== null);

  let insufficientReason: string | null = null;
  if (!best) insufficientReason = "No eligible cash-out zones (no operational ATM or branch).";
  else if (!input.exposed.length) insufficientReason = "No account is currently holding case funds.";
  else if (!anyLink) insufficientReason = "None of the accounts holding funds can be linked to any past cash-out.";
  else if (best.adjusted < CONFIG.minTopScore) insufficientReason = `Best zone score ${best.adjusted.toFixed(2)} is below the review threshold of ${CONFIG.minTopScore.toFixed(2)}.`;
  else if (best.probability < CONFIG.minTopProbability) insufficientReason = `Best zone probability ${Math.round(best.probability * 100)}% is below the ${Math.round(CONFIG.minTopProbability * 100)}% threshold.`;

  // Indicative time window from past minutes-to-cash-out (PRD 16, step 9)
  let window: ForecastWindow | null = null;
  let windowNote = "";
  if (!insufficientReason) {
    const topIds = new Set(top3.map((s) => s.zone_id));
    let evs = history.filter((h) => topIds.has(h.cashout_zone_id) && (connected.has(h.final_account_id) || h.fraud_type === input.fraudType));
    if (evs.length < CONFIG.minWindowEvents) evs = history.filter((h) => h.fraud_type === input.fraudType);
    if (evs.length < CONFIG.minWindowEvents) {
      windowNote = "Time window unavailable: insufficient history.";
    } else {
      const mins = evs.map((h) => Number(h.minutes_to_cashout)).sort((a, b) => a - b);
      // Funds can be withdrawn from the moment of the forecast, so the window opens "now" and closes when
      // similar past cases had usually been cashed out (75th percentile of minutes-to-cash-out).
      const start = input.asOf;
      let end = addMinutes(input.fraudTime, percentile(mins, 0.75));
      const passed = new Date(end) <= new Date(input.asOf);
      if (passed) {
        end = addMinutes(input.asOf, CONFIG.minWindowMinutes);
        windowNote = "Similar past cases had usually cashed out by now. Treat cash-out as imminent or possibly already under way.";
      } else {
        if (minutesBetween(start, end) < CONFIG.minWindowMinutes) end = addMinutes(start, CONFIG.minWindowMinutes);
        windowNote = `Open from now until similar past cases were usually cashed out (75th percentile of ${evs.length} similar past cash-outs).`;
      }
      window = { start: new Date(start).toISOString(), end: new Date(end).toISOString(), basedOnEvents: evs.length, typicalWindowPassed: passed };
    }
  }

  return {
    caseId: input.caseId,
    modelVersion: MODEL_VERSION,
    mode: input.mode,
    asOf: input.asOf,
    insufficient: insufficientReason !== null,
    insufficientReason,
    top3: top3.map((s) => ({ ...s, probability: round(s.probability) })),
    otherProbability: round(otherProbability),
    candidates: scores.slice(0, CONFIG.candidatesToKeep).map((s) => ({ ...s, probability: round(s.probability) })),
    eligibleZones: scores.length,
    dataQuality: dq,
    missing: input.missing,
    stale: input.stale,
    amountExposed: input.amountExposed,
    window,
    windowNote,
    baseline: baseline(input, ctx.history),
  };
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                      */
/* ------------------------------------------------------------------ */

/** Largest-remainder rounding so displayed percentages always add up to exactly 100 (DV-08). */
export function roundTo100(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return values.map(() => 0);
  const scaled = values.map((v) => (v / total) * 100);
  const floors = scaled.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** Contribution of each factor to a zone's raw score (weight × value), largest first. */
export function contributions(f: Factors): { key: FactorKey; label: string; value: number; contribution: number }[] {
  return (Object.keys(WEIGHTS) as FactorKey[])
    .map((k) => ({ key: k, label: FACTOR_LABELS[k], value: f[k], contribution: round(WEIGHTS[k] * f[k]) }))
    .sort((a, b) => b.contribution - a.contribution);
}
