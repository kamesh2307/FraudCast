// FraudCast – pure calculation logic (no database, no UI). Easy to unit test.
// PRD references: 12.2 (priority), 12.3 (exposure, missing data), 12.4 (graph), Section 15 (validation).

import type { AccountRow, CaseRow, PointRow, PredictionRow, TxnRow } from "./types";
import { minutesBetween } from "./format";
import { STALE_AFTER_MINUTES } from "./demo-time";

/* ------------------------------------------------------------------ */
/* Priority score (PRD 12.2) – transparent rule, not AI                 */
/* ------------------------------------------------------------------ */

export type Band = "Critical" | "High" | "Medium" | "Low";

export const PRIORITY_WEIGHTS = { amount: 0.4, velocity: 0.25, recency: 0.2, forecast: 0.15 } as const;

export function band(score: number): Band {
  if (score >= 0.75) return "Critical";
  if (score >= 0.55) return "High";
  if (score >= 0.35) return "Medium";
  return "Low";
}

export type Priority = {
  score: number;
  band: Band;
  amount: number;
  velocity: number;
  recency: number;
  forecast: number | null; // null until the Phase 4 engine produces forecasts
  explanation: string;
};

export const isWithdrawal = (t: TxnRow) => t.destination_account_id === null || t.destination_account_id === undefined;

/** Median minutes between hops (upper median, matches the Phase 2 generator). */
export function medianGap(txns: TxnRow[]): number | null {
  const gaps = txns
    .map((t) => t.minutes_since_previous_transfer)
    .filter((g): g is number => g !== null && g !== undefined && Number.isFinite(Number(g)))
    .map(Number)
    .sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
}

export function computePriority(
  c: CaseRow,
  txns: TxnRow[],
  maxActiveRisk: number,
  now: Date,
  forecastConfidence: number | null = null,
): Priority {
  const W = PRIORITY_WEIGHTS;
  const amount = maxActiveRisk > 0 ? Math.min(1, Number(c.current_amount_at_risk) / maxActiveRisk) : 0;
  const gap = medianGap(txns);
  const velocity = Math.max(0, 1 - (gap ?? 120) / 120);
  const sinceReport = Math.max(0, minutesBetween(c.report_timestamp, now));
  const recency = 1 - Math.min(sinceReport, 1440) / 1440;
  const base = W.amount * amount + W.velocity * velocity + W.recency * recency;
  // Until forecasts exist, the three available factors are re-scaled to sum to 100%.
  const raw = forecastConfidence === null ? base / (1 - W.forecast) : base + W.forecast * forecastConfidence;
  const score = Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
  const f = (x: number) => `${Math.round(x * 100)}%`;
  const explanation =
    `Score ${score.toFixed(2)} = 40% amount at risk (${f(amount)}) + 25% transfer speed (${f(velocity)}) + 20% recency (${f(recency)})` +
    (forecastConfidence === null
      ? " — forecast term (15%) pending until Phase 4, so the other weights are re-scaled."
      : ` + 15% forecast confidence (${f(forecastConfidence)}).`);
  return { score, band: band(score), amount, velocity, recency, forecast: forecastConfidence, explanation };
}

/* ------------------------------------------------------------------ */
/* Forecast availability (filled by Phase 4)                            */
/* ------------------------------------------------------------------ */

export type ForecastStatus = "Not run" | "Available" | "Insufficient evidence";

