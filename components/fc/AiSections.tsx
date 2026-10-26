// FraudCast – displays a stored AI (or template-fallback) text result with its provenance label.

import type { AiTextResult } from "../../lib/ai/summary";

export default function AiSections<K extends string>({
  result,
  labels,
}: {
  result: AiTextResult<Record<K, string>>;
  labels: Record<K, string>;
}) {
  const ai = result.source === "ai";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${ai ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>
          {ai ? "AI-generated from structured data" : "Template (AI not used)"}
        </span>
        {ai && <span className="text-emerald-700">✓ Passed grounding and safety checks</span>}
        <span className="text-slate-500" title="Model and prompt version used">
          {result.model ?? "no model"} · {result.promptVersion}
        </span>
      </div>
      {!ai && result.fallbackReason && <p className="mb-2 text-xs text-amber-800">⚠ {result.fallbackReason}</p>}
      {!ai && result.problems.length > 0 && (
        <details className="mb-2 text-xs text-amber-800">
          <summary className="cursor-pointer">What the checks caught ({result.problems.length})</summary>
          <ul className="mt-1 list-disc pl-5">{result.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
      )}
      <dl className="space-y-2">
        {(Object.keys(labels) as K[]).map((k) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels[k]}</dt>
            <dd className="text-sm leading-6 text-slate-800">{result.sections?.[k] ?? "Not available"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
