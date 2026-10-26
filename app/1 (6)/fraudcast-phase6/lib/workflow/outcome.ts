// FraudCast – Step 24: outcome validation (PRD 12.10, DV-06). Pure function, easy to test.

import { inr } from "../format";

export type OutcomeInput = {
  original: number;
  alreadyWithdrawn: number; // cash withdrawals already recorded in transactions
  protectedAmt: number;
  withdrawn: number;
  zoneId: string | null;
  zoneExists: boolean;
  actualTime: string | null; // ISO
  fraudTime: string;
  now: Date;
  hasApprovedAlert: boolean;
  usefulness: number | null;
  override: boolean;
  overrideReason: string;
  comments: string;
};

export type OutcomeCheck = { errors: string[]; unresolved: number; result: string };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function deriveResult(protectedAmt: number, withdrawn: number, unresolved: number, hasApprovedAlert: boolean): string {
  if (protectedAmt <= 0) return hasApprovedAlert ? "Not protected" : "No action";
  if (withdrawn <= 0 && unresolved <= 0) return "Funds protected";
  return "Partially protected";
}

export function validateOutcome(i: OutcomeInput): OutcomeCheck {
  const errors: string[] = [];
  const okNum = (x: number) => Number.isFinite(x) && x >= 0;
  if (!okNum(i.protectedAmt)) errors.push("Amount protected must be a number of 0 or more.");
  if (!okNum(i.withdrawn)) errors.push("Amount withdrawn must be a number of 0 or more.");
  const p = okNum(i.protectedAmt) ? r2(i.protectedAmt) : 0;
  const w = okNum(i.withdrawn) ? r2(i.withdrawn) : 0;
  if (okNum(i.withdrawn) && w < i.alreadyWithdrawn - 1) {
    errors.push(`Amount withdrawn cannot be less than ${inr(i.alreadyWithdrawn)}, which is already recorded as withdrawn in the transactions.`);
  }
  const rawUnresolved = r2(i.original - p - w);
  if (rawUnresolved < -1) {
    errors.push(`Protected (${inr(p)}) plus withdrawn (${inr(w)}) is ${inr(-rawUnresolved)} more than the original ${inr(i.original)}. The amounts must add up.`);
  }
  if (i.zoneId && !i.zoneExists) errors.push("Choose a valid cash-out zone, or \"Not known\".");
  if (i.actualTime) {
    const d = new Date(i.actualTime);
    if (Number.isNaN(d.getTime())) errors.push("The actual cash-out time is not a valid date and time.");
    else if (d < new Date(i.fraudTime)) errors.push("The actual cash-out time is before the fraud happened.");
    else if (d > i.now) errors.push("The actual cash-out time is after the demo clock.");
  }
  if (i.hasApprovedAlert && !(i.usefulness !== null && Number.isInteger(i.usefulness) && i.usefulness >= 1 && i.usefulness <= 5)) {
    errors.push("Rate how useful the alert was (1 to 5).");
  }
  if (i.override && i.overrideReason.trim().length < 5) errors.push("Give a reason for the override (at least 5 characters).");
  if (i.comments.length > 1000) errors.push("Comments must be 1,000 characters or fewer.");
  const unresolved = Math.max(0, rawUnresolved);
  return { errors, unresolved, result: deriveResult(p, w, unresolved, i.hasApprovedAlert) };
}
