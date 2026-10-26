// FraudCast – load everything the AI features need for one case (server-side only).

import { loadCase } from "../data";
import { demoNow } from "../demo-time";
import { explainRun, type Explanation } from "../explain";
import { loadLatestRun, type StoredRun } from "../forecast-data";
import { db } from "../supabase";
import { buildCaseFacts, buildForecastFacts, type CaseFacts, type ForecastFacts, type ZoneInfo } from "./facts";

export type AiContext = {
  caseFacts: CaseFacts;
  forecastFacts: ForecastFacts;
  run: StoredRun | null;
  explanation: Explanation | null;
};

export async function loadAiContext(caseId: string): Promise<AiContext | null> {
  const [data, run, zonesRes, histRes] = await Promise.all([
    loadCase(caseId),
    loadLatestRun(caseId),
    db().from("zones").select("zone_id,zone_name,jurisdiction"),
    db().from("historical_cashout_events").select("historical_event_id"),
  ]);
  if (!data) return null;
  if (zonesRes.error) throw new Error(`Could not read zones: ${zonesRes.error.message}`);
  const zones = new Map(((zonesRes.data ?? []) as ZoneInfo[]).map((z) => [z.zone_id, z]));
  const name = (id: string) => (zones.get(id) ? `${zones.get(id)!.zone_name} (${id})` : id);
  const explanation = run ? explainRun(run, name, (histRes.data ?? []).length) : null;
  return {
    caseFacts: buildCaseFacts(data.kase, data.txns, data.outcome, demoNow()),
    forecastFacts: buildForecastFacts(run, explanation, zones),
    run,
    explanation,
  };
}
