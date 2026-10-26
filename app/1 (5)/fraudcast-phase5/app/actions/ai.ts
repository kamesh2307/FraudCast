"use server";
// FraudCast – server actions for Phase 5 AI features. They run on the server only,
// so the AI key and the database key never reach the browser.

import { revalidatePath } from "next/cache";
import { answerQuestion, type AssistantAnswer } from "../../lib/ai/assistant";
import { writeAudit } from "../../lib/ai/audit";
import { aiConfig, aiStatus } from "../../lib/ai/config";
import { loadAiContext } from "../../lib/ai/context";
import { generateExplanation } from "../../lib/ai/explain-ai";
import { embed } from "../../lib/ai/llm";
import { generateSummary } from "../../lib/ai/summary";
import { chunkDocs, embeddingText } from "../../lib/knowledge/chunks";
import { retrieve } from "../../lib/knowledge/retrieve";
import { db } from "../../lib/supabase";

const CASE_ID = /^SYN-CASE-\d{4}$/;

function caseIdFrom(formData: FormData): string {
  const id = String(formData.get("case_id") ?? "");
  if (!CASE_ID.test(id)) throw new Error("Invalid case ID.");
  return id;
}

/** Step 17/18 – AI case summary. Stored as a SUMMARY_GENERATED audit event. */
export async function generateCaseSummary(formData: FormData): Promise<void> {
  const caseId = caseIdFrom(formData);
  const ctx = await loadAiContext(caseId);
  if (!ctx) throw new Error("Case not found.");
  const r = await generateSummary(ctx.caseFacts);
  const events = [{
    case_id: caseId, action_type: "SUMMARY_GENERATED", model_version: r.model,
    new_value: { ...r, generated_at: new Date().toISOString() } as unknown as Record<string, unknown>,
  }];
  if (r.source === "template" && aiStatus().ready) {
    events.push({ case_id: caseId, action_type: "LLM_FALLBACK", model_version: r.model, new_value: { feature: "summary", reason: r.fallbackReason, problems: r.problems } as unknown as Record<string, unknown> });
  }
  await writeAudit(events);
  revalidatePath(`/cases/${caseId}`);
}

/** Step 19 – AI explanation of the latest forecast run. Stored as an EXPLANATION_GENERATED audit event. */
export async function generateForecastExplanation(formData: FormData): Promise<void> {
  const caseId = caseIdFrom(formData);
  const ctx = await loadAiContext(caseId);
  if (!ctx) throw new Error("Case not found.");
  if (!ctx.run || !ctx.run.valid || ctx.run.insufficient) throw new Error("There is no ranked forecast to explain. Run the forecast first.");
  const r = await generateExplanation(ctx.forecastFacts);
  const events = [{
    case_id: caseId, action_type: "EXPLANATION_GENERATED", model_version: r.model,
    new_value: { ...r, run_id: ctx.run.runId, generated_at: new Date().toISOString() } as unknown as Record<string, unknown>,
  }];
  if (r.source === "template" && aiStatus().ready) {
    events.push({ case_id: caseId, action_type: "LLM_FALLBACK", model_version: r.model, new_value: { feature: "explanation", reason: r.fallbackReason, problems: r.problems } as unknown as Record<string, unknown> });
  }
  await writeAudit(events);
  revalidatePath(`/cases/${caseId}/forecast`);
}

/** Step 21 – RAG assistant. Called directly from the AssistantPanel client component. */
export async function askAssistant(caseId: string, question: string): Promise<AssistantAnswer> {
  if (!CASE_ID.test(caseId)) throw new Error("Invalid case ID.");
  if (typeof question !== "string") throw new Error("Invalid question.");
  const ctx = await loadAiContext(caseId);
  if (!ctx) throw new Error("Case not found.");
  const a = await answerQuestion(question, ctx.caseFacts, ctx.forecastFacts, { retrieve: (q) => retrieve(q) });
  await writeAudit([{
    case_id: caseId, action_type: "RAG_QUERY", model_version: a.model,
    new_value: {
      question: a.question, mode: a.mode, retrieval: a.retrieval, retrieved: a.retrieved, cited: a.citations.map((c) => c.chunk_id),
      abstained: a.abstained, refused: a.refused, case_answer: a.caseAnswer, guidance_answer: a.guidanceAnswer,
      notices: a.notices, prompt_version: a.promptVersion, latency_ms: a.latencyMs,
    },
  }]);
  return a;
}

/** Step 20/21 – chunk the approved documents, embed them (if AI is on) and store them in rag_chunks. */
export async function buildKnowledgeBase(): Promise<void> {
  const cfg = aiConfig();
  const rows = chunkDocs();
  let vectors: number[][] | null = null;
  let note = "Keyword search only (AI is off).";
  if (aiStatus(cfg).ready) {
    try {
      vectors = await embed(rows.map(embeddingText));
      note = `Embedded with ${cfg.embeddingModel}.`;
    } catch (e) {
      note = `Embedding failed (${(e as Error).message}); stored for keyword search only.`;
    }
  }
  const s = db();
  const del = await s.from("rag_chunks").delete().neq("chunk_id", "");
  if (del.error) throw new Error(`Could not clear the knowledge base: ${del.error.message}`);
  const ins = await s.from("rag_chunks").insert(rows.map((r, i) => ({
    ...r, embedding: vectors ? vectors[i] : null, embedding_model: vectors ? cfg.embeddingModel : null,
  })));
  if (ins.error) throw new Error(`Could not save the knowledge base: ${ins.error.message}. Did you run phase5.sql?`);
  await writeAudit([{ case_id: null, action_type: "KNOWLEDGE_BASE_BUILT", model_version: vectors ? cfg.embeddingModel : null, new_value: { chunks: rows.length, embedded: !!vectors, note } }]);
  revalidatePath("/knowledge");
}
