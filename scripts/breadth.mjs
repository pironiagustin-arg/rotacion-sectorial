// Amplitud del universo (acciones que cotizan en EE.UU.): % sobre la media de 200 y 50 ruedas, y nuevos máximos/mínimos
// de 52 semanas por día. Corre después del cierre (workflow sync-screener) y escribe data/breadth.json.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { UNIVERSE } = await import(pathToFileURL(path.join(ROOT, "lib/universe.js")).href);
const { techScore } = await import(pathToFileURL(path.join(ROOT, "lib/tech.js")).href);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const syms = [...new Set(UNIVERSE.filter((r) => r[3] !== "AR" && !/\./.test(r[0]) && !/^\^/.test(r[0])).map((r) => r[0]))];
async function chart(s) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=2y&interval=1d`, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(r.status);
      const x = (await r.json()).chart.result[0], c = x.indicators.quote[0].close;
      return new Map(x.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), c[i]]).filter(([, v]) => v != null));
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
const ok = series.filter((m) => m && m.size > 260);
const spy = await chart("SPY");
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
syms.forEach((s, i) => { const m = series[i]; if (!m || m.size < 260) return; const t = tOf(m); if (!t) return; const v = [...m.values()];
  rows.push({ s, n: META.get(s)?.[1] || s, sec: META.get(s)?.[2], ced: META.get(s)?.[5] || null, score: t.score, trend: t.trend, rs: t.rs, contr: t.contr, setup: t.setup, rsi: t.rsi, e200: t.e200, s50: t.s50, pos: t.pos, d1: ch(v, 1), w1: ch(v, 5), m1: ch(v, 21), m3: ch(v, 63), rsDiff: t.rsDiff }); });
const eRows = [];
etfs.forEach((e, i) => { const m = etfSeries[i]; if (!m || m.size < 260) return; const t = tOf(m); if (t) eRows.push({ s: e, rsDiff: t.rsDiff, score: t.score, rsi: t.rsi, e200: t.e200 }); });
// RS rating 1-99 (percentil del rendimiento ponderado contra todo el universo + ETF)
const all = [...rows, ...eRows].sort((a, b) => a.rsDiff - b.rsDiff);
all.forEach((r, i) => (r.rsr = Math.max(1, Math.round(((i + 1) / all.length) * 99))));
const by = new Map(eRows.map((r) => [r.s, r]));
const sectors = Object.entries(SECT).filter(([e]) => by.has(e)).map(([e, k]) => ({ etf: e, sec: k, ...by.get(e), subs: (SUB[e] || []).filter(([x]) => by.has(x)).map(([x, l]) => ({ etf: x, l, ...by.get(x) })) })).sort((a, b) => b.rsr - a.rsr);
fs.writeFileSync(path.join(ROOT, "data", "tech.json"), JSON.stringify({ generated: out.generated, date: out.dates.at(-1), rows, sectors }));
console.log(`Ranking técnico: ${rows.length} acciones · sectores: ${sectors.map((x) => x.etf + " " + x.rsr).join(", ")}`);
console.log(`Amplitud: ${ok.length} acciones · último ${out.dates.at(-1)}: ${out.above200.at(-1)}% sobre MM200 · ${out.nh.at(-1)} máximos / ${out.nl.at(-1)} mínimos`);
