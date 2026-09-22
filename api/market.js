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
  };
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
    const [vix, fearGreed, treasuries] = await Promise.all([
      getVix().catch((e) => ({ error: String(e.message || e) })),
      getFearGreed().catch((e) => ({ error: String(e.message || e) })),
      getTreasuries(),
    ]);
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    res.status(200).json({ vix, fearGreed, treasuries, last_update: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
