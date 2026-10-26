// FraudCast – Step 25: fraud-risk management metrics (PRD 12.11). Pure function.
// All figures are computed on synthetic data and must not be presented as real-world performance.

export type MCase = {
  case_id: string; status: string; assigned_analyst: string | null; current_amount_at_risk: number;
  report_timestamp: string; missing_fields: string[] | null; payment_channel: string | null;
};
export type MAlert = {
  alert_id: string; case_id: string; approval_status: string; approved_at: string | null;
  acknowledgement_status: string; acknowledgement_timestamp: string | null;
};
export type MOutcome = {
  case_id: string; actual_cashout_zone: string | null; amount_protected: number; amount_withdrawn: number; amount_unresolved: number;
  forecast_correct_top_one: boolean | null; forecast_correct_top_three: boolean | null; analyst_override: boolean; alert_usefulness: number | null;
};
export type MRun = { run_id: string; case_id: string; model_version: string; baseline_zone: string | null };

export type Metrics = {
  activeCases: number;
  valueAtRisk: number;
  valueProtected: number;
  valueWithdrawn: number;
  valueUnresolved: number;
  closedCases: number;
  medianComplaintToInterventionMin: number | null;
  interventionsMeasured: number;
  medianAckMin: number | null;
  acksMeasured: number;
  forecastEvaluated: number;
  top1: number | null;
  top3: number | null;
  baselineTop1: number | null;
  upliftTop1Pts: number | null;
  falseAlertRate: number | null;
  alertsWithOutcome: number;
  overrideRate: number | null;
  incompleteActive: number;
  modelVersions: { version: string; runs: number }[];
  perAnalyst: { analyst: string; active: number; closed: number }[];
  alertCounts: { draft: number; pending: number; overdue: number; acknowledged: number; discarded: number };
};

const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeMetrics(cases: MCase[], alerts: MAlert[], outcomes: MOutcome[], runs: MRun[]): Metrics {
  const active = cases.filter((c) => c.status !== "Closed");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + Number(b || 0), 0);
  const caseById = new Map(cases.map((c) => [c.case_id, c]));
  const outcomeByCase = new Map(outcomes.map((o) => [o.case_id, o]));
  const approved = alerts.filter((a) => a.approval_status === "Approved" && a.approved_at);

  // Complaint-to-intervention: first approved alert per case minus report time
  const firstApproval = new Map<string, string>();
  for (const a of approved) {
    const cur = firstApproval.get(a.case_id);
    if (!cur || (a.approved_at as string) < cur) firstApproval.set(a.case_id, a.approved_at as string);
  }
  const c2i = [...firstApproval.entries()]
    .map(([cid, at]) => (caseById.get(cid) ? minutes(caseById.get(cid)!.report_timestamp, at) : NaN))
    .filter((m) => Number.isFinite(m) && m >= 0);
  const acks = approved
    .filter((a) => a.acknowledgement_status === "Acknowledged" && a.acknowledgement_timestamp)
    .map((a) => minutes(a.approved_at as string, a.acknowledgement_timestamp as string))
    .filter((m) => Number.isFinite(m) && m >= 0);

  // Forecast accuracy vs baseline: closed cases with a known actual zone, a scored forecast and a stored run
  const baselineByCase = new Map<string, string | null>();
  for (const r of runs) if (!baselineByCase.has(r.case_id)) baselineByCase.set(r.case_id, r.baseline_zone);
  const evaluated = outcomes.filter((o) => o.actual_cashout_zone && o.forecast_correct_top_one !== null && baselineByCase.has(o.case_id));
  const share = (n: number, d: number) => (d ? n / d : null);
  const top1 = share(evaluated.filter((o) => o.forecast_correct_top_one).length, evaluated.length);
  const top3 = share(evaluated.filter((o) => o.forecast_correct_top_three).length, evaluated.length);
  const baselineTop1 = share(evaluated.filter((o) => baselineByCase.get(o.case_id) === o.actual_cashout_zone).length, evaluated.length);

  // False alert: an approved alert whose case outcome shows the actual zone outside the top 3, or usefulness 1–2
  const alertsWithOutcome = approved.filter((a) => outcomeByCase.has(a.case_id));
  const falseAlerts = alertsWithOutcome.filter((a) => {
    const o = outcomeByCase.get(a.case_id)!;
    return o.forecast_correct_top_three === false || (o.alert_usefulness !== null && o.alert_usefulness <= 2);
  });

  const versions = new Map<string, Set<string>>();
  for (const r of runs) {
    if (!versions.has(r.model_version)) versions.set(r.model_version, new Set());
    versions.get(r.model_version)!.add(r.run_id);
  }

  const analysts = new Map<string, { active: number; closed: number }>();
  for (const c of cases) {
    const key = c.assigned_analyst ?? "Unassigned";
    const cur = analysts.get(key) ?? { active: 0, closed: 0 };
    if (c.status === "Closed") cur.closed++;
    else cur.active++;
    analysts.set(key, cur);
  }

  return {
    activeCases: active.length,
    valueAtRisk: sum(active.map((c) => c.current_amount_at_risk)),
    valueProtected: sum(outcomes.map((o) => o.amount_protected)),
    valueWithdrawn: sum(outcomes.map((o) => o.amount_withdrawn)),
    valueUnresolved: sum(outcomes.map((o) => o.amount_unresolved)),
    closedCases: outcomes.length,
    medianComplaintToInterventionMin: median(c2i),
    interventionsMeasured: c2i.length,
    medianAckMin: median(acks),
    acksMeasured: acks.length,
    forecastEvaluated: evaluated.length,
    top1, top3, baselineTop1,
    upliftTop1Pts: top1 !== null && baselineTop1 !== null ? Math.round((top1 - baselineTop1) * 1000) / 10 : null,
    falseAlertRate: share(falseAlerts.length, alertsWithOutcome.length),
    alertsWithOutcome: alertsWithOutcome.length,
    overrideRate: share(outcomes.filter((o) => o.analyst_override).length, outcomes.length),
    incompleteActive: active.filter((c) => (c.missing_fields ?? []).length > 0 || c.payment_channel === null).length,
    modelVersions: [...versions.entries()].map(([version, ids]) => ({ version, runs: ids.size })).sort((a, b) => b.runs - a.runs),
    perAnalyst: [...analysts.entries()].map(([analyst, v]) => ({ analyst, ...v })).sort((a, b) => a.analyst.localeCompare(b.analyst)),
    alertCounts: {
      draft: alerts.filter((a) => a.approval_status === "Draft").length,
      pending: alerts.filter((a) => a.approval_status === "Approved" && a.acknowledgement_status === "Pending").length,
      overdue: alerts.filter((a) => a.acknowledgement_status === "Overdue").length,
      acknowledged: alerts.filter((a) => a.acknowledgement_status === "Acknowledged").length,
      discarded: alerts.filter((a) => a.approval_status === "Discarded").length,
    },
  };
}
