// FraudCast – save and read evaluation results (stored as SAFETY_EVAL_RUN audit events, kept across demo resets).

import { db } from "../supabase";
import { writeEvents } from "../workflow/events";
import type { SuiteName, SuiteResult } from "./suites";

export async function saveSuite(r: SuiteResult): Promise<void> {
  await writeEvents([{ case_id: null, action_type: "SAFETY_EVAL_RUN", new_value: r as unknown as Record<string, unknown> }]);
}

export async function latestSuites(): Promise<Partial<Record<SuiteName, SuiteResult>>> {
  const res = await db().from("audit_events").select("event_id,new_value").eq("action_type", "SAFETY_EVAL_RUN").order("event_id", { ascending: false }).limit(30);
  if (res.error) throw new Error(`Could not read evaluation results: ${res.error.message}`);
  const out: Partial<Record<SuiteName, SuiteResult>> = {};
  for (const row of (res.data ?? []) as { new_value: SuiteResult | null }[]) {
    const v = row.new_value;
    if (v && v.suite && !out[v.suite]) out[v.suite] = v;
  }
  return out;
}
