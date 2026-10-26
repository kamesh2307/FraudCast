// FraudCast – retrieval for the RAG assistant (PRD Section 19).
// Vector search (pgvector) when AI is on and the knowledge base has matching embeddings;
// otherwise keyword search, so the assistant still works in template mode.
// Both paths return ONLY chunks with access_level = 'approved' (RG-01).

import { aiConfig, aiStatus } from "../ai/config";
import { embed } from "../ai/llm";
import { db } from "../supabase";
import type { ChunkRow } from "./chunks";

export type StoredChunk = ChunkRow & { embedding_model: string | null };
export type RetrievedChunk = StoredChunk & { score: number };
export type Retrieval = { chunks: RetrievedChunk[]; mode: "vector" | "keyword"; threshold: number; note: string | null };

const META = "chunk_id,document_id,title,source_type,version,effective_date,section,content,access_level,source_reference,embedding_model";

export async function loadChunks(): Promise<StoredChunk[]> {
  const res = await db().from("rag_chunks").select(META);
  if (res.error) throw new Error(`Could not read the knowledge base: ${res.error.message}. Did you run phase5.sql?`);
  return ((res.data ?? []) as StoredChunk[]).sort((a, b) => a.chunk_id.localeCompare(b.chunk_id));
}

/* ---------------- keyword search ---------------- */

const STOP = new Set(
  "a an and are as at be been before by can case did do does for from had has have how i if in into is it its me my no not of on or our should so than that the their them then there these they this to us was we what when where which who why will with would you your about after any all also out up".split(" "),
);

const SUFFIXES = ["ations", "ation", "ating", "ated", "ates", "ate", "ings", "ing", "edly", "ed", "es", "s", "e"];
/** Very small stemmer: escalate / escalated / escalation -> "escal". */
function stem(w: string): string {
  for (const suf of SUFFIXES) if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  return w;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w) && (w.length > 2 || /\d/.test(w))).map(stem);
}

/** Score = share of the question's (idf-weighted) words found in the chunk. 0 to 1. */
export function keywordSearch(question: string, chunks: StoredChunk[], k = 5): RetrievedChunk[] {
  const pool = chunks.filter((c) => c.access_level === "approved");
  const docs = pool.map((c) => new Set(tokens(`${c.title} ${c.section} ${c.content}`)));
  const heads = pool.map((c) => new Set(tokens(c.section)));
  const bodies = pool.map((c) => tokens(c.content));
  const q = [...new Set(tokens(question))];
  if (!q.length || !pool.length) return [];
  const idf = (t: string) => Math.log(1 + pool.length / (1 + docs.filter((d) => d.has(t)).length));
  const total = q.reduce((s, t) => s + idf(t), 0);
  return pool
    .map((c, i) => {
      const score = q.filter((t) => docs[i].has(t)).reduce((s, t) => s + idf(t), 0) / total; // used for the abstain threshold
      const heading = q.filter((t) => heads[i].has(t)).reduce((s, t) => s + idf(t), 0) / total; // tie-breaker: question matches the section title
      const density = bodies[i].length ? bodies[i].filter((w) => q.includes(w)).length / bodies[i].length : 0; // tie-breaker: focused section
      return { ...c, score: Math.round(score * 1000) / 1000, rankKey: score + 0.3 * heading + 0.5 * density };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.rankKey - a.rankKey || a.chunk_id.localeCompare(b.chunk_id))
    .slice(0, k)
    .map(({ rankKey, ...c }) => (void rankKey, c));
}

/* ---------------- main entry ---------------- */

export async function retrieve(question: string, k = 5): Promise<Retrieval> {
  const cfg = aiConfig();
  const chunks = await loadChunks();
  if (!chunks.length) return { chunks: [], mode: "keyword", threshold: cfg.keywordMinScore, note: "The knowledge base is empty. Open the Knowledge page and click Build knowledge base." };

  const approved = chunks.filter((c) => c.access_level === "approved");
  const embedded = approved.filter((c) => c.embedding_model === cfg.embeddingModel).length;
  let note: string | null = null;

  if (aiStatus(cfg).ready && embedded === approved.length) {
    try {
      const [vector] = await embed([question]);
      const res = await db().rpc("match_rag_chunks", { query_embedding: vector, match_count: k });
      if (res.error) throw new Error(res.error.message);
      const byId = new Map(chunks.map((c) => [c.chunk_id, c]));
      const hits = ((res.data ?? []) as { chunk_id: string; similarity: number }[])
        .map((h) => ({ meta: byId.get(h.chunk_id), score: Math.round(Number(h.similarity) * 1000) / 1000 }))
        .filter((h): h is { meta: StoredChunk; score: number } => !!h.meta && h.meta.access_level === "approved")
        .map((h) => ({ ...h.meta, score: h.score }));
      return { chunks: hits, mode: "vector", threshold: cfg.ragMinSimilarity, note: null };
    } catch (e) {
      note = `Vector search failed (${(e as Error).message}); used keyword search instead.`;
    }
  } else if (aiStatus(cfg).ready && embedded < approved.length) {
    note = "The knowledge base was built without matching embeddings. Rebuild it on the Knowledge page to switch on vector search.";
  }
  return { chunks: keywordSearch(question, chunks, k), mode: "keyword", threshold: cfg.keywordMinScore, note };
}
