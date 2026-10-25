"""
FraudCast Phase 2 - Data validation (PRD Section 15, rules DV-01 to DV-14)
Run AFTER generate_data.py:   python validate_data.py
Exit code 0 = all checks passed, 1 = at least one failure (use this to block deploys).
"""
import os
import re
import sys

import h3
import pandas as pd

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DEMO_NOW = pd.Timestamp("2026-10-22T12:00:00+05:30")
T = {n: pd.read_csv(os.path.join(D, f"{n}.csv")) for n in [
    "zones", "cash_out_points", "accounts", "cases", "transactions",
    "historical_cashout_events", "alerts", "outcomes", "audit_events"]}
for n, df in T.items():
    for col in df.columns:
        if "timestamp" in col or col.endswith("_at") or col in ("data_as_of", "escalation_deadline"):
            df[col] = pd.to_datetime(df[col], utc=True)

failures, warnings = [], []


def check(rule, ok, msg):
    print(f"  [{'PASS' if ok else 'FAIL'}] {rule}: {msg}")
    if not ok:
        failures.append(rule)


def warn(rule, msg):
    print(f"  [WARN] {rule}: {msg}")
    warnings.append(rule)


print("\nFraudCast synthetic data validation\n")

# DV-01 unique identifiers
pk = dict(zones="zone_id", cash_out_points="location_id", accounts="account_id", cases="case_id",
          transactions="transaction_id", historical_cashout_events="historical_event_id", alerts="alert_id",
          outcomes="outcome_id", audit_events="event_id")
dups = {n: int(T[n][c].duplicated().sum()) for n, c in pk.items()}
check("DV-01", sum(dups.values()) == 0, f"unique IDs in all tables {dups if sum(dups.values()) else ''}")

# DV-02 referential integrity
acc, zon, cas, loc = (set(T["accounts"].account_id), set(T["zones"].zone_id), set(T["cases"].case_id),
                      set(T["cash_out_points"].location_id))
tx = T["transactions"]
bad = []
bad += [f"txn src {x}" for x in tx.source_account_id if x not in acc]
bad += [f"txn dst {x}" for x in tx.destination_account_id.dropna() if x not in acc]
bad += [f"txn case {x}" for x in tx.case_id if x not in cas]
bad += [f"txn zone {x}" for x in pd.concat([tx.source_zone, tx.destination_zone]).dropna() if x not in zon]
bad += [f"txn loc {x}" for x in tx.location_id.dropna() if x not in loc]
bad += [f"point zone {x}" for x in T["cash_out_points"].zone_id if x not in zon]
bad += [f"case beneficiary {x}" for x in T["cases"].initial_beneficiary_account_id if x not in acc]
bad += [f"hist account {x}" for x in T["historical_cashout_events"].final_account_id if x not in acc]
bad += [f"hist zone {x}" for x in T["historical_cashout_events"].cashout_zone_id if x not in zon]
bad += [f"outcome case {x}" for x in T["outcomes"].case_id if x not in cas]
check("DV-02", not bad, "all foreign keys resolve" if not bad else f"{len(bad)} broken: {bad[:5]}")

# DV-03 timestamps in logical sequence (money can't leave an account before it arrived)
seq_bad = []
for cid, g in tx.groupby("case_id"):
    first_in = g.dropna(subset=["destination_account_id"]).groupby("destination_account_id").timestamp.min()
    for _, r in g.iterrows():
        if r.transfer_hop > 0 and r.source_account_id in first_in and r.timestamp < first_in[r.source_account_id]:
            seq_bad.append(r.transaction_id)
c = T["cases"]
seq_bad += list(c[c.report_timestamp < c.fraud_timestamp].case_id)
seq_bad += list(tx[tx.timestamp > DEMO_NOW].transaction_id)
check("DV-03", not seq_bad, "transfers ordered; reports after fraud; nothing after DEMO_NOW"
      if not seq_bad else f"{seq_bad[:5]}")

# DV-04 outgoing <= incoming per account per case (victim is the funding source, so exempt)
victims = set(c.victim_account_id)
over = []
for cid, g in tx.groupby("case_id"):
    inflow = g.groupby("destination_account_id").amount.sum()
    outflow = g.groupby("source_account_id").amount.sum()
    for a, out_amt in outflow.items():
        if a not in victims and out_amt - inflow.get(a, 0) > 1:
            over.append((cid, a))
check("DV-04", not over, "no account sends more than it received" if not over else f"{over[:5]}")

# DV-05 current amount at risk = funds still held in network minus protected (closed cases)
oc = T["outcomes"].set_index("case_id")
mism = []
for _, r in c.iterrows():
    g = tx[tx.case_id == r.case_id]
    held = sum(max(0, g[g.destination_account_id == a].amount.sum() - g[g.source_account_id == a].amount.sum())
               for a in set(g.destination_account_id.dropna()))
    expected = held - (oc.loc[r.case_id].amount_protected if r.case_id in oc.index else 0)
    if abs(expected - r.current_amount_at_risk) > 1:
        mism.append((r.case_id, round(expected), r.current_amount_at_risk))
check("DV-05", not mism, "amount at risk recalculates correctly" if not mism else f"{mism}")

