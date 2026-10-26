// Step 27 – Safety evaluation: guardrail self-tests, retrieval golden set, trick prompts (PRD Section 21).
import { runSafetySuite } from "../actions/ops";
import SubmitButton from "../../components/fc/SubmitButton";
import { Badge, Card, Notice } from "../../components/fc/ui";
import { aiStatus } from "../../lib/ai/config";
import { latestSuites } from "../../lib/eval/store";
import type { SuiteName, SuiteResult } from "../../lib/eval/suites";


export const maxDuration = 60;

const SUITES: { name: SuiteName; title: string; what: string; time: string }[] = [
  { name: "guardrails", title: "1 · Guardrail self-tests", what: "18 fixed tests: invented amounts, IDs, times and percentages are blocked; \"freeze\" and criminal labels are blocked; alerts need all 7 fields; outcomes must add up; forecast percentages always total 100.", time: "instant" },
  { name: "retrieval", title: "2 · Retrieval and abstention", what: "26 golden questions must find the right approved section; 10 off-topic questions must get \"No approved guidance found\"; the draft document must never appear.", time: "about 10–30 seconds" },
  { name: "redteam", title: "3 · Trick prompts (red team)", what: "15 attempts to make the assistant freeze accounts, leak its rules, label people, invent data or change the forecast, asked about SYN-CASE-0001. Each answer is checked by a fixed safety judge.", time: "about 5–40 seconds" },
];

function SuiteCard({ s, r }: { s: (typeof SUITES)[number]; r: SuiteResult | undefined }) {
  return (
    <Card
      title={s.title}
      right={!r ? <Badge tone="slate">Not run</Badge> : r.error ? <Badge tone="red">Error</Badge> : <Badge tone={r.pass ? "green" : "red"}>{r.pass ? "✓ Meets target" : "✕ Below target"}</Badge>}
    >
      <p className="text-sm text-slate-700">{s.what}</p>
      <form action={runSafetySuite} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="suite" value={s.name} />
        <SubmitButton label={r ? "Run again" : "Run"} pendingLabel="Running…" variant={r ? "secondary" : "primary"} />
        <span className="text-xs text-slate-500">Takes {s.time}.</span>
      </form>
      {r && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">
            Last run {new Date(r.ranAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · mode: {r.mode} · {(r.durationMs / 1000).toFixed(1)} s
          </p>
          {r.error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠ {r.error}</p>}
          {r.metrics.length > 0 && (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {r.metrics.map((m) => (
                  <tr key={m.label}>
                    <td className="py-1.5">{m.label}</td>
                    <td className="text-right font-semibold">{m.display}</td>
                    <td className="pl-3 text-right text-xs text-slate-500">{m.target === null ? "" : `target ≥ ${Math.round(m.target * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.rows.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-blue-700">
                Show all {r.rows.length} results{r.rows.some((x) => !x.ok) ? ` (${r.rows.filter((x) => !x.ok).length} failed)` : ""}
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left uppercase tracking-wide text-slate-500">
                    <tr><th className="py-1 pr-2">ID</th><th className="pr-2">Input</th><th className="pr-2">Expected</th><th className="pr-2">Got</th><th>Result</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.rows.map((x) => (
                      <tr key={x.id} className={x.ok ? "" : "bg-red-50"}>
                        <td className="py-1 pr-2 font-mono">{x.id}</td>
                        <td className="pr-2">{x.input}</td>
                        <td className="pr-2 font-mono">{x.expected}</td>
                        <td className="pr-2">{x.got}{x.detail && <div className="text-red-800">{x.detail}</div>}</td>
                        <td>{x.ok ? "✓" : "✕"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

export default async function SafetyPage() {
  const results = await latestSuites();
  const ai = aiStatus();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Safety evaluation</h1>
        <p className="text-sm text-slate-600">Evidence that the AI layer behaves safely. Run all three suites once before judging, and again after switching AI on or off.</p>
      </div>
      <Notice tone="amber">
        Currently in <strong>{ai.ready ? "AI mode" : "template mode"}</strong>. Results describe the mode they were run in. These tests use synthetic documents and cases and show that
        the guardrails work as designed; they are not a security certification.
      </Notice>
      {SUITES.map((s) => <SuiteCard key={s.name} s={s} r={results[s.name]} />)}
    </div>
  );
}
