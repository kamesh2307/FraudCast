// Steps 13–16 – Cash-out forecast, explanation, baseline and map (PRD 12.5, 12.6, 12.7)
// Phase 5: adds the AI explanation (Step 19) above the rule-based breakdown.
import Link from "next/link";
import { notFound } from "next/navigation";
import { cellToBoundary } from "h3-js";
import { generateForecastExplanation } from "../../../actions/ai";
import { runCaseForecast } from "../../../actions/forecast";
import AiSections from "../../../../components/fc/AiSections";
import ForecastMap, { type MapPoint, type MapZone } from "../../../../components/fc/ForecastMap";
import SubmitButton from "../../../../components/fc/SubmitButton";
import { Badge, Card, Notice, StatusBadge } from "../../../../components/fc/ui";
import { latestEvent } from "../../../../lib/ai/audit";
import { aiStatus } from "../../../../lib/ai/config";
import { EXPLANATION_LABELS, type ExplanationSections } from "../../../../lib/ai/explain-ai";
import type { AiTextResult } from "../../../../lib/ai/summary";
import { explainRun, FIELD_LABELS } from "../../../../lib/explain";
import { contributions, roundTo100, WEIGHTS } from "../../../../lib/forecast";
import { loadForecastData, loadLatestRun } from "../../../../lib/forecast-data";
import { dt, duration, inr, minutesBetween } from "../../../../lib/format";

export const maxDuration = 60;

const RANK_STYLE: Record<number, string> = {
  1: "border-red-500 bg-red-50",
  2: "border-orange-500 bg-orange-50",
  3: "border-yellow-500 bg-yellow-50",
};

