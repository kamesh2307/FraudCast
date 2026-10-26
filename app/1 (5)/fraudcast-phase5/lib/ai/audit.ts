// FraudCast – write and read AI-related audit events (append-only table, PRD GA-05 and Section 26).
// AI summaries and explanations are stored as audit events, so every generated text stays traceable.

import { demoNow } from "../demo-time";
import { db } from "../supabase";

export type AuditInsert = {
  case_id: string | null;
  action_type: string;
  new_value: Record<string, unknown>;
  reason?: string | null;
  model_version?: string | null;
  user_id?: string;
};

/** Fixed-width, time-ordered ID, so "newest first" sorting by event_id is reliable. */
export function eventId(): string {
  const stamp = Date.now().toString(36).toUpperCase().padStart(9, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `SYN-EVT-AI-${stamp}-${rand}`;
}

export async function writeAudit(events: AuditInsert[]): Promise<void> {
  const now = demoNow().toISOString();
  const rows = events.map((e) => ({
    event_id: eventId(), user_id: e.user_id ?? "DEMO-USER-ANALYST-01", case_id: e.case_id, action_type: e.action_type,
    previous_value: null, new_value: e.new_value, reason: e.reason ?? null, timestamp: now, model_version: e.model_version ?? null,
  }));
  const res = await db().from("audit_events").insert(rows);
  if (res.error) throw new Error(`Could not write audit event: ${res.error.message}`);
}

/** Latest event of a type for a case (optionally matching a key in new_value, e.g. the forecast run). */
export async function latestEvent<T = Record<string, unknown>>(caseId: string, actionType: string, match?: { key: string; value: string }): Promise<{ value: T; eventId: string } | null> {
  const res = await db()
    .from("audit_events")
    .select("event_id,new_value")
    .eq("case_id", caseId)
    .eq("action_type", actionType)
    .order("event_id", { ascending: false })
    .limit(10);
  if (res.error) throw new Error(`Could not read audit events: ${res.error.message}`);
  const rows = (res.data ?? []) as { event_id: string; new_value: Record<string, unknown> | null }[];
  const hit = rows.find((r) => r.new_value && (!match || r.new_value[match.key] === match.value));
  return hit ? { value: hit.new_value as T, eventId: hit.event_id } : null;
}
