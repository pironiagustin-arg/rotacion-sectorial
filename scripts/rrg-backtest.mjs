// Backtest de las señales de rotación (RRG): ¿qué pasa después de "Por explotar"?
// Reproduce día a día la misma lógica de api/_signals.js (sin mirar el futuro) sobre ~10 años de velas diarias,
// mide el rendimiento posterior de cada señal y busca qué acciones del sector rinden más a partir de la señal.
//   node scripts/rrg-backtest.mjs   -> data/rrg_backtest.json
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { rrg } = await import(pathToFileURL(path.join(ROOT, "api/_lib.js")).href);
const { analyze, SECTOR_ETFS, INDUSTRY_ETFS } = await import(pathToFileURL(path.join(ROOT, "api/_signals.js")).href);
const { UNIVERSE } = await import(pathToFileURL(path.join(ROOT, "lib/universe.js")).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const SITE = process.env.SITE || "";

const CACHE = process.env.PX_CACHE ? (fs.existsSync(process.env.PX_CACHE) ? JSON.parse(fs.readFileSync(process.env.PX_CACHE, "utf8")) : {}) : null;
async function daily(sym) {
  if (CACHE?.[sym]) return CACHE[sym];
  const d = await daily0(sym);
  if (CACHE && d) CACHE[sym] = d;
  return d;
}
async function daily0(sym) {
  for (let a = 0; a < 3; a++) {
    try {
      if (SITE) {
        const r = await fetch(`${SITE}/api/overview?view=chart&sym=${encodeURIComponent(sym)}&range=10y&interval=1d&vol=1`);
        if (!r.ok) { await sleep(1500); continue; }
        return (await r.json()).pts.map(([t, c, v]) => ({ t, c, v }));
      }
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d&includeAdjustedClose=true`, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
      if (!r.ok) return null;
      const x = (await r.json())?.chart?.result?.[0];
      const ts = x?.timestamp || [], c = x?.indicators?.adjclose?.[0]?.adjclose || x?.indicators?.quote?.[0]?.close || [], v = x?.indicators?.quote?.[0]?.volume || [];
      return ts.map((t, i) => ({ t: t * 1000, c: c[i], v: v[i] ?? 0 })).filter((p) => p.c != null && isFinite(p.c) && p.c > 0);
    } catch { await sleep(1000); }
  }
  return null;
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}
const day = (t) => new Date(t).toISOString().slice(0, 10);
const avg = (a) => { const v = a.filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const med = (a) => { const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const r1 = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const quad = (p) => (p.x >= 100 ? (p.y >= 100 ? "leading" : "weakening") : p.y >= 100 ? "improving" : "lagging");

// ETF -> acciones del universo que pertenecen (por sector de BYMA o por perfil de industria)
const SECTOR_OF = { XLK: "tech", XLF: "fin", XLV: "health", XLY: "discr", XLP: "staples", XLE: "energy", XLI: "ind", XLB: "mat", XLU: "util", XLRE: "re", XLC: "comm" };
const PROFILE_OF = { SMH: ["semis"], IGV: ["software"], XBI: ["biotech"], IHI: ["medtech"], KRE: ["bank"], IAI: ["capmarkets"], ITA: ["aerospace"], XRT: ["retail"], XOP: ["oilgas"], GDX: ["mining"], COPX: ["mining"], JETS: ["airlines"] };

const H = [5, 10, 20, 40, 60];
async function main() {
  const etfs = { ...SECTOR_ETFS, ...INDUSTRY_ETFS };
  console.log("Bajando ETFs…");
  const spy = await daily("SPY");
  if (!spy?.length) throw new Error("Sin SPY");
  const etfData = {};
  for (const s of Object.keys(etfs)) { etfData[s] = await daily(s); await sleep(150); }
  // Perfiles de las acciones (de snapshots) para mapear industrias
  const cfg = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
  const SB = cfg.match(/supabaseUrl:\s*"([^"]+)"/)[1], KEY = cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
  const snaps = await (await fetch(`${SB}/rest/v1/snapshots?select=symbol,data`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "0-4999" } })).json();
  const tmp = path.join(ROOT, "scripts", ".score-rrg.mjs");
  fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, "js/score.js"), "utf8").replace(/from "\/lib\/universe\.js"/g, `from "${pathToFileURL(path.join(ROOT, "lib/universe.js")).href}"`));
  const meta = new Map(UNIVERSE.map((u) => [u[0], u]));
  const S = await import(pathToFileURL(tmp).href); fs.rmSync(tmp, { force: true });
  const { profileOf } = S;
  const fundRows = await (await fetch(`${SB}/rest/v1/fund_extra?select=symbol,data`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "0-4999" } })).json();
  const FUND = new Map(fundRows.map((d) => [d.symbol, d.data]));
  const SNAP = new Map(snaps.map((d) => { const m = meta.get(d.symbol); return [d.symbol, m ? { ...d.data, sec: m[2], c: m[3], mk: m[4], ced: m[5], n: m[1] } : null]; }));
  // Score con los balances anuales publicados a esa fecha (misma lógica que el backtest del score)
  const FY_KEYS = ["pe", "evEbitda", "evRev", "pb", "fcfY", "divY", "payout", "gm", "om", "nm", "roe", "roic", "revG", "ndEbitda", "fcfM", "rnd", "sbc", "invTurn", "eff", "capexInt", "intCov", "roa"];
  const scoreCache = new Map();
  function scoresAt(t) {
    const key = new Date(t).toISOString().slice(0, 7);
    if (scoreCache.has(key)) return scoreCache.get(key);
    const rows = [];
    for (const [s, r] of SNAP) {
      if (!r || r.c === "AR" || (r.mk || "").includes("REF")) continue;
      const fx = FUND.get(s); const fyEnd = Date.parse(fx?.fyEnd || ""), n = fx?.years?.length || 0; if (!fyEnd || !n) continue;
      let idx = -1; for (let i = n - 1; i >= 0; i--) { if (fyEnd - (n - 1 - i) * 365.25 * 864e5 + 75 * 864e5 <= t) { idx = i; break; } }
      if (idx < 0) continue;
      const fy = fx.fy || {}, v = (k) => fy[k]?.[idx] ?? null;
      const raw = { s, n: r.n, sec: r.sec, c: r.c, mk: r.mk, ced: r.ced, ind: r.ind, cur: r.cur, beta: r.beta, mcap: r.mcap };
      for (const k of FY_KEYS) raw[k] = v(k);
      raw.epsQ = v("epsG"); raw.eps = v("nm") != null ? (v("nm") > 0 ? 1 : -1) : null;
      const cut = {}; for (const [k, arr] of Object.entries(fy)) cut[k] = arr.slice(0, idx + 1);
      const latest = {}; for (const k of ["fcfM", "rnd", "sbc", "invTurn", "eff", "capexInt", "intCov", "roa"]) latest[k] = v(k);
      rows.push(S.derive(raw, null, { fy: cut, years: fx.years.slice(0, idx + 1), latest }));
    }
    S.scoreAll(rows, {});
    const m = new Map(rows.map((r) => [r.s, r.score]));
    scoreCache.set(key, m); return m;
  }
  const prof = new Map(snaps.map((d) => { const m = meta.get(d.symbol); return [d.symbol, m ? profileOf({ s: d.symbol, ind: d.data.ind, sec: m[2] }) : null]; }));
  const stocks = UNIVERSE.filter((u) => u[3] !== "AR" && /^[A-Z.\-]+$/.test(u[0]) && !u[4].includes("REF"));
  console.log(`Bajando ${stocks.length} acciones…`);
  const sp = await pool(stocks.map((u) => u[0]), 6, async (s) => { const d = await daily(s); await sleep(100); return d; });
  const stockPx = new Map(); stocks.forEach((u, i) => { if (sp[i]?.length > 300) stockPx.set(u[0], new Map(sp[i].map((p) => [day(p.t), p.c]))); });
  console.log(`acciones con precios: ${stockPx.size}`);

  const dates = spy.map((p) => day(p.t)), bc = spy.map((p) => p.c);
  const spyAt = new Map(dates.map((d, i) => [d, i]));
  const allRel = Object.fromEntries(H.map((h) => [h, []]));
  const spyMA = bc.map((_, i) => (i >= 199 ? bc.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : null));
  const REC = {}, CL = {};
  for (const [sym] of Object.entries(etfs)) {
    const d = etfData[sym]; if (!d?.length) { console.log(`sin datos ${sym}`); continue; }
    const m = new Map(d.map((p) => [day(p.t), p]));
    let last = null;
    const px = dates.map((dd) => { const p = m.get(dd); if (p) last = p; return p || (last ? { ...last, v: 0 } : null); });
    const closes = px.map((p) => p?.c ?? null); CL[sym] = closes;
    const trail = rrg(closes, bc, spy.map((p) => p.t));
    const tIdx = new Map(trail.map((p, i) => [day(p.t), i]));
    const wIdx = []; for (let i = 0; i < dates.length; i++) { const wk = new Date(spy[i].t); const next = spy[i + 1] ? new Date(spy[i + 1].t) : null; if (!next || next.getUTCDay() < wk.getUTCDay() || next - wk > 3 * 864e5) wIdx.push(i); }
    const wtrail = rrg(wIdx.map((i) => closes[i]), wIdx.map((i) => bc[i]), wIdx.map((i) => spy[i].t));
    const rs = (i, n) => (i - n >= 0 && closes[i] && closes[i - n] ? ((closes[i] / closes[i - n]) - (bc[i] / bc[i - n])) * 100 : null);
    const rec = new Array(dates.length).fill(null);
    let wk = 0;
    for (let i = 300; i < dates.length; i++) {
      const ti = tIdx.get(dates[i]); if (ti == null || ti < 12) continue;
      while (wk < wtrail.length && wtrail[wk].t <= spy[i].t) wk++;
      const wt = wtrail.slice(0, wk);
      const a = analyze(trail.slice(Math.max(0, ti - 40), ti + 1), wt.length >= 3 ? wt.slice(-10) : null, px.slice(Math.max(0, i - 80), i + 1), spy.slice(Math.max(0, i - 80), i + 1));
      if (!a) continue;
      const wq = wt.length ? quad(wt.at(-1)) : null, wqPrev = wt.length > 1 ? quad(wt.at(-2)) : null;
      rec[i] = { st: a.status, q: a.quadrant, wq, wcross: wq === "leading" && wqPrev === "improving" && wt.at(-1).t >= spy[i].t - 6 * 864e5, score: a.score, relVol: a.relVol, accum: a.accum, rs63: rs(i, 63), rs126: rs(i, 126), up: spyMA[i] ? bc[i] > spyMA[i] : null, ti };
      for (const h of H) { const v = i + h < dates.length && closes[i] && closes[i + h] ? ((closes[i + h] / closes[i]) - (bc[i + h] / bc[i])) * 100 : null; if (v != null) allRel[h].push(v); }
    }
    REC[sym] = { rec, trail, closes };
  }
  const relF = (sym, i, h) => { const c = CL[sym]; return i + h < dates.length && c[i] && c[i + h] ? ((c[i + h] / c[i]) - (bc[i + h] / bc[i])) * 100 : null; };
  const absF = (sym, i, h) => { const c = CL[sym]; return i + h < dates.length && c[i] && c[i + h] ? (c[i + h] / c[i] - 1) * 100 : null; };
  // Eventos: primer día en que se cumple la condición, con al menos 20 ruedas sin señal antes
  function eventsFor(pred) {
    const out = [];
    for (const sym of Object.keys(REC)) {
      const { rec, trail } = REC[sym]; let lastEv = -999, prev = false;
      for (let i = 300; i < dates.length; i++) {
        const r = rec[i]; const on = !!(r && pred(r, sym, i));
        if (on && !prev && i - lastEv > 20) {
          lastEv = i;
          let cross = null, exit = null; const ti = r.ti;
          for (let j = ti + 1; j < trail.length && j <= ti + 60; j++) { const q = quad(trail[j]); if (q === "leading") { cross = j - ti; break; } if (q === "lagging" && j - ti > 10) break; }
          if (cross != null) for (let j = ti + cross + 1; j < trail.length && j <= ti + 250; j++) { const q = quad(trail[j]); if (q === "weakening" || q === "lagging") { exit = j - ti; break; } }
          out.push({ sym, name: etfs[sym], group: SECTOR_ETFS[sym] ? "sector" : "industria", i, date: dates[i], score: r.score, relVol: r.relVol, accum: r.accum, wq: r.wq, rs126: r1(r.rs126, 1), cross, exit,
            rel: Object.fromEntries(H.map((h) => [h, r1(relF(sym, i, h))])), abs: Object.fromEntries(H.map((h) => [h, r1(absF(sym, i, h))])),
            relToExit: exit ? r1(relF(sym, i, exit)) : null, relFromCross: cross != null && exit ? r1(relF(sym, i + cross, exit - cross)) : null });
        }
        prev = on;
      }
    }
    return out;
  }
  const DEFS = [
    ["actual", "Por explotar (señal actual, RRG diario)", (r) => r.st === "por_explotar"],
    ["semanal_ok", "Por explotar + semanal en Improving/Leading", (r) => r.st === "por_explotar" && (r.wq === "improving" || r.wq === "leading")],
    ["tendencia", "Por explotar + sector ya ganándole al SPY a 6 meses", (r) => r.st === "por_explotar" && r.rs126 > 0],
    ["mercado", "Por explotar + S&P 500 sobre su media de 200 días", (r) => r.st === "por_explotar" && r.up],
    ["combo", "Por explotar + semanal OK + 6 meses positivo", (r) => r.st === "por_explotar" && (r.wq === "improving" || r.wq === "leading") && r.rs126 > 0],
    ["semanal_cruce", "RRG semanal cruza de Improving a Leading", (r) => r.wcross],
    ["semanal_cruce_tend", "RRG semanal cruza a Leading + 6 meses positivo", (r) => r.wcross && r.rs126 > 0],
    ["cruzo", "RRG diario ya cruzó a Leading (comprar en el cruce)", (r) => r.st === "cruzo"],
    ["solo_xl", "Por explotar solo en sectores XL", (r, sym) => r.st === "por_explotar" && sym.startsWith("XL")],
    ["ind_estricta", "Industrias con señal muy clara (score 75+, volumen +20%, acumulación 1,2x, semanal OK)", (r, sym) => r.st === "por_explotar" && !sym.startsWith("XL") && r.score >= 75 && r.relVol >= 1.2 && r.accum >= 1.2 && (r.wq === "improving" || r.wq === "leading")],
    ["xl_mas_estricta", "Sectores XL + industrias muy claras (la regla nueva)", (r, sym) => r.st === "por_explotar" && (sym.startsWith("XL") || (r.score >= 75 && r.relVol >= 1.2 && r.accum >= 1.2 && (r.wq === "improving" || r.wq === "leading")))],
  ];
  // ---------- Resumen de señales ----------
  const base = Object.fromEntries(H.map((h) => [h, r1(avg(allRel[h]))]));
  const sum = (evs) => ({
    n: evs.length,
    crossed: evs.filter((e) => e.cross != null).length,
    daysToCross: r1(med(evs.map((e) => e.cross)), 0),
    rel: Object.fromEntries(H.map((h) => [h, r1(avg(evs.map((e) => e.rel[h])))])),
    relMed: Object.fromEntries(H.map((h) => [h, r1(med(evs.map((e) => e.rel[h])))])),
    hit: Object.fromEntries(H.map((h) => { const v = evs.map((e) => e.rel[h]).filter((x) => x != null); return [h, v.length ? r1((v.filter((x) => x > 0).length / v.length) * 100, 0) : null]; })),
    abs: Object.fromEntries(H.map((h) => [h, r1(avg(evs.map((e) => e.abs[h])))])),
    relToExit: r1(avg(evs.map((e) => e.relToExit))), daysHeld: r1(med(evs.map((e) => e.exit)), 0), relFromCross: r1(avg(evs.map((e) => e.relFromCross))),
  });
  const variants = DEFS.map(([id, label, pred]) => { const ev = eventsFor(pred); return { id, label, ev, ...sum(ev) }; });
  variants.forEach((v) => console.log(v.id.padEnd(20), "n", String(v.n).padStart(4), "rel20", v.rel[20], "rel40", v.rel[40], "rel60", v.rel[60], "hit40", v.hit[40], "med40", v.relMed[40]));
  const events = variants[0].ev;
  const crossed = events.filter((e) => e.cross != null), notCrossed = events.filter((e) => e.cross == null);
  const bySym = {}; for (const e of events) (bySym[e.sym] ||= []).push(e);
  // Mejor variante (más ganancia a 40 ruedas con al menos 40 señales) para elegir acciones
  const best = [...variants].filter((v) => v.n >= 40).sort((a, b) => (b.rel[40] ?? -99) - (a.rel[40] ?? -99))[0];
  // Rotación por momentum: cada mes, los 3 sectores SPDR con más fuerza relativa a 3 y 6 meses, 1 mes de tenencia
  const mom = (n) => { const res = []; for (let i = 320; i + 21 < dates.length; i += 21) { const cand = Object.keys(SECTOR_ETFS).map((s) => ({ s, v: REC[s]?.rec[i]?.[n] })).filter((x) => x.v != null).sort((a, b) => b.v - a.v).slice(0, 3); if (cand.length < 3) continue; res.push(avg(cand.map((c) => relF(c.s, i, 21)))); } return { n: res.length, rel21: r1(avg(res)), hit: r1((res.filter((x) => x > 0).length / res.length) * 100, 0), annual: r1(avg(res) * 12, 1) }; };
  const momentum = { m3: mom("rs63"), m6: mom("rs126") };
  console.log("momentum", momentum);
  // Miembros de cada evento de la mejor variante
  function membersOf(ev) {
    const i = ev.i, sym = ev.sym, closes = CL[sym];
    const members = [...stockPx.keys()].filter((s) => { const u = meta.get(s); return SECTOR_OF[sym] ? u[2] === SECTOR_OF[sym] : (PROFILE_OF[sym] || []).includes(prof.get(s)); });
    const st2 = [];
    for (const s of members) {
      const P = stockPx.get(s), at = (k) => P.get(dates[k]);
      const p0 = at(i); if (!p0) continue;
      const back = (n) => (i - n >= 0 && at(i - n) && closes[i - n] ? (p0 / at(i - n) - closes[i] / closes[i - n]) * 100 : null);
      const fwd = (h) => (i + h < dates.length && at(i + h) && closes[i + h] ? ((at(i + h) / p0) - (closes[i + h] / closes[i])) * 100 : null);
      let hi = 0; for (let k = Math.max(0, i - 250); k <= i; k++) { const v = at(k); if (v > hi) hi = v; }
      const rs = [], re = []; for (let k = i - 59; k <= i; k++) { if (k < 1) continue; const a1 = at(k), a0 = at(k - 1); if (a1 && a0 && closes[k] && closes[k - 1]) { rs.push(a1 / a0 - 1); re.push(closes[k] / closes[k - 1] - 1); } }
      const mr = avg(rs), me = avg(re); let cov = 0, ve = 0; rs.forEach((x, k) => { cov += (x - mr) * (re[k] - me); ve += (re[k] - me) ** 2; });
      st2.push({ s, score: scoresAt(spy[i].t).get(s) ?? null, rs20: back(20), rs60: back(60), rs120: back(120), d52: hi ? (p0 / hi - 1) * 100 : null, beta: ve ? cov / ve : null, f20: fwd(20), f40: fwd(40), f60: fwd(60) });
    }
    // Combinación: ranking de fuerza relativa 6 meses + ranking de score (ambos de 0 a 1)
    const rk = (k) => { const v = st2.filter((m) => m[k] != null).sort((a, b) => a[k] - b[k]); v.forEach((m, j) => (m["r_" + k] = v.length > 1 ? j / (v.length - 1) : 0.5)); };
    rk("rs120"); rk("score");
    for (const m of st2) { m.combo = m.r_rs120 != null && m.r_score != null ? (m.r_rs120 + m.r_score) / 2 : null; m.momQ = m.score != null && m.score >= 55 ? m.rs120 : null; }
    return st2;
  }
  // Las acciones se evalúan sobre la señal del usuario (Por explotar) y, como control, sobre fechas cualquiera (cada mes, todos los ETFs)
  const pickEvents = variants[0].ev;
  for (const e of pickEvents) e.members = membersOf(e);
  const control = []; for (const sym of Object.keys(REC)) for (let i = 320; i + 60 < dates.length; i += 21) control.push({ sym, i });
  for (const e of control) e.members = membersOf(e);
  console.log(`eventos señal ${pickEvents.length}, control ${control.length}`);
  // ---------- Qué acciones del sector rinden más ----------
  const RULES = [
    ["score", "Las 3 con mejor score fundamental del sector", 1],
    ["combo", "Las 3 mejores combinando fuerza relativa 6 meses + score", 1],
    ["momQ", "Las 3 con más fuerza relativa 6 meses entre las de score 55+", 1],
    ["rs20", "Las 3 con más fuerza relativa contra el sector (20 ruedas)", 1], ["rs60", "Las 3 con más fuerza relativa (60 ruedas)", 1], ["rs120", "Las 3 con más fuerza relativa (6 meses)", 1],
    ["rs20", "Las 3 más rezagadas del sector (20 ruedas)", -1], ["beta", "Las 3 de mayor beta (las que más amplifican al sector)", 1], ["beta", "Las 3 de menor beta", -1],
    ["d52", "Las 3 más cerca de su máximo de 52 semanas", 1], ["d52", "Las 3 más lejos de su máximo (rebote)", -1],
  ];
  function evalRule(evs, k, dir) {
    const per = { 20: [], 40: [], 60: [] }, hits = { 40: [], 60: [] };
    for (const e of evs) {
      const ok = e.members.filter((m) => m[k] != null);
      if (ok.length < 6) continue;
      const pick = [...ok].sort((a, b) => (b[k] - a[k]) * dir).slice(0, 3);
      for (const h of [20, 40, 60]) { const v = avg(pick.map((m) => m["f" + h])); if (v != null) { per[h].push(v); if (h > 20) hits[h].push(v > 0 ? 1 : 0); } }
    }
    return { n: per[40].length, f20: r1(avg(per[20])), f40: r1(avg(per[40])), f60: r1(avg(per[60])), med40: r1(med(per[40])), hit40: r1(avg(hits[40]) * 100, 0), hit60: r1(avg(hits[60]) * 100, 0) };
  }
  const ruleRes = RULES.map(([k, label, dir]) => ({ key: k, dir, label, sig: evalRule(pickEvents, k, dir), ctl: evalRule(control, k, dir) })).sort((a, b) => (b.sig.f60 ?? -99) - (a.sig.f60 ?? -99));
  ruleRes.forEach((r) => console.log(r.label.padEnd(62), "señal f40", r.sig.f40, "f60", r.sig.f60, "hit60", r.sig.hit60, "| control f40", r.ctl.f40, "f60", r.ctl.f60, "hit60", r.ctl.hit60));
  // Promedio de todas las acciones del sector (para saber si conviene acción o ETF)
  const allMembers = { f20: r1(avg(pickEvents.flatMap((e) => e.members.map((m) => m.f20)))), f40: r1(avg(pickEvents.flatMap((e) => e.members.map((m) => m.f40)))), f60: r1(avg(pickEvents.flatMap((e) => e.members.map((m) => m.f60)))), med40: r1(med(pickEvents.flatMap((e) => e.members.map((m) => m.f40)))) };
  console.log("todas las acciones del sector tras la señal", allMembers);
  const out = {
    generated: new Date().toISOString(), from: dates[300], to: dates.at(-1), base,
    all: sum(events), crossed: sum(crossed), notCrossed: sum(notCrossed),
    sectors: sum(events.filter((e) => e.group === "sector")), industries: sum(events.filter((e) => e.group === "industria")),
    bySym: Object.fromEntries(Object.entries(bySym).map(([s, evs]) => [s, { name: etfs[s], ...sum(evs) }])),
    rules: ruleRes, allMembers, momentum,
    variants: variants.map(({ ev, ...v }) => v), best: best.id,
    events: pickEvents.map(({ members, i, ...e }) => ({ ...e, top: [...(members || [])].filter((m) => m.rs120 != null).sort((a, b) => b.rs120 - a.rs120).slice(0, 3).map((m) => ({ s: m.s, f60: r1(m.f60, 1) })) })).sort((a, b) => b.date.localeCompare(a.date)),
  };
  fs.writeFileSync(path.join(ROOT, "data", "rrg_backtest.json"), JSON.stringify(out));
  console.log("ok");
  if (CACHE) fs.writeFileSync(process.env.PX_CACHE, JSON.stringify(CACHE));
}
await main();
