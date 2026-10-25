// FraudCast – all database reads for Phase 3 screens (server-side only).

import { db } from "./supabase";
import type { AccountRow, AlertRow, CaseRow, OutcomeRow, PointRow, PredictionRow, TxnRow } from "./types";

// Postgres "numeric" can arrive as a string from some drivers – always convert to number.
function nums<T>(rows: T[], fields: (keyof T)[]): T[] {
  return rows.map((r) => {
    const copy = { ...r } as Record<string, unknown>;
    for (const f of fields) {
      const v = copy[f as string];
      if (v !== null && v !== undefined) copy[f as string] = Number(v);
    }
    return copy as T;
  });
}

function fail(table: string, message: string): never {
  throw new Error(`Could not read "${table}" from Supabase: ${message}. Check that schema.sql and seed.sql were run.`);
}

const CASE_NUMS: (keyof CaseRow)[] = ["original_amount", "current_amount_at_risk", "reporting_delay_minutes", "priority_score", "data_quality"];
const TXN_NUMS: (keyof TxnRow)[] = ["amount", "transfer_hop", "minutes_since_previous_transfer"];
const ACC_NUMS: (keyof AccountRow)[] = ["current_balance", "previous_synthetic_alert_count", "previous_confirmed_synthetic_link_count"];
const OUT_NUMS: (keyof OutcomeRow)[] = ["amount_protected", "amount_withdrawn", "amount_unresolved", "original_amount_at_risk"];
const PRED_NUMS: (keyof PredictionRow)[] = ["rank", "normalized_confidence"];
const PRED_COLS = "case_id,run_id,rank,normalized_confidence,insufficient_evidence,created_at";

export async function loadAllCases() {
  const s = db();
  const [c, t, p] = await Promise.all([
    s.from("cases").select("*"),
    s.from("transactions").select("*"),
    s.from("predictions").select(PRED_COLS),
  ]);
  if (c.error) fail("cases", c.error.message);
  if (t.error) fail("transactions", t.error.message);
  if (p.error) fail("predictions", p.error.message);
  return {
    cases: nums((c.data ?? []) as CaseRow[], CASE_NUMS),
    txns: nums((t.data ?? []) as TxnRow[], TXN_NUMS),
    preds: nums((p.data ?? []) as PredictionRow[], PRED_NUMS),
  };
}

export async function loadOverview() {
  const s = db();
  const [base, a, o] = await Promise.all([loadAllCases(), s.from("alerts").select("*"), s.from("outcomes").select("*")]);
  if (a.error) fail("alerts", a.error.message);
  if (o.error) fail("outcomes", o.error.message);
  return { ...base, alerts: (a.data ?? []) as AlertRow[], outcomes: nums((o.data ?? []) as OutcomeRow[], OUT_NUMS) };
}

/** Everything needed for one case. Returns null if the case does not exist. */
export async function loadCase(caseId: string) {
  const s = db();
  const all = await loadAllCases(); // needed for the priority score (max active risk across cases)
  const kase = all.cases.find((c) => c.case_id === caseId);
  if (!kase) return null;
  const txns = all.txns
    .filter((t) => t.case_id === caseId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.transfer_hop - b.transfer_hop);

  const accountIds = Array.from(
    new Set([kase.victim_account_id, ...txns.flatMap((t) => [t.source_account_id, t.destination_account_id ?? ""])].filter(Boolean)),
  );
  const locationIds = Array.from(new Set(txns.map((t) => t.location_id).filter((x): x is string => !!x)));

  const [acc, pts, al, oc] = await Promise.all([
    s.from("accounts").select("*").in("account_id", accountIds),
    locationIds.length
      ? s.from("cash_out_points").select("location_id,zone_id,location_type,synthetic_bank_code,operating_status").in("location_id", locationIds)
      : Promise.resolve({ data: [] as PointRow[], error: null }),
    s.from("alerts").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
    s.from("outcomes").select("*").eq("case_id", caseId).maybeSingle(),
  ]);
  if (acc.error) fail("accounts", acc.error.message);
  if (pts.error) fail("cash_out_points", pts.error.message);
  if (al.error) fail("alerts", al.error.message);
  if (oc.error) fail("outcomes", oc.error.message);

  return {
    kase,
    all,
    txns,
    accounts: nums((acc.data ?? []) as AccountRow[], ACC_NUMS),
    points: (pts.data ?? []) as PointRow[],
    alerts: (al.data ?? []) as AlertRow[],
    outcome: oc.data ? nums([oc.data as OutcomeRow], OUT_NUMS)[0] : null,
  };
}
