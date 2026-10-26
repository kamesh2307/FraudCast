# FraudCast – Phase 8: Identities, Money Trail Map and Apple-style Look

| Change | What you get | Where |
|---|---|---|
| 1. Synthetic identities | Every one of the 58 accounts gets an Indian name, Aadhaar and PAN. Shown **masked** (`XXXX XXXX 1234`, `XXXXX1234F`) with a **Show** button. | Case page → Complaint summary · Money trail |
| 2. Money trail map | **Line view:** markers joined by lines, details under each marker (name, account, bank, received, holding, time). **Map view:** the same trail on the Pune map. | Case page → **Money trail map** |
| 3. Apple-style look | Frosted sticky header, pill navigation with an active state, SF/Segoe system font, large titles, soft rounded cards, Apple system colours, tinted status pills | Every page |

## Why the IDs look slightly "off" (on purpose)
Random 12-digit or `ABCDE1234F` numbers could belong to a real person. So:
- **Aadhaar** numbers start with **0 or 1** (UIDAI never issues these) and deliberately **fail the check digit**.
- **PAN** numbers use **Z** as the 4th letter, which is not a real holder type.
- The database **rejects** any value that breaks these rules (tested).
- Names and IDs are **never sent to the AI**, and holders are described as account holders, never as wrongdoers.

## What's in the zip
```
phase8.sql                          NEW  run once in Supabase
app/apple-theme.css                 NEW  (the look)
app/layout.tsx                      CHANGED (frosted header, pill nav)
app/cases/[id]/page.tsx             CHANGED (complainant identity + Money trail button)
app/cases/[id]/trail/page.tsx       NEW
components/fc/ui.tsx                CHANGED (Apple-style cards, tiles, badges, same names, nothing else to edit)
components/fc/NavBar.tsx            NEW
components/fc/TrailView.tsx         NEW
components/fc/MaskedId.tsx          NEW
lib/identity.ts, lib/trail.ts       NEW
```

## Steps
1. **Stop the app:** `Ctrl + C`.
2. **Load the identities:** in Supabase → SQL Editor, run `phase8.sql`. The last line should show **58**.
3. **Copy the files:** copy `app`, `components` and `lib` into your project, choosing **Replace** when asked. There's nothing to install.
4. **Check your Tailwind version:** open `package.json` and look for `"tailwindcss": "^4…"`.
   - **Version 4 (most likely):** the whole look changes everywhere.
   - **Version 3:** the header, cards, badges and tiles still change, but the colour/radius re-mapping is ignored. Tell me and I'll adapt it.
5. **Start the app:** `npm run dev`.
6. **Check it:** open SYN-CASE-0002 and click **Money trail map**. You should see a 4-way split at Hop 2, four orange "Holding" markers, and the red dashed line to the ATM. Switch to **Map view**.
7. **Put it online:** `git push`.

**Reset demo** does not touch accounts, so the names survive a reset. If you ever re-run `schema.sql` and `seed.sql`, run `phase8.sql` again afterwards. The full order is: schema → seed → phase5 → phase7 → phase8.

## Map view note
Accounts are placed at their **home-branch zone** (a bank-branch area), never at a person's address. This follows the PRD rule against showing residential locations, and the page says so. Accounts in the same zone are spread in a small circle so none hide each other.
