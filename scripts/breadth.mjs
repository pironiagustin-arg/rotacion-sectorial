// Amplitud del universo (acciones que cotizan en EE.UU.): % sobre la media de 200 y 50 ruedas, y nuevos máximos/mínimos
// de 52 semanas por día. Corre después del cierre (workflow sync-screener) y escribe data/breadth.json.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { UNIVERSE } = await import(pathToFileURL(path.join(ROOT, "lib/universe.js")).href);
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
const series = [];
for (let i = 0; i < syms.length; i += 8) series.push(...(await Promise.all(syms.slice(i, i + 8).map(chart))));
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
console.log(`Amplitud: ${ok.length} acciones · último ${out.dates.at(-1)}: ${out.above200.at(-1)}% sobre MM200 · ${out.nh.at(-1)} máximos / ${out.nl.at(-1)} mínimos`);
