# The Cliff Is a Curve

A computationally-artsy artefact plotting Ping When's real cliff-proximity scoring function.

**Live:** https://cliff-curve.vercel.app (see deployment report / Vercel dashboard if alias differs)

## What it is
The curve is computed in JavaScript from Ping When's scoring code (`cliffProximity` in `ping-when-real/src/lib/scoring.ts`, constants in `constants.ts`):

- `C(d) = 0` if `d > 110` or `d < -40`; otherwise `C(d) = 0.05 + 0.95·exp(−(d−21)²/(2·22²))`
- Peak: 21 days before the cliff (`CLIFF_PEAK_DAYS=21`), σ=22 days (`CLIFF_SIGMA=22`)
- Score inset (Cliff-week preset 70/40/30, 12-month mark, year weight 1.00): `S(d) = (70·(100·C(d)) + 40·P + 30·H)/140`, thresholds 60 reach / 38 warm. In live code the cliff category is `100·C·yearWeight` (24 mo ×0.84, 36 mo ×0.72), squash-combined on a 0–100 scale; P/H sliders are those 0–100 category scores.

Checkpoints (recomputed, not retyped): C(110)=0.0503, C(70)=0.1295, C(43)=0.6262, C(42)=0.6524, C(21)=1.0000, C(0)=0.6524, C(−21)=0.2036, C(−40)=0.0703.

Claim on page: “Storing only the cliff date throws away the window's shape.” The curve is the tool's stated scoring model, not measured reply data.

## How to run
Open `index.html` in a browser, or `python3 -m http.server` in this folder. Run `node verify.mjs` — 38 checks: extracts the page's own C/S functions and compares to an independent reference (checkpoints, zero outside [−40,110], peak at d=21, S grid), confirms every printed formula/symbol, and that fonts are self-hosted.

## Fonts
Self-hosted in `fonts/` (latin subsets, woff2, from Google Fonts): Fraunces, Inter, IBM Plex Mono — all SIL Open Font License 1.1 (licence texts shipped as `fonts/OFL-*.txt`). No third-party font CDN; Georgia / Times New Roman / serif fallback kept.

Exports (3200×1800 and 2160×2700, @2x) live in the author's asset folder; the page uses `?m=land` for the 1600×900 frame.
