// FraudCast – Knowledge library: approved documents, build the RAG index, test retrieval (Steps 20–21).
import { buildKnowledgeBase } from "../actions/ai";
import SubmitButton from "../../components/fc/SubmitButton";
import { Badge, Card, Notice } from "../../components/fc/ui";
import { aiConfig, aiStatus } from "../../lib/ai/config";
import { KNOWLEDGE_DOCS } from "../../lib/knowledge/docs";
import { loadChunks, retrieve, type Retrieval, type StoredChunk } from "../../lib/knowledge/retrieve";

export const maxDuration = 60;

type SP = Record<string, string | string[] | undefined>;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").slice(0, 300);
  const cfg = aiConfig();
  const status = aiStatus(cfg);

  let chunks: StoredChunk[] = [];
  let loadError: string | null = null;
  try {
    chunks = await loadChunks();
  } catch (e) {
    loadError = (e as Error).message;
  }
  let test: Retrieval | null = null;
  let testError: string | null = null;
  if (q && chunks.length) {
    try {
      test = await retrieve(q);
    } catch (e) {
      testError = (e as Error).message;
    }
  }
  const approved = chunks.filter((c) => c.access_level === "approved");
  const embedded = approved.filter((c) => c.embedding_model === cfg.embeddingModel).length;
  const byDoc = new Map<string, StoredChunk[]>();
  for (const c of chunks) byDoc.set(c.document_id, [...(byDoc.get(c.document_id) ?? []), c]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge library</h1>
        <p className="text-sm text-slate-600">The only documents the assistant may use. All are synthetic demo documents, not real bank policy.</p>
      </div>

      {loadError && <Notice tone="red">⚠ {loadError}</Notice>}

      <Card title="Status" right={<Badge tone={status.ready ? "green" : "slate"}>{status.ready ? "AI on" : "Template mode"}</Badge>}>
        <ul className="space-y-1 text-sm">
          <li>{status.reason}</li>
          <li>
            Knowledge base: <strong>{chunks.length}</strong> chunks stored ({approved.length} approved, {chunks.length - approved.length} not approved and never retrieved).
          </li>
          <li>
            Search mode:{" "}
            {status.ready && approved.length && embedded === approved.length
              ? <strong>vector search ({cfg.embeddingModel}), abstains below similarity {cfg.ragMinSimilarity}</strong>
              : <strong>keyword search, abstains below score {cfg.keywordMinScore}</strong>}
            {status.ready && approved.length > 0 && embedded < approved.length && (
              <span className="text-amber-800"> · ⚠ only {embedded}/{approved.length} chunks have {cfg.embeddingModel} embeddings. Rebuild to switch on vector search.</span>
            )}
          </li>
        </ul>
        <form action={buildKnowledgeBase} className="mt-3">
          <SubmitButton label={chunks.length ? "Rebuild knowledge base" : "Build knowledge base"} pendingLabel="Building…" />
        </form>
        <p className="mt-2 text-xs text-slate-500">Building splits each document into sections{status.ready ? ", creates embeddings" : ""} and stores them in Supabase. Run it again after editing documents or switching AI on.</p>
      </Card>

      <Card title="Test retrieval">
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="kq" className="sr-only">Test question</label>
          <input id="kq" name="q" defaultValue={q} maxLength={300} placeholder="e.g. What checks are needed before escalation?" className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Search</button>
        </form>
        {testError && <p className="mt-2 text-sm text-red-800">⚠ {testError}</p>}
        {test && (
          <div className="mt-3 text-sm">
            <p className="mb-2 text-xs text-slate-600">
              {test.mode} search · threshold {test.threshold} ·{" "}
              {test.chunks.some((c) => c.score >= test!.threshold)
                ? <span className="text-emerald-700">would answer</span>
                : <span className="text-amber-800">would abstain (&quot;No approved guidance found&quot;)</span>}
              {test.note && <span className="text-amber-800"> · {test.note}</span>}
            </p>
            <ol className="space-y-1">
              {test.chunks.map((c) => (
                <li key={c.chunk_id} className={c.score >= test!.threshold ? "" : "text-slate-400"}>
                  <span className="tabular-nums">{c.score.toFixed(3)}</span> · <a href={`#${c.chunk_id}`} className="underline">{c.chunk_id}</a> · {c.title} – {c.section}
                </li>
              ))}
              {!test.chunks.length && <li className="text-amber-800">No matching chunks.</li>}
            </ol>
          </div>
        )}
      </Card>

      {KNOWLEDGE_DOCS.map((d) => {
        const stored = byDoc.get(d.document_id) ?? [];
        return (
          <Card
            key={d.document_id}
            title={`${d.title} · v${d.version}`}
            right={<Badge tone={d.access_level === "approved" ? "green" : "red"}>{d.access_level === "approved" ? "Approved" : `${d.access_level} · never retrieved`}</Badge>}
          >
            <p className="mb-2 text-xs text-slate-500">
              {d.document_id} · {d.source_type} · effective {d.effective_date} · {d.source_reference} · {stored.length ? `${stored.length} chunks stored` : "not yet stored"}
            </p>
            <div className="space-y-2">
              {stored.map((c) => (
                <section key={c.chunk_id} id={c.chunk_id} className="scroll-mt-4 rounded border border-slate-100 p-2 target:border-blue-500 target:bg-blue-50">
                  <h3 className="text-sm font-semibold">{c.section} <span className="font-mono text-[11px] font-normal text-slate-500">{c.chunk_id}</span></h3>
                  <p className="text-sm text-slate-700">{c.content}</p>
                </section>
              ))}
              {!stored.length && <p className="text-sm text-slate-500">Build the knowledge base to store this document.</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
