"use client";
// FraudCast – Phase 7 forms: one-click demo reset and AI connection test.

import { useActionState } from "react";
import { resetDemo, testAiConnection } from "../../app/actions/ops";
import { INITIAL_FORM_STATE, type FormState } from "../../lib/workflow/form-state";

function Result({ state }: { state: FormState }) {
  return (
    <div aria-live="polite">
      {state.error && <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.message && <p className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.message}</p>}
    </div>
  );
}

export function ResetDemoForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(resetDemo, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm text-slate-700">
        Puts every case, transaction, alert, outcome and audit entry back to the fresh demo data, then re-runs all forecasts. The document library and safety results are kept.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="reset-confirm" className="text-sm">Type <strong>RESET</strong> to confirm:</label>
        <input id="reset-confirm" name="confirm" autoComplete="off" disabled={!enabled || pending} className="w-28 rounded border border-slate-300 px-2 py-1.5 font-mono text-sm" />
        <button type="submit" disabled={!enabled || pending} className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:bg-red-300">
          {pending ? "Resetting… (about 10 seconds)" : "Reset demo"}
        </button>
      </div>
      {!enabled && <p className="text-xs text-amber-800">Reset is disabled by DEMO_RESET_ENABLED=false.</p>}
      <Result state={state} />
    </form>
  );
}

export function AiTestForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState(testAiConnection, INITIAL_FORM_STATE);
  return (
    <form action={action}>
      <button type="submit" disabled={!ready || pending} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:text-slate-400">
        {pending ? "Testing…" : "Test AI connection"}
      </button>
      {!ready && <span className="ml-2 text-xs text-slate-500">AI is off, so there is nothing to test. Template mode needs no key.</span>}
      <Result state={state} />
    </form>
  );
}
