// FraudCast – Step 28: go-live readiness checks shown on the Status page.
// Each check says what is wrong and how to fix it, in plain words.

import { aiConfig, aiStatus } from "../ai/config";
import { demoNow } from "../demo-time";
import { latestSuites } from "../eval/store";
import { db } from "../supabase";

export type CheckStatus = "pass" | "warn" | "fail";
export type Check = { group: string; label: string; status: CheckStatus; detail: string; fix?: string };

async function count(table: string, filter?: { col: string; val: string }): Promise<number | string> {
  let q = db().from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.eq(filter.col, filter.val);
  const r = await q;
  return r.error ? `error: ${r.error.message}` : r.count ?? 0;
}

export async function readinessChecks(): Promise<Check[]> {
  const c: Check[] = [];
  const env = process.env;

  // --- Settings
  const hasDb = !!(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL) && !!env.SUPABASE_SERVICE_ROLE_KEY;
  c.push({ group: "Settings", label: "Supabase URL and secret key", status: hasDb ? "pass" : "fail", detail: hasDb ? "Both set." : "Missing.", fix: "Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local and Vercel), then redeploy." });
  const exposed = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /KEY|SECRET|SERVICE|TOKEN|OPENAI|AZURE/i.test(k));
  c.push({ group: "Settings", label: "No secret is exposed to the browser", status: exposed.length ? "fail" : "pass", detail: exposed.length ? `Rename: ${exposed.join(", ")}` : "No NEXT_PUBLIC_ variable looks like a secret.", fix: "Never start a key's name with NEXT_PUBLIC_. Rename it and rotate the key." });
  const clock = env.DEMO_NOW;
  c.push({ group: "Settings", label: "Demo clock (DEMO_NOW)", status: clock && !Number.isNaN(new Date(clock).getTime()) ? "pass" : "warn", detail: clock ? `Set to ${clock}. App time: ${demoNow().toISOString()}` : "Not set: using the built-in default 2026-10-22T12:00:00+05:30.", fix: "Add DEMO_NOW=2026-10-22T12:00:00+05:30 in Vercel so local and live behave the same." });
  const ai = aiStatus();
  c.push({ group: "Settings", label: "AI mode", status: "pass", detail: ai.reason + (ai.ready ? "" : " This is a valid, fully working demo mode.") });

  // --- Data
  const expected: [string, number][] = [["cases", 20], ["zones", 25], ["cash_out_points", 48], ["historical_cashout_events", 30], ["accounts", 58]];
  for (const [t, n] of expected) {
    const got = await count(t);
    c.push({ group: "Data", label: `Table ${t}`, status: got === n ? "pass" : typeof got === "number" && got > 0 ? "warn" : "fail", detail: `${got} rows (seed has ${n}).`, fix: "Re-run schema.sql and seed.sql in Supabase, then phase5.sql and phase7.sql." });
  }
  const preds = await db().from("predictions").select("case_id");
  const casesRes = await db().from("cases").select("case_id,status");
  const withFc = new Set(((preds.data ?? []) as { case_id: string }[]).map((p) => p.case_id));
  const active = ((casesRes.data ?? []) as { case_id: string; status: string }[]).filter((x) => x.status !== "Closed");
  const missingFc = active.filter((x) => !withFc.has(x.case_id)).length;
  c.push({ group: "Data", label: "Forecasts for every active case", status: preds.error ? "fail" : missingFc ? "warn" : "pass", detail: preds.error ? preds.error.message : missingFc ? `${missingFc} active case(s) have no forecast.` : `All ${active.length} active cases have a forecast.`, fix: "Overview → Run forecasts for all cases (or Reset demo, which does it for you)." });

  // --- Knowledge base
  const chunks = await db().from("rag_chunks").select("access_level,embedding_model");
  const rows = (chunks.data ?? []) as { access_level: string; embedding_model: string | null }[];
  const approved = rows.filter((r) => r.access_level === "approved");
  c.push({ group: "Knowledge", label: "Document library built", status: chunks.error ? "fail" : approved.length === 22 ? "pass" : approved.length ? "warn" : "fail", detail: chunks.error ? chunks.error.message : `${approved.length} approved chunks (expected 22).`, fix: "Knowledge → Build knowledge base. If it errors, run phase5.sql." });
  if (ai.ready) {
    const model = aiConfig().embeddingModel;
    const emb = approved.filter((r) => r.embedding_model === model).length;
    c.push({ group: "Knowledge", label: "Embeddings match the AI model", status: emb === approved.length && emb > 0 ? "pass" : "warn", detail: `${emb}/${approved.length} chunks embedded with ${model}.`, fix: "Knowledge → Rebuild knowledge base." });
  }
  const vec = await db().rpc("match_rag_chunks", { query_embedding: new Array(1536).fill(0.001), match_count: 1 });
  c.push({ group: "Knowledge", label: "Vector search function (phase5.sql)", status: vec.error ? "fail" : "pass", detail: vec.error ? vec.error.message : "Installed.", fix: "Run phase5.sql in Supabase." });

  // --- Demo reset
  const snap = await db().rpc("demo_reset_ready", {});
  const s = (snap.data ?? {}) as { cases?: number; alerts?: number; outcomes?: number };
  const snapOk = !snap.error && s.cases === 20 && s.alerts === 11 && s.outcomes === 8;
  c.push({ group: "Demo", label: "Reset snapshot (phase7.sql)", status: snapOk ? "pass" : "fail", detail: snap.error ? snap.error.message : `Snapshot: ${s.cases} cases, ${s.alerts} alerts, ${s.outcomes} outcomes.`, fix: "Run schema.sql, seed.sql, phase5.sql, then phase7.sql." });
  c.push({ group: "Demo", label: "Reset button enabled", status: env.DEMO_RESET_ENABLED === "false" ? "warn" : "pass", detail: env.DEMO_RESET_ENABLED === "false" ? "Disabled by DEMO_RESET_ENABLED=false." : "Enabled.", fix: "Remove DEMO_RESET_ENABLED=false to allow resets." });
  const pending = await count("alerts", { col: "approval_status", val: "Draft" });
  c.push({ group: "Demo", label: "Starting state", status: pending === 0 ? "pass" : "warn", detail: pending === 0 ? "No leftover draft alerts." : `${pending} draft alert(s) left over from practice.`, fix: "Click Reset demo before presenting." });

  // --- Safety evaluation
  const suites = await latestSuites().catch(() => ({}));
  for (const [name, label] of [["guardrails", "Guardrail self-tests"], ["retrieval", "Retrieval and abstention"], ["redteam", "Trick-prompt (red team) safety"]] as const) {
    const r = (suites as Record<string, { pass: boolean; ranAt: string; mode: string; metrics: { display: string }[] }>)[name];
    c.push({ group: "Safety", label, status: !r ? "warn" : r.pass ? "pass" : "fail", detail: r ? `${r.metrics[0]?.display} · ${r.mode} · run ${new Date(r.ranAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "Not run yet.", fix: "Safety page → run this suite (re-run after switching AI on or off)." });
  }
  return c;
}
