// FraudCast – rule-based forecast explanation (PRD 12.7). Not AI.
// Every sentence is built from numbers the engine stored, so nothing can be invented.
// Phase 5's AI explanation will be checked against this.

import { contributions, FACTOR_LABELS, type FactorKey } from "./forecast";
import type { StoredRun, StoredZone } from "./forecast-data";

export const FIELD_LABELS: Record<string, string> = {
  payment_channel: "payment channel of the original transfer",
  "destination_zone (last hop)": "zone of the most recent transfer",
  "account_age_band (exposed account)": "account age of an account holding funds",
};

export function evidence(key: FactorKey, z: StoredZone, run: StoredRun): string {
  switch (key) {
    case "history":
      if (z.linkedEvents > 0)
        return `${z.linkedEvents} past cash-out(s) in this zone were made by accounts connected to this case${z.typeMatchEvents ? `, plus ${z.typeMatchEvents} by unconnected accounts in the same fraud category` : ""}.`;
      if (z.typeMatchEvents > 0) return `No connected account has cashed out here, but ${z.typeMatchEvents} past case(s) of the same fraud type did.`;
      return "No past cash-outs here are linked to this case.";
    case "proximity":
      if (z.graphDistance === 0) return `An account currently holding funds has itself cashed out in this zone before${z.homeBranchMatch ? " (its home branch is also here, a weak signal)" : ""}.`;
      if (z.graphDistance !== null)
        return `An account holding funds is ${z.graphDistance} transfer(s) away from an account that previously cashed out here.`;
      return z.homeBranchMatch ? "Only weak link: an exposed account's home branch is in this zone." : "No transfer path links this case to past cash-outs here.";
    case "velocity":
      return run.medianGapMinutes === null
        ? "Transfer speed could not be measured."
        : `Funds moved quickly (median ${run.medianGapMinutes} min between transfers), which raises urgency for zones linked to the latest transfers.`;
    case "time":
      return z.totalEvents
        ? "Past cash-outs here happened at a similar time of day to the projected cash-out time."
        : "No past cash-outs here to compare timing with.";
    case "access":
      return `${z.availablePoints} cash-out point(s) in this zone are open during the forecast window (context only, not evidence of fraud).`;
  }
}

export type Explanation = {
  headline: string;
  topReasons: { label: string; contribution: number; text: string }[];
  alternatives: string[];
  dataUsed: string[];
  missing: string[];
  limitations: string[];
  baseline: string;
};

export function explainRun(run: StoredRun, name: (zoneId: string) => string, historyCount: number): Explanation | null {
  if (run.insufficient || !run.valid || !run.top3.length) return null;
  const top = run.top3[0];
  const topC = top.factors ? contributions(top.factors) : [];
  const lead = topC[0];

  const topReasons = topC.slice(0, 3).filter((c) => c.contribution > 0).map((c) => ({
    label: c.label, contribution: c.contribution, text: evidence(c.key, top, run),
  }));

  const alternatives = run.top3.slice(1).map((z) => {
    const gap = top.adjusted !== null && z.adjusted !== null ? (top.adjusted - z.adjusted).toFixed(2) : "n/a";
    if (!top.factors || !z.factors) return `${name(z.zone_id)} ranked ${z.rank} (score gap ${gap}).`;
    const deficits = (Object.keys(top.factors) as FactorKey[])
      .map((k) => ({ k, d: contributions(top.factors!).find((c) => c.key === k)!.contribution - contributions(z.factors!).find((c) => c.key === k)!.contribution }))
      .sort((a, b) => b.d - a.d);
    const weakest = deficits[0];
    return `${name(z.zone_id)} ranked ${z.rank}: score ${gap} lower than rank 1, mainly weaker ${FACTOR_LABELS[weakest.k].toLowerCase()}. ${evidence(weakest.k, z, run)}`;
  });

  const missing = run.missing.map((m) => FIELD_LABELS[m] ?? m);
  const limitations: string[] = [];
  if (run.dataQuality < 0.75) limitations.push(`Data quality is ${Math.round(run.dataQuality * 100)}%, so all zone scores were reduced.`);
  if (run.stale) limitations.push("Case data is more than 60 minutes old. Refresh the case data before acting.");
  if (run.typicalWindowPassed) limitations.push("Similar past cases had usually cashed out by now, so funds may already be moving to cash.");
  if (top.probability < 0.5) limitations.push("No single zone is clearly dominant. Consider all three ranked zones.");
  limitations.push("Weights and thresholds are buildathon assumptions and have not been validated on real bank data.");

  const agree = run.baselineTop === top.zone_id;
  const baseline = run.baselineTop
    ? `A simple baseline (most frequent past cash-out zone for ${run.baselineBasis}) picks ${name(run.baselineTop)}. ${agree ? "It agrees with rank 1." : run.top3.some((z) => z.zone_id === run.baselineTop) ? "It appears lower in the forecast's top 3." : "It disagrees with the forecast's top 3, because the forecast weighs account links more than overall frequency."}`
    : "No baseline could be computed (no relevant history).";

  return {
    headline: `${name(top.zone_id)} ranked first mainly because of ${lead ? lead.label.toLowerCase() : "its combined score"}.`,
    topReasons,
    alternatives,
    dataUsed: [
      "Account-to-account transfers in this case and in other recorded synthetic cases",
      `${historyCount} past synthetic cash-out events (zone, time, account, fraud type)`,
      "Operational status and opening hours of synthetic ATMs and branches",
      `${run.eligibleZones} eligible zones (zones with at least one operational cash-out point)`,
    ],
    missing,
    limitations,
    baseline,
  };
}
