// Amplitud del universo (acciones que cotizan en EE.UU.): % sobre la media de 200 y 50 ruedas, y nuevos máximos/mínimos
// de 52 semanas por día. Corre después del cierre (workflow sync-screener) y escribe data/breadth.json.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { UNIVERSE } = await import(pathToFileURL(path.join(ROOT, "lib/universe.js")).href);
const { techScore, coilSetup } = await import(pathToFileURL(path.join(ROOT, "lib/tech.js")).href);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const syms = [...new Set(UNIVERSE.filter((r) => r[3] !== "AR" && !/\./.test(r[0]) && !/^\^/.test(r[0])).map((r) => r[0]))];
async function chart(s, bust = false) {
  for (let a = 0; a < 3; a++) {
    try {
      const host = bust || a ? "query2" : "query1";
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=2y&interval=1d${bust || a ? `&_=${Date.now()}` : ""}`, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(r.status);
      const x = (await r.json()).chart.result[0], q = x.indicators.quote[0], c = q.close;
      const m = new Map(x.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), c[i]]).filter(([, v]) => v != null));
      const ix = c.map((v, i) => i).filter((i) => c[i] != null && q.high[i] != null && q.low[i] != null);
      m.ohlc = { h: ix.map((i) => q.high[i]), l: ix.map((i) => q.low[i]), c: ix.map((i) => c[i]), v: ix.map((i) => q.volume[i] || 0) };
      return m;
    } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return null;
}
// Sectores (SPDR) y subsectores (ETF temáticos), para el ranking por fuerza relativa
const SECT = { XLK: "tech", XLF: "fin", XLV: "health", XLY: "discr", XLP: "staples", XLE: "energy", XLI: "ind", XLB: "mat", XLU: "util", XLRE: "re", XLC: "comm" };
const SUB = {
  XLK: [["SMH", "Semiconductores"], ["IGV", "Software"], ["CIBR", "Ciberseguridad"], ["CLOU", "Nube"], ["AIQ", "Inteligencia artificial"], ["IYW", "Hardware y tecnología EE.UU."]],
  XLF: [["KRE", "Bancos regionales"], ["KBE", "Bancos"], ["IAI", "Brokers y bolsas"], ["KIE", "Seguros"], ["BLOK", "Blockchain"]],
  XLV: [["XBI", "Biotecnología"], ["IHI", "Equipos médicos"], ["XPH", "Farmacéuticas"], ["IHF", "Servicios de salud"]],
  XLY: [["XRT", "Retail"], ["ITB", "Constructoras de viviendas"], ["CARZ", "Autos"], ["PEJ", "Ocio y viajes"]],
  XLP: [["PBJ", "Alimentos y bebidas"]],
  XLE: [["XOP", "Exploración y producción"], ["OIH", "Servicios petroleros"], ["URA", "Uranio"], ["TAN", "Solar"], ["ICLN", "Energía limpia"]],
  XLI: [["ITA", "Defensa y aeroespacial"], ["JETS", "Aerolíneas"], ["IYT", "Transporte"], ["PAVE", "Infraestructura"]],
  XLB: [["GDX", "Mineras de oro"], ["SIL", "Mineras de plata"], ["COPX", "Cobre"], ["LIT", "Litio y baterías"], ["XME", "Metales y minería"]],
  XLU: [["NLR", "Nuclear"]], XLRE: [["SRVR", "Data centers e infraestructura"]], XLC: [["SOCL", "Redes sociales"]],
};
const etfs = [...Object.keys(SECT), ...Object.values(SUB).flat().map(([e]) => e)];
const series = [], etfSeries = [];
for (let i = 0; i < syms.length; i += 8) series.push(...(await Promise.all(syms.slice(i, i + 8).map(chart))));
for (let i = 0; i < etfs.length; i += 8) etfSeries.push(...(await Promise.all(etfs.slice(i, i + 8).map(chart))));
const spy = await chart("SPY");
// Yahoo a veces devuelve una copia vieja (sin la última rueda) desde su caché: reintento esas por el otro servidor
const lastOf = (m) => (m ? [...m.keys()].at(-1) : null), spyLast = lastOf(spy);
for (let pass = 0; pass < 2; pass++) {
  const bad = syms.map((s, i) => i).filter((i) => !series[i] || lastOf(series[i]) !== spyLast);
  const badE = etfs.map((s, i) => i).filter((i) => !etfSeries[i] || lastOf(etfSeries[i]) !== spyLast);
  if (!bad.length && !badE.length) break;
  console.log(`Reintento ${pass + 1}: ${bad.length} acciones y ${badE.length} ETF sin la última rueda`);
  await new Promise((r) => setTimeout(r, 4000));
  for (let k = 0; k < bad.length; k += 6) await Promise.all(bad.slice(k, k + 6).map(async (i) => { const m = await chart(syms[i], true); if (m && (!series[i] || lastOf(m) >= lastOf(series[i]))) series[i] = m; }));
  for (const i of badE) { const m = await chart(etfs[i], true); if (m) etfSeries[i] = m; }
}
const ok = series.filter((m) => m && m.size > 260);
const days = [...spy.keys()].slice(-130);
const out = { generated: new Date().toISOString(), n: ok.length, dates: [], above200: [], above50: [], nh: [], nl: [] };
for (const d of days) {
  let n = 0, a200 = 0, a50 = 0, nh = 0, nl = 0;
  for (const m of ok) {
    const keys = [...m.keys()], i = keys.indexOf(d); if (i < 252) continue;
    const c = keys.slice(0, i + 1).map((k) => m.get(k)), px = c[i];
    const sma = (k) => c.slice(i - k + 1, i + 1).reduce((a, b) => a + b, 0) / k;
    const prev = c.slice(i - 251, i);
    n++; if (px > sma(200)) a200++; if (px > sma(50)) a50++;
    if (px >= Math.max(...prev)) nh++; if (px <= Math.min(...prev)) nl++;
  }
  if (!n) continue;
  out.dates.push(d); out.above200.push(+(a200 / n * 100).toFixed(1)); out.above50.push(+(a50 / n * 100).toFixed(1)); out.nh.push(nh); out.nl.push(nl);
}
if (!out.dates.length) { console.error("::error::Amplitud sin datos"); process.exit(1); }
fs.writeFileSync(path.join(ROOT, "data", "breadth.json"), JSON.stringify(out));

// ---------- Ranking técnico por acción y fuerza relativa de sectores/subsectores ----------
const spyKeys = [...spy.keys()];
const tOf = (m) => { const k = [...m.keys()].filter((d) => spy.has(d)); return techScore(k.map((d) => m.get(d)), k.map((d) => spy.get(d))); };
const META = new Map(UNIVERSE.map((r) => [r[0], r]));
const ch = (v, k) => +((v.at(-1) / v.at(-1 - k) - 1) * 100).toFixed(2);
const rows = [];
const lastDay = spyKeys.at(-1);
let stale = 0;
syms.forEach((s, i) => { const m = series[i]; if (!m || m.size < 260) return;
  // Sin la última rueda aun después de reintentar: si le falta 1 sola rueda se usa igual (mejor que dejarla afuera); más vieja, se excluye
  const lk = [...m.keys()].at(-1); if (lk !== lastDay) { stale++; if (spyKeys.indexOf(lk) < spyKeys.length - 2) return; } // sin la última rueda: el dato estaría viejo
  const t = tOf(m); if (!t) return; const v = [...m.values()];
  rows.push({ s, n: META.get(s)?.[1] || s, sec: META.get(s)?.[2], ced: META.get(s)?.[5] || null, score: t.score, trend: t.trend, rs: t.rs, impr: t.impr, contr: t.contr, setup: t.setup, quad: t.quad, rs3w: t.rs3w, rs1m: t.rs1m, rs3m: t.rs3m, rsHi: t.rsHi, ext: t.ext, rsi: t.rsi, e200: t.e200, s50: t.s50, pos: t.pos, d1: ch(v, 1), w1: ch(v, 5), m1: ch(v, 21), m3: ch(v, 63), rsDiff: t.rsDiff, coil: m.ohlc ? coilSetup(m.ohlc) : null }); });
const eRows = [];
etfs.forEach((e, i) => { const m = etfSeries[i]; if (!m || m.size < 260) return; const t = tOf(m); if (t) eRows.push({ s: e, rsDiff: t.rsDiff, score: t.score, rsi: t.rsi, e200: t.e200, quad: t.quad, rs3w: t.rs3w, rs1m: t.rs1m, rs3m: t.rs3m, rsHi: t.rsHi }); });
// RS rating 1-99: percentil del rendimiento ponderado. Acciones contra acciones; ETF de sectores/subsectores contra ETF
// (antes se mezclaban: un ETF diversificado nunca puede llegar a los extremos de una acción individual).
const pctl = (arr) => [...arr].sort((a, b) => a.rsDiff - b.rsDiff).forEach((r, i, a) => (r.rsr = Math.max(1, Math.round(((i + 1) / a.length) * 99))));
pctl(rows); pctl(eRows);
const by = new Map(eRows.map((r) => [r.s, r]));
const sectors = Object.entries(SECT).filter(([e]) => by.has(e)).map(([e, k]) => ({ etf: e, sec: k, ...by.get(e), subs: (SUB[e] || []).filter(([x]) => by.has(x)).map(([x, l]) => ({ etf: x, l, ...by.get(x) })) })).sort((a, b) => b.rs3w - a.rs3w);
// Próximos balances de TODO el universo (no solo las grandes), para el criterio "sin balance en 7 días"
const earn = {}, uni = new Set(syms);
for (let k = 1; k <= 12; k++) { // desde mañana: los de hoy ya presentaron (corre después del cierre)
  const d = new Date(Date.now() + k * 864e5); if (d.getUTCDay() % 6 === 0) continue; const ds = d.toISOString().slice(0, 10);
  try { const j = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${ds}`, { headers: { "User-Agent": UA, Accept: "application/json" } }).then((r) => r.json());
    for (const r of j?.data?.rows || []) if (uni.has(r.symbol) && !earn[r.symbol]) earn[r.symbol] = ds; } catch {}
}
// Si falló la descarga de muchas acciones (Yahoo limita), no piso el archivo bueno del día anterior
if (rows.length < syms.length * 0.8 || sectors.length < 9) { console.error(`::warning::Ranking técnico incompleto (${rows.length}/${syms.length} acciones, ${sectors.length} sectores): no se actualiza`); }
else fs.writeFileSync(path.join(ROOT, "data", "tech.json"), JSON.stringify({ generated: out.generated, date: out.dates.at(-1), rows, sectors, earn }));
if (stale) console.log(`${stale} acciones sin la última rueda (si les falta más de 1, quedan afuera)`);
console.log(`Ranking técnico: ${rows.length} acciones · sectores: ${sectors.map((x) => x.etf + " " + x.rsr).join(", ")}`);
console.log(`Amplitud: ${ok.length} acciones · último ${out.dates.at(-1)}: ${out.above200.at(-1)}% sobre MM200 · ${out.nh.at(-1)} máximos / ${out.nl.at(-1)} mínimos`);
