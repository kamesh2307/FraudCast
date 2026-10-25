# FraudCast – Phase 3: The Screens

This adds the four screens from the build plan:

| Step | Screen | Address |
|---|---|---|
| 9 | Fraud operations overview | `/` |
| 10 | Case queue (filters, sorting, priority score) | `/cases` |
| 11 | Case workspace (facts, timeline, exposure, missing data) | `/cases/SYN-CASE-0001` |
| 12 | Interactive money-flow graph | `/cases/SYN-CASE-0001/graph` |

No AI is used yet. The case summary is rule-based and clearly labelled as such.

## What's in the folder

```
app/
  layout.tsx                 <- REPLACES yours (banner + navigation)
  page.tsx                   <- REPLACES yours (Overview)
  error.tsx, loading.tsx     <- new
  cases/page.tsx             <- Case queue
  cases/[id]/page.tsx        <- Case workspace
  cases/[id]/not-found.tsx
  cases/[id]/graph/page.tsx  <- Money-flow graph
components/fc/
  ui.tsx                     <- badges, cards, tiles
  MoneyFlowGraph.tsx         <- the interactive graph (plain SVG, no extra library)
lib/
  calc.ts                    <- all the maths: priority, exposure, splits, graph layout
  data.ts                    <- all Supabase reads
  supabase.ts, format.ts, demo-time.ts, types.ts
.env.local.example
```

## Steps

1. **Check your Next.js version.** In the terminal, inside your project folder (where `package.json` is), run `npm list next`. It must be **15 or higher**. If it says 14, tell me and I'll adjust the code.
2. **Install the one new library:** `npm install @supabase/supabase-js`
3. **Copy the files.** Copy the `app`, `components` and `lib` folders into your project folder, choosing **"Replace"** when asked about `app/page.tsx` and `app/layout.tsx`.
   - **Keep** your existing `app/globals.css`. Don't delete it.
   - If your project has a `src` folder containing `app`, copy all three folders into `src/` instead.
4. **Add your Supabase keys.**
   - Copy `.env.local.example` to a new file called `.env.local` next to `package.json`.
   - In Supabase, go to **Project Settings → API Keys**. Copy the **secret key** (starts with `sb_secret_`), or the `service_role` key on the Legacy tab, into `SUPABASE_SERVICE_ROLE_KEY`.
   - Copy your **Project URL** (`https://xxxx.supabase.co`, shown in Project Settings → Data API or on the project home page) into `NEXT_PUBLIC_SUPABASE_URL`.
   - Never put `NEXT_PUBLIC_` in front of the secret key name. That would expose it to the browser.
5. **Run it:** `npm run dev`, then open http://localhost:3000
6. **Test it** with the checklist below.
7. **Put it online.**
   - In Vercel, open your project → **Settings → Environment Variables** and add the same 3 variables: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_NOW`.
   - Then run `git add . && git commit -m "Phase 3 screens" && git push`. Vercel deploys automatically.
   - Check that `.env.local` is **not** in the commit. The default `.gitignore` already excludes it.

## Test checklist

| Check | What you should see |
|---|---|
| Overview | 12 active cases, a **data-health warning naming SYN-CASE-0008** (stale), and an alerts tile showing 1 overdue |
| Click "Critical cases" tile | Queue filtered to Critical only |
| Queue default order | **SYN-CASE-0001 at the top** (highest amount at risk) |
| Hover a priority badge | Tooltip explaining the score calculation |
| Filter Status = Closed, Urgency = Critical | "No cases match these filters" + Clear filters link |
| Open SYN-CASE-0003 | Payment channel shows "⚠ Not available"; Missing information lists it |
| Open SYN-CASE-0008 | Red "Stale data" badge |
| Open SYN-CASE-0005 | "Already withdrawn" amount above ₹0; exposure lower than original |
| SYN-CASE-0002 → graph | Purple **SPLIT ×4** tag on the initial beneficiary |
| SYN-CASE-0005 → graph | Red cash-withdrawal box in the last column |
| Click any box or arrow | Details panel on the right; inferred signals marked "not proof" |
| Tab key on graph | Moves between boxes/arrows; Enter selects |
| Go to /cases/SYN-CASE-9999 | "Case not found" page |

## Common problems

| Problem | Fix |
|---|---|
| Red "Missing Supabase settings" box | `.env.local` is missing or named wrongly. Restart `npm run dev` after creating it. |
| "Could not read cases…" | Run `schema.sql` and `seed.sql` in Supabase (Phase 2). |
| Works locally, error on Vercel | Add the env vars in Vercel, then **Redeploy**. |
| `Can't resolve '@supabase/supabase-js'` | Run step 2. |
| Page has no styling | Tailwind isn't set up. Check Phase 1 created the app with Tailwind. |
| Type error about `params` during build | Your Next.js is older than 15. Tell me. |
| Everything says "days ago" | `DEMO_NOW` is missing or wrong. |

## Notes for later phases

- "Forecast" shows **Not run** everywhere. Phase 4 fills it. The priority score already includes a slot for forecast confidence (15%) and switches over automatically once forecasts exist.
- "Hops" counts transfer steps (victim → A → B = 2 hops), which is one more than the raw `transfer_hop` number.
