// FraudCast – Step 19: AI explanation of an already-calculated forecast (PRD 18.2).
// The AI explains; it never re-ranks. A consistency check makes sure it names the real leading factor.

import { aiStatus } from "./config";
import type { ForecastFacts } from "./facts";
import { groundingCheck, safetyCheck } from "./grounding";
import { chatJSON, type ChatFn } from "./llm";
import { EXPLANATION_SYSTEM, PROMPT_VERSIONS } from "./prompts";
import type { AiTextResult } from "./summary";

export const EXPLANATION_KEYS = ["why_top", "why_alternatives", "uncertainty", "what_to_verify"] as const;
export type ExplanationKey = (typeof EXPLANATION_KEYS)[number];
export type ExplanationSections = Record<ExplanationKey, string>;

export const EXPLANATION_LABELS: Record<ExplanationKey, string> = {
  why_top: "Why the top zone ranked first",
  why_alternatives: "Why the alternatives ranked lower",
  uncertainty: "What uncertainty remains",
  what_to_verify: "What to verify before acting",
};

type Zone = { rank: number; zone_id: string; zone_name: string; probability: string };

export function templateExplanation(f: ForecastFacts): ExplanationSections {
  const zones = (f.ranked_zones as Zone[]) ?? [];
  const reasons = (f.rank_1_reasons as string[]) ?? [];
  const alts = (f.why_alternatives_ranked_lower as string[]) ?? [];
  const lims = (f.limitations as string[]) ?? [];
  const missing = (f.missing_data as string[]) ?? [];
  const top = zones[0];
  return {
    why_top: top
      ? `${top.zone_name} (${top.zone_id}) ranked first at ${top.probability}, led by ${String(f.leading_factor).toLowerCase()}. ${reasons.slice(0, 2).join(" ")}`
      : "No ranked zone is available.",
    why_alternatives: alts.length ? alts.join(" ") : "Not available.",
    uncertainty: lims.length ? lims.join(" ") : "Not available.",
    what_to_verify: `Confirm the transfers to the accounts holding funds are current${missing[0] !== "None" ? `, and fill the missing data (${missing.join("; ")})` : ""}. Check the baseline comparison: ${f.baseline_comparison}`,
  };
}

export async function generateExplanation(facts: ForecastFacts, chat: ChatFn = chatJSON, ready = aiStatus().ready): Promise<AiTextResult<ExplanationSections>> {
  const fallback = (reason: string, problems: string[] = [], model: string | null = null, latencyMs = 0): AiTextResult<ExplanationSections> => ({
    sections: templateExplanation(facts), source: "template", model, promptVersion: PROMPT_VERSIONS.explanation,
    grounded: true, fallbackReason: reason, problems, latencyMs,
  });
  if (!Array.isArray(facts.ranked_zones) || !facts.ranked_zones.length) throw new Error("There is no ranked forecast to explain.");
  if (!ready) return fallback(aiStatus().reason);

  try {
    const res = await chat(EXPLANATION_SYSTEM, `FORECAST_FACTS:\n${JSON.stringify(facts, null, 2)}`);
    const o = (res.json ?? {}) as Record<string, unknown>;
    const missingKeys = EXPLANATION_KEYS.filter((k) => typeof o[k] !== "string" || !(o[k] as string).trim());
    if (missingKeys.length) return fallback(`The AI answer was incomplete (missing: ${missingKeys.join(", ")}).`, [], res.model, res.latencyMs);
    const sections = Object.fromEntries(EXPLANATION_KEYS.map((k) => [k, (o[k] as string).trim().slice(0, 900)])) as ExplanationSections;
    const text = Object.values(sections).join("\n");
    const problems = [...groundingCheck(text, [JSON.stringify(facts)]).problems, ...safetyCheck(text, false).problems];
    const lead = String(facts.leading_factor ?? "").toLowerCase();
    if (lead && !sections.why_top.toLowerCase().includes(lead)) problems.push(`Did not name the leading factor ("${facts.leading_factor}").`);
    const topId = (facts.ranked_zones as Zone[])[0].zone_id;
    if (!sections.why_top.includes(topId) && !sections.why_top.includes((facts.ranked_zones as Zone[])[0].zone_name)) {
      problems.push("Did not name the rank-1 zone in its explanation.");
    }
    if (problems.length) return fallback("The AI explanation failed a grounding, safety or consistency check, so it was discarded.", problems, res.model, res.latencyMs);
    return { sections, source: "ai", model: res.model, promptVersion: PROMPT_VERSIONS.explanation, grounded: true, fallbackReason: null, problems: [], latencyMs: res.latencyMs };
  } catch (e) {
    return fallback(`AI unavailable: ${(e as Error).message}`);
  }
}