export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = decodeURIComponent(id);
  const [data, run] = await Promise.all([loadForecastData(), loadLatestRun(caseId)]);
  const c = data.cases.find((x) => x.case_id === caseId);
  if (!c) notFound();

  const zoneById = new Map(data.zones.map((z) => [z.zone_id, z]));
  const name = (zid: string) => (zoneById.get(zid) ? `${zoneById.get(zid)!.zone_name} (${zid})` : zid);
  const showRanked = !!run && run.valid && !run.insufficient;
  const percents = showRanked ? roundTo100([...run!.top3.map((z) => z.probability), run!.other]) : [];
  const rankOf = new Map(showRanked ? run!.top3.map((z, i) => [z.zone_id, { rank: z.rank, percent: percents[i] }]) : []);
  const explanation = run ? explainRun(run, name, data.history.length) : null;
  const outcome = data.outcomes.find((o) => o.case_id === caseId);
  const ai = aiStatus();
  const aiExplanation = showRanked
    ? await latestEvent<AiTextResult<ExplanationSections>>(caseId, "EXPLANATION_GENERATED", { key: "run_id", value: run!.runId }).catch(() => null)
    : null;

  const mapZones: MapZone[] = data.zones.map((z) => ({
    zone_id: z.zone_id,
    zone_name: z.zone_name,
    jurisdiction: z.jurisdiction,
    boundary: cellToBoundary(z.h3_index) as [number, number][],
    centroid: [z.centroid_latitude, z.centroid_longitude],
    historyCount: z.historical_synthetic_cashout_count,
    rank: rankOf.get(z.zone_id)?.rank ?? null,
    percent: rankOf.get(z.zone_id)?.percent ?? null,
  }));
  const mapPoints: MapPoint[] = data.points.map((p) => ({
    location_id: p.location_id, zone_id: p.zone_id, location_type: p.location_type,
    operating_status: p.operating_status, bank: p.synthetic_bank_code, lat: p.latitude, lng: p.longitude,
  }));

  const runForm = (label: string, variant: "primary" | "secondary" = "primary") => (
    <form action={runCaseForecast}>
      <input type="hidden" name="case_id" value={c.case_id} />
      <SubmitButton label={label} pendingLabel="Running forecast…" variant={variant} />
    </form>
  );
  const explainForm = (label: string, variant: "primary" | "secondary") => (
    <form action={generateForecastExplanation}>
      <input type="hidden" name="case_id" value={c.case_id} />
      <SubmitButton label={label} pendingLabel="Generating…" variant={variant} />
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/cases/${c.case_id}`} className="text-sm text-blue-700 hover:underline">← Back to {c.case_id}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Cash-out forecast</h1>
            <span className="font-mono text-sm text-slate-600">{c.case_id}</span>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">Where and when the exposed funds are most likely to be withdrawn, and why.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cases/${c.case_id}/graph`} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Money-flow graph</Link>
          {run && runForm("Re-run forecast", "secondary")}
        </div>
      </div>

      <Notice tone="blue">
        <strong>Indicative forecast. Requires human review.</strong> Calculated by a transparent scoring rule (not AI, not a trained model) on synthetic data. It never triggers any action by itself.
      </Notice>

      {!run && (
        <Card title="Forecast not run yet">
          <p className="mb-3 text-sm text-slate-700">Run the forecast to rank the most likely cash-out zones for this case.</p>
          {runForm("Run forecast")}
        </Card>
      )}

      {run && !run.valid && (
        <Notice tone="red">
          ⚠ Forecast unavailable due to a calculation error ({run.validationError}). Re-run the forecast. If it happens again, check the data.
        </Notice>
      )}

      {run && run.valid && run.insufficient && (
        <Card title="Forecast result" right={<Badge tone="amber">Insufficient evidence</Badge>}>
          <p className="text-base font-medium text-amber-900">
            Insufficient evidence to narrow the forecast. Continue monitoring or conduct additional review.
          </p>
          <p className="mt-2 text-sm text-slate-700"><strong>Why:</strong> {run.insufficientReason}</p>
          {run.missing.length > 0 && <p className="mt-1 text-sm text-slate-700"><strong>Missing data:</strong> {run.missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}</p>}
          <p className="mt-2 text-xs text-slate-500">No zone is ranked, because the evidence is too weak to give a responsible answer. Run {dt(run.createdAt)} · {run.modelVersion}</p>
        </Card>
      )}

      {run && run.valid && run.insufficient && (
        <Card title="Geospatial view (no zones ranked)">
          <ForecastMap zones={mapZones} points={mapPoints} />
        </Card>
      )}

      {showRanked && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card title="Geospatial view">
            <ForecastMap zones={mapZones} points={mapPoints} />
          </Card>

          <div className="space-y-4">
            <Card title="Top-three cash-out zones" right={<Badge tone="green">Available</Badge>}>
              <ol className="space-y-2">
                {run!.top3.map((z, i) => {
                  const zr = zoneById.get(z.zone_id);
                  const pts = data.points.filter((p) => p.zone_id === z.zone_id);
                  return (
                    <li key={z.zone_id} className={`rounded-md border-l-4 p-3 ${RANK_STYLE[z.rank]}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">#{z.rank} {zr?.zone_name ?? z.zone_id}</span>
                        <span className="text-xl font-bold tabular-nums">{percents[i]}%</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="font-mono">{z.zone_id}</span> · {zr?.jurisdiction ?? "—"} · {pts.filter((p) => p.operating_status === "Operational").length} operational cash-out points
                      </div>
                    </li>
                  );
                })}
                <li className="flex justify-between rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
                  <span>All other zones ({Math.max(0, run!.eligibleZones - 3)})</span>
                  <span className="font-semibold tabular-nums">{percents[3]}%</span>
                </li>
              </ol>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Amount exposed</dt>
                  <dd className="font-semibold">{inr(run!.amountExposed)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Data quality</dt>
                  <dd className={`font-semibold ${run!.dataQuality < 0.75 ? "text-amber-800" : ""}`}>{Math.round(run!.dataQuality * 100)}%</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Indicative cash-out window</dt>
                  <dd className="font-semibold">
                    {run!.window ? `${dt(run!.window.start)} → ${dt(run!.window.end)} (${duration(minutesBetween(run!.window.start, run!.window.end))})` : "Not available"}
                  </dd>
                  <dd className={`text-xs ${run!.typicalWindowPassed ? "text-red-700" : "text-slate-500"}`}>
                    {run!.typicalWindowPassed && "⚠ "}
                    {run!.windowNote || "Time window unavailable: insufficient history."}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Forecast made</dt>
                  <dd>{dt(run!.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Model version</dt>
                  <dd className="font-mono text-xs">{run!.modelVersion}</dd>
                </div>
              </dl>
              {run!.mode === "retrospective" && (
                <p className="mt-3 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  Closed case: this is a retrospective forecast as of the last transfer ({dt(run!.asOf)}), used to test the engine. Actual cash-out zone:{" "}
                  <strong>{outcome?.actual_cashout_zone ?? "not recorded"}</strong>
                  {outcome?.actual_cashout_zone && (
                    <> ({run!.top3.findIndex((z) => z.zone_id === outcome.actual_cashout_zone) >= 0 ? `rank ${run!.top3.findIndex((z) => z.zone_id === outcome.actual_cashout_zone) + 1} ✓` : "not in top 3 ✕"})</>
                  )}
                </p>
              )}
            </Card>

            <Card title="Baseline comparison">
              <p className="text-sm text-slate-700">{explanation?.baseline}</p>
            </Card>
          </div>
        </div>
      )}

      {showRanked && (
        <Card
          title="Explanation for analysts"
          right={aiExplanation ? explainForm("Regenerate", "secondary") : <Badge tone={ai.ready ? "purple" : "slate"}>{ai.ready ? "AI on" : "Template mode"}</Badge>}
        >
          {aiExplanation ? (
            <AiSections result={aiExplanation.value} labels={EXPLANATION_LABELS} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {explainForm(ai.ready ? "Generate AI explanation" : "Generate explanation (template mode)", "primary")}
              <span className="text-xs text-slate-500">
                The AI only explains the calculated result. It cannot change the ranking, and its text is checked against the numbers below.
              </span>
            </div>
          )}
        </Card>
      )}

      {showRanked && explanation && (
        <Card title="Why this forecast (verified breakdown)" right={<Badge tone="slate" title="Built from stored engine numbers with fixed rules.">Rule-based · not AI</Badge>}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">{explanation.headline}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {explanation.topReasons.map((r) => (
                  <li key={r.label}>
                    <span className="font-medium">{r.label}</span> <span className="text-xs text-slate-500">(+{r.contribution.toFixed(2)})</span>
                    <div className="text-slate-700">{r.text}</div>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-sm font-semibold">Why the alternatives ranked lower</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {explanation.alternatives.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Score breakdown for rank 1</h3>
              <div className="mt-2 space-y-1.5" role="list">
                {run!.top3[0].factors &&
                  contributions(run!.top3[0].factors).map((f) => (
                    <div key={f.key} role="listitem" className="text-xs">
                      <div className="flex justify-between"><span>{f.label}</span><span className="tabular-nums">{f.contribution.toFixed(2)} of {WEIGHTS[f.key].toFixed(2)}</span></div>
                      <div className="h-2 rounded bg-slate-100" aria-hidden="true">
                        <div className="h-2 rounded bg-blue-600" style={{ width: `${Math.min(100, (f.contribution / 0.35) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                <p className="pt-1 text-xs text-slate-500">
                  Raw score {run!.top3[0].raw?.toFixed(2)} × data quality {run!.dataQuality.toFixed(2)} = {run!.top3[0].adjusted?.toFixed(2)}
                </p>
              </div>
              <h3 className="mt-4 text-sm font-semibold">Data used</h3>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">{explanation.dataUsed.map((d) => <li key={d}>{d}</li>)}</ul>
              <h3 className="mt-3 text-sm font-semibold">Missing data</h3>
              <p className="text-xs text-slate-700">{explanation.missing.length ? `⚠ ${explanation.missing.join(", ")}` : "None."}</p>
              <h3 className="mt-3 text-sm font-semibold">Limitations</h3>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">{explanation.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700">
            Human review required: verify these signals before raising any intervention alert. FraudCast never freezes accounts or contacts anyone by itself.
          </p>
        </Card>
      )}
    </div>
  );
}