export function latestForecast(preds: PredictionRow[]): { status: ForecastStatus; topConfidence: number | null } {
  if (!preds.length) return { status: "Not run", topConfidence: null };
  const latest = [...preds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const run = preds.filter((p) => p.run_id === latest.run_id);
  if (run.some((p) => p.insufficient_evidence)) return { status: "Insufficient evidence", topConfidence: 0 };
  const top = run.find((p) => Number(p.rank) === 1);
  return { status: "Available", topConfidence: top ? Number(top.normalized_confidence) : null };
}

/** Priority for every case at once (max active risk is computed across active cases). */
export function computeAllPriorities(cases: CaseRow[], txns: TxnRow[], preds: PredictionRow[], now: Date) {
  const active = cases.filter((c) => c.status !== "Closed");
  const maxActiveRisk = Math.max(0, ...active.map((c) => Number(c.current_amount_at_risk)));
  const out = new Map<string, Priority & { forecastStatus: ForecastStatus }>();
  for (const c of cases) {
    const fc = latestForecast(preds.filter((p) => p.case_id === c.case_id));
    const p = computePriority(c, txns.filter((t) => t.case_id === c.case_id), maxActiveRisk, now, fc.topConfidence);
    out.set(c.case_id, { ...p, forecastStatus: fc.status });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Data quality (PRD 12.2 CQ-11, Section 15 DV-13/DV-14)                */
/* ------------------------------------------------------------------ */

export function confidenceBand(dq: number): "High" | "Medium" | "Low" {
  const v = Number(dq);
  if (v >= 0.75) return "High";
  if (v >= 0.5) return "Medium";
  return "Low";
}

export function staleMinutes(c: CaseRow, now: Date): number {
  return Math.max(0, minutesBetween(c.data_as_of, now));
}

export function isStale(c: CaseRow, now: Date): boolean {
  return staleMinutes(c, now) > STALE_AFTER_MINUTES;
}

const FIELD_LABELS: Record<string, string> = {
  payment_channel: "Payment channel of the original fraud transfer",
  "destination_zone (last hop)": "Zone of the most recent transfer",
  "account_age_band (exposed account)": "Account age of an account currently holding funds",
};

/** Human-readable list of missing or stale information. Never invents values. */
export function missingInfo(c: CaseRow, now: Date): string[] {
  const raw = (c.missing_fields ?? []).filter((f) => !f.toLowerCase().startsWith("data stale"));
  if (c.payment_channel === null && !raw.includes("payment_channel")) raw.push("payment_channel");
  const list = raw.map((f) => FIELD_LABELS[f] ?? f);
  if (isStale(c, now)) list.push(`Case data is stale (last refreshed ${Math.round(staleMinutes(c, now))} minutes ago)`);
  return list;
}

/* ------------------------------------------------------------------ */
/* Money flow: hops, holdings, splits, sequence checks                  */
/* ------------------------------------------------------------------ */

/** Number of account-to-account transfer steps in the longest chain (hop 0 counts as step 1). */
export function hopCount(txns: TxnRow[]): number {
  const hops = txns.filter((t) => !isWithdrawal(t)).map((t) => Number(t.transfer_hop));
  return hops.length ? Math.max(...hops) + 1 : 0;
}

export type Holding = { inflow: number; outflow: number; held: number };

/** For each account in the case: money in, money out, and fraud funds still held. */
export function holdings(txns: TxnRow[]): Map<string, Holding> {
  const m = new Map<string, Holding>();
  const get = (id: string) => {
    if (!m.has(id)) m.set(id, { inflow: 0, outflow: 0, held: 0 });
    return m.get(id)!;
  };
  for (const t of txns) {
    if (t.status === "Reversed") continue;
    get(t.source_account_id).outflow += Number(t.amount);
    if (!isWithdrawal(t)) get(t.destination_account_id as string).inflow += Number(t.amount);
  }
  for (const h of m.values()) h.held = Math.max(0, Math.round((h.inflow - h.outflow) * 100) / 100);
  return m;
}

export function amountWithdrawn(txns: TxnRow[]): number {
  return txns.filter(isWithdrawal).reduce((s, t) => s + Number(t.amount), 0);
}

/** Accounts that sent money to 3+ different accounts within 60 minutes (PRD MG-07). */
export function splitCounts(txns: TxnRow[], windowMin = 60, threshold = 3): Map<string, number> {
  const bySource = new Map<string, TxnRow[]>();
  for (const t of txns) {
    if (isWithdrawal(t)) continue;
    bySource.set(t.source_account_id, [...(bySource.get(t.source_account_id) ?? []), t]);
  }
  const out = new Map<string, number>();
  for (const [src, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let best = 0;
    for (let i = 0; i < sorted.length; i++) {
      const dests = new Set<string>();
      for (let j = i; j < sorted.length && minutesBetween(sorted[i].timestamp, sorted[j].timestamp) <= windowMin; j++) {
        dests.add(sorted[j].destination_account_id as string);
      }
      best = Math.max(best, dests.size);
    }
    if (best >= threshold) out.set(src, best);
  }
  return out;
}

/** DV-03: transfers that leave an account before money first arrived there. */
export function outOfOrder(txns: TxnRow[], victimId: string): Set<string> {
  const firstIn = new Map<string, string>();
  for (const t of txns) {
    if (isWithdrawal(t)) continue;
    const d = t.destination_account_id as string;
    if (!firstIn.has(d) || t.timestamp < firstIn.get(d)!) firstIn.set(d, t.timestamp);
  }
  const bad = new Set<string>();
  for (const t of txns) {
    if (t.source_account_id === victimId) continue;
    const arrived = firstIn.get(t.source_account_id);
    if (arrived && new Date(t.timestamp) < new Date(arrived)) bad.add(t.transaction_id);
  }
  return bad;
}

/** Inferred indicators from synthetic account attributes. These are signals, never proof. */
export function inferredIndicators(a: AccountRow | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.account_age_band === "Under 30 days") out.push("New account (under 30 days)");
  if (a.recent_activity_band === "Spike" && a.normal_activity_band === "Low") out.push("Activity spike vs normal pattern");
  if (Number(a.previous_synthetic_alert_count) > 0) out.push(`Prior synthetic alerts: ${a.previous_synthetic_alert_count}`);
  if (Number(a.previous_confirmed_synthetic_link_count) > 0)
    out.push(`Linked to past synthetic cases: ${a.previous_confirmed_synthetic_link_count}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Graph model (PRD 12.4)                                               */
/* ------------------------------------------------------------------ */

export type GraphNode = {
  id: string;
  kind: "account" | "cashout";
  title: string;
  subtitle: string;
  col: number;
  row: number;
  isVictim: boolean;
  inflow: number;
  outflow: number;
  held: number;
  exposed: boolean;
  splitCount: number;
  indicators: string[];
  details: { label: string; value: string }[];
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  channel: string;
  hop: number;
  status: string;
  withdrawal: boolean;
  outOfOrder: boolean;
};

export function buildGraph(
  c: CaseRow,
  txns: TxnRow[],
  accounts: Map<string, AccountRow>,
  points: Map<string, PointRow>,
  fmt: { inr: (n: number) => string },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const closed = c.status === "Closed";
  const hold = holdings(txns);
  const splits = splitCounts(txns);
  const bad = outOfOrder(txns, c.victim_account_id);
  const ordered = [...txns].sort((a, b) => Number(a.transfer_hop) - Number(b.transfer_hop) || a.timestamp.localeCompare(b.timestamp));

  // 1) Columns: victim = 0, each receiving account = sender column + 1 (first arrival wins)
  const col = new Map<string, number>([[c.victim_account_id, 0]]);
  const firstSeen = new Map<string, string>([[c.victim_account_id, ""]]);
  for (const t of ordered) {
    if (!col.has(t.source_account_id)) col.set(t.source_account_id, 0);
    if (!firstSeen.has(t.source_account_id)) firstSeen.set(t.source_account_id, t.timestamp);
    if (isWithdrawal(t)) continue;
    const d = t.destination_account_id as string;
    if (!col.has(d)) col.set(d, (col.get(t.source_account_id) ?? 0) + 1);
    if (!firstSeen.has(d)) firstSeen.set(d, t.timestamp);
  }
  const lastAccountCol = Math.max(0, ...col.values());

  // 2) Cash-out nodes, one per withdrawal location, in the final column
  const cashKey = (t: TxnRow) => `CASHOUT:${t.location_id ?? "unknown"}`;
  for (const t of ordered.filter(isWithdrawal)) {
    const k = cashKey(t);
    if (!col.has(k)) col.set(k, lastAccountCol + 1);
    if (!firstSeen.has(k)) firstSeen.set(k, t.timestamp);
  }

  // 3) Rows inside each column, ordered by first arrival time
  const byCol = new Map<number, string[]>();
  for (const [id, cIdx] of col) byCol.set(cIdx, [...(byCol.get(cIdx) ?? []), id]);
  const rowOf = new Map<string, number>();
  for (const ids of byCol.values()) {
    ids.sort((a, b) => (firstSeen.get(a) ?? "").localeCompare(firstSeen.get(b) ?? "") || a.localeCompare(b));
    ids.forEach((id, i) => rowOf.set(id, i));
  }

  const nodes: GraphNode[] = [];
  for (const [id, cIdx] of col) {
    if (id.startsWith("CASHOUT:")) {
      const locId = id.slice("CASHOUT:".length);
      const p = points.get(locId);
      const wd = txns.filter((t) => isWithdrawal(t) && (t.location_id ?? "unknown") === locId);
      const total = wd.reduce((s, t) => s + Number(t.amount), 0);
      nodes.push({
        id, kind: "cashout", title: "Cash withdrawal",
        subtitle: p ? `${p.location_type} · ${p.zone_id}` : "Location not available",
        col: cIdx, row: rowOf.get(id) ?? 0, isVictim: false,
        inflow: total, outflow: 0, held: 0, exposed: false, splitCount: 0, indicators: [],
        details: [
          { label: "Location", value: p ? `${p.location_id} (${p.location_type})` : "Not available" },
          { label: "Zone", value: p?.zone_id ?? wd[0]?.destination_zone ?? "Not available" },
          { label: "Synthetic bank", value: p?.synthetic_bank_code ?? "Not available" },
          { label: "Amount withdrawn here", value: fmt.inr(total) },
          { label: "Withdrawals", value: String(wd.length) },
          { label: "Data type", value: "Confirmed transaction record (synthetic)" },
        ],
      });
      continue;
    }
    const a = accounts.get(id);
    const h = hold.get(id) ?? { inflow: 0, outflow: 0, held: 0 };
    const isVictim = id === c.victim_account_id;
    const exposed = !closed && !isVictim && h.held > 0;
    nodes.push({
      id, kind: "account",
      title: id,
      subtitle: isVictim ? "Victim account (funds sent)" : id === c.initial_beneficiary_account_id ? "Initial beneficiary" : "Beneficiary account",
      col: cIdx, row: rowOf.get(id) ?? 0, isVictim,
      inflow: h.inflow, outflow: h.outflow, held: isVictim ? 0 : h.held, exposed,
      splitCount: splits.get(id) ?? 0,
      indicators: isVictim ? [] : inferredIndicators(a),
      details: [
        { label: "Account type", value: a?.account_type ?? "Not available" },
        { label: "Synthetic bank", value: a?.bank_code ?? "Not available" },
        { label: "Account age", value: a?.account_age_band ?? "Not available" },
        { label: "Received in this case", value: fmt.inr(h.inflow) },
        { label: "Sent or withdrawn", value: fmt.inr(h.outflow) },
        { label: "Case funds still held", value: isVictim ? "—" : fmt.inr(h.held) },
        { label: "Account balance (synthetic)", value: a ? fmt.inr(Number(a.current_balance)) : "Not available" },
        { label: "Review status", value: a?.review_status ?? "Not available" },
      ],
    });
  }

  const edges: GraphEdge[] = txns.map((t) => ({
    id: t.transaction_id,
    from: t.source_account_id,
    to: isWithdrawal(t) ? cashKey(t) : (t.destination_account_id as string),
    amount: Number(t.amount),
    timestamp: t.timestamp,
    channel: t.channel,
    hop: Number(t.transfer_hop),
    status: t.status,
    withdrawal: isWithdrawal(t),
    outOfOrder: bad.has(t.transaction_id),
  }));

  return { nodes, edges };
}
