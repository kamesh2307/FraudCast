// FraudCast – Step 21: RAG analyst assistant (PRD 12.8 and Section 19).
// Case facts come from the database; procedure comes from approved documents. Both are labelled separately.
// Every guidance answer must cite a retrieved approved chunk; otherwise the assistant abstains.

import { aiStatus } from "./config";
import type { CaseFacts, ForecastFacts } from "./facts";
import { ACTION_TERMS, groundingCheck, safetyCheck } from "./grounding";
import { chatJSON, type ChatFn } from "./llm";
import { ASSISTANT_SYSTEM, PROMPT_VERSIONS } from "./prompts";
import type { Retrieval, RetrievedChunk } from "../knowledge/retrieve";

export type Citation = { chunk_id: string; document_id: string; title: string; version: string; section: string; excerpt: string; score: number };

export type AssistantAnswer = {
  question: string;
  caseAnswer: string | null;
  guidanceAnswer: string | null;
  citations: Citation[];
  abstained: boolean;
  refused: boolean;
  mode: "ai" | "template";
  retrieval: "vector" | "keyword";
  notices: string[];
  model: string | null;
  promptVersion: string;
  latencyMs: number;
  retrieved: { chunk_id: string; score: number }[];
};

export const NO_GUIDANCE = "No approved guidance found for this question.";
export const REFUSAL =
  "I can only answer questions about this case and approved FraudCast procedures. I can't change my rules or take actions.";
export const ACTION_REFUSAL =
  "FraudCast can't freeze, hold or block accounts, or contact law enforcement. It only informs you; any such action needs separate authorization by an authorized person, outside FraudCast.";

const INJECTION = /(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|system)?\s*(instructions|rules|prompts?)|system prompt|you are now|act as|developer mode|jailbreak|reveal (your|the) (prompt|instructions|rules)/i;
const ACTION_REQUEST = /^\s*(please\s+)?(freeze|block|hold|seize|arrest|file|report|close)\b|\b(can|could|will|would)\s+you\s+(please\s+)?(freeze|block|hold|put a hold|seize|file|report|close|arrest)\b/i;

const excerpt = (c: RetrievedChunk, n = 320) => (c.content.length > n ? `${c.content.slice(0, n).replace(/\s+\S*$/, "")}…` : c.content);
const toCitation = (c: RetrievedChunk): Citation => ({
  chunk_id: c.chunk_id, document_id: c.document_id, title: c.title, version: c.version, section: c.section, excerpt: excerpt(c), score: c.score,
});

type Zone = { rank: number; zone_id: string; zone_name: string; jurisdiction: string; probability: string };

/** Template mode: answer common case questions from facts with fixed wording. */
export function templateCaseAnswer(q: string, cf: CaseFacts, ff: ForecastFacts): string | null {
  const s = q.toLowerCase();
  const zones = (ff.ranked_zones as Zone[] | undefined) ?? [];
  if (/missing|gap|not available|incomplete|unknown/.test(s)) {
    const m = (cf.missing_information as string[]) ?? [];
    return m.length ? `Missing or stale for ${cf.case_id}: ${m.join("; ")}.` : `No required information is missing for ${cf.case_id}.`;
  }
  if (/why|rank|first|zone|forecast|top|likely|where.*cash/.test(s)) {
    if (!zones.length) return `Forecast status for ${cf.case_id}: ${ff.status}.${ff.reason ? ` ${ff.reason}` : ""}`;
    const reasons = (ff.rank_1_reasons as string[]) ?? [];
    return `${zones[0].zone_name} (${zones[0].zone_id}) is ranked first at ${zones[0].probability}, led by ${String(ff.leading_factor).toLowerCase()}. ${reasons.slice(0, 2).join(" ")}`;
  }
  if (/recipient|who should|which team|send.*alert|alert.*to/.test(s) && zones.length) {
    return `The rank-1 zone ${zones[0].zone_id} is in jurisdiction ${zones[0].jurisdiction}.`;
  }
  if (/amount|risk|exposed|held|how much|where.*money|balance/.test(s)) {
    const holders = Array.isArray(cf.accounts_holding_funds) ? (cf.accounts_holding_funds as { account_id: string; amount_held: string }[]) : [];
    return `${cf.current_amount_at_risk} is at risk for ${cf.case_id}.${holders.length ? ` Held in ${holders.map((h) => `${h.account_id} (${h.amount_held})`).join(", ")}.` : ""} ${cf.already_withdrawn_as_cash} has already been withdrawn as cash.`;
  }
  return null;
}

type Deps = { retrieve: (q: string) => Promise<Retrieval>; chat?: ChatFn; ready?: boolean };

