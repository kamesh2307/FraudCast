// FraudCast – audit events for the Phase 6 workflow (alerts and outcomes). The table is append-only.

import { demoNow } from "../demo-time";
import { db } from "../supabase";

export const DEMO_USER = "DEMO-USER-ANALYST-01";

/** Time-ordered ID: SYN-EVT-WF-<9-char time>-<4 random>. */
export function wfEventId(): string {
  const stamp = Date.now().toString(36).toUpperCase().padStart(9, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `SYN-EVT-WF-${stamp}-${rand}`;
}

export type WfEvent = {
  case_id: string | null;
  action_type: string;
  new_value: Record<string, unknown>;
  previous_value?: Record<string, unknown> | null;
  reason?: string | null;
  model_version?: string | null;
};

export async function writeEvents(events: WfEvent[]): Promise<void> {
  if (!events.length) return;
  const now = demoNow().toISOString();
  const res = await db().from("audit_events").insert(
    events.map((e) => ({
      event_id: wfEventId(), user_id: DEMO_USER, case_id: e.case_id, action_type: e.action_type,
      previous_value: e.previous_value ?? null, new_value: e.new_value, reason: e.reason ?? null,
      timestamp: now, model_version: e.model_version ?? null,
    })),
  );
  if (res.error) throw new Error(`Could not write audit event: ${res.error.message}`);
}
