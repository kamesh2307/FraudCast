# FraudCast – Phase 7: Test, Go Live and Rehearse

| Step | What it adds | Where |
|---|---|---|
| 27 | **Safety evaluation**: 18 guardrail self-tests, 26 golden questions plus 10 off-topic, and 15 trick prompts, each with a pass/fail target | Menu → **Safety** |
| 28 | **Go-live checks**: settings, data, forecasts, knowledge base, vector search, reset snapshot and safety results, each with a "how to fix" line. Also a **Test AI connection** button. | Menu → **Status** |
| 29 | **Reset demo**: one click (type RESET) restores the fresh demo data and re-runs all forecasts in about 10 seconds | Status page |
| 30 | **Demo script, backup video and code-freeze plan** | `DEMO_SCRIPT.md` |

## What's in the zip

```
phase7.sql                         NEW  run once (see step 2)
app/layout.tsx                     CHANGED (Safety + Status in the menu)
app/safety/page.tsx                NEW
app/status/page.tsx                NEW
app/actions/ops.ts                 NEW
components/fc/OpsForms.tsx         NEW
lib/eval/*                         NEW (test sets, safety judge, suites, storage)
lib/ops/readiness.ts               NEW
DEMO_SCRIPT.md                     NEW
```

You need no new npm packages.

## Steps

### 1. Copy the files
Press `Ctrl + C` to stop the app. Copy `app`, `components` and `lib` into your project, choosing **Replace** when asked.

### 2. Restore fresh data and save the reset snapshot (Supabase → SQL Editor)
Your data has changed since Phase 6 testing, so start fresh. Run these **4 files in this order**, each in a new query:

| # | File | Where it is |
|---|---|---|
| 1 | `schema.sql` | Phase 2 folder |
| 2 | `data/seed.sql` | Phase 2 folder |
| 3 | `phase5.sql` | Phase 5 zip (needed again, because schema.sql rebuilds the document table) |
| 4 | `phase7.sql` | This zip |

If `phase7.sql` says *"this is not the fresh Phase 2 seed"*, it is protecting you: it refuses to save changed data as the "clean" copy. Re-run 1–3 first.

### 3. Rebuild the derived data (in the app)
Run `npm run dev`, then:
- **Overview** → **Run forecasts for all cases**
- **Knowledge** → **Build knowledge base** (Rebuild, if AI is on)

### 4. Run the safety suites
**Safety** → run all three. Expected in template mode (tested):

| Suite | Expected |
|---|---|
| Guardrail self-tests | **18/18** |
| Retrieval | **26/26** right section in top 5 (92% ranked first), **10/10** off-topic refused, draft never leaked |
| Trick prompts | **15/15** safe (4 refused outright, the rest "no answer" or safe facts) |

If AI is on, run them again. AI mode was tested with a deliberately hostile fake model; your real model's numbers will be your own.

### 5. Check Status
**Status** should say **"✓ Ready to demo"**. A warning about `DEMO_NOW` is fixed by adding it in Vercel (step 6).

### 6. Go live (Vercel)
1. In Vercel → Settings → Environment Variables, check these exist:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret key (never NEXT_PUBLIC_) |
   | `DEMO_NOW` | `2026-10-22T12:00:00+05:30` |
   | `LLM_ENABLED` | `true` or `false` |
   | AI keys (only if AI on) | `OPENAI_API_KEY`, `LLM_MODEL`, `EMBEDDING_MODEL` (or the Azure ones) |
   | Optional | `ACK_DELAY_SECONDS=20`, `ESCALATION_MINUTES=15`, `RAG_MIN_SIMILARITY` |

2. Run `git add . && git commit -m "Phase 7 demo-ready" && git push`, and wait for the deploy.
3. On the **live URL**: open **Status**, click **Test AI connection** (if AI is on), and confirm "Ready to demo".
4. **Test the fallback:** set `LLM_ENABLED=false` in Vercel, redeploy, and click through one case. Everything should still work (grey "template mode" badge). Then switch it back.

### 7. Rehearse
Follow `DEMO_SCRIPT.md` on the live URL, then **Status → Reset demo**. Do this at least twice.

## Good to know

- **Reset keeps:** the knowledge base, safety results and previous reset records. **Reset clears:** alerts, outcomes, AI summaries and the audit trail from practice.
- **Audit honesty:** the audit log is append-only, and Reset is the single exception. It is restricted to the server and every reset is logged as `DEMO_RESET`. Say so if a judge asks.
- **On the day, disable reset** by adding `DEMO_RESET_ENABLED=false` in Vercel, so nobody clicks it mid-demo by accident.

## Common problems

| Problem | Fix |
|---|---|
| Reset says "Did you run phase7.sql?" | Step 2 |
| phase7.sql: "not the fresh Phase 2 seed" | Re-run schema.sql → seed.sql → phase5.sql, then phase7.sql |
| Knowledge base empty after step 2 | Expected: schema.sql recreates the table. Click **Build knowledge base**. |
| Retrieval suite below 80% with AI on | Adjust `RAG_MIN_SIMILARITY` (Knowledge page tester), rebuild, re-run |
| Red-team suite fails with AI on | Open the failed row: it shows the exact answer and why. Paste it to me. |
| Safety or Status page times out on Vercel | They allow 60 seconds; with AI on, run suites locally (results are stored in the shared database) |
