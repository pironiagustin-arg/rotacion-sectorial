// Cálculos pesados que corren en GitHub Actions y se guardan como JSON estático en /data:
//   node scripts/compute.mjs picks     -> data/picks.json    (candidatas del día, para seguirlas en vivo)
//   node scripts/compute.mjs backtest  -> data/backtest.json (score reconstruido año a año vs SPY)
//   node scripts/compute.mjs funds     -> data/funds.json    (13F de grandes fondos)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const SEC_UA = "agustin-finance-app contacto@example.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// score.js usa imports absolutos del navegador: se copia con la ruta resuelta
const tmp = path.join(ROOT, "scripts", ".score.mjs");
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, "js/score.js"), "utf8").replace(/from "\/lib\/universe\.js"/g, `from "${pathToFileURL(path.join(ROOT, "lib/universe.js")).href}"`));
const S = await import(pathToFileURL(tmp).href);
const { UNIVERSE } = await import(pathToFileURL(path.join(ROOT, "lib/universe.js")).href);
const META = new Map(UNIVERSE.map((r) => [r[0], r]));
const withMeta = (row) => { const m = META.get(row.s); return m ? { ...row, sec: m[2], c: m[3], mk: m[4], ced: m[5], n: row.n && row.n !== row.s ? row.n : m[1] } : null; };

