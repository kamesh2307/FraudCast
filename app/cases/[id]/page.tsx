// Step 11 – Case Intelligence Workspace (PRD 12.3)
// Phase 4: forecast card. Phase 5: AI summary + assistant. Phase 6: alert workflow + outcome recording.
import Link from "next/link";
import { notFound } from "next/navigation";
import { generateCaseSummary } from "../../actions/ai";
import { runCaseForecast } from "../../actions/forecast";
import AiSections from "../../../components/fc/AiSections";
import AlertsSection from "../../../components/fc/AlertsSection";
import AssistantPanel from "../../../components/fc/AssistantPanel";
import OutcomeSection from "../../../components/fc/OutcomeSection";
import SubmitButton from "../../../components/fc/SubmitButton";
import { Badge, Card, ConfidenceBadge, Fact, Notice, PriorityBadge, StatusBadge } from "../../../components/fc/ui";
import { latestEvent } from "../../../lib/ai/audit";
import { aiStatus } from "../../../lib/ai/config";
import { SUMMARY_LABELS, type AiTextResult, type SummarySections } from "../../../lib/ai/summary";
import {
  amountWithdrawn, computeAllPriorities, confidenceBand, holdings, hopCount, isStale, isWithdrawal,
  missingInfo, outOfOrder, splitCounts, staleMinutes,
} from "../../../lib/calc";
import { loadCase } from "../../../lib/data";
import { demoNow } from "../../../lib/demo-time";
import { roundTo100 } from "../../../lib/forecast";
import { loadLatestRun } from "../../../lib/forecast-data";
import { duration, dt, inr } from "../../../lib/format";
import { syncSimulatedAlerts } from "../../../lib/workflow/alerts";

export const maxDuration = 60; // AI calls can take a few seconds