# DV-06 outcome reconciliation
o = T["outcomes"]
diff = (o.amount_protected + o.amount_withdrawn + o.amount_unresolved - o.original_amount_at_risk).abs()
check("DV-06", (diff <= 1).all(), "protected + withdrawn + unresolved = original for every outcome")
wd_bad = [r.case_id for _, r in o.iterrows()
          if abs(tx[(tx.case_id == r.case_id) & tx.destination_account_id.isna()].amount.sum() - r.amount_withdrawn) > 1]
check("DV-06b", not wd_bad, "withdrawn amounts match withdrawal transactions" if not wd_bad else f"{wd_bad}")

# DV-07 zones valid for map display (+ real H3 cells, + points inside their hexagon)
z = T["zones"]
bad_h3 = [r.zone_id for _, r in z.iterrows() if not h3.is_valid_cell(r.h3_index)]
outside = [p.location_id for _, p in T["cash_out_points"].iterrows()
           if h3.latlng_to_cell(p.latitude, p.longitude, 8) != z.set_index("zone_id").h3_index[p.zone_id]]
check("DV-07", not bad_h3 and not outside, "valid H3 cells; every cash-out point lies inside its hexagon"
      if not (bad_h3 or outside) else f"bad cells {bad_h3}, points outside {outside}")

# DV-08 / DV-15 forecast checks happen in Phase 4 (predictions table is empty now)
print("  [SKIP] DV-08, DV-15: predictions are created in Phase 4")

# DV-09 actual zone exists
check("DV-09", o.actual_cashout_zone.dropna().isin(zon).all(), "actual cash-out zones exist in zone table")

# DV-10 alerts linked to valid cases
check("DV-10", T["alerts"].case_id.isin(cas).all(), "every alert belongs to a valid case")
ap = T["alerts"][T["alerts"].approval_status == "Approved"]
check("DV-10b", ap.approved_by.notna().all() and ap.approved_at.notna().all(),
      "every approved alert has an approver and timestamp (human-approval rule)")

# DV-11 no real-looking personal/banking data
PATTERNS = {"account-number-like (9-18 digits)": r"(?<![\d.])\d{9,18}(?![\d.])",
            "IFSC-like": r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
            "mobile-like": r"(?<!\d)[6-9]\d{9}(?!\d)",
            "email": r"[\w.+-]+@[\w-]+\.[\w.]+"}
hits = []
for n, df in T.items():
    for col in df.columns:
        if col == "h3_index":
            continue
        txt = df[col].astype(str)
        for label, pat in PATTERNS.items():
            m = txt[txt.str.contains(pat, regex=True)]
            if len(m):
                hits.append(f"{n}.{col}: {label}")
check("DV-11", not hits, "no account numbers, IFSC codes, phone numbers or emails" if not hits else f"{hits}")

# DV-12 every ID contains SYN or DEMO
id_bad = [f"{n}.{col}" for n, df in T.items() for col in df.columns
          if (col.endswith("_id") or col in ("assigned_analyst", "approved_by", "home_branch_zone",
                                            "victim_location_zone", "actual_cashout_zone"))
          and col != "user_id"
          and not df[col].dropna().astype(str).str.contains("SYN|DEMO").all()]
check("DV-12", not id_bad, "all identifiers contain SYN or DEMO" if not id_bad else f"{id_bad}")

# DV-13 missing data is blank (warned), never fabricated
check("DV-13", c.payment_channel.isna().sum() >= 1 and c.missing_fields.notna().sum() >= 1,
      f"{int(c.missing_fields.notna().sum())} cases carry missing-field warnings instead of invented values")

# DV-14 freshness timestamp present + stale case flagged
age = (DEMO_NOW - c.data_as_of).dt.total_seconds() / 60
check("DV-14", c.data_as_of.notna().all() and (age > 60).sum() >= 1,
      f"all cases have data_as_of; {int((age > 60).sum())} stale case(s) present for testing")

# Prohibited inputs reminder
print("  [INFO] victim_location_zone is stored for routing only and must NOT be used by the Phase 4 engine.")

# Volume check against PRD Section 14
vol = dict(active_cases=(len(c[c.status != "Closed"]), 10, 12), historical=(len(T["historical_cashout_events"]), 25, 30),
           accounts=(len(T["accounts"]), 40, 60), transactions=(len(tx), 100, 150), zones=(len(z), 20, 30),
           points=(len(T["cash_out_points"]), 30, 50), alerts=(len(T["alerts"]), 8, 12), outcomes=(len(o), 6, 10))
off = {k: v[0] for k, v in vol.items() if not v[1] <= v[0] <= v[2]}
check("VOLUME", not off, "row counts within PRD ranges" if not off else f"out of range: {off}")

# Edge-case coverage
needed = {"EDGE_SPLIT_4PLUS", "EDGE_MISSING_CHANNEL", "EDGE_INSUFFICIENT_EVIDENCE",
          "EDGE_ACTUAL_OUTSIDE_TOP3", "EDGE_WITHDRAWN_BEFORE_REPORT"}
have = set(c.edge_case_tag.dropna())
check("EDGES", needed <= have, "all 5 PRD edge cases present" if needed <= have else f"missing {needed - have}")

print(f"\nResult: {len(failures)} failure(s), {len(warnings)} warning(s)")
sys.exit(1 if failures else 0)