const cfg = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
const SB_URL = cfg.match(/supabaseUrl:\s*"([^"]+)"/)[1], SB_KEY = cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
async function sbAll(table, cols) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?select=${cols}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: "0-4999" } });
  if (!r.ok) throw new Error(`${table} ${r.status}`);
  return r.json();
}
async function loadBase() {
  const [snaps, fund] = await Promise.all([sbAll("snapshots", "symbol,data"), sbAll("fund_extra", "symbol,data")]);
  return { rows: snaps.map((d) => withMeta(d.data)).filter(Boolean), fund: new Map(fund.map((d) => [d.symbol, d.data])) };
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; try { out[i] = await fn(items[i], i); } catch { out[i] = null; } } }));
  return out;
}
// Desde GitHub Actions Yahoo bloquea las IPs: si hay SITE, los precios se piden a través de la app en Vercel
const SITE = process.env.SITE || "";
async function chart(sym, range = "5y", interval = "1wk") {
  for (let a = 0; a < 3; a++) {
    if (SITE) {
      const r = await fetch(`${SITE}/api/overview?view=chart&sym=${encodeURIComponent(sym)}&range=${range}&interval=${interval}`);
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (a + 1)); continue; }
      if (!r.ok) return null;
      return ((await r.json()).pts || []).map(([t, c]) => ({ t, c })).filter((p) => p.c > 0);
    }
    const r = await fetch(`https://query${a % 2 + 1}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`, { headers: { "User-Agent": UA } });
    if (r.status === 429) { await sleep(1500 * (a + 1)); continue; }
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const ts = res?.timestamp || [], c = res?.indicators?.adjclose?.[0]?.adjclose || res?.indicators?.quote?.[0]?.close || [];
    return ts.map((t, i) => ({ t: t * 1000, c: c[i] })).filter((p) => p.c != null && isFinite(p.c) && p.c > 0);
  }
  return null;
}
const pxAt = (pts, t) => { let b = null; for (const p of pts || []) { if (p.t <= t) b = p.c; else break; } return b; };
const med = (a) => { const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const avg = (a) => { const v = a.filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r2 = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const eligible = (r) => r.c !== "AR" && !(r.mk || "").includes("REF") && r.profile !== "crypto";

// ---------- Candidatas del día ----------
async function picks() {
  const { rows, fund } = await loadBase();
  const d = rows.map((r) => S.derive(r, null, fund.get(r.s)));
  S.scoreAll(d, {});
  const spy = (await chart("SPY", "5d", "1d"))?.at(-1)?.c ?? rows.find((r) => r.s === "SPY")?.px ?? null;
  const day = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const top = d.filter((r) => eligible(r) && S.ok(r.score)).sort((a, b) => b.score - a.score);
  const list = [...new Map([...top.filter((r) => r.cand), ...top.slice(0, 15)].map((r) => [r.s, r])).values()]
    .map((r) => ({ s: r.s, ced: r.ced, n: r.n, score: r.score, cand: !!r.cand, px: r.px, cur: r.cur, profile: r.profile, lynch: r.lynch }));
  const file = path.join(DATA, "picks.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { days: {} };
  prev.days[day] = { spy, picks: list };
  prev.updated = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(prev));
  console.log(`picks ${day}: ${list.length} (${list.filter((x) => x.cand).length} candidatas), SPY ${spy}`);
}

// ---------- Backtest anual ----------
// Para cada 1 de abril (los balances del año anterior ya están publicados) se reconstruye el score con los datos
// anuales de ese ejercicio y se mide el rendimiento de los 12 meses siguientes (o hasta hoy) contra el SPY.
const FY_KEYS = ["pe", "evEbitda", "evRev", "pb", "fcfY", "divY", "payout", "gm", "om", "nm", "roe", "roic", "revG", "ndEbitda", "fcfM", "rnd", "sbc", "invTurn", "eff", "capexInt", "intCov", "roa"];
function rowAt(r, fx, idx) {
  const fy = fx.fy || {}, v = (k) => fy[k]?.[idx] ?? null;
  const raw = { s: r.s, n: r.n, sec: r.sec, c: r.c, mk: r.mk, ced: r.ced, ind: r.ind, cur: r.cur, beta: r.beta };
  for (const k of FY_KEYS) raw[k] = v(k);
  raw.epsQ = v("epsG");
  raw.eps = S.ok(v("nm")) ? (v("nm") > 0 ? 1 : -1) : null;
  const sh0 = fy.sh?.[idx], shN = fy.sh?.at(-1);
  raw.mcap = r.mcap;
  const cut = {}; for (const [k, arr] of Object.entries(fy)) cut[k] = arr.slice(0, idx + 1);
  const latest = {}; for (const k of ["fcfM", "rnd", "sbc", "invTurn", "eff", "capexInt", "intCov", "roa"]) latest[k] = v(k);
  if (S.ok(sh0) && S.ok(shN) && idx > 0 && S.ok(fy.sh?.[idx - 1])) latest.dil = (sh0 / fy.sh[idx - 1] - 1) * 100;
  return S.derive(raw, null, { fy: cut, years: (fx.years || []).slice(0, idx + 1), latest });
}
async function backtest() {
  const { rows, fund } = await loadBase();
  const base = rows.filter((r) => r.c !== "AR" && !(r.mk || "").includes("REF") && fund.get(r.s)?.fy);
  console.log(`backtest: ${base.length} empresas con estados anuales`);
  const prices = new Map();
  const res = await pool([...base.map((r) => r.s), "SPY"], 6, async (s) => { const p = await chart(s); await sleep(120); return p; });
  [...base.map((r) => r.s), "SPY"].forEach((s, i) => prices.set(s, res[i]));
  console.log(`precios: ${[...prices.values()].filter(Boolean).length}`);
  const now = Date.now(), Y = new Date().getUTCFullYear();
  const periods = [];
  for (let y = Y - 4; y <= Y; y++) {
    const from = Date.UTC(y, 3, 1), to = Math.min(Date.UTC(y + 1, 3, 1), now);
    if (from >= now - 20 * 864e5) continue;
    const spy0 = pxAt(prices.get("SPY"), from), spy1 = pxAt(prices.get("SPY"), to);
    if (!spy0 || !spy1) continue;
    const snap = [];
    for (const r of base) {
      const fx = fund.get(r.s), fyEnd = Date.parse(fx.fyEnd || ""), n = fx.years?.length || 0;
      if (!fyEnd || !n) continue;
      // último ejercicio cerrado al menos 75 días antes de la fecha de armado
      let idx = -1;
      for (let i = n - 1; i >= 0; i--) { const end = fyEnd - (n - 1 - i) * 365.25 * 864e5; if (end + 75 * 864e5 <= from) { idx = i; break; } }
      if (idx < 0) continue;
      const p0 = pxAt(prices.get(r.s), from), p1 = pxAt(prices.get(r.s), to);
      if (!p0 || !p1) continue;
      const row = rowAt(r, fx, idx);
      row.ret = (p1 / p0 - 1) * 100; row.fyUsed = fx.years[idx];
      snap.push(row);
    }
    S.scoreAll(snap, {});
    const sc = snap.filter((r) => eligible(r) && S.ok(r.score)).sort((a, b) => b.score - a.score);
    if (sc.length < 40) continue;
    const q = 5, qs = Array.from({ length: q }, (_, i) => sc.slice(Math.floor((i * sc.length) / q), Math.floor(((i + 1) * sc.length) / q)));
    const top10 = sc.slice(0, 10), cands = sc.filter((r) => r.cand);
    const spyRet = (spy1 / spy0 - 1) * 100;
    periods.push({
      from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10), partial: to < Date.UTC(y + 1, 3, 1),
      n: sc.length, spy: r2(spyRet), all: r2(avg(sc.map((r) => r.ret))), allMed: r2(med(sc.map((r) => r.ret))),
      top10: { ret: r2(avg(top10.map((r) => r.ret))), med: r2(med(top10.map((r) => r.ret))), beat: top10.filter((r) => r.ret > spyRet).length, picks: top10.map((r) => ({ s: r.s, ced: r.ced, n: r.n, score: r.score, ret: r2(r.ret, 1), fy: r.fyUsed })) },
      cands: { n: cands.length, ret: r2(avg(cands.map((r) => r.ret))), med: r2(med(cands.map((r) => r.ret))), beat: cands.filter((r) => r.ret > spyRet).length },
      quint: qs.map((g) => ({ n: g.length, ret: r2(avg(g.map((r) => r.ret))), med: r2(med(g.map((r) => r.ret))), beat: g.filter((r) => r.ret > spyRet).length, score: r2(avg(g.map((r) => r.score)), 0) })),
      bottom10: { ret: r2(avg(sc.slice(-10).map((r) => r.ret))) },
    });
    console.log(`${y}: n=${sc.length} top10 ${r2(avg(top10.map((r) => r.ret)))}% vs SPY ${r2(spyRet)}%`);
  }
  if (!periods.length) { console.error("::error::Backtest sin períodos (¿sin precios?): se conserva el anterior"); process.exitCode = 1; return; }
  fs.writeFileSync(path.join(DATA, "backtest.json"), JSON.stringify({ generated: new Date().toISOString(), periods }));
}

// ---------- 13F: grandes fondos ----------
const FUNDS = [
  [1067983, "Berkshire Hathaway", "Warren Buffett"], [1336528, "Pershing Square", "Bill Ackman"], [1536411, "Duquesne Family Office", "Stanley Druckenmiller"],
  [1656456, "Appaloosa", "David Tepper"], [1040273, "Third Point", "Dan Loeb"], [1709323, "Himalaya Capital", "Li Lu"], [1061768, "Baupost", "Seth Klarman"],
  [1112520, "Akre Capital", "Chuck Akre"], [1569205, "Fundsmith", "Terry Smith"], [1103804, "Viking Global", "Andreas Halvorsen"],
  [1061165, "Lone Pine", "Stephen Mandel"], [1167483, "Tiger Global", "Chase Coleman"], [1135730, "Coatue", "Philippe Laffont"],
  [1697748, "ARK Invest", "Cathie Wood"], [1350694, "Bridgewater", "Ray Dalio (fundador)"],
];
const secGet = async (u) => { await sleep(130); const r = await fetch(u, { headers: { "User-Agent": SEC_UA } }); if (!r.ok) throw new Error(u + " " + r.status); return r; };
const _norm = (s) => String(s || "").toUpperCase().replace(/&AMP;/g, "&").replace(/[^A-Z0-9& ]/g, " ")
  .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|HLDGS?|HOLDINGS?|GROUP|SA|NV|AG|SE|ADR|ADS|SPONSORED|SPON|NEW|DEL|CL [A-C]|CLASS [A-C]|COM|THE|N V|S A|LP|LLC|TR|TRUST)\b/g, " ").replace(/\s+/g, " ").trim();
