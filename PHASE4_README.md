# FraudCast – Phase 4: The Forecast Engine and Map

Phase 4 adds the core feature: **where and when the money is likely to be withdrawn, and why.**

| Step | What it adds | Where you see it |
|---|---|---|
| 13 | Forecast engine: scores every zone and returns the top 3 zones plus "Other" | `/cases/SYN-CASE-0001/forecast` |
| 14 | "Insufficient evidence" rule and the cash-out time window | SYN-CASE-0004 |
| 15 | Simple baseline to compare against | Forecast page and `/evaluation` |
| 16 | Map of Pune with hexagons, ranked zones and ATMs | Forecast page |
| + | Priority score now includes forecast confidence (the 15% slot) | Case queue |

No AI is used yet. The forecast is plain maths, so every number can be explained.

## What's in the zip

Copy these into your project and **Replace** when asked. You need no database changes, because the `predictions` table from Phase 2 already has every column needed.

```
app/page.tsx                       CHANGED  (adds "Run forecasts for all cases" button)
app/layout.tsx                     CHANGED  (adds "Evaluation" to the menu)
app/cases/[id]/page.tsx            CHANGED  (forecast summary card + link)
app/cases/[id]/forecast/page.tsx   NEW      (forecast, explanation, map)
app/evaluation/page.tsx            NEW      (engine vs baseline)
app/actions/forecast.ts            NEW      (what the Run buttons do, on the server)
components/fc/ForecastMap.tsx      NEW
components/fc/SubmitButton.tsx     NEW
lib/forecast.ts                    NEW      (the engine – all the maths)
lib/forecast-data.ts               NEW      (save and load forecasts)
lib/explain.ts                     NEW      (plain-English explanation)
lib/evaluation.ts                  NEW      (accuracy tests)
lib/types.ts                       CHANGED  (new types added at the bottom)
```

Your other Phase 3 files (queue, graph, `calc.ts`, `data.ts`, `ui.tsx` and so on) stay as they are.

## Steps

1. **Stop the app.** Click in the terminal running `npm run dev` and press `Ctrl + C`.
2. **Install three libraries.** In the same terminal, inside your project folder:
   ```
   npm install leaflet h3-js
   npm install -D @types/leaflet
   ```
   - `leaflet` draws the map.
   - `h3-js` turns each zone's H3 ID into a hexagon shape.
   - `@types/leaflet` helps the code check itself.
3. **Copy the files.** Unzip, then copy the `app`, `components` and `lib` folders into your project folder (next to `package.json`, not inside `app`). Choose **Replace** for files that already exist.
4. **Start the app:** `npm run dev`
5. **Run the forecasts.** Open http://localhost:3000 and click **Run forecasts for all cases** (top right). Wait a few seconds until the button text changes back.
6. **Test it** with the checklist below.
7. **Put it online:** `git add . && git commit -m "Phase 4 forecast engine" && git push`. You don't need new Vercel settings. After it deploys, click **Run forecasts for all cases** once on the live site too, unless you already did it locally (both use the same Supabase).

## Test checklist (expected results with your data)

