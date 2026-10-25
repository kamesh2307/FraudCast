// Step 10 – Active Case Queue (PRD 12.2)
import Link from "next/link";
import { Card, ConfidenceBadge, ForecastBadge, PriorityBadge, StatusBadge } from "../../components/fc/ui";
import { computeAllPriorities, confidenceBand, hopCount, isStale, missingInfo } from "../../lib/calc";
import { loadAllCases } from "../../lib/data";
import { demoNow } from "../../lib/demo-time";
import { duration, dt, inr, minutesBetween } from "../../lib/format";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const URGENCY = ["Critical", "High", "Medium", "Low"];
const STATUS_OPTIONS = [
  { v: "active", label: "All active (not closed)" },
  { v: "all", label: "All cases" },
  { v: "New", label: "New" },
  { v: "In Review", label: "In Review" },
  { v: "Alert Sent", label: "Alert Sent" },
  { v: "Acknowledged", label: "Acknowledged" },
  { v: "Closed", label: "Closed" },
];
const SORTS = [
  { v: "priority", label: "Priority (highest first)" },
  { v: "amount", label: "Amount at risk (highest first)" },
  { v: "oldest", label: "Time since report (longest first)" },
  { v: "newest", label: "Time since report (newest first)" },
];

export default async function QueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const urgency = URGENCY.includes(one(sp.urgency)) ? one(sp.urgency) : "";
  const status = STATUS_OPTIONS.some((s) => s.v === one(sp.status)) ? one(sp.status) : "active";
  const sort = SORTS.some((s) => s.v === one(sp.sort)) ? one(sp.sort) : "priority";
  const typeParam = one(sp.type);

  const now = demoNow();
  const { cases, txns, preds } = await loadAllCases();
  const prio = computeAllPriorities(cases, txns, preds, now);
  const fraudTypes = Array.from(new Set(cases.map((c) => c.fraud_type))).sort();
  const type = fraudTypes.includes(typeParam) ? typeParam : "";

  const rows = cases
    .filter((c) => (status === "all" ? true : status === "active" ? c.status !== "Closed" : c.status === status))
    .filter((c) => !urgency || prio.get(c.case_id)?.band === urgency)
    .filter((c) => !type || c.fraud_type === type)
    .map((c) => {
      const ct = txns.filter((t) => t.case_id === c.case_id);
      return { c, p: prio.get(c.case_id)!, hops: hopCount(ct), gaps: missingInfo(c, now).length, stale: isStale(c, now) };
    })
    .sort((a, b) => {
      if (sort === "amount") return b.c.current_amount_at_risk - a.c.current_amount_at_risk;
      if (sort === "oldest") return a.c.report_timestamp.localeCompare(b.c.report_timestamp);
      if (sort === "newest") return b.c.report_timestamp.localeCompare(a.c.report_timestamp);
      return b.p.score - a.p.score;
    });

  const filtersActive = urgency || type || status !== "active" || sort !== "priority";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Case queue</h1>
        <p className="text-sm text-slate-600">
          Ordered by intervention priority. Hover a priority badge to see how its score was calculated.
        </p>
      </div>

      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Urgency</span>
            <select name="urgency" defaultValue={urgency} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
              <option value="">All urgencies</option>
              {URGENCY.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Fraud category</span>
            <select name="type" defaultValue={type} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
              <option value="">All categories</option>
              {fraudTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
            <select name="status" defaultValue={status} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.v} value={s.v}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Sort by</span>
            <select name="sort" defaultValue={sort} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
              {SORTS.map((s) => (
                <option key={s.v} value={s.v}>{s.label}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500">
              Apply
            </button>
            {filtersActive && (
              <Link href="/cases" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-700">No cases match these filters.</p>
          <Link href="/cases" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
            Clear filters
          </Link>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Fraud cases ordered by {SORTS.find((s) => s.v === sort)?.label}</caption>
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2">Case</th>
                <th scope="col" className="px-3 py-2">Priority</th>
                <th scope="col" className="px-3 py-2">Fraud type</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Amount at risk</th>
                <th scope="col" className="px-3 py-2">Reported</th>
                <th scope="col" className="px-3 py-2">Reporting delay</th>
                <th scope="col" className="px-3 py-2 text-center">Hops</th>
                <th scope="col" className="px-3 py-2">Data confidence</th>
                <th scope="col" className="px-3 py-2">Forecast</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ c, p, hops, gaps, stale }, i) => (
                <tr key={c.case_id} className={i === 0 && sort === "priority" && status !== "Closed" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/cases/${c.case_id}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                      {c.case_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <PriorityBadge band={p.band} title={p.explanation} />
                      <span className="text-xs text-slate-500">{p.score.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{c.fraud_type}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{inr(c.current_amount_at_risk)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{dt(c.report_timestamp)}</div>
                    <div className="text-xs text-slate-500">{duration(minutesBetween(c.report_timestamp, now))} ago</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{duration(c.reporting_delay_minutes)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{hops}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <ConfidenceBadge level={confidenceBand(c.data_quality)} />
                      {gaps > 0 && <span className="text-xs text-amber-800" title="Missing or stale fields">⚠ {gaps} gap{gaps > 1 ? "s" : ""}</span>}
                      {stale && <span className="sr-only">Stale data</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><ForecastBadge status={p.forecastStatus} /></td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/cases/${c.case_id}`} className="whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Showing {rows.length} of {cases.length} synthetic cases. Priority = 40% amount at risk + 25% transfer speed + 20% recency + 15% forecast confidence (forecast term added in Phase 4).
      </p>
    </div>
  );
}
