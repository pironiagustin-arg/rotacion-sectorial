// Utilidades compartidas por /api/sectors y /api/rrg (el prefijo _ evita que Vercel lo exponga como endpoint).
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const SECTOR_META = {
  SPY: { name: "S&P 500", color: "#6b7280", is_benchmark: true },
  XLK: { name: "Tecnología", color: "#4C6EF5" },
  XLF: { name: "Financiero", color: "#2F9E44" },
  XLV: { name: "Salud", color: "#E64980" },
  XLY: { name: "Consumo discrecional", color: "#F76707" },
  XLP: { name: "Consumo básico", color: "#0CA678" },
  XLE: { name: "Energía", color: "#495057" },
  XLI: { name: "Industrial", color: "#7048E8" },
  XLB: { name: "Materiales", color: "#AE3EC9" },
  XLU: { name: "Servicios públicos", color: "#1098AD" },
  XLRE: { name: "Bienes raíces", color: "#F08C00" },
  XLC: { name: "Comunicaciones", color: "#E8590C" },
};
export const PALETTE = ["#4C6EF5", "#2F9E44", "#E64980", "#F76707", "#0CA678", "#495057", "#7048E8", "#AE3EC9", "#1098AD", "#F08C00", "#E8590C", "#C92A2A", "#5C940D", "#1971C2"];

const DAY = 86400;
// clave de rango -> parámetros de Yahoo
export function rangeParams(key) {
  const now = Math.floor(Date.now() / 1000);
  switch (key) {
    case "1w": return { key: "1w", qs: "range=5d&interval=15m", bar: 20 }; // barras de 15 min
    case "1m": return { key: "1m", qs: "range=1mo&interval=1d", bar: 20 };
    case "3m": return { key: "3m", qs: "range=3mo&interval=1d", bar: 20 };
    case "6m": return { key: "6m", qs: "range=6mo&interval=1d", bar: 20 };
    case "3y": return { key: "3y", qs: `period1=${now - 3 * 366 * DAY}&period2=${now}&interval=1wk`, bar: 4 };
    case "5y": return { key: "5y", qs: "range=5y&interval=1wk", bar: 4 };
    default: return { key: "1y", qs: "range=1y&interval=1d", bar: 20 };
  }
}

export async function fetchChart(symbol, qs) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}&includeAdjustedClose=true`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ${symbol} sin datos`);
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose;
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const c = adj?.[i] ?? q.close?.[i];
    if (c != null && isFinite(c)) pts.push({ t: ts[i] * 1000, c });
  }
  return { meta: res.meta || {}, pts };
}

// Alinea las series de cada símbolo sobre las fechas del benchmark. Devuelve { dates, closes: {sym: number[]} }.
export function align(bench, others) {
  const dates = bench.pts.map((p) => p.t);
  const closes = { __bench: bench.pts.map((p) => p.c) };
  for (const [sym, d] of Object.entries(others)) {
    const m = new Map(d.pts.map((p) => [p.t, p.c]));
    let last = null;
    closes[sym] = dates.map((t) => { if (m.has(t)) last = m.get(t); return last; });
  }
  return { dates, closes };
}

export const round = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

// RRG: RS = precio / benchmark.
// RS-Ratio    = 100 + 1.5 * z(RS, ventana 20)      (z-score respecto de su media y desvío móviles)
// RS-Momentum = 100 + 1.5 * z(RS-Ratio, ventana 10)
export function rrg(prices, bench, times, w1 = 20, w2 = 10, k = 1.5) {
  const rs = prices.map((p, i) => (p != null && bench[i] ? p / bench[i] : null));
  const zwin = (arr, i, w) => {
    if (i < w - 1) return null;
    const win = arr.slice(i - w + 1, i + 1);
    if (win.some((x) => x == null)) return null;
    const m = mean(win), s = std(win);
    return s ? (arr[i] - m) / s : null;
  };
  const ratio = rs.map((_, i) => { const z = zwin(rs, i, w1); return z == null ? null : 100 + k * z; });
  const out = [];
  for (let i = 0; i < ratio.length; i++) {
    const zm = zwin(ratio, i, w2);
    if (ratio[i] == null || zm == null) continue;
    out.push({ x: round(ratio[i], 2), y: round(100 + k * zm, 2), t: times[i] });
  }
  return out;
}

// Retorno relativo a `n` barras vs. benchmark, en puntos porcentuales.
export function relMomentum(prices, bench, n) {
  const out = [];
  for (let i = n; i < prices.length; i++) {
    if (!prices[i] || !prices[i - n] || !bench[i] || !bench[i - n]) { out.push(null); continue; }
    out.push((prices[i] / prices[i - n] - 1) * 100 - (bench[i] / bench[i - n] - 1) * 100);
  }
  return out;
}

// Variación % del ratio precio/benchmark a `n` barras.
export function rsChange(prices, bench, n) {
  const rs = prices.map((p, i) => (p && bench[i] ? p / bench[i] : null));
  const out = [];
  for (let i = n; i < rs.length; i++) out.push(rs[i] && rs[i - n] ? (rs[i] / rs[i - n] - 1) * 100 : null);
  return out;
}

export function zScoreLast(series) {
  const v = series.filter((x) => x != null);
  if (v.length < 10) return null;
  const s = std(v);
  return s ? (v[v.length - 1] - mean(v)) / s : null;
}

export function correlation(a, b) {
  const x = [], y = [];
  for (let i = 1; i < a.length; i++) if (a[i] && a[i - 1] && b[i] && b[i - 1]) { x.push(a[i] / a[i - 1] - 1); y.push(b[i] / b[i - 1] - 1); }
  if (x.length < 5) return null;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export function liveQuote(d) {
  const price = d.meta.regularMarketPrice ?? d.pts.at(-1)?.c ?? null;
  const prev = d.meta.chartPreviousClose && d.pts.length < 3 ? d.meta.chartPreviousClose : d.pts.length >= 2 ? d.pts.at(-2).c : null;
  const raw = d.pts.at(-1)?.c;
  const base = price != null && raw != null && Math.abs(raw - price) / price < 0.02 ? d.pts.at(-2)?.c ?? prev : d.pts.at(-1)?.c ?? prev;
  return { price: round(price, 2), changePercent: price != null && base ? round((price / base - 1) * 100, 3) : null };
}
