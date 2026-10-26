// FraudCast – Step 24 on the case page: record the outcome (open cases) or show the locked outcome (closed cases).

import OutcomeForm, { type OutcomeZone } from "./OutcomeForm";
import { Badge, Card } from "./ui";
import { dt, inr } from "../../lib/format";
import { db } from "../../lib/supabase";

type OutcomeView = {
  outcome_id: string; actual_cashout_zone: string | null; actual_cashout_timestamp: string | null; forecast_rank: number | null;
  forecast_correct_top_three: boolean | null; original_amount_at_risk: number; amount_protected: number; amount_withdrawn: number;
  amount_unresolved: number; intervention_result: string; analyst_override: boolean; override_reason: string | null;
  analyst_feedback: string | null; alert_usefulness: number | null; closed_at: string | null;
};

export default async function OutcomeSection({
  caseId, closed, original, alreadyWithdrawn, hasApprovedAlert, rankedZones,
}: {
  caseId: string;
  closed: boolean;
  original: number;
  alreadyWithdrawn: number;
  hasApprovedAlert: boolean;
  rankedZones: string[];
}) {
  if (closed) {
    const res = await db().from("outcomes").select("*").eq("case_id", caseId).maybeSingle();
    const o = (res.data ?? null) as OutcomeView | null;
    return (
      <Card title="Outcome" right={<Badge tone="slate">🔒 Locked</Badge>}>
        {!o ? (
          <p className="text-sm text-slate-600">The case is closed but no outcome record was found.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Result</dt><dd className="font-semibold">{o.intervention_result}</dd></div>
            <div><dt className="text-xs text-slate-500">Protected</dt><dd className="font-semibold text-emerald-800">{inr(Number(o.amount_protected))}</dd></div>
            <div><dt className="text-xs text-slate-500">Withdrawn</dt><dd className="font-semibold text-red-800">{inr(Number(o.amount_withdrawn))}</dd></div>
            <div><dt className="text-xs text-slate-500">Unresolved</dt><dd className="font-semibold">{inr(Number(o.amount_unresolved))}</dd></div>
            <div><dt className="text-xs text-slate-500">Actual cash-out zone</dt><dd>{o.actual_cashout_zone ?? "Not known"}</dd></div>
            <div><dt className="text-xs text-slate-500">Forecast rank of actual zone</dt><dd>{o.actual_cashout_zone ? (o.forecast_rank ? `#${o.forecast_rank} ✓` : "Not in top 3 ✕") : "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Alert usefulness</dt><dd>{o.alert_usefulness ? `${o.alert_usefulness} / 5` : "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Closed</dt><dd>{dt(o.closed_at)}</dd></div>
            {o.analyst_override && <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-slate-500">Override reason</dt><dd>{o.override_reason}</dd></div>}
            {o.analyst_feedback && <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-slate-500">Comments</dt><dd>{o.analyst_feedback}</dd></div>}
          </dl>
        )}
      </Card>
    );
  }

  const zres = await db().from("zones").select("zone_id,zone_name").order("zone_id", { ascending: true });
  const zones: OutcomeZone[] = ((zres.data ?? []) as { zone_id: string; zone_name: string }[]).map((z) => ({
    ...z, rank: rankedZones.includes(z.zone_id) ? rankedZones.indexOf(z.zone_id) + 1 : null,
  }));
  return (
    <Card title="Record outcome" right={<Badge tone="amber">Case open</Badge>}>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-blue-700">Open the outcome form (closes the case)</summary>
        <div className="mt-3">
          <OutcomeForm caseId={caseId} original={original} alreadyWithdrawn={alreadyWithdrawn} zones={zones} hasApprovedAlert={hasApprovedAlert} />
        </div>
      </details>
    </Card>
  );
}
