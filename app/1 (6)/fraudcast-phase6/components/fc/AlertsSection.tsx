// FraudCast – Steps 22–23 on the case page: raise, review, approve and track intervention alerts (server component).

import { createAlertDraft, simulateAcknowledgement, simulateNoReply } from "../../app/actions/workflow";
import AlertComposer from "./AlertComposer";
import AlertCountdown from "./AlertCountdown";
import SubmitButton from "./SubmitButton";
import { Badge, Card, StatusBadge } from "./ui";
import { aiStatus } from "../../lib/ai/config";
import { dt } from "../../lib/format";
import { db } from "../../lib/supabase";
import { alertEventInfo, loadCaseAlerts } from "../../lib/workflow/alerts";
import { defaultRecipient, ESCALATION_DESK, findRecipient, RECIPIENTS, workflowConfig } from "../../lib/workflow/config";

export default async function AlertsSection({
  caseId, closed, rank1Zone, forecastAvailable,
}: {
  caseId: string;
  closed: boolean;
  rank1Zone: string | null;
  forecastAvailable: boolean;
}) {
  const [alerts, info, zoneRes] = await Promise.all([
    loadCaseAlerts(caseId),
    alertEventInfo(caseId),
    rank1Zone ? db().from("zones").select("jurisdiction").eq("zone_id", rank1Zone).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const jurisdiction = (zoneRes.data as { jurisdiction?: string } | null)?.jurisdiction ?? null;
  const suggested = defaultRecipient(jurisdiction, forecastAvailable);
  const cfg = workflowConfig();
  const ai = aiStatus();
  const draft = alerts.find((a) => a.approval_status === "Draft");
  const others = alerts.filter((a) => a.approval_status !== "Draft").reverse();

  return (
    <Card title="Intervention alerts" right={<Badge tone="slate" title="No real team is contacted. Recipients and replies are simulated.">Simulated recipients</Badge>}>
      <div className="space-y-4">
        {!closed && !draft && (
          <form action={createAlertDraft} className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
            <input type="hidden" name="case_id" value={caseId} />
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Recipient (from the synthetic escalation matrix)</span>
              <select name="recipient_id" defaultValue={suggested.id} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
                {RECIPIENTS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.id}){r.id === suggested.id ? " – suggested" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">
              Suggested: {suggested.label}, because {forecastAvailable && jurisdiction ? `the rank-1 zone ${rank1Zone} is in ${jurisdiction}` : "this case has no ranked forecast (escalation matrix rule)"}.
            </p>
            <SubmitButton label={ai.ready ? "Draft alert with AI" : "Draft alert (template mode)"} pendingLabel="Drafting…" />
          </form>
        )}

        {draft && (
          <AlertComposer
            alertId={draft.alert_id}
            initialText={draft.edited_content ?? draft.draft_content}
            draftText={draft.draft_content}
            recipientLabel={`${findRecipient(draft.recipient_id)?.label ?? draft.recipient_id} (${draft.recipient_id})`}
            needsJustification={!forecastAvailable}
            draftSource={info.get(draft.alert_id)?.draftSource ?? null}
            draftNote={info.get(draft.alert_id)?.draftSource === "template" && ai.ready ? info.get(draft.alert_id)?.draftFallback ?? null : null}
          />
        )}

        {others.length === 0 && !draft && <p className="text-sm text-slate-600">No alert has been raised for this case yet.</p>}

        <ul className="space-y-3">
          {others.map((a) => {
            const real = info.get(a.alert_id)?.realApprovedAt ?? null;
            const pending = a.approval_status === "Approved" && a.acknowledgement_status === "Pending";
            const overdue = a.acknowledgement_status === "Overdue";
            return (
              <li key={a.alert_id} className={`rounded-md border p-3 text-sm ${overdue ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{a.alert_id}</span>
                  <span>→ {findRecipient(a.recipient_id)?.label ?? a.recipient_id}</span>
                  {a.approval_status === "Discarded" ? <Badge tone="slate">Discarded · never sent</Badge> : <StatusBadge status={a.acknowledgement_status} />}
                  {a.approval_status === "Approved" && <Badge tone="slate">Simulated</Badge>}
                  {a.action_status !== "None" && <Badge tone="blue">{a.action_status}</Badge>}
                </div>
                {a.approval_status === "Approved" && (
                  <p className="mt-1 text-xs text-slate-600">
                    Approved {dt(a.approved_at)} by {a.approved_by ?? "—"} · deadline {dt(a.escalation_deadline)}
                    {a.acknowledgement_timestamp && ` · acknowledged ${dt(a.acknowledgement_timestamp)}`}
                  </p>
                )}
                {overdue && (
                  <p className="mt-1 text-xs font-medium text-red-800">⚠ Overdue: not acknowledged by the deadline. The SOP says escalate to the Fraud Escalation Desk.</p>
                )}
                {(pending || overdue) && !closed && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {pending && real && <AlertCountdown approvedRealAt={real} delaySeconds={cfg.ackDelaySeconds} />}
                    <form action={simulateAcknowledgement}>
                      <input type="hidden" name="alert_id" value={a.alert_id} />
                      <SubmitButton label={overdue ? "Simulate late acknowledgement" : "Simulate acknowledgement now"} pendingLabel="Updating…" variant="secondary" />
                    </form>
                    {pending && (
                      <form action={simulateNoReply}>
                        <input type="hidden" name="alert_id" value={a.alert_id} />
                        <SubmitButton label="Simulate no reply (overdue)" pendingLabel="Updating…" variant="secondary" />
                      </form>
                    )}
                    {overdue && !draft && a.recipient_id !== ESCALATION_DESK && (
                      <form action={createAlertDraft}>
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="recipient_id" value={ESCALATION_DESK} />
                        <input type="hidden" name="escalates" value={a.alert_id} />
                        <SubmitButton label="Draft escalation to Fraud Escalation Desk" pendingLabel="Drafting…" />
                      </form>
                    )}
                  </div>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-700">
                    View alert text{a.edited_content ? " (edited by analyst)" : ""}
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px] leading-5 text-slate-800">{a.edited_content ?? a.draft_content}</pre>
                </details>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-slate-500">
          FraudCast drafts; the analyst approves. Nothing is sent outside the app, and no account is frozen or held by FraudCast.
        </p>
      </div>
    </Card>
  );
}
