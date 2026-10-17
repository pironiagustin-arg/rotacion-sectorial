// Seguimiento en vivo de las alertas "Por explotar" del RRG: registra cada alerta nueva (con sus 3 líderes a 6 meses)
// y recalcula día a día cómo reaccionaron el sector y esas acciones contra el S&P 500.
//   node scripts/rrg-live.mjs   -> data/rrg_live.json  (lo corre el sync diario después del cierre)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "rrg_live.json");
const SITE = process.env.SITE || "";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (t) => new Date(t).toISOString().slice(0, 10);
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
const MAXD = 60;

async function closes(sym) {
  for (let a = 0; a < 3; a++) {
    try {
      if (SITE) {
        const r = await fetch(`${SITE}/api/overview?view=chart&sym=${encodeURIComponent(sym)}&range=2y&interval=1d`);
        if (!r.ok) { await sleep(1500); continue; }
        return new Map((await r.json()).pts.map(([t, c]) => [day(t), c]));
      }
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`, { headers: { "User-Agent": UA } });
      if (!r.ok) { await sleep(1500); continue; }
      const x = (await r.json())?.chart?.result?.[0];
      const ts = x?.timestamp || [], c = x?.indicators?.adjclose?.[0]?.adjclose || x?.indicators?.quote?.[0]?.close || [];
      return new Map(ts.map((t, i) => [day(t * 1000), c[i]]).filter(([, v]) => v != null));
    } catch { await sleep(1000); }
  }
  return null;
}
// Señales del día y líderes: por la app en Vercel (Actions) o importando el handler (local)
async function api(qs) {
  if (SITE) { const r = await fetch(`${SITE}/api/signals${qs}`); return r.ok ? r.json() : null; }
  const m = await import(pathToFileURL(path.join(ROOT, "api/signals.js")).href);
  const q = Object.fromEntries(new URLSearchParams(qs.replace(/^\?/, "")));
  let out = null; await m.default({ query: q, headers: {} }, { status() { return this; }, setHeader() {}, json(j) { out = j; } });
  return out;
}

const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { signals: [] };
const today = day(Date.now() - 3 * 3600e3);

// 1) Carga inicial: alertas del último año según el backtest (misma fórmula, día a día)
if (!db.backfilled) {
  const bt = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "rrg_backtest.json"), "utf8"));
  const since = day(Date.now() - 370 * 864e5);
  const clear = (e) => (e.sym.startsWith("XL") || (e.score >= 75 && (e.relVol ?? 0) >= 1.2 && (e.accum ?? 0) >= 1.2 && (e.wq === "improving" || e.wq === "leading")));
  for (const e of bt.events.filter((e) => e.date >= since && clear(e))) {
    if (db.signals.some((s) => s.sym === e.sym && s.date === e.date)) continue;
    db.signals.push({ date: e.date, sym: e.sym, name: e.name, group: e.group, score: e.score, ema: e.ema ?? null, leaders: (e.top || []).map((t) => t.s), source: "backtest" });
  }
  db.backfilled = true;
}

// 2) Alertas nuevas de hoy
const sig = await api("");
const list = sig?.signals || [];
const now = Object.fromEntries(list.map((s) => [s.symbol, { status: s.status, quadrant: s.quadrant }]));
for (const s of list.filter((x) => x.status === "por_explotar" && x.group !== "accion")) {
  const recent = db.signals.find((x) => x.sym === s.symbol && (Date.parse(today) - Date.parse(x.date)) / 864e5 < 28);
  if (recent) continue;
  const L = await api(`?leaders=${s.symbol}`);
  db.signals.push({ date: today, sym: s.symbol, name: s.name, group: s.group, score: s.score, ema: !!(s.aboveEma20 && s.aboveEma200), leaders: (L?.leaders || []).slice(0, 3).map((x) => x.s), source: "live" });
  console.log(`Nueva alerta: ${s.symbol} (${s.name}) · líderes ${(L?.leaders || []).slice(0, 3).map((x) => x.s).join(", ")}`);
}

// 3) Recalcular la reacción de cada alerta de los últimos ~5 meses
db.signals = db.signals.filter((s) => Date.parse(today) - Date.parse(s.date) < 400 * 864e5).sort((a, b) => b.date.localeCompare(a.date));
const syms = [...new Set(["SPY", ...db.signals.flatMap((s) => [s.sym, ...s.leaders])])];
const px = new Map();
for (const s of syms) { px.set(s, await closes(s)); await sleep(120); }
const spy = px.get("SPY"); if (!spy) throw new Error("Sin SPY");
const dates = [...spy.keys()].sort();
for (const s of db.signals) {
  let i0 = dates.findIndex((d) => d >= s.date); if (i0 < 0) i0 = dates.length - 1;
  const D = dates.slice(i0, i0 + MAXD + 1), s0 = spy.get(D[0]);
  const path1 = (sym) => { const p = px.get(sym); if (!p) return null; let last = null; const b = p.get(D[0]); if (!b) return null; return D.map((d) => { const c = p.get(d) ?? last; last = c; return c ? r2(((c / b) - (spy.get(d) / s0)) * 100) : null; }); };
  const etf = path1(s.sym);
  const lpAll = s.leaders.map((l) => [l, path1(l)]).filter(([, p]) => p);
  const lp = lpAll.map(([, p]) => p);
  const lead = lp.length ? D.map((_, k) => { const v = lp.map((p) => p[k]).filter((x) => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; }) : null;
  const each = Object.fromEntries(s.leaders.map((l, k) => [l, path1(l)?.at(-1) ?? null]));
  const abs = (() => { const p = px.get(s.sym); const b = p?.get(D[0]); const c = p?.get(D.at(-1)); return b && c ? r2((c / b - 1) * 100) : null; })();
  Object.assign(s, { days: D.length - 1, dates: [D[0], D.at(-1)], etf, lead, each, lpaths: Object.fromEntries(lpAll), abs, now: now[s.sym] || null });
}
db.updated = new Date().toISOString();
fs.writeFileSync(FILE, JSON.stringify(db));
const at = (arr, k) => arr.map((s) => (s.etf?.[k] != null ? s.etf[k] : null)).filter((x) => x != null);
console.log(`Alertas seguidas: ${db.signals.length}`);
for (const s of db.signals) console.log(`${s.date} ${s.sym.padEnd(5)} d+${String(s.days).padStart(2)} sector ${s.etf?.at(-1)}% · líderes ${s.lead?.at(-1) ?? "—"}% vs SPY`);
