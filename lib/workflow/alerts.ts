// FraudCast – Step 23: alert reads and the SIMULATED recipient (acknowledgement / overdue).
// No real team exists. The "team" acknowledges ACK_DELAY_SECONDS real seconds after approval,
// unless the analyst clicks "Simulate no reply", in which case the alert becomes Overdue.

import { demoNow } from "../demo-time";
import { db } from "../supabase";
import type { AlertRow } from "../types";
import { workflowConfig } from "./config";
import { writeEvents } from "./events";

export type AlertFull = AlertRow & { alert_reason: string; draft_content: string; edited_content: string | null };

export async function loadCaseAlerts(caseId: string): Promise<AlertFull[]> {
  const res = await db().from("alerts").select("*").eq("case_id", caseId).order("created_at", { ascending: true });
  if (res.error) throw new Error(`Could not read alerts: ${res.error.message}`);
  return ((res.data ?? []) as AlertFull[]).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.alert_id.localeCompare(b.alert_id));
}

export async function loadAlert(alertId: string): Promise<AlertFull | null> {
  const res = await db().from("alerts").select("*").eq("alert_id", alertId).maybeSingle();
  if (res.error) throw new Error(`Could not read alert: ${res.error.message}`);
  return (res.data ?? null) as AlertFull | null;
}

export type AlertEventInfo = { realApprovedAt: string | null; draftSource: string | null; draftModel: string | null; draftFallback: string | null };

/** Approval real-time and draft provenance per alert, from the audit log. */
export async function alertEventInfo(caseId?: string): Promise<Map<string, AlertEventInfo>> {
  let q = db().from("audit_events").select("action_type,new_value").in("action_type", ["ALERT_DRAFTED", "ALERT_APPROVED"]);
  if (caseId) q = q.eq("case_id", caseId);
  const res = await q;
  if (res.error) throw new Error(`Could not read audit events: ${res.error.message}`);
  const map = new Map<string, AlertEventInfo>();
  for (const row of (res.data ?? []) as { action_type: string; new_value: Record<string, unknown> | null }[]) {
    const v = row.new_value ?? {};
    const id = typeof v.alert_id === "string" ? v.alert_id : null;
    if (!id) continue;
    const cur = map.get(id) ?? { realApprovedAt: null, draftSource: null, draftModel: null, draftFallback: null };
    if (row.action_type === "ALERT_APPROVED" && typeof v.real_time === "string") cur.realApprovedAt = v.real_time;
    if (row.action_type === "ALERT_DRAFTED") {
      cur.draftSource = typeof v.source === "string" ? v.source : null;
      cur.draftModel = typeof v.model === "string" ? v.model : null;
      cur.draftFallback = typeof v.fallback_reason === "string" ? v.fallback_reason : null;
    }
    map.set(id, cur);
  }
  return map;
}

export async function acknowledgeAlert(a: AlertFull, trigger: "auto" | "manual"): Promise<boolean> {
  const cfg = workflowConfig();
  const now = demoNow();
  const late = a.acknowledgement_status === "Overdue";
  const approved = a.approved_at ? new Date(a.approved_at) : now;
  const ackAt = late ? now : new Date(approved.getTime() + cfg.ackSimMinutes * 60000);
  const s = db();
  const up = await s
    .from("alerts")
    .update({ acknowledgement_status: "Acknowledged", acknowledgement_timestamp: ackAt.toISOString(), action_status: "Review started" })
    .eq("alert_id", a.alert_id)
    .in("acknowledgement_status", ["Pending", "Overdue"])
    .select("alert_id");
  if (up.error) throw new Error(`Could not acknowledge alert: ${up.error.message}`);
  if (!(up.data ?? []).length) return false; // already handled by another request
  const cs = await s.from("cases").update({ status: "Acknowledged", updated_at: now.toISOString() }).eq("case_id", a.case_id).eq("status", "Alert Sent");
  if (cs.error) throw new Error(`Could not update case status: ${cs.error.message}`);
  await writeEvents([{
    case_id: a.case_id, action_type: "ALERT_ACKNOWLEDGED",
    previous_value: { acknowledgement_status: a.acknowledgement_status },
    new_value: { alert_id: a.alert_id, recipient_id: a.recipient_id, simulated: true, trigger, late, acknowledged_at: ackAt.toISOString() },
  }]);
  return true;
}

export async function markOverdue(a: AlertFull, trigger: "auto" | "manual"): Promise<boolean> {
  const up = await db()
    .from("alerts")
    .update({ acknowledgement_status: "Overdue" })
    .eq("alert_id", a.alert_id)
    .eq("acknowledgement_status", "Pending")
    .select("alert_id");
  if (up.error) throw new Error(`Could not update alert: ${up.error.message}`);
  if (!(up.data ?? []).length) return false;
  await writeEvents([{
    case_id: a.case_id, action_type: "ALERT_OVERDUE",
    previous_value: { acknowledgement_status: "Pending" },
    new_value: { alert_id: a.alert_id, recipient_id: a.recipient_id, simulated: true, trigger, deadline: a.escalation_deadline },
  }]);
  return true;
}

/**
 * Run the simulation for pending alerts (all, or one case). Called when pages load.
 * - Approved in this app more than ACK_DELAY_SECONDS ago (real time) → Acknowledged.
 * - Past its escalation deadline on the demo clock → Overdue.
 * Seeded alerts have no real approval time, so they only change when the analyst clicks a button.
 */
export async function syncSimulatedAlerts(caseId?: string): Promise<number> {
  let q = db().from("alerts").select("*").eq("approval_status", "Approved").eq("acknowledgement_status", "Pending");
  if (caseId) q = q.eq("case_id", caseId);
  const res = await q;
  if (res.error) throw new Error(`Could not read alerts: ${res.error.message}`);
  const pending = (res.data ?? []) as AlertFull[];
  if (!pending.length) return 0;
  const info = await alertEventInfo(caseId);
  const cfg = workflowConfig();
  const now = demoNow();
  let changed = 0;
  for (const a of pending) {
    const real = info.get(a.alert_id)?.realApprovedAt;
    if (real && Date.now() - Date.parse(real) >= cfg.ackDelaySeconds * 1000) {
      if (await acknowledgeAlert(a, "auto")) changed++;
    } else if (a.escalation_deadline && new Date(a.escalation_deadline) < now) {
      if (await markOverdue(a, "auto")) changed++;
    }
  }
  return changed;
}
