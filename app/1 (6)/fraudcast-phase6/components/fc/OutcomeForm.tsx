"use client";
// FraudCast – Step 24: record the outcome. Unresolved is calculated, so the amounts always add up.

import { useActionState, useState } from "react";
import { submitOutcome } from "../../app/actions/workflow";
import { inr } from "../../lib/format";
import { INITIAL_FORM_STATE } from "../../lib/workflow/form-state";
import { deriveResult } from "../../lib/workflow/outcome";

export type OutcomeZone = { zone_id: string; zone_name: string; rank: number | null };

const toNum = (s: string) => {
  const t = s.replace(/[₹,\s]/g, "");
  return t === "" ? 0 : Number(t);
};

export default function OutcomeForm({
  caseId, original, alreadyWithdrawn, zones, hasApprovedAlert,
}: {
  caseId: string;
  original: number;
  alreadyWithdrawn: number;
  zones: OutcomeZone[];
  hasApprovedAlert: boolean;
}) {
  const [state, action, pending] = useActionState(submitOutcome, INITIAL_FORM_STATE);
  const [protectedAmt, setProtected] = useState("0");
  const [withdrawn, setWithdrawn] = useState(String(Math.round(alreadyWithdrawn)));
  const [override, setOverride] = useState("no");

  const p = toNum(protectedAmt);
  const w = toNum(withdrawn);
  const valid = Number.isFinite(p) && Number.isFinite(w) && p >= 0 && w >= 0;
  const unresolved = Math.round((original - p - w) * 100) / 100;
  const over = valid && unresolved < -1;
  const underWithdrawn = valid && w < alreadyWithdrawn - 1;

  return (
    <form
      action={action}
      onSubmit={(e: { preventDefault: () => void }) => {
        if (!window.confirm("Record this outcome and close the case? The outcome is locked afterwards.")) e.preventDefault();
      }}
      className="space-y-4 text-sm"
    >
      <input type="hidden" name="case_id" value={caseId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded bg-slate-50 p-2">
          <div className="text-xs text-slate-500">Original amount at risk</div>
          <div className="font-semibold">{inr(original)}</div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Amount protected (₹)</span>
          <input name="amount_protected" inputMode="decimal" value={protectedAmt} onChange={(e: { target: { value: string } }) => setProtected(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Amount withdrawn (₹)</span>
          <input name="amount_withdrawn" inputMode="decimal" value={withdrawn} onChange={(e: { target: { value: string } }) => setWithdrawn(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
          <span className="text-[11px] text-slate-500">At least {inr(alreadyWithdrawn)} (already recorded)</span>
        </label>
        <div className={`rounded p-2 ${over || !valid ? "bg-red-50" : "bg-amber-50"}`}>
          <div className="text-xs text-slate-600">Unresolved (calculated)</div>
          <div className={`font-semibold ${over || !valid ? "text-red-800" : ""}`}>
            {!valid ? "Enter valid amounts" : over ? `⚠ ${inr(-unresolved)} too much` : inr(Math.max(0, unresolved))}
          </div>
          {valid && !over && <div className="text-[11px] text-slate-600">Result: {deriveResult(p, w, Math.max(0, unresolved), hasApprovedAlert)}</div>}
        </div>
      </div>
      {underWithdrawn && <p className="text-xs text-red-800">⚠ Withdrawn cannot be less than {inr(alreadyWithdrawn)}.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Actual cash-out zone</span>
          <select name="actual_zone" defaultValue="" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5">
            <option value="">Not known / no cash-out</option>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.zone_name} ({z.zone_id}){z.rank ? ` – forecast #${z.rank}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Actual cash-out time (IST, optional)</span>
          <input type="datetime-local" name="actual_time" className="w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
      </div>

      {hasApprovedAlert ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-600">How useful was the alert? (1 = not useful, 5 = very useful)</legend>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1">
                <input type="radio" name="usefulness" value={n} /> {n}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-slate-500">No alert was approved for this case, so alert usefulness is not rated.</p>
      )}

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-slate-600">Did you act differently from the forecast (override)?</legend>
        <div className="flex gap-4">
          {["no", "yes"].map((v) => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name="override" value={v} checked={override === v} onChange={() => setOverride(v)} /> {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
        {override === "yes" && (
          <textarea name="override_reason" rows={2} maxLength={500} placeholder="Why? (required)" className="mt-2 w-full rounded border border-slate-300 p-2" />
        )}
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Comments (optional)</span>
        <textarea name="comments" rows={2} maxLength={1000} className="w-full rounded border border-slate-300 p-2" />
      </label>

      <button type="submit" disabled={pending || over || !valid} className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:bg-blue-300">
        {pending ? "Saving…" : "Record outcome and close case"}
      </button>
      <div aria-live="polite">
        {state.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{state.error}</p>}
        {state.message && <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">{state.message}</p>}
      </div>
    </form>
  );
}
