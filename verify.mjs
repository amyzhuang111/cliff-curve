// node --experimental-websocket verify.mjs   (Node 20; plain `node` on Node >= 22)
// Checks index.html against Ping When's REAL scoring code, glyph coverage of the self-hosted fonts,
// and the rendered layout (claim vs curve, label sizes, resize) in headless Chrome. Exit 1 on any failure.
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');
const PW = process.env.PING_WHEN_DIR || join(here, '..', 'ping-when-real');
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); };
const section = t => console.log(`\n== ${t}`);

section('A. page formula + printed text');
const src = html.match(/const PEAK=21, SIGMA=22;[\s\S]*?function S\(d,P,H\)\{[^\n]*\}/)?.[0];
ok(!!src, 'page defines PEAK=21, SIGMA=22, C(d), S(d,P,H)');
const { C, S } = new Function(src + '; return {C,S};')();
const expected = { 110: 0.0503, 70: 0.1295, 43: 0.6262, 42: 0.6524, 21: 1.0000, 0: 0.6524, '-21': 0.2036, '-40': 0.0703 };
for (const [d, v] of Object.entries(expected)) ok(Math.abs(C(+d) - v) < 5e-5, `C(${d})=${C(+d).toFixed(4)} (expected ${v})`);
for (const d of [-41, 111]) ok(C(d) === 0, `C(${d})=0 outside [-40,110]`);
let argmax = 0, best = -1; for (let d = -40; d <= 110; d += 0.01) if (C(d) > best) { best = C(d); argmax = d; }
ok(Math.abs(argmax - 21) < 0.02, `C peaks at d=${argmax.toFixed(2)} (21 days before the cliff)`);
for (const s of ['C(d) = 0.05 + 0.95·exp(−(d−21)²/(2·22²))', 'C(d) = 0 outside [−40, 110]', 'S(d) = (70·(100·C(d)) + 40·P + 30·H) / 140', '12-month mark', '×0.84', '×0.72', '21 days before', 'S &lt; 38', 'S ≥ 60', 'not measured reply data', 'rounded'])
  ok(html.includes(s), `page prints "${s}"`);
