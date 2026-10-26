# FraudCast – Phase 6: Act and Close the Loop

| Step | What it adds | Where you see it |
|---|---|---|
| 22 | **Alert composer**: choose a recipient, FraudCast drafts the alert, the analyst edits it, and **Approve** needs a tick box plus a confirmation | Case page → "Intervention alerts" |
| 23 | **Simulated reply**: the "team" acknowledges about 20 seconds after approval. **Simulate no reply** makes it **Overdue**, and you can then draft an escalation. | Same card |
| 24 | **Outcome form**: protected, withdrawn and unresolved amounts (unresolved is calculated, so the amounts always add up), actual zone, usefulness and override | Case page → "Record outcome" |
| 25 | **Manager dashboard**: money outcomes, response times, forecast accuracy vs baseline, false-alert and override rates, workload, alerts needing attention | Menu → **Dashboard** |
| 26 | **Audit log**: every draft, edit, approval, reply, outcome, forecast and AI output, filterable by case | Menu → **Audit log**, or **Audit trail** on a case |

## What's in the zip

You need **no SQL and no new npm packages**. Everything uses the tables from Phase 2.

```
app/layout.tsx                      CHANGED  (Dashboard + Audit log in the menu)
app/cases/[id]/page.tsx             CHANGED  (alerts + outcome sections, Audit trail link)
app/dashboard/page.tsx              NEW
app/audit/page.tsx                  NEW
app/actions/workflow.ts             NEW  (server-side buttons)
components/fc/AlertsSection.tsx     NEW
components/fc/AlertComposer.tsx     NEW
components/fc/AlertCountdown.tsx    NEW
components/fc/OutcomeSection.tsx    NEW
components/fc/OutcomeForm.tsx       NEW
lib/workflow/*                      NEW  (config, alert text, AI draft, simulation, outcome rules, metrics, audit)
```

## Steps

1. **Stop the app:** `Ctrl + C`.
2. **Copy the files:** copy `app`, `components` and `lib` into your project folder, choosing **Replace** when asked.
3. **Optional settings in `.env.local`** (the defaults are fine):
   ```
   ACK_DELAY_SECONDS=20     # real seconds before the simulated team acknowledges
   ESCALATION_MINUTES=15    # demo minutes before an alert counts as overdue
   ```
4. **Start:** `npm run dev`.
5. **Test** with the walkthrough below.
6. **Online:** `git add . && git commit -m "Phase 6 workflow" && git push`.

Recording outcomes **changes your demo data**: cases close and alerts are added. Phase 7 adds a **Reset demo** button. Until then you can restore everything by re-running `schema.sql`, then `seed.sql`, then clicking **Run forecasts for all cases** and **Build knowledge base**.

## Walkthrough (about 5 minutes)

**A. The happy path: SYN-CASE-0001**
1. Open SYN-CASE-0001 and scroll to **Intervention alerts**. The suggested recipient is **ATM operations – East**, because the rank-1 zone SYN-ZONE-22 is in SYN-JUR-EAST.
2. Click **Draft alert**. A draft appears with 7 labelled parts: case reference, priority, evidence, forecast, time sensitivity, requested review and the disclaimer.
3. Try to break it:
   - Approve without ticking the box: **blocked**.
   - Delete the disclaimer line and approve: **blocked**.
   - Type "please freeze SYN-ACC-0022" and approve: **blocked**, citing the alert template rules.
4. Fix it, tick the box and click **Approve and send (simulated)**. The status becomes **Pending**, a countdown runs, and after about 20 seconds it turns **Acknowledged**. The case status changes to Acknowledged too.
5. Open **Record outcome**, enter protected ₹5,00,000 and withdrawn ₹1,85,000. "Unresolved" shows ₹0. Pick zone **SYN-ZONE-05**, rate the alert 4, and save. The case is now **Closed** and the outcome shows "Forecast rank of actual zone #2 ✓".

**B. The unhappy path: SYN-CASE-0004** (insufficient evidence)
1. The suggested recipient is the **Fraud Escalation Desk** (escalation matrix rule).
2. Draft the alert. It names **no zone**, and approval asks for a **justification**.
3. Approve, then click **Simulate no reply (overdue)**. The alert turns red with an **Overdue** warning.
4. Click **Draft escalation to Fraud Escalation Desk**. The new draft says the earlier alert was not acknowledged in time.

**C. Manager view**
- **Dashboard**: value protected goes up, the override and false-alert rates appear, and the seeded pending alert (SYN-ALT-001) is listed under "Alerts needing attention".
- **Audit log**: filter by SYN-CASE-0001 to see the full trail, from the draft through edits, approval, acknowledgement and outcome.

## What I tested

| Test | Result |
|---|---|
| Template alert has all 7 fields and passes safety checks | ✓ |
| AI drafts with an invented amount, "freeze", "fraudster", missing fields or a timeout fall back to the template | ✓ all caught |
| Approve blocked when: box not ticked, disclaimer removed, field emptied, wrong case ID, "freeze" added, already approved, or forecast missing with no justification | ✓ |
| Auto-acknowledgement, manual acknowledgement, overdue, late acknowledgement, escalation draft, discard | ✓ |
| Outcome blocked when: amounts exceed the original, withdrawn below the amount already recorded, usefulness missing, override without a reason, time after the demo clock, case already closed | ✓ |
| Outcome saves the correct forecast rank, closes the case, sets amount at risk to the unresolved amount, and marks alerts "Action recorded" | ✓ |
| No alerts on closed cases; invalid case, alert or recipient IDs rejected | ✓ |
| Dashboard metrics and audit order | ✓ |
| **Total** | **63 / 63** against a fake database that enforces the schema's rules |

I could not run a real Next.js build or connect to your Supabase from here.

## Common problems

| Problem | Fix |
|---|---|
| `useActionState is not a function` | Your React is older than 19. Run `npm install react@latest react-dom@latest next@latest`. |
| Countdown reaches 0 but stays Pending | Refresh the page, or click **Simulate acknowledgement now**. Check that `ACK_DELAY_SECONDS` is a number. |
| "violates check constraint … outcomes" | Re-run Phase 2 `schema.sql`. The outcome rules rely on it. |
| Seeded alert SYN-ALT-001 never auto-acknowledges | Expected: it was created by the seed, not approved in the app. Use the buttons. |
| Want the demo data back | Re-run `schema.sql` and `seed.sql`, then **Run forecasts for all cases** and **Build knowledge base** (Phase 7 adds a one-click reset). |
