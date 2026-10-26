// Steps 28–29 – Go-live readiness and demo control.
import { AiTestForm, ResetDemoForm } from "../../components/fc/OpsForms";
import { Badge, Card, Notice } from "../../components/fc/ui";
import { aiStatus } from "../../lib/ai/config";
import { readinessChecks, type CheckStatus } from "../../lib/ops/readiness";


export const maxDuration = 60;

const ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✕" };
const TONE: Record<CheckStatus, "green" | "amber" | "red"> = { pass: "green", warn: "amber", fail: "red" };
const WORD: Record<CheckStatus, string> = { pass: "OK", warn: "Check", fail: "Fix" };

export default async function StatusPage() {
  let checks: Awaited<ReturnType<typeof readinessChecks>> = [];
  let error: string | null = null;
  try {
    checks = await readinessChecks();
  } catch (e) {
    error = (e as Error).message;
  }
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const groups = [...new Set(checks.map((c) => c.group))];
  const ai = aiStatus();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Demo status</h1>
          <p className="text-sm text-slate-600">Is this site ready to present? Check it on the live URL before judging.</p>
        </div>
        {!error && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${fails ? "bg-red-100 text-red-800" : warns ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
            {fails ? `✕ Not ready: ${fails} to fix` : warns ? `! Ready with ${warns} warning(s)` : "✓ Ready to demo"}
          </span>
        )}
      </div>

      {error && <Notice tone="red">⚠ Could not run the checks: {error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reset demo" right={<Badge tone="red">Changes data</Badge>}>
          <ResetDemoForm enabled={process.env.DEMO_RESET_ENABLED !== "false"} />
        </Card>
        <Card title="AI connection" right={<Badge tone={ai.ready ? "purple" : "slate"}>{ai.ready ? "AI on" : "Template mode"}</Badge>}>
          <p className="mb-2 text-sm text-slate-700">{ai.reason}</p>
          <AiTestForm ready={ai.ready} />
          <p className="mt-2 text-xs text-slate-500">If the AI fails on the day, set LLM_ENABLED=false in Vercel and redeploy. Everything keeps working in template mode.</p>
        </Card>
      </div>

      {groups.map((g) => (
        <Card key={g} title={g}>
          <ul className="divide-y divide-slate-100">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.label} className="flex flex-wrap items-start gap-3 py-2 text-sm">
                <Badge tone={TONE[c.status]}><span aria-hidden="true">{ICON[c.status]}</span> {WORD[c.status]}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-slate-600">{c.detail}</div>
                  {c.status !== "pass" && c.fix && <div className="text-xs text-blue-800">How to fix: {c.fix}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
