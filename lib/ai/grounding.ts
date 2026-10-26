// FraudCast – guardrails for AI text (PRD GA-03, GA-04, SF-06).
// 1) Grounding: every ID, amount, percentage, time and number in AI text must exist in the input data.
// 2) Safety: block criminal labels about people, and block account/enforcement actions unless an
//    approved document supports them AND the text says human authorization is required.

export type Claims = { ids: string[]; times: string[]; percents: number[]; numbers: { value: number; approx: boolean; raw: string }[] };

const ID_RE = /\b(?:SYN|DEMO)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const PCT_RE = /(\d+(?:\.\d+)?)\s?%/g;
// ₹6,85,000 | Rs 685000 | 6.85 lakh | 1.2 crore | 0.84 | 13
const NUM_RE = /(?:₹|rs\.?|inr)?\s?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(lakhs?|lacs?|crores?|cr)\b)?/gi;

export function extractClaims(text: string): Claims {
  const ids = [...new Set(text.match(ID_RE) ?? [])];
  let rest = text.replace(ID_RE, " ");
  const times = [...rest.matchAll(TIME_RE)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
  rest = rest.replace(TIME_RE, " ");
  const percents = [...rest.matchAll(PCT_RE)].map((m) => Number(m[1]));
  rest = rest.replace(PCT_RE, " ");
  const numbers = [...rest.matchAll(NUM_RE)].map((m) => {
    const base = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    const mult = unit.startsWith("la") ? 1e5 : unit.startsWith("cr") ? 1e7 : 1;
    return { value: base * mult, approx: mult > 1, raw: m[0].trim() };
  });
  return { ids, times, percents, numbers };
}

export type GroundingResult = { ok: boolean; problems: string[] };

/** Check AI output against one or more source texts (usually JSON.stringify of the facts given to the AI). */
export function groundingCheck(output: string, sources: string[], extraAllowedNumbers: number[] = []): GroundingResult {
  const allowed = extractClaims(sources.join("\n"));
  const ids = new Set(allowed.ids);
  const times = new Set(allowed.times);
  const pcts = allowed.percents;
  const nums = [...allowed.numbers.map((n) => n.value), ...allowed.percents, ...extraAllowedNumbers];
  const out = extractClaims(output);
  const problems: string[] = [];

  for (const id of out.ids) if (!ids.has(id)) problems.push(`Identifier ${id} is not in the case data.`);
  for (const t of out.times) if (!times.has(t)) problems.push(`Time ${t} is not in the case data.`);
  for (const p of out.percents) if (!pcts.some((a) => Math.abs(a - p) < 0.51)) problems.push(`Percentage ${p}% is not in the case data.`);
  for (const n of out.numbers) {
    const ok = n.approx
      ? nums.some((a) => a > 0 && Math.abs(a - n.value) / a <= 0.01)
      : nums.some((a) => Math.abs(a - n.value) < (Math.abs(a) < 10 ? 0.0051 : 0.5));
    if (!ok) problems.push(`Number "${n.raw}" is not in the case data.`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

const LABELS_ON_PEOPLE = /\b(arrest\w*|criminals?|criminality|fraudsters?|suspects?|culprits?|accused|perpetrators?|scammers?)\b/i;
export const ACTION_TERMS = /\b(freez\w*|frozen|debit[- ]?holds?|holds? on (?:the )?accounts?|place (?:a )?holds?|block(?:ing)? (?:the )?accounts?|liens?|seiz\w*|FIR|police complaint|prosecut\w*)\b/i;
const HUMAN_AUTH = /\b(human|analyst|authori[sz]\w*|approv\w*)\b/i;

/**
 * allowActionTerms: true only when the approved documents given to the AI themselves mention the action.
 * Even then, the text must say a human must authorize it.
 */
export function safetyCheck(text: string, allowActionTerms: boolean): GroundingResult {
  const problems: string[] = [];
  const label = text.match(LABELS_ON_PEOPLE);
  if (label) problems.push(`Uses the word "${label[0]}", which labels people. FraudCast describes accounts and transactions only.`);
  const action = text.match(ACTION_TERMS);
  if (action && !allowActionTerms) problems.push(`Mentions "${action[0]}", which no approved document provided here supports.`);
  if (action && allowActionTerms && !HUMAN_AUTH.test(text)) problems.push(`Mentions "${action[0]}" without stating that human authorization is required.`);
  return { ok: problems.length === 0, problems };
}
