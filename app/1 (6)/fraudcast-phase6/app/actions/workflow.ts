"use server";
// FraudCast – Phase 6 server actions: draft, edit, approve and discard alerts; simulate the recipient; record outcomes.
// They run on the server only. FraudCast never contacts anyone outside the app: every recipient is simulated.

import { revalidatePath } from "next/cache";
import { aiStatus } from "../../lib/ai/config";
import { loadAiContext } from "../../lib/ai/context";
import { safetyCheck } from "../../lib/ai/grounding";
import { amountWithdrawn, computeAllPriorities } from "../../lib/calc";
import { loadAllCases, loadCase } from "../../lib/data";
import { demoNow } from "../../lib/demo-time";
import { loadLatestRun } from "../../lib/forecast-data";
import { chunkDocs } from "../../lib/knowledge/chunks";
import { db } from "../../lib/supabase";
import { generateAlertDraft } from "../../lib/workflow/alert-draft";
import { editDistance, validateAlertText } from "../../lib/workflow/alert-text";
import { acknowledgeAlert, loadAlert, markOverdue } from "../../lib/workflow/alerts";
import { findRecipient, workflowConfig } from "../../lib/workflow/config";
import { DEMO_USER, writeEvents, type WfEvent } from "../../lib/workflow/events";
import type { FormState } from "../../lib/workflow/form-state";
import { validateOutcome } from "../../lib/workflow/outcome";

const CASE_ID = /^SYN-CASE-\d{4}$/;
const ALERT_ID = /^SYN-ALT-[0-9A-Z-]{1,40}$/;

const ok = (message: string): FormState => ({ ok: true, message, error: null, at: Date.now() });
const fail = (error: string): FormState => ({ ok: false, message: null, error, at: Date.now() });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(caseId: string) {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
}

/** The approved alert template, straight from the approved document library (SYN-DOC-03). */
function procedureText(): string {
  return chunkDocs()
    .filter((c) => c.document_id === "SYN-DOC-03" && c.access_level === "approved")
    .map((c) => `${c.section}: ${c.content}`)
    .join("\n");
}

async function forecastAvailable(caseId: string): Promise<boolean> {
  const run = await loadLatestRun(caseId);
  return !!run && run.valid && !run.insufficient;
}

/* ------------------------------------------------------------------ */
/* Step 22 – Draft, edit, approve, discard                              */
/* ------------------------------------------------------------------ */

export async function createAlertDraft(formData: FormData): Promise<void> {
  const caseId = str(formData, "case_id");
  if (!CASE_ID.test(caseId)) throw new Error("Invalid case ID.");
  const recipient = findRecipient(str(formData, "recipient_id"));
  if (!recipient) throw new Error("Choose a recipient from the escalation matrix.");
  const escalationOf = str(formData, "escalates") || null;
  if (escalationOf && !ALERT_ID.test(escalationOf)) throw new Error("Invalid alert reference.");

  const s = db();
  const existing = await s.from("alerts").select("alert_id").eq("case_id", caseId).eq("approval_status", "Draft");
  if (existing.error) throw new Error(`Could not read alerts: ${existing.error.message}`);
  if ((existing.data ?? []).length) {
    refresh(caseId); // one draft at a time: show the existing one
    return;
  }

  const [ctx, all] = await Promise.all([loadAiContext(caseId), loadAllCases()]);
  const kase = all.cases.find((c) => c.case_id === caseId);
  if (!ctx || !kase) throw new Error("Case not found.");
  if (kase.status === "Closed") throw new Error("This case is closed. Alerts cannot be raised on closed cases.");
  const now = demoNow();
  const priority = computeAllPriorities(all.cases, all.txns, all.preds, now).get(caseId)?.band ?? "Medium";
  const fcOk = !!ctx.run && ctx.run.valid && !ctx.run.insufficient;

  const d = await generateAlertDraft({ cf: ctx.caseFacts, ff: ctx.forecastFacts, priority, recipient, procedure: procedureText(), escalationOf });
  const alertId = `SYN-ALT-${Date.now().toString(36).toUpperCase()}`;
  const ins = await s.from("alerts").insert({
    alert_id: alertId, case_id: caseId, recipient_type: recipient.type, recipient_id: recipient.id, priority,
    alert_reason: escalationOf
      ? `Escalation of ${escalationOf}: not acknowledged in time`
      : fcOk ? "Indicative forecast shows elevated cash-out likelihood within the window" : "Forecast not available: analyst-requested review",
    draft_content: d.text, edited_content: null, approval_status: "Draft", approved_by: null, approved_at: null,
    acknowledgement_status: "Not sent", acknowledgement_timestamp: null, action_status: "None", escalation_deadline: null,
    created_at: now.toISOString(),
  });
  if (ins.error) throw new Error(`Could not save the draft alert: ${ins.error.message}`);

  const events: WfEvent[] = [{
    case_id: caseId, action_type: "ALERT_DRAFTED", model_version: d.model,
    new_value: { alert_id: alertId, recipient_id: recipient.id, recipient_type: recipient.type, source: d.source, model: d.model, prompt_version: d.promptVersion, fallback_reason: d.fallbackReason, problems: d.problems, escalation_of: escalationOf },
  }];
  if (d.source === "template" && aiStatus().ready) {
    events.push({ case_id: caseId, action_type: "LLM_FALLBACK", model_version: d.model, new_value: { feature: "alert_draft", reason: d.fallbackReason, problems: d.problems } });
  }
  await writeEvents(events);
  refresh(caseId);
}

