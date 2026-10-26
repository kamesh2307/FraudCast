# FraudCast – 3-Minute Demo Script

**Before you start:** Status page shows "✓ Ready to demo" → click **Reset demo** → open the **Overview** in one tab and **SYN-CASE-0001** in a second tab. Zoom the browser to 110%.

| Time | Screen | What you click | What you say |
|---|---|---|---|
| **0:00–0:20** | Overview | — | "Banks detect fraud, but once money hops across mule accounts, analysts have minutes to act and no view of *where it will be cashed out*. FraudCast is an intervention layer for bank fraud teams. Everything you'll see is synthetic data." |
| **0:20–0:40** | Case queue | Open queue, point to the top row | "Cases are ranked by a transparent priority score: amount at risk, transfer speed, recency and forecast confidence. SYN-CASE-0001, ₹6,85,000, is first." |
| **0:40–1:00** | Money-flow graph | Case 0001 → **Money-flow graph** | "One screen replaces manual trail reconstruction: who sent what, when, and which accounts still hold the money (orange)." |
| **1:00–1:35** | Forecast and map | **Cash-out forecast & map** | "The forecast ranks the most likely cash-out zones: Pune Hex 22 at 78%. It's plain maths, not a black box. Here's why: linked cash-out history, transfer speed, graph proximity. It even warns that cash-out may be imminent. And when evidence is thin, it says so instead of guessing." *(optional: show SYN-CASE-0004 "Insufficient evidence")* |
| **1:35–2:10** | Case page → Intervention alerts | **Draft alert** → **Approve and send** (tick box) | "AI drafts the alert; the analyst edits and approves. It can't send anything by itself, can't say 'freeze', and every number is checked against the data." *(the simulated team acknowledges about 20 seconds later)* |
| **2:10–2:30** | Analyst assistant | Ask *"Please freeze account SYN-ACC-0022"* | "The assistant answers only from approved procedures, cites its source, and refuses actions it isn't allowed to take." |
| **2:30–2:50** | Evaluation, then Safety | Scroll the summary tables | "We measure ourselves honestly. On synthetic data the engine beats a simple baseline: 63% vs 38% top-3 on closed cases. 15 of 15 trick prompts were handled safely. These are synthetic results, and proving them on real bank data is the pilot's job." |
| **2:50–3:00** | Dashboard | — | "Managers see money protected, response times and forecast accuracy. Next step: a single-bank pilot on historical data." |

## Backup lines for questions

- **"Is this AI predicting criminals?"** No. It forecasts *zones*, never people. Geography is context, not evidence, and the product refuses to label anyone.
- **"What if the AI is wrong or down?"** The forecast doesn't use AI at all. AI only explains and drafts, and every output is checked; if a check fails, a template is shown. With AI switched off, the whole demo still works.
- **"How accurate is it really?"** On synthetic data only: top-1 38% vs baseline 25% on 8 closed cases, and 47% vs 40% leave-one-out on 30 past cash-outs. Real accuracy needs a bank pilot. We don't claim it.
- **"Why not just freeze the account?"** That's a legal decision for authorized bank staff. FraudCast gets the right team the right evidence faster.

## Plan B: backup video (do this the day before)

1. Run the script once on the live URL and record the screen:
   - **Windows:** `Win + Alt + R` (Xbox Game Bar), or Clipchamp
   - **Mac:** `Cmd + Shift + 5`
2. Keep it under 3 minutes and save it on your laptop **and** a USB stick or phone.
3. If the live site fails during judging, say "Let me show you the recorded run" and play it.

## Code freeze (24 hours before)

1. Do a final `git push`, and confirm Vercel deployed successfully.
2. Status page shows ✓ Ready, all three Safety suites pass, and you've practised twice.
3. Add `DEMO_RESET_ENABLED=false` in Vercel and redeploy, so nobody can reset mid-demo. Before judging, reset once *before* adding it.
4. **No more code changes.** Only rehearse.
5. On the day: open the live URL 10 minutes early, check the Status page, and keep the video ready.
