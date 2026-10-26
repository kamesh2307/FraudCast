// FraudCast – the ONLY data the AI is allowed to see about a case.
// Values are pre-formatted (₹, IST times, %) so the AI can copy them, and so the grounding check
// can compare the AI's text against exactly what it was given.

import { amountWithdrawn, holdings, hopCount, isWithdrawal, missingInfo, splitCounts } from "../calc";
import type { Explanation } from "../explain";
import { contributions, roundTo100, WEIGHTS } from "../forecast";
import type { StoredRun } from "../forecast-data";
import { dt, duration, inr } from "../format";
import type { CaseRow, OutcomeRow, TxnRow } from "../types";

export type CaseFacts = Record<string, unknown> & { case_id: string };
export type ForecastFacts = Record<string, unknown> & { status: string };
export type ZoneInfo = { zone_id: string; zone_name: string; jurisdiction: string };

export function buildCaseFacts(c: CaseRow, txns: TxnRow[], outcome: OutcomeRow | null, now: Date): CaseFacts {
  const closed = c.status === "Closed";
  const hold = holdings(txns);
  const holders = [...hold.entries()].filter(([a, h]) => a !== c.victim_account_id && h.held > 0);
  const splits = [...splitCounts(txns).entries()];
  const transfers = txns.filter((t) => !isWithdrawal(t));
  return {
    case_id: c.case_id,
    status: c.status,
    fraud_type: c.fraud_type,
    payment_channel: c.payment_channel ?? "Not available",
    fraud_time: dt(c.fraud_timestamp),
    report_time: dt(c.report_timestamp),
    reporting_delay: duration(c.reporting_delay_minutes),
    original_amount: inr(c.original_amount),
    current_amount_at_risk: inr(c.current_amount_at_risk),
    already_withdrawn_as_cash: inr(amountWithdrawn(txns)),
    victim_account_id: c.victim_account_id,
    initial_beneficiary_account_id: c.initial_beneficiary_account_id,
    beneficiary_account_count: new Set(transfers.map((t) => t.destination_account_id)).size,
    transfer_steps: hopCount(txns),
    split_pattern: splits.length
      ? splits.map(([acc, n]) => `${acc} sent funds to ${n} accounts within 60 minutes`).join("; ")
      : "No account sent funds to 3 or more accounts within 60 minutes",
    accounts_holding_funds: closed ? "Not applicable (case closed)" : holders.map(([acc, h]) => ({ account_id: acc, amount_held: inr(h.held) })),
    transfers: txns.map((t) => ({
      time: dt(t.timestamp),
      from: t.source_account_id,
      to: isWithdrawal(t) ? `cash withdrawal at ${t.location_id ?? "location not available"} in ${t.destination_zone ?? "zone not available"}` : t.destination_account_id,
      amount: inr(t.amount),
      channel: t.channel === "Unknown" ? "Not available" : t.channel,
      step: isWithdrawal(t) ? "cash-out" : `transfer step ${Number(t.transfer_hop) + 1}`,
    })),
    missing_information: missingInfo(c, now),
    outcome: outcome
      ? { amount_protected: inr(outcome.amount_protected), amount_withdrawn: inr(outcome.amount_withdrawn), amount_unresolved: inr(outcome.amount_unresolved) }
      : "Not applicable (case still open)",
  };
}

export function buildForecastFacts(run: StoredRun | null, explanation: Explanation | null, zones: Map<string, ZoneInfo>): ForecastFacts {
  if (!run) return { status: "Forecast not run yet" };
  if (!run.valid) return { status: "Forecast unavailable because of a calculation error" };
  if (run.insufficient) {
    return {
      status: "Insufficient evidence",
      reason: run.insufficientReason ?? "Not available",
      message: "Insufficient evidence to narrow the forecast. Continue monitoring or conduct additional review.",
    };
  }
  const percents = roundTo100([...run.top3.map((z) => z.probability), run.other]);
  const top = run.top3[0];
  const breakdown = top.factors ? contributions(top.factors) : [];
  return {
    status: "Available (indicative forecast, requires human review)",
    model_version: run.modelVersion,
    ranked_zones: run.top3.map((z, i) => ({
      rank: z.rank,
      zone_id: z.zone_id,
      zone_name: zones.get(z.zone_id)?.zone_name ?? "Not available",
      jurisdiction: zones.get(z.zone_id)?.jurisdiction ?? "Not available",
      probability: `${percents[i]}%`,
    })),
    all_other_zones: `${percents[3]}%`,
    amount_exposed: inr(run.amountExposed),
    cash_out_window: run.window ? `${dt(run.window.start)} to ${dt(run.window.end)}` : "Not available",
    window_note: run.windowNote || "Not available",
    data_quality: `${Math.round(run.dataQuality * 100)}%`,
    leading_factor: breakdown[0]?.label ?? "Not available",
    rank_1_score_breakdown: breakdown.map((b) => ({ factor: b.label, contribution: b.contribution.toFixed(2), maximum: WEIGHTS[b.key].toFixed(2) })),
    rank_1_reasons: explanation?.topReasons.map((r) => `${r.label}: ${r.text}`) ?? [],
    why_alternatives_ranked_lower: explanation?.alternatives ?? [],
    limitations: explanation?.limitations ?? [],
    missing_data: explanation?.missing.length ? explanation.missing : ["None"],
    baseline_comparison: explanation?.baseline ?? "Not available",
  };
}