async function loadDraft(formData: FormData): Promise<{ alertId: string; error: string | null; alert: Awaited<ReturnType<typeof loadAlert>> }> {
  const alertId = str(formData, "alert_id");
  if (!ALERT_ID.test(alertId)) return { alertId, error: "Invalid alert ID.", alert: null };
  const alert = await loadAlert(alertId);
  if (!alert) return { alertId, error: "Alert not found.", alert: null };
  if (alert.approval_status !== "Draft") return { alertId, error: `This alert is already ${alert.approval_status.toLowerCase()}.`, alert };
  return { alertId, error: null, alert };
}

const contentOf = (fd: FormData) => String(fd.get("content") ?? "").replace(/\r\n/g, "\n").trim();

export async function saveAlertEdits(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { error, alert } = await loadDraft(formData);
    if (error || !alert) return fail(error ?? "Alert not found.");
    const text = contentOf(formData);
    if (!text) return fail("The alert is empty.");
    if (text.length > 4000) return fail("The alert is longer than 4,000 characters.");
    const before = alert.edited_content ?? alert.draft_content;
    const up = await db().from("alerts").update({ edited_content: text === alert.draft_content ? null : text }).eq("alert_id", alert.alert_id).eq("approval_status", "Draft");
    if (up.error) return fail(`Could not save: ${up.error.message}`);
    await writeEvents([{ case_id: alert.case_id, action_type: "ALERT_EDITED", new_value: { alert_id: alert.alert_id, edit_distance: editDistance(before, text), total_edit_distance: editDistance(alert.draft_content, text) } }]);
    refresh(alert.case_id);
    const problems = [...validateAlertText(text, alert.case_id), ...safetyCheck(text, false).problems];
    return ok(problems.length ? `Edits saved. Fix before approval: ${problems.join(" ")}` : "Edits saved.");
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function approveAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { error, alert } = await loadDraft(formData);
    if (error || !alert) return fail(error ?? "Alert not found.");
    const text = contentOf(formData);
    const problems = validateAlertText(text, alert.case_id);
    const safety = safetyCheck(text, false);
    if (problems.length || !safety.ok) {
      return fail(["Approval blocked.", ...problems, ...safety.problems.map((p) => `${p} Alerts may only request a review (approved alert template).`)].join(" "));
    }
    if (str(formData, "confirm") !== "on") return fail("Tick the confirmation box to approve this alert.");
    const fcOk = await forecastAvailable(alert.case_id);
    const justification = str(formData, "justification");
    if (!fcOk && justification.length < 10) {
      return fail("This case has no ranked forecast. Write a justification (at least 10 characters) explaining why you are escalating.");
    }
    const s = db();
    const kase = await s.from("cases").select("case_id,status").eq("case_id", alert.case_id).maybeSingle();
    if (kase.error) return fail(`Could not read the case: ${kase.error.message}`);
    if ((kase.data as { status?: string } | null)?.status === "Closed") return fail("This case is closed. The alert cannot be sent.");

    const cfg = workflowConfig();
    const now = demoNow();
    const deadline = new Date(now.getTime() + cfg.escalationMinutes * 60000);
    const up = await s
      .from("alerts")
      .update({
        edited_content: text === alert.draft_content ? null : text,
        approval_status: "Approved", approved_by: DEMO_USER, approved_at: now.toISOString(),
        acknowledgement_status: "Pending", escalation_deadline: deadline.toISOString(),
      })
      .eq("alert_id", alert.alert_id)
      .eq("approval_status", "Draft")
      .select("alert_id");
    if (up.error) return fail(`Could not approve: ${up.error.message}`);
    if (!(up.data ?? []).length) return fail("This alert was already handled.");
    const cs = await s.from("cases").update({ status: "Alert Sent", updated_at: now.toISOString() }).eq("case_id", alert.case_id).neq("status", "Closed");
    if (cs.error) return fail(`Alert approved, but the case status could not be updated: ${cs.error.message}`);
    await writeEvents([{
      case_id: alert.case_id, action_type: "ALERT_APPROVED",
      previous_value: { approval_status: "Draft" },
      new_value: {
        alert_id: alert.alert_id, recipient_id: alert.recipient_id, approver: DEMO_USER, real_time: new Date().toISOString(),
        edited: text !== alert.draft_content, edit_distance: editDistance(alert.draft_content, text),
        justification: justification || null, forecast_available: fcOk, escalation_deadline: deadline.toISOString(),
      },
      reason: justification || null,
    }]);
    refresh(alert.case_id);
    return ok(`Approved by ${DEMO_USER} and sent to ${alert.recipient_id} (simulated). The simulated team acknowledges in about ${cfg.ackDelaySeconds} seconds.`);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function discardAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { error, alert } = await loadDraft(formData);
    if (error || !alert) return fail(error ?? "Alert not found.");
    const up = await db().from("alerts").update({ approval_status: "Discarded" }).eq("alert_id", alert.alert_id).eq("approval_status", "Draft");
    if (up.error) return fail(`Could not discard: ${up.error.message}`);
    await writeEvents([{ case_id: alert.case_id, action_type: "ALERT_DISCARDED", previous_value: { approval_status: "Draft" }, new_value: { alert_id: alert.alert_id } }]);
    refresh(alert.case_id);
    return ok("Draft discarded. Nothing was sent.");
  } catch (e) {
    return fail((e as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/* Step 23 – Simulated recipient                                         */
/* ------------------------------------------------------------------ */

async function approvedAlert(formData: FormData) {
  const alertId = str(formData, "alert_id");
  if (!ALERT_ID.test(alertId)) throw new Error("Invalid alert ID.");
  const a = await loadAlert(alertId);
  if (!a || a.approval_status !== "Approved") throw new Error("Only approved alerts can be acknowledged.");
  return a;
}

export async function simulateAcknowledgement(formData: FormData): Promise<void> {
  const a = await approvedAlert(formData);
  await acknowledgeAlert(a, "manual");
  refresh(a.case_id);
}

export async function simulateNoReply(formData: FormData): Promise<void> {
  const a = await approvedAlert(formData);
  await markOverdue(a, "manual");
  refresh(a.case_id);
}

/* ------------------------------------------------------------------ */
/* Step 24 – Outcome                                                     */
/* ------------------------------------------------------------------ */

const money = (s: string) => {
  const t = s.replace(/[₹,\s]/g, "");
  return t === "" ? NaN : Number(t);
};

export async function submitOutcome(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const caseId = str(formData, "case_id");
    if (!CASE_ID.test(caseId)) return fail("Invalid case ID.");
    const data = await loadCase(caseId);
    if (!data) return fail("Case not found.");
    if (data.kase.status === "Closed") return fail("This case is already closed. Its outcome is locked.");
    const s = db();
    const existing = await s.from("outcomes").select("outcome_id").eq("case_id", caseId).maybeSingle();
    if (existing.error) return fail(`Could not read outcomes: ${existing.error.message}`);
    if (existing.data) return fail("An outcome is already recorded for this case.");

    const zoneId = str(formData, "actual_zone") || null;
    let zoneExists = false;
    if (zoneId) {
      const z = await s.from("zones").select("zone_id").eq("zone_id", zoneId).maybeSingle();
      zoneExists = !z.error && !!z.data;
    }
    const rawTime = str(formData, "actual_time");
    const actualTime = rawTime ? (/[zZ]|[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime.length === 16 ? `${rawTime}:00` : rawTime}+05:30`) : null;
    const usefulnessRaw = str(formData, "usefulness");
    const hasApprovedAlert = data.alerts.some((a) => a.approval_status === "Approved");
    const override = str(formData, "override") === "yes";
    const overrideReason = str(formData, "override_reason");
    const comments = str(formData, "comments");
    const now = demoNow();
    const original = Number(data.kase.original_amount);
    const already = amountWithdrawn(data.txns);
    const protectedAmt = money(str(formData, "amount_protected"));
    const withdrawn = money(str(formData, "amount_withdrawn"));

    const v = validateOutcome({
      original, alreadyWithdrawn: already, protectedAmt, withdrawn, zoneId, zoneExists, actualTime,
      fraudTime: data.kase.fraud_timestamp, now, hasApprovedAlert,
      usefulness: usefulnessRaw ? Number(usefulnessRaw) : null, override, overrideReason, comments,
    });
    if (v.errors.length) return fail(v.errors.join(" "));

    // How did the forecast the analyst saw perform?
    const run = await loadLatestRun(caseId);
    let rank: number | null = null;
    let top1: boolean | null = null;
    let top3: boolean | null = null;
    if (zoneId) {
      const ranked = run && run.valid && !run.insufficient ? run.top3.map((z) => z.zone_id) : [];
      const idx = ranked.indexOf(zoneId);
      rank = idx >= 0 ? idx + 1 : null;
      top1 = idx === 0;
      top3 = idx >= 0;
    }

    const p = Math.round(protectedAmt * 100) / 100;
    const w = Math.round(withdrawn * 100) / 100;
    const ins = await s.from("outcomes").insert({
      outcome_id: `SYN-OUT-${caseId.slice(-4)}-${Date.now().toString(36).toUpperCase()}`,
      case_id: caseId, actual_cashout_zone: zoneId, actual_cashout_timestamp: actualTime ? new Date(actualTime).toISOString() : null,
      forecast_rank: rank, forecast_correct_top_one: top1, forecast_correct_top_three: top3,
      original_amount_at_risk: original, amount_protected: p, amount_withdrawn: w, amount_unresolved: v.unresolved,
      intervention_result: v.result, analyst_override: override, override_reason: override ? overrideReason : null,
      analyst_feedback: comments || null, alert_usefulness: hasApprovedAlert ? Number(usefulnessRaw) : null,
      case_status: "Closed", closed_at: now.toISOString(),
    });
    if (ins.error) return fail(`Could not save the outcome: ${ins.error.message}`);
    const cs = await s.from("cases").update({ status: "Closed", current_amount_at_risk: v.unresolved, updated_at: now.toISOString() }).eq("case_id", caseId);
    if (cs.error) return fail(`Outcome saved, but the case could not be closed: ${cs.error.message}`);
    await s.from("alerts").update({ action_status: "Action recorded" }).eq("case_id", caseId).eq("acknowledgement_status", "Acknowledged");

    const events: WfEvent[] = [{
      case_id: caseId, action_type: "OUTCOME_RECORDED",
      previous_value: { status: data.kase.status, current_amount_at_risk: data.kase.current_amount_at_risk },
      new_value: { protected: p, withdrawn: w, unresolved: v.unresolved, result: v.result, actual_zone: zoneId, forecast_rank: rank, top1, top3, override },
    }];
    if (override) events.push({ case_id: caseId, action_type: "FORECAST_OVERRIDDEN", new_value: { reason: overrideReason, run_id: run?.runId ?? null }, reason: overrideReason });
    await writeEvents(events);
    refresh(caseId);
    return ok(`Outcome recorded (${v.result}). The case is closed and the dashboard is updated.`);
  } catch (e) {
    return fail((e as Error).message);
  }
}
