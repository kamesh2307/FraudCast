// FraudCast – Step 17/18: AI case summary with grounding check and template fallback (PRD 18.1).

import { aiStatus } from "./config";
import type { CaseFacts } from "./facts";
import { groundingCheck, safetyCheck } from "./grounding";
import { chatJSON, type ChatFn } from "./llm";
import { PROMPT_VERSIONS, SUMMARY_SYSTEM } from "./prompts";

export const SUMMARY_KEYS = ["what_happened", "amount_at_risk", "important_transfers", "current_exposure", "missing_information"] as const;
export type SummaryKey = (typeof SUMMARY_KEYS)[number];
export type SummarySections = Record<SummaryKey, string>;

export const SUMMARY_LABELS: Record<SummaryKey, string> = {
  what_happened: "What happened",
  amount_at_risk: "Amount at risk",
  important_transfers: "Important transfers",
  current_exposure: "Current exposure",
  missing_information: "Missing information",
};

export type AiTextResult<S> = {
  sections: S;
  source: "ai" | "template";
  model: string | null;
  promptVersion: string;
  grounded: boolean;
  fallbackReason: string | null;
  problems: string[];
  latencyMs: number;
};

type Transfer = { time: string; from: string; to: string; amount: string; channel: string; step: string };

/** Fixed-wording summary built only from the facts. Used when AI is off or its answer fails a check. */
export function templateSummary(f: CaseFacts): SummarySections {
  const transfers = (f.transfers as Transfer[]) ?? [];
  const cash = transfers.filter((t) => t.step === "cash-out");
  const largest = transfers.filter((t) => t.step !== "cash-out").slice(1, 4);
  const holders = Array.isArray(f.accounts_holding_funds) ? (f.accounts_holding_funds as { account_id: string; amount_held: string }[]) : [];
  const missing = (f.missing_information as string[]) ?? [];
  return {
    what_happened: `On ${f.fraud_time}, ${f.original_amount} left the victim account via ${f.payment_channel === "Not available" ? "an unrecorded payment channel" : f.payment_channel} (${f.fraud_type}). It was reported ${f.reporting_delay} later.`,
    amount_at_risk: `${f.current_amount_at_risk} is currently at risk. ${f.already_withdrawn_as_cash} has already been withdrawn as cash.`,
    important_transfers: `The money moved through ${f.beneficiary_account_count} beneficiary account(s) in ${f.transfer_steps} transfer step(s). ${f.split_pattern}.${largest.length ? ` Onward transfers include ${largest.map((t) => `${t.amount} from ${t.from} to ${t.to}`).join(", ")}.` : ""}${cash.length ? ` ${cash.length} cash withdrawal(s) are recorded.` : ""}`,
    current_exposure: holders.length
      ? `Funds are currently held in ${holders.map((h) => `${h.account_id} (${h.amount_held})`).join(", ")}.`
      : typeof f.accounts_holding_funds === "string"
        ? `${f.accounts_holding_funds}.`
        : "No account is currently holding case funds.",
    missing_information: missing.length ? `Not available: ${missing.join("; ")}.` : "All required fields are present.",
  };
}

export async function generateSummary(facts: CaseFacts, chat: ChatFn = chatJSON, ready = aiStatus().ready): Promise<AiTextResult<SummarySections>> {
  const fallback = (reason: string, problems: string[] = [], model: string | null = null, latencyMs = 0): AiTextResult<SummarySections> => ({
    sections: templateSummary(facts), source: "template", model, promptVersion: PROMPT_VERSIONS.summary,
    grounded: true, fallbackReason: reason, problems, latencyMs,
  });
  if (!ready) return fallback(aiStatus().reason);

  try {
    const res = await chat(SUMMARY_SYSTEM, `CASE_FACTS:\n${JSON.stringify(facts, null, 2)}`);
    const o = (res.json ?? {}) as Record<string, unknown>;
    const missingKeys = SUMMARY_KEYS.filter((k) => typeof o[k] !== "string" || !(o[k] as string).trim());
    if (missingKeys.length) return fallback(`The AI answer was incomplete (missing: ${missingKeys.join(", ")}).`, [], res.model, res.latencyMs);
    const sections = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, (o[k] as string).trim().slice(0, 800)])) as SummarySections;
    const text = Object.values(sections).join("\n");
    const g = groundingCheck(text, [JSON.stringify(facts)]);
    const s = safetyCheck(text, false);
    if (!g.ok || !s.ok) {
      return fallback("The AI answer failed the grounding or safety check, so it was discarded.", [...g.problems, ...s.problems], res.model, res.latencyMs);
    }
    return { sections, source: "ai", model: res.model, promptVersion: PROMPT_VERSIONS.summary, grounded: true, fallbackReason: null, problems: [], latencyMs: res.latencyMs };
  } catch (e) {
    return fallback(`AI unavailable: ${(e as Error).message}`);
  }
}
