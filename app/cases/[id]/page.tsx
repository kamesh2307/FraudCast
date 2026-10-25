// Step 11 – Case Intelligence Workspace (PRD 12.3)
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, ConfidenceBadge, Fact, Notice, PriorityBadge, StatusBadge } from "../../../components/fc/ui";
import {
  amountWithdrawn, computeAllPriorities, confidenceBand, holdings, hopCount, isStale, isWithdrawal,
  missingInfo, outOfOrder, splitCounts, staleMinutes,
} from "../../../lib/calc";
import { loadCase } from "../../../lib/data";
import { demoNow } from "../../../lib/demo-time";
import { duration, dt, inr } from "../../../lib/format";

export default async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadCase(decodeURIComponent(id));
  if (!data) notFound();
  const { kase: c, all, txns, alerts, outcome } = data;
  const now = demoNow();

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

  // Rule-based summary (not AI). The AI summary is added in Phase 5.
  const summary = [
    `On ${dt(c.fraud_timestamp)}, ${inr(c.original_amount)} was transferred from the victim account via ${c.payment_channel ?? "an unrecorded payment channel"} (${c.fraud_type}).`,
    `The complaint was reported ${duration(c.reporting_delay_minutes)} later.`,
    `The funds moved through ${beneficiaries.size} beneficiary account${beneficiaries.size === 1 ? "" : "s"} across ${hops} transfer step${hops === 1 ? "" : "s"}${maxSplit >= 3 ? `, including a split into ${maxSplit} accounts within 60 minutes` : ""}.`,
    withdrawn > 0 ? `${inr(withdrawn)} has already been withdrawn as cash.` : "No cash withdrawal has been recorded.",
    closed
      ? `The case is closed: ${inr(outcome?.amount_protected ?? 0)} protected, ${inr(outcome?.amount_withdrawn ?? 0)} withdrawn and ${inr(outcome?.amount_unresolved ?? 0)} unresolved.`
      : `${inr(heldTotal)} is currently held in ${holders.length} account${holders.length === 1 ? "" : "s"}.`,
  ];

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
          <Link href={`/cases/${c.case_id}/graph`} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500">
            Open money-flow graph →
          </Link>
          <span aria-disabled="true" title="Forecast engine is added in Phase 4" className="cursor-not-allowed rounded border border-slate-300 px-4 py-2 text-sm text-slate-400">
            Cash-out forecast (Phase 4)
          </span>
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
          right={<Badge tone="slate" title="Built from structured data with fixed rules. AI summary arrives in Phase 5.">Rule-based · not AI</Badge>}
          className="lg:col-span-2"
        >
          <p className="text-sm leading-6 text-slate-800">{summary.join(" ")}</p>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Intervention alerts">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-600">No alert has been raised for this case. The alert composer is added in Phase 6.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li key={a.alert_id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
                  <span className="font-mono text-xs">{a.alert_id}</span>
                  <span>→ {a.recipient_id}</span>
                  <StatusBadge status={a.acknowledgement_status} />
                  <Badge tone="slate">Simulated</Badge>
                  <span className="text-xs text-slate-500">Approved {dt(a.approved_at)} by {a.approved_by ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Cash-out forecast">
          <p className="text-sm text-slate-600">
            Not run yet. The forecasting engine (top-three zones, time window and explanation) is added in Phase 4.
          </p>
        </Card>
      </div>
    </div>
  );
}
