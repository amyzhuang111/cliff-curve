// node verify.mjs — checks index.html against Ping When's code-exact cliff formula. Exit 1 on any failure.
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); };
// reference (independent of page)
const Cref = d => (d > 110 || d < -40) ? 0 : 0.05 + 0.95 * Math.exp(-((d - 21) ** 2) / (2 * 22 ** 2));
const Sref = (d, P, H) => (70 * (100 * Cref(d)) + 40 * P + 30 * H) / 140;
// page's own functions, extracted from index.html
const src = html.match(/const PEAK=21, SIGMA=22;[\s\S]*?function S\(d,P,H\)\{[^\n]*\}/)?.[0];
ok(!!src, 'page defines PEAK=21, SIGMA=22, C(d), S(d,P,H)');
const { C, S } = new Function(src + '; return {C,S};')();
const expected = { 110: 0.0503, 70: 0.1295, 43: 0.6262, 42: 0.6524, 21: 1.0000, 0: 0.6524, '-21': 0.2036, '-40': 0.0703 };
for (const [d, v] of Object.entries(expected)) ok(Math.abs(C(+d) - v) < 5e-5 && Math.abs(C(+d) - Cref(+d)) < 1e-12, `C(${d})=${C(+d).toFixed(4)} (expected ${v})`);
for (const d of [-41, 111, -100, 200]) ok(C(d) === 0, `C(${d})=0 outside [-40,110]`);
let maxErr = 0; for (let d = -60; d <= 130; d += 0.25) for (const P of [0, 30, 100]) for (const H of [0, 20, 100]) maxErr = Math.max(maxErr, Math.abs(S(d, P, H) - Sref(d, P, H)));
ok(maxErr < 1e-12, `page S(d,P,H) == reference over grid (max err ${maxErr})`);
ok(S(21, 30, 20).toFixed(1) === '62.9' && S(0, 30, 20).toFixed(1) === '45.5', `S(21,30,20)=${S(21,30,20).toFixed(2)}, S(0,30,20)=${S(0,30,20).toFixed(2)}`);
let argmax = 0, best = -1; for (let d = -40; d <= 110; d += 0.01) if (C(d) > best) { best = C(d); argmax = d; }
ok(Math.abs(argmax - 21) < 0.02, `C peaks at d=${argmax.toFixed(2)} (21 days before the cliff)`);
// printed text
for (const s of ['C(d) = 0.05 + 0.95·exp(−(d−21)²/(2·22²))', 'C(d) = 0 outside [−40, 110]', 'S(d) = (70·(100·C(d)) + 40·P + 30·H) / 140', '12-month mark', '×0.84', '×0.72', '21 days before', 'S &lt; 38', 'S ≥ 60', 'not measured reply data'])
  ok(html.includes(s), `page prints "${s}"`);
for (const sym of ['d = days to cliff', 'C = cliff proximity', 'P = proof', 'H = org-shift', 'S = final score', '21 = peak', '22 = σ', '0.05 = floor'])
  ok(html.includes(sym), `symbol defined: "${sym}"`);
// fonts self-hosted
ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), 'no Google Fonts CDN reference');
const urls = [...html.matchAll(/url\((fonts\/[^)]+)\)/g)].map(m => m[1]);
ok(urls.length >= 5 && urls.every(u => existsSync(new URL('./' + u, import.meta.url))), `${urls.length} @font-face files exist locally`);
ok(['Fraunces', 'Inter', 'IBMPlexMono'].every(f => existsSync(new URL(`./fonts/OFL-${f}.txt`, import.meta.url))), 'OFL licence files shipped');
ok(/Fraunces,Georgia,"Times New Roman",serif/.test(html), 'system serif fallback kept');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
