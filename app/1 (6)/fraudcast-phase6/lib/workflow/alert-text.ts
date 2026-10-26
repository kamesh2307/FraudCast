// FraudCast – Step 22: alert text. The 7 mandatory fields come from the approved alert template (SYN-DOC-03).
// Pure functions: compose, validate, measure edits, and build the template (non-AI) draft.

import type { CaseFacts, ForecastFacts } from "../ai/facts";
import type { Recipient } from "./config";

export const DISCLAIMER =
  "This alert is an indicative forecast generated from synthetic demonstration data. Any account or enforcement action requires separate human authorization.";

/** Six labelled lines + the disclaimer = the 7 mandatory fields. */
export const ALERT_LABELS = ["Case reference", "Priority", "Evidence summary", "Forecast summary", "Time sensitivity", "Requested review"] as const;

export type AlertParts = {
  caseRef: string;
  priority: string;
  recipient: Recipient;
  evidence: string;
  forecast: string;
  time: string;
  review: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function composeAlert(p: AlertParts): string {
  return [
    "[SYNTHETIC DEMO] INTERVENTION ALERT",
    `To: ${p.recipient.label} (${p.recipient.id})`,
    `Case reference: ${p.caseRef}`,
    `Priority: ${p.priority}`,
    `Evidence summary: ${clean(p.evidence)}`,
    `Forecast summary: ${clean(p.forecast)}`,
    `Time sensitivity: ${clean(p.time)}`,
    `Requested review: ${clean(p.review)}`,
    "",
    DISCLAIMER,
  ].join("\n");
}

/** Problems that block approval (AL-05/AL-11 and PRD 15 "approval blocked if mandatory fields empty"). */
export function validateAlertText(text: string, caseId: string): string[] {
  if (!text.trim()) return ["The alert is empty."];
  const problems: string[] = [];
  if (text.length > 4000) problems.push("The alert is longer than 4,000 characters.");
  for (const label of ALERT_LABELS) {
    if (!new RegExp(`^\\s*${label}:[ \\t]*\\S`, "mi").test(text)) problems.push(`Mandatory field "${label}" is missing or empty.`);
  }
  const ref = text.match(/^\s*Case reference:[ \t]*(.*)$/im);
  if (ref && !ref[1].includes(caseId)) problems.push(`"Case reference" must contain ${caseId}.`);
  if (!clean(text).includes(DISCLAIMER)) problems.push("The required human-authorization disclaimer is missing or was changed.");
  return problems;
}

/** Levenshtein distance (characters changed by the analyst). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length * b.length > 9_000_000) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

type Zone = { rank: number; zone_id: string; zone_name: string; jurisdiction: string; probability: string };
type Holder = { account_id: string; amount_held: string };

/** Fixed-wording draft built only from the facts. Used when AI is off or its draft fails a check. */
export function templateParts(cf: CaseFacts, ff: ForecastFacts, priority: string, recipient: Recipient, escalationOf: string | null): AlertParts {
  const holders = Array.isArray(cf.accounts_holding_funds) ? (cf.accounts_holding_funds as Holder[]) : [];
  const zones = (ff.ranked_zones as Zone[] | undefined) ?? [];
  const window = typeof ff.cash_out_window === "string" && ff.cash_out_window !== "Not available" ? ff.cash_out_window : null;

  const evidence =
    `${cf.fraud_type} reported ${cf.report_time}. ${cf.original_amount} moved through ${cf.beneficiary_account_count} beneficiary account(s) in ${cf.transfer_steps} transfer step(s). ` +
    `${cf.current_amount_at_risk} is still at risk${holders.length ? `, held in ${holders.map((h) => `${h.account_id} (${h.amount_held})`).join(", ")}` : ""}. ` +
    `${cf.already_withdrawn_as_cash} has already been withdrawn as cash.`;

  const forecast = zones.length
    ? `Indicative forecast: ${zones.map((z) => `#${z.rank} ${z.zone_name} (${z.zone_id}) ${z.probability}`).join(", ")}; all other zones ${ff.all_other_zones}. Data quality ${ff.data_quality}.`
    : `Forecast status: ${ff.status}.${ff.reason ? ` ${ff.reason}` : ""} No zone is ranked.`;

  const time = zones.length && window
    ? `Cash-out window ${window}. ${ff.window_note && ff.window_note !== "Not available" ? ff.window_note : ""}`
    : "No cash-out window is available. Treat as time-sensitive while funds remain held.";

  const where = zones.length
    ? `cash-out activity at ATMs and branches in ${zones[0].zone_name} (${zones[0].zone_id})${zones.length > 1 ? `, and in ${zones.slice(1).map((z) => z.zone_id).join(" and ")}` : ""} during the window`
    : "activity on the accounts currently holding funds";

  const review =
    `${escalationOf ? `Alert ${escalationOf} was not acknowledged in time and is escalated under the approved SOP. ` : ""}` +
    `Please review ${where}, and acknowledge this alert within 15 minutes as set out in the approved SOP.`;

  return { caseRef: cf.case_id, priority, recipient, evidence, forecast, time, review };
}
