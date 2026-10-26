# FraudCast – Phase 9: Soft Cyberpunk Look with Light/Dark Switch

- **Dark (default):** near-black background, faint grid, soft pastel glow (rose, lavender, mint, pale cyan), gradient card edges, glowing active-page underline, gradient primary buttons, a pulsing dot on Critical/Overdue, darkened maps.
- **Light:** the clean Apple-style look from Phase 8, with the same pastel accents.
- **Switch:** ☀ / ☾ toggle in the header. Each browser remembers its choice. No flash of the wrong theme on load.

## What's in the zip (no SQL, nothing to install)
```
app/futuristic-theme.css        NEW   all the colours, glow, grid, dark map, dark graphs
app/layout.tsx                  CHANGED (imports the theme, header, switch, no-flash script)
components/fc/ThemeToggle.tsx   NEW
components/fc/NavBar.tsx        CHANGED (glowing underline in dark)
components/fc/ui.tsx            CHANGED (cards, tiles, badges, notices read colours from the theme)
```
Keep `app/apple-theme.css` from Phase 8: the new layout still imports it.

## Steps
1. `Ctrl + C` to stop the app.
2. Copy `app` and `components` into your project and choose **Replace**.
3. `npm run dev`, open http://localhost:3000, and click the ☀/☾ switch in the top right.
4. `git push`.

## Notes
- Every page changes automatically. Tables, forms, the money-flow graph, the trail line view and both maps all have dark versions.
- Text keeps readable contrast in both themes; status still uses words and icons, not just colour.
- "Reduce motion" turns off the pulse and hover effects.
- **On a projector,** dark themes can look washed out. Test in the room if you can, and switch to Light if needed.
- If one spot looks wrong (for example a box that stays white in dark mode), send a screenshot. It'll be a one-line fix.
