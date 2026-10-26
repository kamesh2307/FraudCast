// Step 26 – Audit log: who did what, when, with which model (PRD Section 26). Read-only; the table is append-only.
import Link from "next/link";
import { Badge, Card } from "../../components/fc/ui";
import { dt } from "../../lib/format";
import { db } from "../../lib/supabase";


type SP = Record<string, string | string[] | undefined>;
type Ev = {
  event_id: string; user_id: string; case_id: string | null; action_type: string; previous_value: unknown;
  new_value: Record<string, unknown> | null; reason: string | null; timestamp: string; model_version: string | null;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Events written in the same demo minute are ordered by the real time encoded in their ID. */
function realOrder(id: string): number {
  const m = id.match(/^SYN-EVT-(?:AI|WF|FC)-([0-9A-Z]+)-/);
  return m ? parseInt(m[1], 36) : 0;
}

const TONE: Record<string, "red" | "amber" | "blue" | "green" | "slate" | "purple"> = {
  ALERT_APPROVED: "green", ALERT_ACKNOWLEDGED: "green", OUTCOME_RECORDED: "green", ALERT_OVERDUE: "red", LLM_FALLBACK: "amber",
  FORECAST_OVERRIDDEN: "amber", ALERT_DISCARDED: "slate", FORECAST_CREATED: "blue", SUMMARY_GENERATED: "purple",
  EXPLANATION_GENERATED: "purple", RAG_QUERY: "purple", ALERT_DRAFTED: "blue", ALERT_EDITED: "blue",
};

function summary(e: Ev): string {
  const v = e.new_value ?? {};
  const pick = (k: string) => (v[k] === undefined || v[k] === null ? null : String(v[k]));
  switch (e.action_type) {
    case "ALERT_DRAFTED": return `${pick("alert_id")} to ${pick("recipient_id")} · ${pick("source") === "ai" ? "AI draft" : "template draft"}`;
    case "ALERT_EDITED": return `${pick("alert_id")} · ${pick("edit_distance")} characters changed`;
    case "ALERT_APPROVED": return `${pick("alert_id")} sent to ${pick("recipient_id")}${v.edited ? " (edited)" : ""}${pick("justification") ? ` · justification: ${pick("justification")}` : ""}`;
    case "ALERT_ACKNOWLEDGED": return `${pick("alert_id")} acknowledged by ${pick("recipient_id")} (simulated, ${pick("trigger")})`;
    case "ALERT_OVERDUE": return `${pick("alert_id")} not acknowledged by deadline (simulated, ${pick("trigger")})`;
    case "ALERT_DISCARDED": return `${pick("alert_id")} discarded, never sent`;
    case "OUTCOME_RECORDED": return `${pick("result")} · protected ₹${pick("protected")}, withdrawn ₹${pick("withdrawn")}, unresolved ₹${pick("unresolved")} · actual zone ${pick("actual_zone") ?? "not known"}`;
    case "FORECAST_OVERRIDDEN": return `Reason: ${pick("reason")}`;
    case "FORECAST_CREATED": return v.insufficient ? "Insufficient evidence" : `Top zone ${pick("top_zone")} (${Math.round(Number(v.top_probability ?? 0) * 100)}%) · ${pick("mode")}`;
    case "RAG_QUERY": return `"${pick("question")}" · ${v.refused ? "refused" : v.abstained ? "no answer" : `cited ${Array.isArray(v.cited) ? v.cited.join(", ") || "none" : "none"}`}`;
    case "SUMMARY_GENERATED":
    case "EXPLANATION_GENERATED": return `${pick("source") === "ai" ? "AI-generated, passed checks" : "Template"}${pick("fallbackReason") ? ` · ${pick("fallbackReason")}` : ""}`;
    case "LLM_FALLBACK": return `${pick("feature")}: ${pick("reason")}`;
    default: return JSON.stringify(v).slice(0, 160);
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const caseFilter = /^SYN-CASE-\d{4}$/.test(one(sp.case)) ? one(sp.case) : "";
  const typeFilter = /^[A-Z_]{3,40}$/.test(one(sp.type)) ? one(sp.type) : "";
  let q = db().from("audit_events").select("*").order("timestamp", { ascending: false }).limit(500);
  if (caseFilter) q = q.eq("case_id", caseFilter);
  if (typeFilter) q = q.eq("action_type", typeFilter);
  const res = await q;
  if (res.error) throw new Error(`Could not read the audit log: ${res.error.message}`);
  const events = ((res.data ?? []) as Ev[]).sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp) || realOrder(b.event_id) - realOrder(a.event_id) || b.event_id.localeCompare(a.event_id),
  );
  const types = [
    "ALERT_DRAFTED", "ALERT_EDITED", "ALERT_APPROVED", "ALERT_ACKNOWLEDGED", "ALERT_OVERDUE", "ALERT_DISCARDED", "OUTCOME_RECORDED",
    "FORECAST_OVERRIDDEN", "FORECAST_CREATED", "SUMMARY_GENERATED", "EXPLANATION_GENERATED", "RAG_QUERY", "LLM_FALLBACK", "KNOWLEDGE_BASE_BUILT", "CASE_INGESTED",
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-slate-600">Every forecast, AI output, alert decision and outcome, newest first. Entries cannot be edited or deleted.</p>
      </div>
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-600">Case</span>
            <input name="case" defaultValue={caseFilter} placeholder="SYN-CASE-0001" className="rounded border border-slate-300 px-2 py-1.5 font-mono text-xs" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-600">Event type</span>
            <select name="type" defaultValue={typeFilter} className="rounded border border-slate-300 bg-white px-2 py-1.5">
              <option value="">All events</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded bg-blue-700 px-4 py-1.5 font-medium text-white hover:bg-blue-800">Filter</button>
          {(caseFilter || typeFilter) && <Link href="/audit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Clear</Link>}
        </form>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr><th className="px-3 py-2">Time (demo clock)</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Case</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Model</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((e) => (
              <tr key={e.event_id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(e.timestamp)}</td>
                <td className="px-3 py-2"><Badge tone={TONE[e.action_type] ?? "slate"}>{e.action_type}</Badge></td>
                <td className="px-3 py-2">{e.case_id ? <Link href={`/audit?case=${e.case_id}`} className="font-mono text-xs text-blue-700 underline">{e.case_id}</Link> : "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{e.user_id}</td>
                <td className="px-3 py-2 text-xs">
                  {summary(e)}
                  <details>
                    <summary className="cursor-pointer text-[11px] text-slate-500">Raw record</summary>
                    <pre className="mt-1 max-w-xl whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify({ event_id: e.event_id, previous_value: e.previous_value, new_value: e.new_value, reason: e.reason }, null, 2)}</pre>
                  </details>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{e.model_version ?? "—"}</td>
              </tr>
            ))}
            {!events.length && <tr><td colSpan={6} className="px-3 py-4 text-slate-500">No events match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Showing up to 500 events. Timestamps use the frozen demo clock; events at the same time are ordered by when they actually happened.</p>
    </div>
  );
}
