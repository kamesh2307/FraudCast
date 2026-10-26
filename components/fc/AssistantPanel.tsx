"use client";
// FraudCast – RAG analyst assistant panel (PRD 12.8). Calls the askAssistant server action.

import { useState } from "react";
import { askAssistant } from "../../app/actions/ai";
import type { AssistantAnswer } from "../../lib/ai/assistant";

const SUGGESTIONS = [
  "Why was the top zone ranked first?",
  "What data is missing from this case?",
  "What approved checks should be completed before escalation?",
  "What should be included in the intervention alert?",
  "Who should receive the alert for this case?",
];

export default function AssistantPanel({ caseId, aiReady }: { caseId: string; aiReady: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantAnswer[]>([]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    if (text.length > 500) {
      setError("Please keep questions under 500 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const a = await askAssistant(caseId, text);
      setHistory((h) => [a, ...h].slice(0, 10));
      setQuestion("");
    } catch (e) {
      setError((e as Error).message || "The assistant could not answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Answers use this case&apos;s database facts and the approved document library only. {aiReady ? "AI is on." : "AI is off: answers use fixed templates and document excerpts."}
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            disabled={busy}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e: { preventDefault: () => void }) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor={`q-${caseId}`} className="sr-only">Ask the assistant</label>
        <input
          id={`q-${caseId}`}
          value={question}
          onChange={(e: { target: { value: string } }) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Ask about this case or the approved procedures…"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button type="submit" disabled={busy || !question.trim()} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:bg-blue-300">
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <ol aria-live="polite" className="space-y-3">
        {history.map((a, i) => (
          <li key={`${a.question}-${history.length - i}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Q: {a.question}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.mode === "ai" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>
                {a.mode === "ai" ? "AI-generated" : "Template"}
              </span>
              <span className="text-[11px] text-slate-500">{a.retrieval} search · {a.latencyMs} ms</span>
              {a.refused && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">Refused</span>}
              {a.abstained && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">No answer</span>}
            </div>
            {a.caseAnswer && (
              <div className="mt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From case data</div>
                <p className="text-slate-800">{a.caseAnswer}</p>
              </div>
            )}
            {a.guidanceAnswer && (
              <div className="mt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From approved guidance</div>
                <p className={a.citations.length ? "text-slate-800" : "text-amber-800"}>{a.guidanceAnswer}</p>
              </div>
            )}
            {a.citations.length > 0 && (
              <ul className="mt-2 space-y-1">
                {a.citations.map((c) => (
                  <li key={c.chunk_id}>
                    <details className="rounded bg-slate-50 px-2 py-1 text-xs">
                      <summary className="cursor-pointer text-blue-800">
                        Source: {c.title} v{c.version} · {c.section} <span className="text-slate-500">({c.chunk_id}, score {c.score.toFixed(2)})</span>
                      </summary>
                      <p className="mt-1 text-slate-700">{c.excerpt}</p>
                      <a href={`/knowledge#${c.chunk_id}`} className="text-blue-700 underline">Open in knowledge library</a>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {a.notices.map((n) => (
              <p key={n} className="mt-2 text-xs text-amber-800">⚠ {n}</p>
            ))}
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-slate-500">The assistant explains and cites. It never changes the forecast or takes any action on accounts.</p>
    </div>
  );
}
