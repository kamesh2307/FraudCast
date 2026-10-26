"use client";
// FraudCast – Step 22: review, edit and approve a draft alert. Approval needs an explicit confirmation.

import { useActionState, useState } from "react";
import { approveAlert, discardAlert, saveAlertEdits } from "../../app/actions/workflow";
import { INITIAL_FORM_STATE } from "../../lib/workflow/form-state";

export default function AlertComposer({
  alertId, initialText, draftText, recipientLabel, needsJustification, draftSource, draftNote,
}: {
  alertId: string;
  initialText: string;
  draftText: string;
  recipientLabel: string;
  needsJustification: boolean;
  draftSource: string | null;
  draftNote: string | null;
}) {
  const [text, setText] = useState(initialText);
  const [saveState, saveAction, saving] = useActionState(saveAlertEdits, INITIAL_FORM_STATE);
  const [approveState, approveAction, approving] = useActionState(approveAlert, INITIAL_FORM_STATE);
  const [discardState, discardAction, discarding] = useActionState(discardAlert, INITIAL_FORM_STATE);
  const latest = [saveState, approveState, discardState].sort((a, b) => b.at - a.at)[0];
  const busy = saving || approving || discarding;
  const edited = text.trim() !== draftText.trim();

  return (
    <form className="space-y-3">
      <input type="hidden" name="alert_id" value={alertId} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">Draft · not sent</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${draftSource === "ai" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>
          {draftSource === "ai" ? "AI-drafted · passed grounding and safety checks" : "Template draft (AI not used)"}
        </span>
        <span className="text-slate-500">To {recipientLabel} · {edited ? "edited by analyst" : "unedited"} · {text.length}/4000</span>
      </div>
      {draftNote && <p className="text-xs text-amber-800">⚠ {draftNote}</p>}

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-600">Alert text (edit freely; keep the labelled fields and the disclaimer)</span>
        <textarea
          name="content"
          value={text}
          onChange={(e: { target: { value: string } }) => setText(e.target.value)}
          rows={14}
          maxLength={4000}
          className="w-full rounded border border-slate-300 p-2 font-mono text-xs leading-5 focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </label>

      {needsJustification && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-amber-900">Justification (required: this case has no ranked forecast)</span>
          <textarea name="justification" rows={2} maxLength={500} className="w-full rounded border border-amber-300 p-2 text-sm" />
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-4 w-4" />
        <span>I have reviewed this alert and I authorize sending it to {recipientLabel}. It requests a review only and does not instruct any account action.</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          formAction={approveAction}
          disabled={busy}
          onClick={(e: { preventDefault: () => void }) => {
            if (!window.confirm(`Approve and send this alert to ${recipientLabel}? (Simulated: nothing leaves FraudCast.)`)) e.preventDefault();
          }}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:bg-blue-300"
        >
          {approving ? "Approving…" : "Approve and send (simulated)"}
        </button>
        <button type="submit" formAction={saveAction} disabled={busy} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:text-slate-400">
          {saving ? "Saving…" : "Save edits"}
        </button>
        <button type="submit" formAction={discardAction} disabled={busy} className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-800 hover:bg-red-50 disabled:text-slate-400">
          {discarding ? "Discarding…" : "Discard draft"}
        </button>
      </div>

      <div aria-live="polite">
        {latest.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{latest.error}</p>}
        {latest.message && <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{latest.message}</p>}
      </div>
    </form>
  );
}
