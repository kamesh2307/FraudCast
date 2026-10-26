"use server";
// FraudCast – Phase 7 server actions: safety evaluation, AI connection test, one-click demo reset.

import { revalidatePath } from "next/cache";
import { answerQuestion } from "../../lib/ai/assistant";
import { aiConfig, aiStatus } from "../../lib/ai/config";
import { loadAiContext } from "../../lib/ai/context";
import { chatJSON, embed } from "../../lib/ai/llm";
import { saveSuite } from "../../lib/eval/store";
import { runGuardrailSuite, runRedTeamSuite, runRetrievalSuite, type SuiteName, type SuiteResult } from "../../lib/eval/suites";
import { runAndSaveForecasts } from "../../lib/forecast-data";
import { chunkDocs } from "../../lib/knowledge/chunks";
import { retrieve } from "../../lib/knowledge/retrieve";
import { db } from "../../lib/supabase";
import { writeEvents } from "../../lib/workflow/events";
import type { FormState } from "../../lib/workflow/form-state";

const ok = (message: string): FormState => ({ ok: true, message, error: null, at: Date.now() });
const fail = (error: string): FormState => ({ ok: false, message: null, error, at: Date.now() });
const RED_TEAM_CASE = "SYN-CASE-0001";

/** Step 27 – run one evaluation suite and store the result (kept across demo resets). */
export async function runSafetySuite(formData: FormData): Promise<void> {
  const suite = String(formData.get("suite") ?? "") as SuiteName;
  if (!["guardrails", "retrieval", "redteam"].includes(suite)) throw new Error("Unknown suite.");
  const t0 = Date.now();
  let result: SuiteResult;
  try {
    if (suite === "guardrails") {
      result = runGuardrailSuite();
    } else if (suite === "retrieval") {
      result = await runRetrievalSuite((q) => retrieve(q));
    } else {
      const ctx = await loadAiContext(RED_TEAM_CASE);
      if (!ctx) throw new Error(`${RED_TEAM_CASE} not found. Reset the demo first.`);
      const contents = new Map(chunkDocs().map((c) => [c.chunk_id, c.content]));
      result = await runRedTeamSuite(
        (q) => answerQuestion(q, ctx.caseFacts, ctx.forecastFacts, { retrieve: (x) => retrieve(x) }),
        (id) => contents.get(id),
        [JSON.stringify(ctx.caseFacts), JSON.stringify(ctx.forecastFacts)],
      );
      const st = aiStatus();
      result.mode = st.ready ? `ai (${aiConfig().chatModel})` : "template";
    }
  } catch (e) {
    result = { suite, ranAt: new Date().toISOString(), mode: aiStatus().ready ? "ai" : "template", metrics: [], pass: false, rows: [], error: (e as Error).message, durationMs: Date.now() - t0 };
  }
  await saveSuite(result);
  revalidatePath("/safety");
  revalidatePath("/status");
}

/** Step 28 – check that the AI key, model and embedding model actually work. */
export async function testAiConnection(_prev: FormState, _fd: FormData): Promise<FormState> {
  void _prev;
  void _fd;
  const st = aiStatus();
  if (!st.ready) return fail(st.reason);
  const cfg = aiConfig();
  try {
    const t0 = Date.now();
    const chat = await chatJSON('Reply with the JSON object {"ok": true} and nothing else.', "ping");
    const t1 = Date.now();
    const [v] = await embed(["FraudCast connection test"]);
    const t2 = Date.now();
    const okJson = (chat.json as { ok?: unknown } | null)?.ok === true;
    return ok(`Chat model ${chat.model} answered in ${t1 - t0} ms${okJson ? "" : " (unexpected reply, but reachable)"}. Embedding model ${cfg.embeddingModel} returned ${v.length} dimensions in ${t2 - t1} ms.`);
  } catch (e) {
    return fail(`AI test failed: ${(e as Error).message}`);
  }
}

/** Step 29 – restore the fresh demo data and re-run every forecast. */
export async function resetDemo(_prev: FormState, formData: FormData): Promise<FormState> {
  void _prev;
  if (process.env.DEMO_RESET_ENABLED === "false") return fail("Reset is disabled (DEMO_RESET_ENABLED=false).");
  if (String(formData.get("confirm") ?? "").trim() !== "RESET") return fail('Type RESET (in capitals) to confirm.');
  try {
    const t0 = Date.now();
    const r = await db().rpc("reset_demo", {});
    if (r.error) return fail(`Reset failed: ${r.error.message}. Did you run phase7.sql?`);
    const restored = (r.data ?? {}) as { cases?: number; alerts?: number; outcomes?: number; kept_events?: number };
    const fc = await runAndSaveForecasts(null, "Demo reset: forecasts re-run");
    await writeEvents([{ case_id: null, action_type: "DEMO_RESET", new_value: { ...restored, forecasts: fc.cases, real_time: new Date().toISOString() } }]);
    revalidatePath("/", "layout");
    return ok(`Demo reset in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${restored.cases} cases, ${restored.alerts} alerts and ${restored.outcomes} outcomes restored, ${fc.cases} forecasts re-run. Safety results were kept.`);
  } catch (e) {
    return fail(`Reset failed: ${(e as Error).message}`);
  }
}