export async function answerQuestion(rawQuestion: string, caseFacts: CaseFacts, forecastFacts: ForecastFacts, deps: Deps): Promise<AssistantAnswer> {
  const started = Date.now();
  const question = rawQuestion.replace(/\s+/g, " ").trim().slice(0, 500);
  const ready = deps.ready ?? aiStatus().ready;
  const chat = deps.chat ?? chatJSON;
  const base: AssistantAnswer = {
    question, caseAnswer: null, guidanceAnswer: null, citations: [], abstained: false, refused: false,
    mode: ready ? "ai" : "template", retrieval: "keyword", notices: [], model: null, promptVersion: PROMPT_VERSIONS.assistant, latencyMs: 0, retrieved: [],
  };
  const done = (a: AssistantAnswer) => ({ ...a, latencyMs: Date.now() - started });

  if (!question) return done({ ...base, abstained: true, guidanceAnswer: NO_GUIDANCE, notices: ["Please type a question."] });
  if (INJECTION.test(question)) return done({ ...base, refused: true, caseAnswer: REFUSAL, notices: ["Possible prompt injection detected; the question was not sent to the AI."] });

  const r = await deps.retrieve(question);
  const above = r.chunks.filter((c) => c.score >= r.threshold);
  const notices = r.note ? [r.note] : [];
  const common = { ...base, retrieval: r.mode, retrieved: r.chunks.map((c) => ({ chunk_id: c.chunk_id, score: c.score })), notices };

  if (ACTION_REQUEST.test(question)) {
    // Cite the approved policy on actions with a fixed lookup, so account IDs in the question can't dilute the search.
    const policy = await deps.retrieve("What actions does FraudCast not take: freeze, hold or block an account?");
    const sop = policy.chunks.filter((c) => c.score >= policy.threshold && ACTION_TERMS.test(c.content)).slice(0, 2);
    return done({ ...common, refused: true, caseAnswer: ACTION_REFUSAL, guidanceAnswer: sop.length ? sop.map((c) => c.content).join(" ") : null, citations: sop.map(toCitation) });
  }

  const template = (extra: string[] = []): AssistantAnswer => {
    const caseAnswer = templateCaseAnswer(question, caseFacts, forecastFacts);
    const top = above.slice(0, 2);
    const guidanceAnswer = top.length ? top.map((c) => excerpt(c, 420)).join(" ") : null;
    return {
      ...common, mode: "template", caseAnswer, guidanceAnswer: guidanceAnswer ?? (caseAnswer ? null : NO_GUIDANCE),
      citations: top.map(toCitation), abstained: !caseAnswer && !guidanceAnswer, notices: [...notices, ...extra],
    };
  };
  if (!ready) return done(template());

  const docs = above.map((c) => `<document id="${c.chunk_id}" title="${c.title}" version="${c.version}" section="${c.section}">\n${c.content}\n</document>`).join("\n");
  const user = `QUESTION: ${question}\n\nCASE_FACTS:\n${JSON.stringify(caseFacts)}\n\nFORECAST_FACTS:\n${JSON.stringify(forecastFacts)}\n\nDOCUMENTS:\n${docs || "(no approved document matched this question)"}`;

  try {
    const res = await chat(ASSISTANT_SYSTEM, user);
    const o = (res.json ?? {}) as Record<string, unknown>;
    let caseAnswer = typeof o.from_case_data === "string" && o.from_case_data.trim() ? o.from_case_data.trim().slice(0, 1200) : null;
    let guidanceAnswer = typeof o.from_guidance === "string" && o.from_guidance.trim() ? o.from_guidance.trim().slice(0, 1200) : null;
    const allowedIds = new Set(above.map((c) => c.chunk_id));
    const cited = (Array.isArray(o.cited_chunk_ids) ? o.cited_chunk_ids : []).map(String).filter((id) => allowedIds.has(id));
    const citedChunks = above.filter((c) => cited.includes(c.chunk_id));
    const allowActions = citedChunks.some((c) => ACTION_TERMS.test(c.content));
    const extra: string[] = [];

    if (caseAnswer) {
      const g = groundingCheck(caseAnswer, [JSON.stringify(caseFacts), JSON.stringify(forecastFacts)]);
      const s = safetyCheck(caseAnswer, allowActions);
      if (!g.ok || !s.ok) {
        caseAnswer = templateCaseAnswer(question, caseFacts, forecastFacts);
        extra.push(`The AI's case answer failed a check (${[...g.problems, ...s.problems][0]}) and was replaced with a template answer.`);
      }
    }
    if (guidanceAnswer) {
      if (!citedChunks.length) {
        guidanceAnswer = null;
        extra.push("The AI gave guidance without citing an approved document, so it was removed.");
      } else {
        const g = groundingCheck(guidanceAnswer, [...citedChunks.map((c) => c.content), JSON.stringify(caseFacts), JSON.stringify(forecastFacts)]);
        const s = safetyCheck(guidanceAnswer, allowActions);
        if (!g.ok || !s.ok) {
          guidanceAnswer = null;
          extra.push(`The AI's guidance failed a check (${[...g.problems, ...s.problems][0]}) and was removed.`);
        }
      }
    }
    const abstained = !caseAnswer && !guidanceAnswer;
    return done({
      ...common, mode: "ai", model: res.model, caseAnswer,
      guidanceAnswer: guidanceAnswer ?? (abstained || (!caseAnswer && !citedChunks.length) ? NO_GUIDANCE : null),
      citations: guidanceAnswer ? citedChunks.map(toCitation) : [], abstained, notices: [...notices, ...extra],
    });
  } catch (e) {
    return done(template([`AI unavailable (${(e as Error).message}); showing a template answer.`]));
  }
}