async function holdings(cik, acc) {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}/`;
  const idx = await (await secGet(base + "index.json")).json();
  const xmlName = (idx.directory.item || []).map((x) => x.name).find((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  if (!xmlName) return null;
  const xml = await (await secGet(base + xmlName)).text();
  const out = new Map();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const t = (k) => (m[1].match(new RegExp(`<(?:\\w+:)?${k}>([^<]*)<`)) || [])[1]?.trim();
    if (t("putCall")) continue;
    const cusip = t("cusip"), val = Number(t("value")), sh = Number(t("sshPrnamt"));
    const cur = out.get(cusip) || { name: t("nameOfIssuer"), cusip, value: 0, sh: 0 };
    cur.value += val || 0; cur.sh += sh || 0; out.set(cusip, cur);
  }
  return out;
}
// CUSIP -> ticker con OpenFIGI (gratis, 25 pedidos/min de 10 CUSIP). Se cachea en data/cusips.json.
async function figiMap(cusips) {
  const file = path.join(DATA, "cusips.json");
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const todo = [...new Set(cusips)].filter((c) => c && !(c in cache));
  console.log(`CUSIP nuevos para mapear: ${todo.length}`);
  for (let i = 0; i < todo.length; i += 10) {
    const chunk = todo.slice(i, i + 10);
    for (let a = 0; a < 4; a++) {
      const r = await fetch("https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chunk.map((c) => ({ idType: "ID_CUSIP", idValue: c }))) });
      if (r.status === 429) { await sleep(30000); continue; }
      if (!r.ok) break;
      const j = await r.json();
      chunk.forEach((c, k) => { const d = j[k]?.data || []; const us = d.find((x) => x.exchCode === "US") || d[0]; cache[c] = us ? us.ticker.replace("/", "-") : null; });
      break;
    }
    await sleep(2600);
  }
  fs.writeFileSync(file, JSON.stringify(cache));
  return cache;
}
async function funds() {
  const uniSyms = new Set(UNIVERSE.map((u) => u[0]));
  const raw = [];
  for (const [cik, name, who] of FUNDS) {
    try {
      const sub = await (await secGet(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)).json();
      const f = sub.filings.recent, hr = [];
      for (let i = 0; i < f.form.length && hr.length < 2; i++) if (f.form[i] === "13F-HR") hr.push({ acc: f.accessionNumber[i], date: f.filingDate[i], period: f.reportDate[i] });
      if (!hr.length || Date.parse(hr[0].date) < Date.now() - 200 * 864e5) continue;
      const cur = await holdings(cik, hr[0].acc), prev = hr[1] ? await holdings(cik, hr[1].acc) : null;
      if (cur) raw.push({ cik, name, who, hr, cur, prev });
    } catch (e) { console.log(`${name}: error ${e.message}`); }
  }
  const map = await figiMap(raw.flatMap((x) => [...x.cur.keys(), ...(x.prev ? x.prev.keys() : [])]));
  const ALIAS = { GOOG: "GOOGL", "BRK-A": "BRK-B", FOX: "FOXA", NWS: "NWSA", "BF-A": "BF-B", "LEN-B": "LEN", UA: "UAA" };
  const mapSym = (cusip) => { const t = map[cusip] || null; return t ? ALIAS[t] || t : null; };
  const managers = [], bySymbol = {};
  for (const { cik, name, who, hr, cur, prev } of raw) {
    {
      const total = [...cur.values()].reduce((s, x) => s + x.value, 0);
      // Clases distintas de la misma empresa (GOOGL/GOOG) se suman
      const agg = new Map();
      for (const x of cur.values()) { const t = mapSym(x.cusip) || x.cusip, p = prev?.get(x.cusip); const g = agg.get(t) || { t, name: x.name, cusips: [], value: 0, sh: 0, psh: 0, had: false }; g.value += x.value; g.sh += x.sh; if (p) { g.psh += p.sh; g.had = true; } g.cusips.push(x.cusip); agg.set(t, g); }
      const rows = [...agg.values()].map((x) => {
        const p = x.had ? { sh: x.psh } : null, tk = mapSym(x.cusips[0]), sym = tk && uniSyms.has(tk) ? tk : null;
        const chg = p && p.sh ? (x.sh / p.sh - 1) * 100 : null;
        const status = !prev ? null : !p ? "new" : chg > 5 ? "add" : chg < -5 ? "trim" : "hold";
        return { s: sym, t: tk, name: x.name, value: x.value, pct: r2((x.value / total) * 100), chg: r2(chg, 1), status };
      }).sort((a, b) => b.value - a.value);
      const curT = new Set([...cur.keys()].map((c) => mapSym(c) || c));
      const soldM = new Map();
      if (prev) for (const p of prev.values()) { const t = mapSym(p.cusip) || p.cusip; if (curT.has(t)) continue; const g = soldM.get(t) || { s: uniSyms.has(t) ? t : null, t: mapSym(p.cusip), name: p.name, value: 0, status: "sold" }; g.value += p.value; soldM.set(t, g); }
      const sold = [...soldM.values()].sort((a, b) => b.value - a.value);
      managers.push({ cik, name, who, date: hr[0].date, period: hr[0].period, total, n: rows.length, top: rows.slice(0, 25), news: rows.filter((r) => r.status === "new").slice(0, 10), adds: rows.filter((r) => r.status === "add").slice(0, 10), trims: rows.filter((r) => r.status === "trim").slice(0, 10), sold: sold.slice(0, 10) });
      for (const r of [...rows, ...sold]) if (r.s) (bySymbol[r.s] ||= []).push({ fund: name, who, pct: r.pct ?? null, chg: r.chg ?? null, status: r.status, value: r.value, period: hr[0].period });
      console.log(`${name}: ${rows.length} posiciones, ${rows.filter((r) => r.s).length} en el universo`);
    }
  }
  fs.writeFileSync(path.join(DATA, "funds.json"), JSON.stringify({ generated: new Date().toISOString(), managers, bySymbol }));
}

const mode = process.argv[2];
try {
  if (mode === "picks") await picks();
  else if (mode === "backtest") await backtest();
  else if (mode === "funds") await funds();
  else { console.error("modo: picks | backtest | funds"); process.exitCode = 1; }
} finally { fs.rmSync(tmp, { force: true }); }
