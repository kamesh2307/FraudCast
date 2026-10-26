// Model evaluation – enhanced engine vs simple baseline (PRD Section 17)
import Link from "next/link";
import { Badge, Card, Notice } from "../../components/fc/ui";
import { demoNow } from "../../lib/demo-time";
import { evaluateClosedCases, evaluateHistory, summarise, type EvalRow, type EvalSummary } from "../../lib/evaluation";
import { CONFIG, MODEL_VERSION, WEIGHTS } from "../../lib/forecast";
import { loadForecastData } from "../../lib/forecast-data";


const p = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const pp = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)} pts`;

function SummaryTable({ s }: { s: EvalSummary }) {
  const rows: [string, string, string, string][] = [
    ["Top-1 accuracy (actual zone ranked first)", p(s.enhancedTop1), p(s.baselineTop1), pp(s.upliftTop1)],
    ["Top-3 recall (actual zone in top 3)", p(s.enhancedTop3), p(s.baselineTop3), pp(s.upliftTop3)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th scope="col" className="py-2 pr-4">Metric</th><th scope="col" className="pr-4">FraudCast engine</th><th scope="col" className="pr-4">Simple baseline</th><th scope="col">Uplift</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([m, e, b, u]) => (
            <tr key={m}><td className="py-2 pr-4">{m}</td><td className="pr-4 font-semibold tabular-nums">{e}</td><td className="pr-4 tabular-nums">{b}</td><td className="tabular-nums">{u}</td></tr>
          ))}
          <tr><td className="py-2 pr-4">Median distance from rank-1 zone to actual zone</td><td className="pr-4 tabular-nums" colSpan={3}>{s.medianGeoErrorKm === null ? "—" : `${s.medianGeoErrorKm} km`}</td></tr>
          <tr><td className="py-2 pr-4">Time-window accuracy (actual time inside window)</td><td className="pr-4 tabular-nums" colSpan={3}>{p(s.windowAccuracy)} of {s.windowsProduced} window(s) produced</td></tr>
          <tr><td className="py-2 pr-4">Insufficient-evidence results</td><td className="pr-4 tabular-nums" colSpan={3}>{s.insufficient} of {s.n}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function DetailTable({ rows, linkCases }: { rows: EvalRow[]; linkCases: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-left uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-3">ID</th><th scope="col" className="pr-3">Fraud type</th><th scope="col" className="pr-3">Actual zone</th>
            <th scope="col" className="pr-3">Engine rank 1</th><th scope="col" className="pr-3">Actual's rank</th>
            <th scope="col" className="pr-3">Baseline pick</th><th scope="col" className="pr-3">Distance</th><th scope="col">In window</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 pr-3 font-mono">{linkCases ? <Link href={`/cases/${r.id}/forecast`} className="text-blue-700 underline">{r.id}</Link> : r.id}</td>
              <td className="pr-3">{r.label}</td>
              <td className="pr-3 font-mono">{r.actualZone}</td>
              <td className="pr-3 font-mono">{r.insufficient ? <span className="font-sans text-amber-800">Insufficient evidence</span> : r.enhancedTop}</td>
              <td className="pr-3">{r.enhancedRank === 1 ? "✓ 1" : r.enhancedRank ? `✓ ${r.enhancedRank}` : "✕ not in top 3"}</td>
              <td className="pr-3 font-mono">{r.baselineTop ?? "—"}{r.baselineRank === 1 ? " ✓" : ""}</td>
              <td className="pr-3 tabular-nums">{r.geoErrorKm === null ? "—" : `${r.geoErrorKm} km`}</td>
              <td>{r.windowHit === null ? "—" : r.windowHit ? "✓" : "✕"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EvaluationPage() {
  const d = await loadForecastData();
  const closed = evaluateClosedCases(d.cases, d.txns, d.outcomes, d.accounts, d.ctx, d.zones, demoNow());
  const loo = evaluateHistory(d.history, d.accounts, d.ctx, d.zones);
  const sc = summarise(closed);
  const sl = summarise(loo);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Forecast evaluation</h1>
        <Badge tone="slate">{MODEL_VERSION}</Badge>
      </div>
      <Notice tone="amber">
        <strong>Read this first:</strong> these results use synthetic data that the team generated. They show that the evaluation pipeline works and that the engine
        finds the patterns placed in the data. They are <strong>not</strong> evidence of real-world accuracy.
      </Notice>

      <Card title={`Test 1 · Closed cases (${sc.n})`}>
        <p className="mb-3 text-sm text-slate-600">
          For each closed case, the engine forecasts as of the last transfer, ignoring the withdrawals, and is compared with where the money was actually withdrawn.
        </p>
        <SummaryTable s={sc} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">Show case-by-case results</summary>
          <div className="mt-2"><DetailTable rows={closed} linkCases /></div>
        </details>
      </Card>

      <Card title={`Test 2 · Leave-one-out on past cash-outs (${sl.n})`}>
        <p className="mb-3 text-sm text-slate-600">
          Each past cash-out is hidden in turn, and the engine tries to predict it from the remaining history. This stops a case's own answer being used to score it.
        </p>
        <SummaryTable s={sl} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">Show event-by-event results</summary>
          <div className="mt-2"><DetailTable rows={loo} linkCases={false} /></div>
        </details>
      </Card>

      <Card title="How the engine scores a zone">
        <p className="text-sm text-slate-700">
          Zone score = {Object.entries(WEIGHTS).map(([k, w]) => `${Math.round(w * 100)}% ${k}`).join(" + ")}, multiplied by data quality, then converted to relative
          probabilities (softmax, temperature {CONFIG.temperature}). A case returns &quot;insufficient evidence&quot; when no account holding funds links to any past cash-out,
          the best score is below {CONFIG.minTopScore}, or the best probability is below {Math.round(CONFIG.minTopProbability * 100)}%. The baseline simply picks the most
          frequent past cash-out zone for the same fraud type and time band.
        </p>
      </Card>
    </div>
  );
}
