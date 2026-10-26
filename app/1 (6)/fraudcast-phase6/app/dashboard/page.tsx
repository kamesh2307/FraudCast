// Step 25 – Fraud-risk management dashboard (PRD 12.11)
import Link from "next/link";
import { Badge, Card, Notice, StatusBadge, Tile } from "../../components/fc/ui";
import { duration, inr } from "../../lib/format";
import { db } from "../../lib/supabase";
import { syncSimulatedAlerts } from "../../lib/workflow/alerts";
import { computeMetrics, type MAlert, type MCase, type MOutcome, type MRun } from "../../lib/workflow/metrics";


const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const toNum = <T,>(rows: unknown[] | null, fields: string[]): T[] =>
  (rows ?? []).map((r) => {
    const o = { ...(r as Record<string, unknown>) };
    for (const f of fields) if (o[f] !== null && o[f] !== undefined) o[f] = Number(o[f]);
    return o as T;
  });

export default async function DashboardPage() {
  await syncSimulatedAlerts().catch(() => 0);
  const s = db();
  const [c, a, o, p] = await Promise.all([
    s.from("cases").select("case_id,status,assigned_analyst,current_amount_at_risk,report_timestamp,missing_fields,payment_channel"),
    s.from("alerts").select("alert_id,case_id,recipient_id,approval_status,approved_at,acknowledgement_status,acknowledgement_timestamp,escalation_deadline,created_at"),
    s.from("outcomes").select("case_id,actual_cashout_zone,amount_protected,amount_withdrawn,amount_unresolved,forecast_correct_top_one,forecast_correct_top_three,analyst_override,alert_usefulness"),
    s.from("predictions").select("run_id,case_id,model_version,baseline_zone"),
  ]);
  for (const [name, r] of [["cases", c], ["alerts", a], ["outcomes", o], ["predictions", p]] as const) {
    if (r.error) throw new Error(`Could not read ${name}: ${r.error.message}`);
  }
  const cases = toNum<MCase>(c.data, ["current_amount_at_risk"]);
  const alerts = (a.data ?? []) as (MAlert & { recipient_id: string; escalation_deadline: string | null; created_at: string })[];
  const outcomes = toNum<MOutcome>(o.data, ["amount_protected", "amount_withdrawn", "amount_unresolved", "alert_usefulness"]);
  const m = computeMetrics(cases, alerts, outcomes, (p.data ?? []) as MRun[]);
  const attention = alerts
    .filter((x) => x.approval_status === "Draft" || x.acknowledgement_status === "Pending" || x.acknowledgement_status === "Overdue")
    .sort((x, y) => (x.acknowledgement_status === "Overdue" ? -1 : 0) - (y.acknowledgement_status === "Overdue" ? -1 : 0) || x.created_at.localeCompare(y.created_at));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Fraud-risk management dashboard</h1>
          <p className="text-sm text-slate-600">Team workload, money outcomes, alert handling and forecast performance.</p>
        </div>
        <Link href="/audit" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Open audit log →</Link>
      </div>

      <Notice tone="amber">
        <strong>Synthetic data.</strong> Computed on {m.closedCases} closed synthetic case(s). These numbers show the workflow and measurement working, not real-world performance.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Value at risk (active)" value={inr(m.valueAtRisk)} sub={`${m.activeCases} active case(s)`} href="/cases" tone="amber" />
        <Tile label="Value protected" value={inr(m.valueProtected)} sub={`${m.closedCases} closed case(s)`} href="/cases?status=Closed" tone="green" />
        <Tile label="Value withdrawn" value={inr(m.valueWithdrawn)} sub="Cashed out before intervention worked" tone="red" />
        <Tile label="Value unresolved" value={inr(m.valueUnresolved)} sub="Closed cases, still not recovered or traced" tone="slate" />
        <Tile label="Median complaint → intervention" value={m.medianComplaintToInterventionMin === null ? "—" : duration(m.medianComplaintToInterventionMin)} sub={`Report to first alert approval · ${m.interventionsMeasured} case(s)`} tone="blue" />
        <Tile label="Median alert acknowledgement" value={m.medianAckMin === null ? "—" : duration(m.medianAckMin)} sub={`${m.acksMeasured} acknowledged alert(s) · simulated`} tone="blue" />
        <Tile label="Alerts needing attention" value={m.alertCounts.draft + m.alertCounts.pending + m.alertCounts.overdue} sub={<>{m.alertCounts.overdue > 0 && <span className="font-medium text-red-700">⚠ {m.alertCounts.overdue} overdue · </span>}{m.alertCounts.pending} pending · {m.alertCounts.draft} draft</>} tone={m.alertCounts.overdue ? "red" : "purple"} />
        <Tile label="Active cases with incomplete data" value={m.incompleteActive} sub="Missing fields shown as gaps, never estimated" tone="slate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Forecast performance" right={<Badge tone="slate">n = {m.forecastEvaluated}</Badge>}>
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr><td className="py-1.5">Top-1 accuracy (actual zone ranked first)</td><td className="text-right font-semibold">{pct(m.top1)}</td></tr>
              <tr><td className="py-1.5">Top-3 recall (actual zone in top 3)</td><td className="text-right font-semibold">{pct(m.top3)}</td></tr>
              <tr><td className="py-1.5">Baseline top-1 accuracy</td><td className="text-right">{pct(m.baselineTop1)}</td></tr>
              <tr><td className="py-1.5">Uplift over baseline (top-1)</td><td className="text-right font-semibold">{m.upliftTop1Pts === null ? "—" : `${m.upliftTop1Pts > 0 ? "+" : ""}${m.upliftTop1Pts.toFixed(1)} pts`}</td></tr>
              <tr><td className="py-1.5">False-alert rate (actual zone outside top 3, or usefulness 1–2)</td><td className="text-right">{pct(m.falseAlertRate)} <span className="text-xs text-slate-500">of {m.alertsWithOutcome}</span></td></tr>
              <tr><td className="py-1.5">Override rate (analyst acted differently from forecast)</td><td className="text-right">{pct(m.overrideRate)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Based on closed cases with a known cash-out zone. With so few cases, one case moves these numbers a lot. See <Link href="/evaluation" className="underline">Evaluation</Link> for the larger historical test.</p>
        </Card>

        <Card title="Workload by analyst">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1">Analyst</th><th className="text-right">Active</th><th className="text-right">Closed</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {m.perAnalyst.map((r) => (
                <tr key={r.analyst}><td className="py-1.5 font-mono text-xs">{r.analyst}</td><td className="text-right tabular-nums">{r.active}</td><td className="text-right tabular-nums">{r.closed}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Model versions in use</h3>
          <ul className="mt-1 text-sm">
            {m.modelVersions.length ? m.modelVersions.map((v) => <li key={v.version}><span className="font-mono text-xs">{v.version}</span> · {v.runs} forecast run(s)</li>) : <li className="text-slate-500">No forecasts yet. Run them from the Overview page.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Alerts needing attention" right={<Badge tone="slate">Simulated recipients</Badge>}>
        {attention.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing waiting. Every alert is acknowledged, discarded or closed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-1 pr-3">Alert</th><th className="pr-3">Case</th><th className="pr-3">Recipient</th><th className="pr-3">Status</th><th>Deadline</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attention.map((x) => (
                  <tr key={x.alert_id} className={x.acknowledgement_status === "Overdue" ? "bg-red-50" : ""}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{x.alert_id}</td>
                    <td className="pr-3"><Link href={`/cases/${x.case_id}`} className="font-mono text-xs text-blue-700 underline">{x.case_id}</Link></td>
                    <td className="pr-3 font-mono text-xs">{x.recipient_id}</td>
                    <td className="pr-3">{x.approval_status === "Draft" ? <Badge tone="amber">Draft · awaiting approval</Badge> : <StatusBadge status={x.acknowledgement_status} />}</td>
                    <td className="text-xs">{x.escalation_deadline ? new Date(x.escalation_deadline).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