const WL = "Weights shown: Ping When's 'cliff week' preset 70/40/30 (default 30/40/30).";
ok(html.includes(WL), 'page prints weights line: ' + WL);
{ const cs = readFileSync(join(PW, 'src/lib/constants.ts'), 'utf8');
  ok(/DEFAULT_WEIGHTS[^=]*=\s*\{\s*cliff:\s*30,\s*proof:\s*40,\s*shift:\s*30/.test(cs), 'Ping When DEFAULT_WEIGHTS is 30/40/30 (constants.ts)');
  ok(/id: "cliff"[\s\S]{0,120}weights: \{ cliff: 70, proof: 40, shift: 30 \}/.test(cs), "Ping When 'cliff' preset is 70/40/30 (constants.ts)"); }
for (const sym of ['d = days to cliff', 'C = cliff proximity', 'P = proof', 'H = org-shift', 'S = final score', '21 = peak', '22 = σ', '0.05 = floor'])
  ok(html.includes(sym), `symbol defined: "${sym}"`);

section(`B. against Ping When's real code (${PW}/src/lib/scoring.ts)`);
let real = null;
if (!existsSync(join(PW, 'src/lib/scoring.ts'))) ok(false, `ping-when repo not found at ${PW} (set PING_WHEN_DIR)`);
else {
  const out = join(mkdtempSync(join(tmpdir(), 'cc-')), 'scoring.mjs');
  const entry = join(here, '.verify-entry.ts');
  execFileSync('bash', ['-c', `printf '%s' "export * from '${PW}/src/lib/scoring.ts'; export * from '${PW}/src/lib/constants.ts';" > "${entry}" && npx -y esbuild@0.28.2 "${entry}" --bundle --format=esm --platform=node --alias:@=${PW}/src --outfile="${out}" --log-level=error; rc=$?; rm -f "${entry}"; exit $rc`], { stdio: 'inherit' });
  real = await import(pathToFileURL(out).href);
  let rev = ''; try { rev = execFileSync('git', ['-C', PW, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch {}
  ok(true, `bundled real scoring.ts + constants.ts with esbuild (ping-when-real @ ${rev})`);
  ok(real.CLIFF_PEAK_DAYS === 21 && real.CLIFF_SIGMA === 22, `constants CLIFF_PEAK_DAYS=${real.CLIFF_PEAK_DAYS}, CLIFF_SIGMA=${real.CLIFF_SIGMA}`);
  ok(real.REACH_THRESHOLD === 60 && real.WARM_THRESHOLD === 38, `thresholds REACH=${real.REACH_THRESHOLD}, WARM=${real.WARM_THRESHOLD}`);
  ok(real.YEAR_WEIGHT[12] === 1 && real.YEAR_WEIGHT[24] === 0.84 && real.YEAR_WEIGHT[36] === 0.72, `YEAR_WEIGHT 12:${real.YEAR_WEIGHT[12]} 24:${real.YEAR_WEIGHT[24]} 36:${real.YEAR_WEIGHT[36]}`);
  const cw = real.PRESETS.find(p => p.id === 'cliff')?.weights;
  ok(cw && cw.cliff === 70 && cw.proof === 40 && cw.shift === 30, `"Cliff week" preset weights ${JSON.stringify(cw)}`);
  let maxC = 0, nC = 0; for (let d = -80; d <= 160; d += 0.25) { maxC = Math.max(maxC, Math.abs(C(d) - real.cliffProximity(d))); nC++; }
  ok(maxC === 0, `page C(d) == real cliffProximity(d) at ${nC} points d∈[-80,160] step 0.25 (max |Δ| ${maxC})`);
  // end-to-end: real scoreResearchers on a synthetic person whose 12-month mark is d days away,
  // one proof signal (release, strength P/100) and one shift signal (reorg, strength H/100) dated today.
  const asOf = new Date(Date.UTC(2026, 9, 19)); const iso = t => t.toISOString().slice(0, 10);
  let maxS = 0, nS = 0, skipped = 0, statusMismatch = 0;
  for (let d = -60; d <= 130; d++) {
    const ann = new Date(asOf.getTime() + d * 864e5);
    const start = new Date(Date.UTC(ann.getUTCFullYear() - 1, ann.getUTCMonth(), ann.getUTCDate()));
    for (const P of [0, 10, 30, 55, 100]) for (const H of [0, 20, 45, 100]) {
      const signals = [];
      if (P) signals.push({ type: 'release', date: iso(asOf), title: 'p', detail: '', strength: P / 100 });
      if (H) signals.push({ type: 'reorg', date: iso(asOf), title: 'h', detail: '', strength: H / 100 });
      const [row] = real.scoreResearchers([{ id: 'x', name: 'x', archetype: '', roleType: '', org: '', location: '', roleStart: iso(start), focus: '', workHook: '', signals }], cw, asOf);
      const m12 = row.cliffMarks.find(m => m.months === 12);
      if (m12.date !== iso(ann)) { skipped++; continue; }
      maxS = Math.max(maxS, Math.abs(row.scoreExact - S(d, P, H))); nS++;
      const s = Math.round(S(d, P, H)), pageBand = s < 38 ? 'wait' : s >= 60 ? 'reach-or-warm' : 'warm';
      if (pageBand === 'wait' ? row.status !== 'wait' : pageBand === 'warm' ? row.status !== 'warm' : row.status === 'wait') statusMismatch++;
    }
  }
  ok(nS > 3500 && maxS < 1e-9, `page S(d,P,H) == real scoreResearchers().scoreExact on ${nS} cases (Cliff week, 12-mo mark; ${skipped} month-end dates skipped) max |Δ| ${maxS.toExponential(1)}`);
  ok(statusMismatch === 0, `page threshold bands agree with real status on all cases on rounded S, as the code does (${statusMismatch} mismatches; reach additionally needs open window)`);
}

section('C. fonts + glyph coverage + no-JS fallback');
const ns = html.match(/<noscript>[\s\S]*?<img src="([^"]+)"[^>]*alt="([^"]+)"/);
ok(!!ns && existsSync(join(here, ns[1])) && ns[2].length > 60, `<noscript> static chart ${ns?.[1]} exists with alt text`);
ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), 'no Google Fonts CDN reference');
const faces = [...html.matchAll(/@font-face\{font-family:"?([^;"]+)"?;[^}]*url\((fonts\/[^)]+)\)/g)].map(m => ({ fam: m[1], file: m[2] }));
ok(faces.length === 5 && faces.every(f => existsSync(join(here, f.file))), `${faces.length} @font-face files exist locally`);
ok(['Fraunces', 'Inter', 'IBMPlexMono'].every(f => existsSync(join(here, `fonts/OFL-${f}.txt`))), 'OFL licence files shipped');
ok(/Fraunces,Georgia,"Times New Roman",serif/.test(html), 'system serif fallback kept');

section('D. rendered layout in headless Chrome (real-time, via CDP)');
const types = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ttf': 'font/ttf' };
const srv = createServer((q, r) => { const f = join(here, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!f.startsWith(here) || !existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dport = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${dport}`, '--window-size=1700,1400', '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'ccchrome-')), 'about:blank'], { stdio: 'ignore' });
let layout = null;
try {
  let tabs; for (let i = 0; i < 75 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => (ws.onopen = r));
  let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); pend[m.id]?.(m); delete pend[m.id]; };
  const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.navigate', { url: `${base}/layout-check.html` });
  for (let i = 0; i < 80 && !layout; i++) { await sleep(250); const r = await send('Runtime.evaluate', { expression: "document.getElementById('RESULT')?.textContent||''", returnByValue: true }); if (r.result?.result?.value) layout = JSON.parse(r.result.result.value); }
  ws.close();
} finally { chrome.kill(); srv.close(); }
ok(!!layout, 'layout-check.html ran');
if (layout) {
  for (const [k, v] of Object.entries(layout)) {
    ok(v.claimLines === 2 && v.claimCurveHits.every(h => h === 0), `${k} (${v.width}px): serif claim lines' bboxes (+4px pad) contain 0 curve points [${v.claimCurveHits}]`);
    ok(v.minSvgLabelPx >= 11, `${k}: smallest SVG label ${v.minSvgLabelPx}px >= 11px`);
    if (!v.small) ok(v.liWrap.length === 0, `${k}: no symbol definition wraps${v.liWrap.length ? ' — WRAPS: ' + v.liWrap.join(' | ') : ''}`);
    ok(v.wl && v.wl.visible && v.wl.text === WL, `${k}: weights line rendered visibly`);
    ok(v.wl && v.wl.inPanel && v.wl.noHScroll, `${k}: weights line inside its panel, no horizontal overflow`);
    if (k === 'land' || k === 'port') ok(v.wl && v.wl.mainBottom <= v.wl.innerHeight, `${k}: page still fits ${v.width}x${v.wl.innerHeight} frame (bottom ${v.wl.mainBottom})`);
    if (v.small) ok(v.has42, `${k}: d=42 axis tick present on mobile`);
  }
  ok(layout['resize:to375'].small && layout['resize:to375'].heroViewBox === layout.m375.heroViewBox, `resize 1080→375 re-runs mobile layout (viewBox ${layout['resize:to375'].heroViewBox})`);
  ok(!layout['resize:back1080'].small && layout['resize:back1080'].heroViewBox === layout.port.heroViewBox, `resize 375→1080 restores desktop layout (viewBox ${layout['resize:back1080'].heroViewBox})`);
  // glyph coverage: every character rendered in a family must be in that family's woff2 cmap
  const need = {}; for (const v of Object.values(layout)) for (const [fam, chars] of Object.entries(v.charsByFont)) need[fam] = [...new Set((need[fam] || '') + chars)].join('');
  const files = {}; for (const f of faces) (files[f.fam] ||= []).push(join(here, f.file));
  const py = `import json,sys\nfrom fontTools.ttLib import TTFont\nreq=json.loads(sys.argv[1]);out={}\nfor fam,(chars,fs) in req.items():\n  for f in fs:\n    cm=TTFont(f).getBestCmap();out[f]=[c for c in chars if ord(c) not in cm]\nprint(json.dumps(out))`;
  const req = {}; for (const [fam, chars] of Object.entries(need)) { if (files[fam]) req[fam] = [chars, files[fam]]; else ok(false, `text rendered in "${fam}" which is not self-hosted`); }
  const missing = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify(req)]).toString());
  for (const [f, m] of Object.entries(missing)) { const fam = faces.find(x => join(here, x.file) === f).fam; ok(m.length === 0, `${f.split('/').pop()} covers all ${need[fam].length} chars rendered in ${fam}${m.length ? ' — MISSING ' + m.join('') : ''} (non-ASCII: ${[...need[fam]].filter(c => c > '~').join('')})`); }
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
