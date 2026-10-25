"""
FraudCast Phase 2 - Synthetic data generator
=============================================
Creates ALL demo data for FraudCast. Nothing here is real.

  - Same seed  -> exactly the same data every run (reproducible demo).
  - Every ID contains SYN or DEMO.
  - Real geography (H3 hexagons over Pune) + 100% synthetic activity.

Run:
    pip install h3 pandas
    python generate_data.py

Output (folder ./data):
    zones.csv, cash_out_points.csv, accounts.csv, cases.csv, transactions.csv,
    historical_cashout_events.csv, alerts.csv, outcomes.csv, audit_events.csv,
    seed.sql   <- paste into Supabase SQL Editor AFTER schema.sql
"""
import math
import os
import random
from datetime import datetime, timedelta, timezone

import h3
import pandas as pd

# ----------------------------------------------------------------------------
# 1. SETTINGS (change here, nowhere else)
# ----------------------------------------------------------------------------
SEED = 42
IST = timezone(timedelta(hours=5, minutes=30))
DEMO_NOW = datetime(2026, 10, 22, 12, 0, tzinfo=IST)   # the app must treat this as "now"
CITY, DISTRICT = "Pune", "Pune"
CITY_CENTRE = (18.5204, 73.8567)
H3_RES = 8                 # ~0.74 sq km per hexagon (PRD Section 13)
N_ZONES = 25
N_RINGS = 5                # synthetic mule networks with habitual cash-out zones
STALE_AFTER_MIN = 60       # DV-14
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

rng = random.Random(SEED)


def ts(dt):
    return dt.isoformat()


def r100(x):
    """round rupees to nearest 100"""
    return float(int(round(x / 100.0)) * 100)


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ----------------------------------------------------------------------------
# 2. ZONES - real H3 hexagons, synthetic attributes
# ----------------------------------------------------------------------------
centre_cell = h3.latlng_to_cell(*CITY_CENTRE, H3_RES)
cells = sorted(h3.grid_disk(centre_cell, 3),
               key=lambda c: (h3.grid_distance(centre_cell, c), c))[:N_ZONES]


