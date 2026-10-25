# FraudCast – Phase 2: Make the Data

Everything in this folder is **synthetic**. No real people, accounts or banks.
The map hexagons are real Pune locations, but all activity on them is invented.

## What's in the folder

| File | What it does |
|---|---|
| `schema.sql` | Creates the 11 database tables, with built-in checks such as SYN/DEMO IDs, amounts that must add up and an append-only audit log. |
| `generate_data.py` | Creates all the fake data. It uses the same seed every time, so you get the same data on every run. |
| `validate_data.py` | Runs the PRD Section 15 checks (DV-01 to DV-14) and ends with PASS or FAIL. |
| `data/*.csv` | The generated data. Open these in Excel to look at it. |
| `data/seed.sql` | The same data as SQL insert statements. **Use this file to load Supabase.** |

## Steps

1. **Copy the folder** into your project, for example as `fraudcast/data-gen/`.
2. **Install the 2 libraries** in your terminal: `pip install h3 pandas`.
3. **Generate the data:** `python generate_data.py`. It prints the row counts.
4. **Check the data:** `python validate_data.py`. It should end with `0 failure(s)`.
5. **Create the tables:** in Supabase, open SQL Editor → New query, paste the whole of `schema.sql` and click Run.
6. **Load the data:** start a new query, paste `data/seed.sql` and click Run. It should end with `COMMIT`.
7. **Check it loaded:** run `select status, count(*) from cases group by status;`. You should get 20 cases in total.
8. **Commit to GitHub:** `git add . && git commit -m "Phase 2 synthetic data" && git push`.

Use `seed.sql` rather than the CSV upload button. One field (`missing_fields`) is a list, and the CSV import doesn't handle lists well.

## What's inside

| Table | Rows | Notes |
|---|---|---|
| zones | 25 | Real H3 hexagons at resolution 8 (about 0.74 km² each) around central Pune |
| cash_out_points | 48 | Synthetic ATMs, branches and business correspondents, each placed inside its hexagon |
| accounts | 58 | 20 victims, 35 mules in 5 rings, and 3 "fresh" mules with no history |
| cases | 20 | 12 active and 8 closed |
| transactions | 121 | Transfers and cash withdrawals |
| historical_cashout_events | 30 | Past cases, which the Phase 4 engine learns patterns from |
| alerts | 11 | 1 pending, 1 overdue, 9 acknowledged |
| outcomes | 8 | Amounts reconcile to the rupee |
| predictions, rag_chunks | 0 | Filled in Phase 4 and Phase 5 |

## How the data is designed

There are 5 synthetic mule rings. Each ring usually cashes out in its **primary zone** (65% of the time), sometimes in a **secondary zone** (20%) and occasionally somewhere random (15%). Each ring also has its own habits for time of day, transfer speed and fraud type. These patterns give the Phase 4 scoring engine something real to find, and the 15% random share stops it from being perfectly right.

## Special test cases (use these in your demo)

| Case | What it tests |
|---|---|
| SYN-CASE-0002 | Money split into 4 accounts within 60 minutes |
| SYN-CASE-0003 | Missing payment channel, which should show a warning |
| SYN-CASE-0004 | Fresh mules with no history, which should show "Insufficient evidence" |
| SYN-CASE-0005 | Part of the money already withdrawn, so the amount at risk is lower than the original |
| SYN-CASE-0008 | Stale data, which should show a stale badge and lower confidence |
| SYN-CASE-0009 | Missing last-hop zone and account age |
| SYN-CASE-0011 | Alert overdue |
| SYN-CASE-0016 | Actual cash-out happened outside the forecast zones (an honest miss) |
| SYN-CASE-0017 | All money withdrawn before the complaint was even filed |
| SYN-CASE-0020 | Analyst overrode the forecast, with a reason |

## Important for later phases

- **Demo "now" is fixed at 22 Oct 2026, 12:00 IST** (`DEMO_NOW`). The app must use this as the current time, not the real clock. Otherwise every case will look days old. Put it in a Vercel environment variable: `DEMO_NOW=2026-10-22T12:00:00+05:30`.
- `priority` is a **first version** that leaves out forecast confidence. Phase 4 recalculates it with the full formula (40/25/20/15).
- `victim_location_zone` is for routing alerts only. **Never use it in the forecast** (PRD Section 13).
- `role_hint` (victim or mule) is a demo helper for building the data. Don't show it in the UI as a label on people.
- `outcomes.forecast_rank` and the correct/incorrect columns are empty for now. Phase 4 fills them after the forecasts are run.
- To change the city or the amount of data, edit the **SETTINGS** block at the top of `generate_data.py`, then repeat steps 3–6.