| Where | What you should see |
|---|---|
| Overview, before step 5 | Blue notice: "12 active case(s) have no forecast yet" |
| Overview, after step 5 | "Active forecasts 11 / 12 · 1 insufficient evidence". Critical cases changes from 3 to 2, because priority now uses forecast confidence. |
| Supabase SQL: `select count(*) from predictions;` | 77 |
| Case queue | "Forecast" column shows **Available**, except SYN-CASE-0004 (**Insufficient evidence**) |
| `/cases/SYN-CASE-0001/forecast` | #1 Pune Hex 22 **78%**, #2 Pune Hex 05 **9%**, #3 Pune Hex 14 **7%**, Other **6%**, with a red warning that similar past cases had usually cashed out by now |
| Same page, map | Pune map with red, orange and yellow hexagons labelled #1/#2/#3, plus coloured ATM dots |
| Same page, "Why this forecast" | Ranked first mainly because of linked cash-out history, with a score breakdown |
| `/cases/SYN-CASE-0004/forecast` | "Insufficient evidence to narrow the forecast. Continue monitoring or conduct additional review." and no ranked zones |
| `/cases/SYN-CASE-0016/forecast` | Retrospective note: actual zone SYN-ZONE-08, "not in top 3 ✕" (an honest miss) |
| `/cases/SYN-CASE-0018/forecast` | Actual zone is rank 2 ✓ |
| `/evaluation`, Test 1 (8 closed cases) | Top-1: engine **38%** vs baseline **25%**. Top-3: **63%** vs **38%**. |
| `/evaluation`, Test 2 (30 past cash-outs) | Top-1: **47%** vs **40%**. Top-3: **60%** vs **53%**. Time window: **75%** |
| Map checkbox | "Show past synthetic cash-out clusters" adds dark circles |
| Click "Re-run forecast" | Button shows "Running forecast…", then the page refreshes |

## How the engine works (simple version)

For every zone with at least one working ATM or branch, FraudCast gives five scores between 0 and 1. It then adds them up using the PRD weights:

| Factor | Weight | Question it answers |
|---|---|---|
| Linked cash-out history | 35% | Have accounts connected to this case cashed out here before? |
| Transaction velocity | 25% | Is the money moving fast, and is this zone linked to the latest transfers? |
| Graph proximity | 20% | How many transfers away is the money from an account that cashed out here? |
| Time-pattern similarity | 10% | Did past cash-outs here happen at a similar time of day? |
| ATM/branch accessibility | 10% | Are cash points open here during the window? This is context only. |

The total is then multiplied by **data quality**, which drops by 15% for each missing field and by 10% if the data is stale. The adjusted totals are turned into percentages that add up to exactly 100.

The engine says **"insufficient evidence"** instead of guessing when any of these is true:
- No account holding the money links to any past cash-out.
- The best score is below 0.40.
- The best zone is under 25%.

## Talking points for judges

- **It admits uncertainty.** SYN-CASE-0004 involves brand-new accounts with no history, so FraudCast refuses to guess.
- **It is honest about misses.** Ring 2's past cash-outs never happened in the zone it later used (SYN-ZONE-02). So cases 0014 and 0019 are missed, because the history held no evidence for that zone. We did not tune the engine to hide this.
- **It beats a simple baseline** on both tests. However, all data is synthetic, so this shows the pipeline works, **not** real-world accuracy.

## Changes from the PRD (deliberate, recorded as assumptions)

| PRD said | Built | Why |
|---|---|---|
| Softmax temperature 0.5 | 0.12 | With about 20 zones, 0.5 spreads probability so thinly that no zone could ever reach the 25% threshold |
| History factor divided by the maximum across zones | Divided by a fixed cap of 3 linked events | Dividing by the maximum always gives the top zone a perfect score, even on weak evidence |
| Window = 25th to 75th percentile of past timings | From **now** until the 75th percentile | Money can be withdrawn the moment it lands, so the useful message is "act before X" |
| Keep every prediction run | Keep the latest run per case. Every run stays in `audit_events` | Supabase returns at most 1,000 rows by default, so old runs could hide new ones |

All engine settings are in `CONFIG` at the top of `lib/forecast.ts`. If you change one, also change `MODEL_VERSION`.

## Common problems

| Problem | Fix |
|---|---|
| `Module not found: Can't resolve 'leaflet'` or `'h3-js'` | Run step 2, then restart `npm run dev` |
| Type error mentioning `leaflet` during build | Run `npm install -D @types/leaflet` |
| Map area is grey but zones and dots show | The map tiles need internet. The ranked list still works. |
| "Could not save forecasts…" | Check the Phase 2 `schema.sql` ran (the `predictions` table must exist) |
| Clicking Run does nothing | Check the terminal for a red error and paste it to me |
| Numbers differ from the checklist | Check `DEMO_NOW=2026-10-22T12:00:00+05:30` is in `.env.local`, then click Run forecasts again |