export default async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = decodeURIComponent(id);
  await syncSimulatedAlerts(caseId).catch(() => 0); // simulated recipient replies (Step 23)
  const [data, run, summaryEvent] = await Promise.all([
    loadCase(caseId),
    loadLatestRun(caseId),
    latestEvent<AiTextResult<SummarySections>>(caseId, "SUMMARY_GENERATED").catch(() => null),
  ]);
  if (!data) notFound();
  const { kase: c, all, txns, alerts, outcome } = data;
  const now = demoNow();
  const ai = aiStatus();

  const p = computeAllPriorities(all.cases, all.txns, all.preds, now).get(c.case_id)!;
  const closed = c.status === "Closed";
  const hold = holdings(txns);
  const holders = [...hold.entries()].filter(([acc, h]) => acc !== c.victim_account_id && h.held > 0);
  const heldTotal = holders.reduce((s, [, h]) => s + h.held, 0);
  const withdrawn = amountWithdrawn(txns);
  const transfers = txns.filter((t) => !isWithdrawal(t));
  const beneficiaries = new Set(transfers.map((t) => t.destination_account_id));
  const hops = hopCount(txns);
  const splits = splitCounts(txns);
  const maxSplit = Math.max(0, ...splits.values());
  const badOrder = outOfOrder(txns, c.victim_account_id);
  const missing = missingInfo(c, now);
  const stale = isStale(c, now);
  const reconcileGap = !closed ? Math.abs(heldTotal - c.current_amount_at_risk) : 0;
  const forecastOk = !!run && run.valid && !run.insufficient;
  const fcPercents = forecastOk ? roundTo100([...run!.top3.map((z) => z.probability), run!.other]) : [];

  const ruleSummary = [
    `On ${dt(c.fraud_timestamp)}, ${inr(c.original_amount)} was transferred from the victim account via ${c.payment_channel ?? "an unrecorded payment channel"} (${c.fraud_type}).`,
    `The complaint was reported ${duration(c.reporting_delay_minutes)} later.`,
    `The funds moved through ${beneficiaries.size} beneficiary account${beneficiaries.size === 1 ? "" : "s"} across ${hops} transfer step${hops === 1 ? "" : "s"}${maxSplit >= 3 ? `, including a split into ${maxSplit} accounts within 60 minutes` : ""}.`,
    withdrawn > 0 ? `${inr(withdrawn)} has already been withdrawn as cash.` : "No cash withdrawal has been recorded.",
    closed
      ? `The case is closed: ${inr(outcome?.amount_protected ?? 0)} protected, ${inr(outcome?.amount_withdrawn ?? 0)} withdrawn and ${inr(outcome?.amount_unresolved ?? 0)} unresolved.`
      : `${inr(heldTotal)} is currently held in ${holders.length} account${holders.length === 1 ? "" : "s"}.`,
  ];

  const summaryForm = (label: string, variant: "primary" | "secondary") => (
    <form action={generateCaseSummary}>
      <input type="hidden" name="case_id" value={c.case_id} />
      <SubmitButton label={label} pendingLabel="Generating…" variant={variant} />
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/cases" className="text-sm text-blue-700 hover:underline">← Case queue</Link>
          <h1 className="mt-1 font-mono text-2xl font-semibold">{c.case_id}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityBadge band={p.band} title={p.explanation} />
            <span className="text-xs text-slate-500">score {p.score.toFixed(2)}</span>
            <StatusBadge status={c.status} />
            <ConfidenceBadge level={confidenceBand(c.data_quality)} />
            {stale && <Badge tone="red">⏱ Stale data · {Math.round(staleMinutes(c, now))} min old</Badge>}
            <span className="text-xs text-slate-500">Data as of {dt(c.data_as_of)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/audit?case=${c.case_id}`} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Audit trail</Link>
          <Link href={`/cases/${c.case_id}/graph`} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">
            Money-flow graph
          </Link>
          <Link href={`/cases/${c.case_id}/forecast`} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500">
            Cash-out forecast & map →
          </Link>
        </div>
      </div>

      {reconcileGap > 1 && (
        <Notice tone="red">⚠ Exposure reconciliation warning: funds still held ({inr(heldTotal)}) differ from the recorded amount at risk ({inr(c.current_amount_at_risk)}).</Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Complaint summary" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label="Fraud type" value={c.fraud_type} />
            <Fact label="Payment channel" value={c.payment_channel ?? "Not available"} warn={!c.payment_channel} />
            <Fact label="Initial beneficiary" value={<span className="font-mono text-xs">{c.initial_beneficiary_account_id}</span>} />
            <Fact label="Fraud time" value={dt(c.fraud_timestamp)} />
            <Fact label="Report time" value={dt(c.report_timestamp)} />
            <Fact label="Reporting delay" value={duration(c.reporting_delay_minutes)} />
            <Fact label="Assigned analyst" value={c.assigned_analyst ?? "Unassigned"} />
            <Fact label="Beneficiary accounts" value={beneficiaries.size} />
            <Fact label="Transfer hops" value={hops} />
          </dl>
        </Card>

        <Card title="Money position">
          <dl className="space-y-3">
            <Fact label="Original amount" value={inr(c.original_amount)} />
            <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-3">
              <dt className="text-xs font-medium text-amber-900">{closed ? "Unresolved amount" : "Current amount exposed"}</dt>
              <dd className="text-2xl font-bold text-amber-950">{inr(c.current_amount_at_risk)}</dd>
              {!closed && <dd className="text-xs text-amber-900">Held in {holders.length} account(s)</dd>}
            </div>
            <Fact label="Already withdrawn" value={inr(withdrawn)} warn={withdrawn > 0} />
            {outcome && <Fact label="Amount protected" value={inr(outcome.amount_protected)} />}
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Case summary"
          right={summaryEvent ? summaryForm("Regenerate", "secondary") : <Badge tone="slate" title="Built from structured data with fixed rules.">Rule-based · not AI</Badge>}
          className="lg:col-span-2"
        >
          {summaryEvent ? (
            <AiSections result={summaryEvent.value} labels={SUMMARY_LABELS} />
          ) : (
            <>
              <p className="text-sm leading-6 text-slate-800">{ruleSummary.join(" ")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {summaryForm(ai.ready ? "Generate AI summary" : "Generate summary (template mode)", "primary")}
                <span className="text-xs text-slate-500">Uses only this case&apos;s structured data. Every number is checked before display.</span>
              </div>
            </>
          )}
        </Card>

        <Card title="Missing information" right={<Badge tone={missing.length ? "amber" : "green"}>{missing.length ? `${missing.length} gap(s)` : "Complete"}</Badge>}>
          {missing.length === 0 ? (
            <p className="text-sm text-slate-600">All required fields are present.</p>
          ) : (
            <ul className="space-y-2 text-sm text-amber-900">
              {missing.map((m) => (
                <li key={m} className="flex gap-2"><span aria-hidden="true">⚠</span>{m}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Missing values are shown as gaps, never filled with estimates.</p>
        </Card>
      </div>

      <Card
        title="Cash-out forecast"
        right={
          !run ? <Badge tone="slate">Not run</Badge>
          : !run.valid ? <Badge tone="red">Error</Badge>
          : run.insufficient ? <Badge tone="amber">Insufficient evidence</Badge>
          : <Badge tone="green">Available</Badge>
        }
      >
        {!run && (
          <>
            <p className="mb-3 text-sm text-slate-600">No forecast has been run for this case yet.</p>
            <form action={runCaseForecast}>
              <input type="hidden" name="case_id" value={c.case_id} />
              <SubmitButton label="Run forecast" pendingLabel="Running forecast…" />
            </form>
          </>
        )}
        {run && !run.valid && <p className="text-sm text-red-800">⚠ Forecast unavailable due to a calculation error. Open the forecast page to re-run it.</p>}
        {run && run.valid && run.insufficient && (
          <p className="text-sm text-amber-900">Insufficient evidence to narrow the forecast. Continue monitoring or conduct additional review.</p>
        )}
        {forecastOk && (
          <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
            <ol className="min-w-[220px] space-y-1 text-sm">
              {run!.top3.map((z, i) => (
                <li key={z.zone_id} className="flex justify-between gap-4">
                  <span>#{z.rank} <span className="font-mono text-xs">{z.zone_id}</span></span>
                  <span className="font-semibold tabular-nums">{fcPercents[i]}%</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 text-slate-500"><span>Other zones</span><span className="tabular-nums">{fcPercents[3]}%</span></li>
            </ol>
            <div className="text-xs">
              <p className={run!.typicalWindowPassed ? "text-red-700" : "text-slate-600"}>
                Window: {run!.window ? `${dt(run!.window.start)} → ${dt(run!.window.end)}` : "not available"}{run!.typicalWindowPassed && " · ⚠ cash-out may be imminent"}
              </p>
              <p className="mt-1 text-slate-500">Indicative forecast. Requires human review. {run!.modelVersion} · {dt(run!.createdAt)}</p>
            </div>
          </div>
        )}
        {run && (
          <Link href={`/cases/${c.case_id}/forecast`} className="mt-3 inline-block text-sm font-medium text-blue-700 underline">
            Open forecast, explanation and map →
          </Link>
        )}
      </Card>

      <AlertsSection caseId={c.case_id} closed={closed} rank1Zone={forecastOk ? run!.top3[0].zone_id : null} forecastAvailable={forecastOk} />

      <OutcomeSection
        caseId={c.case_id}
        closed={closed}
        original={Number(c.original_amount)}
        alreadyWithdrawn={withdrawn}
        hasApprovedAlert={alerts.some((a) => a.approval_status === "Approved")}
        rankedZones={forecastOk ? run!.top3.map((z) => z.zone_id) : []}
      />

      <Card title="Analyst assistant" right={<Badge tone={ai.ready ? "purple" : "slate"}>{ai.ready ? "AI on" : "Template mode"}</Badge>}>
        <AssistantPanel caseId={c.case_id} aiReady={ai.ready} />
      </Card>

      <Card title="Transaction timeline" right={<span className="text-xs text-slate-500">{txns.length} records · chronological</span>}>
        {badOrder.size > 0 && (
          <div className="mb-3"><Notice tone="red">⚠ {badOrder.size} transfer(s) leave an account before money arrived there. Check source data.</Notice></div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-3">Time</th>
                <th scope="col" className="py-2 pr-3">Hop</th>
                <th scope="col" className="py-2 pr-3">From</th>
                <th scope="col" className="py-2 pr-3">To</th>
                <th scope="col" className="py-2 pr-3 text-right">Amount</th>
                <th scope="col" className="py-2 pr-3">Channel</th>
                <th scope="col" className="py-2 pr-3">Gap</th>
                <th scope="col" className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txns.map((t) => {
                const wd = isWithdrawal(t);
                return (
                  <tr key={t.transaction_id} className={wd ? "bg-red-50/60" : badOrder.has(t.transaction_id) ? "bg-amber-50" : ""}>
                    <td className="whitespace-nowrap py-2 pr-3">{dt(t.timestamp)}</td>
                    <td className="py-2 pr-3 tabular-nums">{wd ? "Cash-out" : t.transfer_hop}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {t.source_account_id}
                      {t.source_account_id === c.victim_account_id && <span className="ml-1 font-sans text-slate-500">(victim)</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {wd ? <span className="font-sans text-red-800">💵 {t.channel} · {t.location_id ?? "location n/a"} · {t.destination_zone ?? "zone n/a"}</span> : t.destination_account_id}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{inr(t.amount)}</td>
                    <td className="py-2 pr-3">{t.channel === "Unknown" ? <span className="text-amber-800">⚠ Unknown</span> : t.channel}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.minutes_since_previous_transfer === null ? "—" : duration(t.minutes_since_previous_transfer)}</td>
                    <td className="py-2">{t.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
