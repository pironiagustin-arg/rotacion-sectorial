// GET /api/overview -> foto del mercado para el Dashboard:
// índices y activos clave (precio, variación 1D/1S/1M/YTD y mini serie de 3 meses) + rendimiento de sectores e industrias.
import { UA, round } from "./_lib.js";
import { quotes } from "./_screen.js";
import { SECTOR_ETFS, INDUSTRY_ETFS } from "./_signals.js";

const MARKET = [
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"], ["^VIX", "VIX"],
  ["^TNX", "Tasa 10 años EE.UU."], ["DX-Y.NYB", "Dólar (DXY)"], ["GC=F", "Oro"], ["CL=F", "Petróleo WTI"], ["BTC-USD", "Bitcoin"],
  ["EEM", "Emergentes"], ["EWZ", "Brasil"],
];

async function daily(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  const ts = res?.timestamp || [], c = res?.indicators?.quote?.[0]?.close || [];
  const pts = ts.map((t, i) => ({ t: t * 1000, c: c[i] })).filter((p) => p.c != null && isFinite(p.c));
  const live = res?.meta?.regularMarketPrice;
  if (live && pts.length && Math.abs(live / pts.at(-1).c - 1) < 0.2) pts[pts.length - 1].c = live;
  return pts;
}
function perf(pts) {
  if (!pts?.length) return null;
  const last = pts.at(-1), at = (days) => { const t = last.t - days * 864e5; let b = null; for (const p of pts) { if (p.t <= t) b = p; else break; } return b; };
  const ytd0 = pts.filter((p) => new Date(p.t).getFullYear() < new Date(last.t).getFullYear()).at(-1);
  const ch = (p) => (p ? round((last.c / p.c - 1) * 100, 2) : null);
  return { price: round(last.c, 2), d1: ch(pts.at(-2)), w1: ch(at(7)), m1: ch(at(30)), m3: ch(at(91)), ytd: ch(ytd0), y1: ch(pts[0]), spark: pts.slice(-63).map((p) => round(p.c, 2)), t: last.t };
}

// GET /api/overview?s=AAPL,MSFT -> precios en vivo (Yahoo v7, tiempo real en EE.UU.), con pre y post mercado.
async function liveQuotes(req, res) {
  const syms = [...new Set(String(req.query?.s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.\-^=]{1,15}$/.test(x)))].slice(0, 200);
  if (!syms.length) return res.status(400).json({ error: "Sin símbolos" });
  try {
    const q = await quotes(syms), out = {};
    for (const [s, x] of q) {
      const st = x.marketState || "";
      const ext = st.startsWith("PRE") ? { p: x.preMarketPrice, c: x.preMarketChangePercent, l: "pre" } : /POST|CLOSED/.test(st) && x.postMarketPrice ? { p: x.postMarketPrice, c: x.postMarketChangePercent, l: "post" } : null;
      out[s] = { px: x.regularMarketPrice ?? null, chg: x.regularMarketChangePercent ?? null, t: (x.regularMarketTime || 0) * 1000, st, ext: ext && ext.p ? ext : null };
    }
    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
    return res.status(200).json({ q: out, at: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}

export default async function handler(req, res) {
  if (req.query?.s) return liveQuotes(req, res);
  try {
    const groups = [
      ...MARKET.map(([s, n]) => ({ s, n, g: "market" })),
      ...Object.entries(SECTOR_ETFS).map(([s, n]) => ({ s, n, g: "sector" })),
      ...Object.entries(INDUSTRY_ETFS).map(([s, n]) => ({ s, n, g: "industry" })),
    ];
    const data = await Promise.all(groups.map((x) => daily(x.s).then(perf).catch(() => null)));
    const spy = data[0];
    const out = { market: [], sectors: [], industries: [] };
    groups.forEach((x, i) => {
      const p = data[i]; if (!p) return;
      const row = { symbol: x.s, name: x.n, ...p };
      if (x.g !== "market" && spy) for (const k of ["d1", "w1", "m1", "m3", "ytd", "y1"]) row["rel_" + k] = p[k] != null && spy[k] != null ? round(p[k] - spy[k], 2) : null;
      (x.g === "market" ? out.market : x.g === "sector" ? out.sectors : out.industries).push(row);
    });
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({ ...out, last_update: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
