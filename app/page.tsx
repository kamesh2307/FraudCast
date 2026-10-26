// Step 9 – Fraud Operations Overview (PRD 12.1) – updated in Phase 4 with forecast controls
import Link from "next/link";
import { runAllForecasts } from "./actions/forecast";
import SubmitButton from "../components/fc/SubmitButton";
import { Card, Notice, StatusBadge, Tile } from "../components/fc/ui";
import { computeAllPriorities, isStale, latestForecast } from "../lib/calc";
import { loadOverview } from "../lib/data";
import { demoNow } from "../lib/demo-time";
import { duration, inr, minutesBetween } from "../lib/format";


const STATUSES = ["New", "In Review", "Alert Sent", "Acknowledged", "Closed"] as const;

export default async function OverviewPage() {
  const now = demoNow();
  const { cases, txns, preds, alerts, outcomes } = await loadOverview();
  const prio = computeAllPriorities(cases, txns, preds, now);

  const active = cases.filter((c) => c.status !== "Closed");
  const critical = active.filter((c) => prio.get(c.case_id)?.band === "Critical");
  const totalAtRisk = active.reduce((s, c) => s + c.current_amount_at_risk, 0);
  const protectedAmt = outcomes.reduce((s, o) => s + o.amount_protected, 0);

  const reportOf = new Map(cases.map((c) => [c.case_id, c.report_timestamp]));
  const responseTimes = alerts
    .filter((a) => a.approval_status === "Approved" && a.approved_at && reportOf.get(a.case_id))
    .map((a) => minutesBetween(reportOf.get(a.case_id) as string, a.approved_at as string))
    .filter((m) => m >= 0);
  const avgResponse = responseTimes.length ? responseTimes.reduce((s, m) => s + m, 0) / responseTimes.length : null;

  const isOverdue = (a: (typeof alerts)[number]) =>
    a.acknowledgement_status === "Overdue" ||
    (a.acknowledgement_status === "Pending" && !!a.escalation_deadline && new Date(a.escalation_deadline) < now);
  const pending = alerts.filter((a) => a.approval_status === "Approved" && a.acknowledgement_status === "Pending" && !isOverdue(a));
  const overdue = alerts.filter(isOverdue);

  const stale = active.filter((c) => isStale(c, now));
  const lowQuality = active.filter((c) => c.data_quality < 0.5);
  const withGaps = active.filter((c) => (c.missing_fields ?? []).length > 0 || c.payment_channel === null);

  const fc = active.map((c) => latestForecast(preds.filter((p) => p.case_id === c.case_id)).status);
  const fcAvailable = fc.filter((s) => s === "Available").length;
  const fcInsufficient = fc.filter((s) => s === "Insufficient evidence").length;
  const fcNotRun = fc.filter((s) => s === "Not run").length;

  const statusCounts = STATUSES.map((s) => ({ status: s, n: cases.filter((c) => c.status === s).length }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fraud operations overview</h1>
          <p className="text-sm text-slate-600">Live position across all synthetic cases. Select a tile to open the matching cases.</p>
        </div>
        <form action={runAllForecasts}>
          <SubmitButton label="Run forecasts for all cases" pendingLabel="Running forecasts…" />
        </form>
      </div>

      {fcNotRun > 0 && (
        <Notice tone="blue">
          {fcNotRun} active case(s) have no forecast yet. Select <strong>Run forecasts for all cases</strong> to rank likely cash-out zones and update priorities.
        </Notice>
      )}

      {(stale.length > 0 || lowQuality.length > 0) && (
        <Notice tone="amber">
          <strong>Data-health warning:</strong>{" "}
          {stale.length > 0 && <>{stale.length} case(s) have stale data ({stale.map((c) => c.case_id).join(", ")}). </>}
          {lowQuality.length > 0 && <>{lowQuality.length} case(s) have low data confidence. </>}
          Forecasts for these cases will carry lower confidence.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Active cases" value={active.length} sub={`${withGaps.length} with missing information`} href="/cases" tone="blue" />
        <Tile label="Critical cases" value={critical.length} sub="Priority score ≥ 0.75" href="/cases?urgency=Critical" tone="red" />
        <Tile label="Total amount at risk" value={inr(totalAtRisk)} sub="Across active cases" href="/cases?sort=amount" tone="amber" />
        <Tile label="Amount protected" value={inr(protectedAmt)} sub={`From ${outcomes.length} closed synthetic cases`} href="/cases?status=Closed" tone="green" />
        <Tile label="Avg complaint-to-intervention" value={avgResponse === null ? "Not available" : duration(avgResponse)} sub={`Report → alert approval, ${responseTimes.length} alerts`} />
        <Tile
          label="Alerts awaiting acknowledgement"
          value={pending.length}
          sub={<>{overdue.length > 0 ? <span className="font-medium text-red-700">⚠ {overdue.length} overdue · </span> : null}Simulated recipients</>}
          href="/cases?status=Alert+Sent"
          tone={overdue.length ? "red" : "amber"}
        />
        <Tile label="Stale or low-confidence cases" value={stale.length + lowQuality.length} sub="Data older than 60 min or confidence < 0.50" />
        <Tile
          label="Active forecasts"
          value={`${fcAvailable} / ${active.length}`}
          sub={<>{fcInsufficient > 0 && <span className="text-amber-800">{fcInsufficient} insufficient evidence · </span>}<Link href="/evaluation" className="underline">See evaluation</Link></>}
          tone="purple"
        />
      </div>

      <Card title="Case status summary">
        <ul className="flex flex-wrap gap-3">
          {statusCounts.map(({ status, n }) => (
            <li key={status}>
              <Link href={`/cases?status=${encodeURIComponent(status)}`} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">
                <StatusBadge status={status} />
                <span className="text-lg font-semibold">{n}</span>
              </Link>
            </li>
          ))}
          <li className="flex items-center px-2 text-sm text-slate-500">Total: {cases.length}</li>
        </ul>
      </Card>

      <p className="text-xs text-slate-500">Computed on synthetic data; does not represent real-world performance.</p>
    </div>
  );
}
