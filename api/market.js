// /api/market — VIX, Fear & Greed Index (CNN) y curva de rendimientos del Tesoro (Yahoo), con variación diaria
import { UA, fetchChart, round } from "./_lib.js";

const CNN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TREASURIES = [
  { key: "3m", label: "3 meses", symbol: "^IRX" },
  { key: "2y", label: "2 años", symbol: "2YY=F" },
  { key: "5y", label: "5 años", symbol: "^FVX" },
  { key: "10y", label: "10 años", symbol: "^TNX" },
  { key: "30y", label: "30 años", symbol: "^TYX" },
];

// último valor y el previo (para variación diaria) de una serie de precios/yields diarios
function lastTwo(pts) {
  const v = pts.filter((p) => p.c != null);
  if (!v.length) return { last: null, prev: null, t: null };
  const last = v[v.length - 1];
  const prev = v.length >= 2 ? v[v.length - 2] : null;
  return { last: last.c, prev: prev ? prev.c : null, t: last.t };
}

async function getVix() {
  const d = await fetchChart("^VIX", "range=10d&interval=1d");
  const { last, prev } = lastTwo(d.pts);
  return {
    value: round(last, 2),
    change: prev != null ? round(last - prev, 2) : null,
    changePercent: prev ? round((last / prev - 1) * 100, 2) : null,
  };
}

async function getFearGreed() {
  const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    headers: { "User-Agent": CNN_UA, Referer: "https://edition.cnn.com/markets/fear-and-greed", Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`CNN Fear & Greed HTTP ${r.status}`);
  const j = await r.json();
  const f = j.fear_and_greed || {};
  return {
    score: round(f.score, 1),
    rating: f.rating || null,
    previousClose: round(f.previous_close, 1),
    previousWeek: round(f.previous_1_week, 1),
    previousMonth: round(f.previous_1_month, 1),
    previousYear: round(f.previous_1_year, 1),
    timestamp: f.timestamp || null,
    putCall: round(j.put_call_options?.data?.at(-1)?.y, 2),
    // componentes del índice (0-100 cada uno)
    parts: [["market_momentum_sp500", "Momentum S&P 500"], ["stock_price_strength", "Máximos vs mínimos"], ["stock_price_breadth", "Amplitud (volumen)"], ["put_call_options", "Put/Call"], ["market_volatility_vix", "Volatilidad (VIX)"], ["junk_bond_demand", "Demanda de bonos basura"], ["safe_haven_demand", "Refugio (bonos vs acciones)"]]
      .map(([k, l]) => ({ k, l, score: round(j[k]?.score, 0), rating: j[k]?.rating || null })),
  };
}

// Curva y expectativa de inflación (FRED, sin clave): 10a-2a, 10a-3m y breakeven a 10 años, últimos 2 años (semanal)
async function getFred() {
  const ids = ["T10Y2Y", "T10Y3M", "T10YIE"];
  const out = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(12000) })).text();
      const from = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
      const rows = t.trim().split("\n").slice(1).filter((l) => l.slice(0, 10) >= from).map((l) => l.split(",")).filter(([, v]) => v && v !== ".").map(([d, v]) => [d, Number(v)]);
      out[id] = { last: rows.at(-1)?.[1] ?? null, date: rows.at(-1)?.[0] ?? null, hist: rows.filter((_, i) => i % 5 === 0 || i === rows.length - 1).map(([, v]) => v) };
    } catch { out[id] = null; }
  }));
  // Respaldo si FRED no responde: 10a − 3m con los rendimientos de Yahoo (^TNX y ^IRX, semanal)
  if (!out.T10Y3M?.last && out.T10Y3M?.last !== 0) {
    try {
      const w = async (sym) => { const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1wk`, { headers: { "User-Agent": CNN_UA } })).json(); const r = j.chart.result[0]; return new Map(r.timestamp.map((t, i) => [t, r.indicators.quote[0].close[i]])); };
      const [a, b] = await Promise.all([w("^TNX"), w("^IRX")]);
      const h = [...a.keys()].filter((t) => a.get(t) != null && b.get(t) != null).map((t) => round(a.get(t) - b.get(t), 2));
      if (h.length) out.T10Y3M = { last: h.at(-1), hist: h, src: "yahoo" };
    } catch { /* sin respaldo */ }
  }
  return out;
}

async function getTreasuries() {
  const results = await Promise.all(
    TREASURIES.map(async (t) => {
      try {
        const d = await fetchChart(t.symbol, "range=10d&interval=1d");
        const { last, prev } = lastTwo(d.pts);
        return { key: t.key, label: t.label, yield: round(last, 3), changeBps: prev != null ? round((last - prev) * 100, 1) : null };
      } catch (e) {
        return { key: t.key, label: t.label, yield: null, changeBps: null, error: String(e.message || e) };
      }
    })
  );
  return results;
}

export default async function handler(req, res) {
  try {
    const [vix, fearGreed, treasuries, fred] = await Promise.all([
      getVix().catch((e) => ({ error: String(e.message || e) })),
      getFearGreed().catch((e) => ({ error: String(e.message || e) })),
      getTreasuries(),
      getFred().catch(() => null),
    ]);
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    res.status(200).json({ vix, fearGreed, treasuries, fred, last_update: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