def jurisdiction(latlng):
    if haversine_km(latlng, CITY_CENTRE) < 1.2:
        return "SYN-JUR-CENTRAL"
    bearing = math.degrees(math.atan2(latlng[1] - CITY_CENTRE[1], latlng[0] - CITY_CENTRE[0])) % 360
    return ["SYN-JUR-NORTH", "SYN-JUR-EAST", "SYN-JUR-SOUTH", "SYN-JUR-WEST"][int(((bearing + 45) % 360) // 90)]


zones = []
for i, c in enumerate(cells, 1):
    lat, lng = h3.cell_to_latlng(c)
    zones.append(dict(
        zone_id=f"SYN-ZONE-{i:02d}", h3_index=c, zone_name=f"Pune Hex {i:02d}",
        city=CITY, district=DISTRICT, jurisdiction=jurisdiction((lat, lng)),
        centroid_latitude=round(lat, 6), centroid_longitude=round(lng, 6),
        approximate_area=round(h3.cell_area(c, unit="km^2"), 2),
    ))
ZID = [z["zone_id"] for z in zones]
ZONE = {z["zone_id"]: z for z in zones}

# Each mule ring habitually cashes out in a primary zone, sometimes a secondary one
hot = rng.sample(ZID[1:], N_RINGS * 2)
RINGS = []
ring_profiles = [  # (preferred fraud types, typical minutes to cash-out, preferred cash-out hour band, hop gap minutes)
    (["UPI fraud", "Phishing"], 90, (19, 23), (4, 15)),
    (["Investment scam"], 240, (10, 14), (15, 40)),
    (["Impersonation", "UPI fraud"], 150, (14, 18), (8, 25)),
    (["Card-not-present", "Phishing"], 60, (20, 24), (3, 10)),
    (["Investment scam", "Impersonation"], 360, (9, 12), (20, 45)),
]
for r in range(N_RINGS):
    ft, mtc, hb, gap = ring_profiles[r]
    RINGS.append(dict(ring=r + 1, primary=hot[2 * r], secondary=hot[2 * r + 1],
                      fraud_types=ft, mtc=mtc, hour_band=hb, gap=gap))

# ----------------------------------------------------------------------------
# 3. CASH-OUT POINTS - synthetic ATMs / branches placed inside each hexagon
# ----------------------------------------------------------------------------
BANKS = ["SYN-BANK-A", "SYN-BANK-B", "SYN-BANK-C", "SYN-BANK-D", "SYN-BANK-E"]
points_per_zone = {z: 0 for z in ZID}
for rg in RINGS:
    points_per_zone[rg["primary"]] = rng.randint(4, 5)
    points_per_zone[rg["secondary"]] = 3
others = [z for z in ZID if points_per_zone[z] == 0]
for z in others:
    points_per_zone[z] = rng.choice([0, 1, 1, 2])
MAX_POINTS = 48  # PRD range is 30-50; trim background zones first, never the hotspots
for z in sorted(others, key=lambda z: -points_per_zone[z]):
    if sum(points_per_zone.values()) <= MAX_POINTS:
        break
    points_per_zone[z] -= 1

points = []
pid = 0
for z in ZID:
    cell = ZONE[z]["h3_index"]
    clat, clng = ZONE[z]["centroid_latitude"], ZONE[z]["centroid_longitude"]
    for _ in range(points_per_zone[z]):
        while True:  # keep sampling until the point is inside the hexagon
            d, ang = rng.uniform(0.05, 0.35), rng.uniform(0, 2 * math.pi)
            lat = clat + (d / 111.0) * math.cos(ang)
            lng = clng + (d / (111.0 * math.cos(math.radians(clat)))) * math.sin(ang)
            if h3.latlng_to_cell(lat, lng, H3_RES) == cell:
                break
        pid += 1
        ltype = rng.choices(["ATM", "Branch", "Business Correspondent"], [0.7, 0.2, 0.1])[0]
        points.append(dict(
            location_id=f"SYN-LOC-{pid:03d}", zone_id=z, location_type=ltype,
            synthetic_bank_code=rng.choice(BANKS), latitude=round(lat, 6), longitude=round(lng, 6),
            operating_status="Offline" if rng.random() < 0.08 else "Operational",
            availability_window="24x7" if ltype == "ATM" else ("09:30-16:30" if ltype == "Branch" else "10:00-19:00"),
            activity_band=rng.choice(["Low", "Medium", "High"]),
        ))
POINTS_BY_ZONE = {z: [p for p in points if p["zone_id"] == z] for z in ZID}

for z in zones:
    pts = POINTS_BY_ZONE[z["zone_id"]]
    z["atm_count"] = sum(p["location_type"] == "ATM" for p in pts)
    n = len(pts)
    z["atm_density_band"] = "High" if n >= 5 else ("Medium" if n >= 2 else "Low")

# ----------------------------------------------------------------------------
# 4. ACCOUNTS - 20 victims + 5 rings x 7 mules + 3 "fresh" unlinked mules
# ----------------------------------------------------------------------------
accounts, acc_n = [], 0


def new_account(role, **kw):
    global acc_n
    acc_n += 1
    a = dict(account_id=f"SYN-ACC-{acc_n:04d}", bank_code=rng.choice(BANKS), role_hint=role,
             home_branch_zone=rng.choice(ZID), review_status="None", current_balance=0.0)
    if role == "victim":
        a.update(account_type=rng.choice(["Savings", "Savings", "Current"]), account_age_band="Over 180 days",
                 previous_synthetic_alert_count=0, previous_confirmed_synthetic_link_count=0,
                 normal_activity_band=rng.choice(["Low", "Medium", "High"]), recent_activity_band="Medium",
                 base_balance=r100(rng.uniform(20000, 300000)))
    else:
        a.update(account_type=rng.choice(["Savings", "Savings", "Wallet", "Current", "Prepaid"]),
                 account_age_band=rng.choice(["Under 30 days", "Under 30 days", "30-180 days"]),
                 previous_synthetic_alert_count=rng.randint(0, 3),
                 previous_confirmed_synthetic_link_count=rng.randint(0, 2),
                 normal_activity_band="Low", recent_activity_band="Spike",
                 base_balance=r100(rng.uniform(500, 8000)))
    a.update(kw)
    accounts.append(a)
    return a["account_id"]


VICTIMS = [new_account("victim") for _ in range(20)]
for rg in RINGS:
    rg["collector"] = new_account("mule")
    rg["layers"] = [new_account("mule") for _ in range(4)]
    rg["cashers"] = [new_account("mule") for _ in range(2)]
FRESH = [new_account("mule", previous_synthetic_alert_count=0, previous_confirmed_synthetic_link_count=0,
                     account_age_band="Under 30 days") for _ in range(3)]
ACC = {a["account_id"]: a for a in accounts}

# ----------------------------------------------------------------------------
# 5. HISTORICAL CASH-OUT EVENTS - 30 past cases, 6 per ring
# ----------------------------------------------------------------------------
hist = []
for i in range(30):
    rg = RINGS[i % N_RINGS]
    zone = rng.choices([rg["primary"], rg["secondary"], rng.choice(ZID)], [0.65, 0.20, 0.15])[0]
    day = DEMO_NOW - timedelta(days=rng.randint(3, 90))
    hour = rng.randint(rg["hour_band"][0], rg["hour_band"][1] - 1)
    when = day.replace(hour=hour, minute=rng.randint(0, 59), second=0, microsecond=0)
    hops = rng.randint(2, 4)
    hist.append(dict(
        historical_event_id=f"SYN-HCE-{i + 1:03d}", case_id=f"SYN-HCASE-{i + 1:03d}",
        final_account_id=rng.choice(rg["cashers"]), cashout_zone_id=zone, cashout_timestamp=when,
        amount_withdrawn=r100(rng.uniform(30000, 450000)), fraud_type=rng.choice(rg["fraud_types"]),
        transfer_hop_count=hops, minutes_to_cashout=max(20, int(rng.gauss(rg["mtc"], rg["mtc"] * 0.25))),
        splitting_pattern="None" if hops == 2 else rng.choice(["Fan-out", "Fan-out then fan-in"]),
        outcome=rng.choices(["Withdrawn", "Partially protected", "Protected"], [0.7, 0.2, 0.1])[0],
    ))
for a_id in {h["final_account_id"] for h in hist}:  # cashers have a confirmed synthetic history
    ACC[a_id]["previous_confirmed_synthetic_link_count"] = max(1, ACC[a_id]["previous_confirmed_synthetic_link_count"])

for z in zones:
    evs = [h for h in hist if h["cashout_zone_id"] == z["zone_id"]]
    z["historical_synthetic_cashout_count"] = len(evs)
    recent = sum(h["cashout_timestamp"] > DEMO_NOW - timedelta(days=30) for h in evs)
    older = len(evs) - recent
    z["risk_trend"] = "Rising" if recent > older / 2 + 0.5 else ("Falling" if evs and recent == 0 else "Stable")

# ----------------------------------------------------------------------------
# 6. CASES + TRANSACTIONS
#    12 active + 8 closed, each with a deliberate scenario (edge cases included)
# ----------------------------------------------------------------------------
PLAN = [
    # id, ring (0 = fresh/unlinked), amount, status, scenario tag
    (1, 1, 685000, "New", None),
    (2, 2, 420000, "In Review", "EDGE_SPLIT_4PLUS"),
    (3, 3, 310000, "New", "EDGE_MISSING_CHANNEL"),
    (4, 0, 180000, "New", "EDGE_INSUFFICIENT_EVIDENCE"),
    (5, 4, 540000, "Alert Sent", "PARTIAL_WITHDRAWAL_ALREADY"),
    (6, 5, 260000, "In Review", None),
    (7, 1, 95000, "New", None),
    (8, 2, 375000, "In Review", "EDGE_STALE_DATA"),
    (9, 3, 150000, "New", "MISSING_ZONE_AND_AGE"),
    (10, 4, 220000, "In Review", None),
    (11, 5, 480000, "Alert Sent", "ALERT_OVERDUE"),
    (12, 1, 330000, "Acknowledged", None),
    (13, 1, 450000, "Closed", "OUTCOME_FULLY_PROTECTED"),
    (14, 2, 380000, "Closed", "OUTCOME_PARTIAL"),
    (15, 3, 290000, "Closed", "OUTCOME_NOT_PROTECTED"),
    (16, 4, 350000, "Closed", "EDGE_ACTUAL_OUTSIDE_TOP3"),
    (17, 5, 210000, "Closed", "EDGE_WITHDRAWN_BEFORE_REPORT"),
    (18, 1, 270000, "Closed", "OUTCOME_FULLY_PROTECTED_SECONDARY"),
    (19, 2, 400000, "Closed", "OUTCOME_PARTIAL"),
    (20, 3, 320000, "Closed", "EDGE_ANALYST_OVERRIDE"),
]
CHANNELS = ["UPI", "IMPS", "NEFT", "Card", "Wallet"]
ANALYSTS = ["DEMO-USER-ANALYST-01", "DEMO-USER-ANALYST-02", "DEMO-USER-ANALYST-03"]
cases, txns, tx_n = [], [], 0
case_meta = {}


def add_tx(case_id, src, dst, amount, when, channel, hop, prev_when, dst_zone="auto", location_id=None):
    global tx_n
    tx_n += 1
    src_zone = ACC[src]["home_branch_zone"] if src in ACC else None
    if dst_zone == "auto":
        dst_zone = ACC[dst]["home_branch_zone"] if dst else None
    txns.append(dict(
        transaction_id=f"SYN-TXN-{tx_n:05d}", case_id=case_id, source_account_id=src,
        destination_account_id=dst, amount=float(amount), timestamp=when, channel=channel,
        source_zone=src_zone, destination_zone=dst_zone, status="Completed", transfer_hop=hop,
        minutes_since_previous_transfer=None if prev_when is None else int((when - prev_when).total_seconds() // 60),
        location_id=location_id,
    ))


def split(total, k):
    """split an amount into k parts that add up exactly"""
    w = [rng.uniform(0.6, 1.4) for _ in range(k)]
    parts = [r100(total * x / sum(w)) for x in w[:-1]]
    parts.append(round(total - sum(parts), 2))
    return parts


for cid, ring_no, amount, status, tag in PLAN:
    case_id = f"SYN-CASE-{cid:04d}"
    victim = VICTIMS[cid - 1]
    closed = status == "Closed"
    if ring_no == 0:
        rg = dict(collector=FRESH[0], layers=FRESH[1:], cashers=[], gap=(5, 12),
                  fraud_types=["UPI fraud"], primary=None, secondary=None, hour_band=(18, 22), mtc=120)
    else:
        rg = RINGS[ring_no - 1]
    fraud_type = rng.choice(rg["fraud_types"])
    channel = rng.choice(["UPI", "IMPS"] if fraud_type != "Card-not-present" else ["Card"])

    # ---- build the money chain with relative minutes first ----
    g0, g1 = rg["gap"]
    t = 0
    chain = []  # (minute, src, dst, amt, channel, hop)
    chain.append((t, victim, rg["collector"], amount, channel, 0))
    n_layers = 4 if tag == "EDGE_SPLIT_4PLUS" else (2 if ring_no == 0 else rng.randint(2, 3))
    layers = rg["layers"][:n_layers]
    parts = split(amount, n_layers)
    hop1_t = []
    for L, amt in zip(layers, parts):
        t += rng.randint(2, 9) if tag == "EDGE_SPLIT_4PLUS" else rng.randint(g0, g1)
        chain.append((t, rg["collector"], L, amt, rng.choice(["UPI", "IMPS"]), 1))
        hop1_t.append((L, amt, t))
    holders = {}  # account -> amount currently held in this case
    for L, amt, t1 in hop1_t:
        if rg["cashers"] and rng.random() < 0.65:
            C = rng.choice(rg["cashers"])
            t2 = t1 + rng.randint(g0, g1)
            chain.append((t2, L, C, amt, rng.choice(["IMPS", "UPI", "Wallet"]), 2))
            holders[C] = holders.get(C, 0) + amt
        else:
            holders[L] = holders.get(L, 0) + amt
    chain_len = max(c[0] for c in chain)

    # ---- place the chain in time ----
    if closed:
        fraud_ts = (DEMO_NOW - timedelta(days=rng.randint(2, 20))).replace(
            hour=rng.randint(rg["hour_band"][0] - 3 if rg["hour_band"][0] >= 3 else 0, rg["hour_band"][0]),
            minute=rng.randint(0, 59), second=0, microsecond=0)
    else:
        fraud_ts = DEMO_NOW - timedelta(minutes=chain_len + rng.randint(25, 150))
    fraud_ts = fraud_ts.replace(second=0, microsecond=0)

    last_in = {}  # account -> last time money arrived (for the minutes_since_previous field)
    for m, src, dst, amt, ch, hop in sorted(chain, key=lambda c: (c[5], c[0])):
        when = fraud_ts + timedelta(minutes=m)
        prev = last_in.get(src)
        add_tx(case_id, src, dst, amt, when, ch if not (hop == 0 and tag == "EDGE_MISSING_CHANNEL") else "Unknown",
               hop, prev)
        last_in[dst] = when
    last_transfer = fraud_ts + timedelta(minutes=chain_len)

    # ---- cash withdrawals (closed cases, and one active partial) ----
    withdrawn, actual_zone, actual_ts = 0.0, None, None
    if closed or tag == "PARTIAL_WITHDRAWAL_ALREADY":
        if tag == "EDGE_ACTUAL_OUTSIDE_TOP3":
            actual_zone = rng.choice([z for z in ZID if z not in {r["primary"] for r in RINGS} | {r["secondary"] for r in RINGS}
                                      and any(p["operating_status"] == "Operational" for p in POINTS_BY_ZONE[z])])
        elif tag in ("OUTCOME_FULLY_PROTECTED_SECONDARY", "EDGE_ANALYST_OVERRIDE"):
            actual_zone = rg["secondary"]
        else:
            actual_zone = rg["primary"]
        share = {"OUTCOME_FULLY_PROTECTED": 0.0, "OUTCOME_FULLY_PROTECTED_SECONDARY": 0.0,
                 "OUTCOME_PARTIAL": 0.45, "OUTCOME_NOT_PROTECTED": 0.85, "EDGE_ACTUAL_OUTSIDE_TOP3": 0.6,
                 "EDGE_WITHDRAWN_BEFORE_REPORT": 1.0, "EDGE_ANALYST_OVERRIDE": 0.2,
                 "PARTIAL_WITHDRAWAL_ALREADY": 0.25}[tag]
        target = r100(amount * share) if share < 1 else amount
        pts = [p for p in POINTS_BY_ZONE[actual_zone] if p["operating_status"] == "Operational"]
        wt = last_transfer + timedelta(minutes=rng.randint(10, 30))
        if tag == "PARTIAL_WITHDRAWAL_ALREADY":
            wt = min(wt, DEMO_NOW - timedelta(minutes=8))
        if share == 0:  # fully protected: hold landed before any withdrawal, but log the attempted zone
            actual_ts = wt
        for acc_id in list(holders):
            if target <= 0:
                break
            take = min(holders[acc_id], target) if share < 1 else holders[acc_id]
            if take <= 0:
                continue
            p = rng.choice(pts)
            wd_channel = {"ATM": "ATM withdrawal", "Branch": "Branch withdrawal",
                          "Business Correspondent": "BC withdrawal"}[p["location_type"]]
            add_tx(case_id, acc_id, None, take, wt, wd_channel, 3, last_in.get(acc_id),
                   dst_zone=actual_zone, location_id=p["location_id"])
            holders[acc_id] = round(holders[acc_id] - take, 2)
            withdrawn += take
            target -= take
            actual_ts = actual_ts or wt
            wt += timedelta(minutes=rng.randint(3, 12))
    held_now = round(sum(holders.values()), 2)

    # ---- report time ----
    if tag == "EDGE_WITHDRAWN_BEFORE_REPORT":
        report_ts = (actual_ts or last_transfer) + timedelta(minutes=rng.randint(40, 120))
    elif closed:
        report_ts = fraud_ts + timedelta(minutes=rng.randint(5, max(6, chain_len // 2)))
    else:
        report_ts = min(fraud_ts + timedelta(minutes=rng.randint(10, 90)), DEMO_NOW - timedelta(minutes=5))

    case_meta[case_id] = dict(ring=ring_no, rg=rg, holders=holders, withdrawn=withdrawn, actual_zone=actual_zone,
                              actual_ts=actual_ts, amount=amount, tag=tag, status=status, closed=closed,
                              report_ts=report_ts, fraud_ts=fraud_ts, held_now=held_now)
    cases.append(dict(case_id=case_id, fraud_type=fraud_type, original_amount=float(amount),
                      fraud_timestamp=fraud_ts, report_timestamp=report_ts,
                      reporting_delay_minutes=int((report_ts - fraud_ts).total_seconds() // 60),
                      payment_channel=None if tag == "EDGE_MISSING_CHANNEL" else channel,
                      initial_beneficiary_account_id=rg["collector"], victim_account_id=victim,
                      victim_location_zone=rng.choice(ZID), status=status,
                      assigned_analyst=None if status == "New" and cid in (1, 4) else ANALYSTS[cid % 3],
                      edge_case_tag=tag))

# Missing-data edge cases: blank fields instead of fabricating values (DV-13)
for c in cases:
    tag = case_meta[c["case_id"]]["tag"]
    if tag in ("MISSING_ZONE_AND_AGE", "EDGE_INSUFFICIENT_EVIDENCE"):
        last_hop = max((t for t in txns if t["case_id"] == c["case_id"] and t["destination_account_id"]),
                       key=lambda t: t["timestamp"])
        last_hop["destination_zone"] = None
        exposed = [a for a, v in case_meta[c["case_id"]]["holders"].items() if v > 0]
        ACC[exposed[0]]["account_age_band"] = None

# ----------------------------------------------------------------------------
# 7. EXPOSURE, DATA QUALITY, PRIORITY  (PRD Sections 12.2, 15, 16)
# ----------------------------------------------------------------------------
outcomes_tmp = {}
for c in cases:
    m = case_meta[c["case_id"]]
    tag = m["tag"]
    if m["closed"]:
        remaining = round(m["amount"] - m["withdrawn"], 2)
        if tag in ("OUTCOME_FULLY_PROTECTED", "OUTCOME_FULLY_PROTECTED_SECONDARY", "EDGE_ANALYST_OVERRIDE"):
            protected = remaining
        elif tag == "OUTCOME_NOT_PROTECTED":
            protected = 0.0
        elif tag == "EDGE_WITHDRAWN_BEFORE_REPORT":
            protected = 0.0
        else:
            protected = r100(remaining * rng.uniform(0.55, 0.8))
        unresolved = round(remaining - protected, 2)
        outcomes_tmp[c["case_id"]] = (protected, m["withdrawn"], unresolved)
        c["current_amount_at_risk"] = unresolved
    else:
        c["current_amount_at_risk"] = round(m["amount"] - m["withdrawn"], 2)

    missing = []
    if c["payment_channel"] is None:
        missing.append("payment_channel")
    ctx = [t for t in txns if t["case_id"] == c["case_id"] and t["destination_account_id"]]
    if ctx and max(ctx, key=lambda t: t["timestamp"])["destination_zone"] is None:
        missing.append("destination_zone (last hop)")
    if any(ACC[a]["account_age_band"] is None for a, v in m["holders"].items() if v > 0):
        missing.append("account_age_band (exposed account)")
    stale = tag == "EDGE_STALE_DATA"
    c["data_as_of"] = DEMO_NOW - timedelta(minutes=95 if stale else 2)
    if stale:
        missing.append("data stale (> 60 min)")
    c["missing_fields"] = missing
    c["data_quality"] = round(max(0.0, 1 - 0.15 * sum("stale" not in x for x in missing) - (0.10 if stale else 0)), 2)

# Preliminary priority (forecast-confidence term added in Phase 4; weights re-scaled to sum to 1)
active = [c for c in cases if c["status"] != "Closed"]
max_risk = max(c["current_amount_at_risk"] for c in active)
for c in cases:
    gaps = [t["minutes_since_previous_transfer"] for t in txns
            if t["case_id"] == c["case_id"] and t["minutes_since_previous_transfer"] is not None]
    med_gap = sorted(gaps)[len(gaps) // 2] if gaps else 120
    velocity = max(0.0, 1 - med_gap / 120)
    since_report = max(0, (DEMO_NOW - c["report_timestamp"]).total_seconds() / 60)
    recency = 1 - min(since_report, 1440) / 1440
    amt_norm = min(1.0, c["current_amount_at_risk"] / max_risk)
    score = (0.40 * amt_norm + 0.25 * velocity + 0.20 * recency) / 0.85
    c["priority_score"] = round(score, 3)
    c["priority"] = "Critical" if score >= 0.75 else "High" if score >= 0.55 else "Medium" if score >= 0.35 else "Low"
    c["created_at"] = c["report_timestamp"]
    c["updated_at"] = c["data_as_of"]

# Account balances = synthetic pre-existing balance + fraud funds still held in ACTIVE cases
for a in accounts:
    a["current_balance"] = a["base_balance"]
for c in active:
    for acc_id, held in case_meta[c["case_id"]]["holders"].items():
        ACC[acc_id]["current_balance"] = round(ACC[acc_id]["current_balance"] + max(0, held), 2)
        ACC[acc_id]["recent_activity_band"] = "Spike"
        if c["status"] in ("Alert Sent", "Acknowledged"):
            ACC[acc_id]["review_status"] = "Under review"

# ----------------------------------------------------------------------------
# 8. ALERTS (11) and OUTCOMES (8)
# ----------------------------------------------------------------------------
alerts, outcomes, audit = [], [], []
al_n = 0
RECIPIENTS = {"SYN-JUR-CENTRAL": "SYN-TEAM-ATMOPS-CENTRAL", "SYN-JUR-NORTH": "SYN-TEAM-ATMOPS-NORTH",
              "SYN-JUR-EAST": "SYN-TEAM-ATMOPS-EAST", "SYN-JUR-SOUTH": "SYN-TEAM-ATMOPS-SOUTH",
              "SYN-JUR-WEST": "SYN-TEAM-ATMOPS-WEST"}


def inr(x):
    s = f"{int(round(x)):d}"
    if len(s) <= 3:
        return "INR " + s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return "INR " + ",".join(groups + [tail])


for c in cases:
    m = case_meta[c["case_id"]]
    if not (m["closed"] or c["status"] in ("Alert Sent", "Acknowledged")):
        continue
    al_n += 1
    zone = m["rg"]["primary"]
    approved_at = max(c["report_timestamp"] + timedelta(minutes=rng.randint(8, 25)), c["report_timestamp"])
    if not m["closed"]:
        approved_at = min(approved_at, DEMO_NOW - timedelta(minutes=3))
    deadline = approved_at + timedelta(minutes=15)
    exposed_at_alert = round(m["amount"] - (0 if m["tag"] != "EDGE_WITHDRAWN_BEFORE_REPORT" else m["withdrawn"]), 2)
    draft = (f"[SYNTHETIC DEMO] Case {c['case_id']} | Priority: {c['priority']}\n"
             f"Evidence: {c['fraud_type']} reported {ts(c['report_timestamp'])}; funds moved across "
             f"{len({t['destination_account_id'] for t in txns if t['case_id'] == c['case_id'] and t['destination_account_id']})} accounts.\n"
             f"Amount exposed: {inr(exposed_at_alert)}.\n"
             f"Indicative forecast: elevated cash-out likelihood in {ZONE[zone]['zone_name']} ({zone}).\n"
             f"Requested review: please review cash-out activity in the zone per approved SOP.\n"
             f"This alert is an indicative forecast. Any account or enforcement action requires separate human authorization.")
    if c["status"] == "Acknowledged" or m["closed"]:
        ack_status, ack_ts, action = "Acknowledged", approved_at + timedelta(minutes=rng.randint(3, 12)), (
            "Action recorded" if m["closed"] else "Review started")
    elif m["tag"] == "ALERT_OVERDUE":
        ack_status, ack_ts, action = "Overdue", None, "None"
        approved_at = DEMO_NOW - timedelta(minutes=40)
        deadline = approved_at + timedelta(minutes=15)
    else:
        ack_status, ack_ts, action = "Pending", None, "None"
        approved_at = DEMO_NOW - timedelta(minutes=5)
        deadline = approved_at + timedelta(minutes=15)
    alerts.append(dict(
        alert_id=f"SYN-ALT-{al_n:03d}", case_id=c["case_id"], recipient_type="ATM operations",
        recipient_id=RECIPIENTS[ZONE[zone]["jurisdiction"]], priority=c["priority"],
        alert_reason="Forecast indicates elevated cash-out likelihood within the indicative window",
        draft_content=draft, edited_content=None, approval_status="Approved",
        approved_by=c["assigned_analyst"] or ANALYSTS[0], approved_at=approved_at,
        acknowledgement_status=ack_status, acknowledgement_timestamp=ack_ts, action_status=action,
        escalation_deadline=deadline, created_at=approved_at - timedelta(minutes=4)))

oc_n = 0
for c in cases:
    m = case_meta[c["case_id"]]
    if not m["closed"]:
        continue
    oc_n += 1
    prot, wd, unres = outcomes_tmp[c["case_id"]]
    result = ("Funds protected" if wd == 0 and unres == 0 else "Not protected" if prot == 0 else "Partially protected")
    override = m["tag"] == "EDGE_ANALYST_OVERRIDE"
    closed_at = max(c["report_timestamp"], m["actual_ts"] or c["report_timestamp"]) + timedelta(hours=rng.randint(4, 30))
    outcomes.append(dict(
        outcome_id=f"SYN-OUT-{oc_n:03d}", case_id=c["case_id"], actual_cashout_zone=m["actual_zone"],
        actual_cashout_timestamp=m["actual_ts"], forecast_rank=None, forecast_correct_top_one=None,
        forecast_correct_top_three=None,  # filled by the Phase 4 engine
        original_amount_at_risk=m["amount"], amount_protected=prot, amount_withdrawn=wd, amount_unresolved=unres,
        intervention_result=result, analyst_override=override,
        override_reason=("Analyst prioritised an alternative zone after a synthetic branch callback reported "
                         "an ATM outage in the top-ranked zone.") if override else None,
        analyst_feedback=None,
        alert_usefulness={"Funds protected": 5, "Partially protected": 3, "Not protected": 2}[result]
        if m["tag"] != "EDGE_WITHDRAWN_BEFORE_REPORT" else 1,
        case_status="Closed", closed_at=closed_at))

for i, c in enumerate(cases, 1):
    audit.append(dict(event_id=f"SYN-EVT-{i:05d}", user_id="system", case_id=c["case_id"],
                      action_type="CASE_INGESTED", previous_value=None, new_value=None,
                      reason="Phase 2 synthetic seed", timestamp=c["created_at"], model_version=None))

# ----------------------------------------------------------------------------
# 9. WRITE CSVs + seed.sql
# ----------------------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
for a in accounts:
    a.pop("base_balance", None)
TABLES = [  # FK-safe load order
    ("zones", zones), ("cash_out_points", points), ("accounts", accounts), ("cases", cases),
    ("transactions", txns), ("historical_cashout_events", hist), ("alerts", alerts),
    ("outcomes", outcomes), ("audit_events", audit),
]
COLS = {
    "zones": ["zone_id", "h3_index", "zone_name", "city", "district", "jurisdiction", "centroid_latitude",
              "centroid_longitude", "approximate_area", "atm_count", "atm_density_band",
              "historical_synthetic_cashout_count", "risk_trend"],
    "accounts": ["account_id", "bank_code", "account_type", "account_age_band", "home_branch_zone",
                 "previous_synthetic_alert_count", "previous_confirmed_synthetic_link_count",
                 "normal_activity_band", "recent_activity_band", "current_balance", "review_status", "role_hint"],
    "cases": ["case_id", "fraud_type", "original_amount", "current_amount_at_risk", "fraud_timestamp",
              "report_timestamp", "reporting_delay_minutes", "payment_channel", "initial_beneficiary_account_id",
              "victim_account_id", "victim_location_zone", "status", "priority", "priority_score",
              "assigned_analyst", "data_quality", "missing_fields", "edge_case_tag", "data_as_of",
              "created_at", "updated_at"],
}


def sql_val(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        return f"'{v.isoformat()}'"
    if isinstance(v, list):
        return "array[" + ",".join(sql_val(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"


sql = ["-- FraudCast synthetic seed. Generated by generate_data.py (seed=%d). Run AFTER schema.sql." % SEED,
       "begin;"]
for name, rows in TABLES:
    cols = COLS.get(name, list(rows[0].keys()))
    df = pd.DataFrame(rows)[cols]
    df_out = df.copy()
    for col in df_out.columns:
        df_out[col] = df_out[col].map(lambda v: v.isoformat() if isinstance(v, datetime) else
                                      ("|".join(v) if isinstance(v, list) else v))
    for col in df_out.columns:  # keep whole numbers as integers in CSV (e.g. 9 not 9.0) for Supabase import
        vals = [r[col] for r in rows if r[col] is not None]
        if vals and all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
            df_out[col] = df_out[col].astype("Int64")
    df_out.to_csv(os.path.join(OUT, f"{name}.csv"), index=False)
    for r in rows:
        qcols = ", ".join(f'"{c}"' if c == "timestamp" else c for c in cols)
        sql.append(f"insert into {name} ({qcols}) values ({', '.join(sql_val(r[c]) for c in cols)});")
sql.append("commit;")
with open(os.path.join(OUT, "seed.sql"), "w", encoding="utf-8") as f:
    f.write("\n".join(sql))

print(f"Done. DEMO_NOW = {DEMO_NOW.isoformat()}  ->  files in {OUT}")
for name, rows in TABLES:
    print(f"  {name:<28}{len(rows):>4} rows")
