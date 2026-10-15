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
      const e = x.earningsTimestampStart || x.earningsTimestamp || null;
      out[s] = { px: x.regularMarketPrice ?? null, chg: x.regularMarketChangePercent ?? null, t: (x.regularMarketTime || 0) * 1000, st, ext: ext && ext.p ? ext : null, earn: e ? e * 1000 : null, earnLast: x.earningsTimestamp ? x.earningsTimestamp * 1000 : null, earnEst: !!x.isEarningsDateEstimate, cur: x.currency || null };
    }
    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
    return res.status(200).json({ q: out, at: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}

// GET /api/overview?view=ars -> CEDEARs en BYMA (pesos, dólar MEP y cable), CCL implícito por CEDEAR y cotizaciones del dólar
async function arsView(req, res) {
  const j = (u) => fetch(u, { headers: { "User-Agent": UA } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [ced0, stk, ccl, dol] = await Promise.all([j("https://data912.com/live/arg_cedears"), j("https://data912.com/live/arg_stocks"), j("https://data912.com/live/ccl"), j("https://dolarapi.com/v1/dolares")]);
  if (!ced0) return res.status(502).json({ error: "BYMA sin datos" });
  const ced = [...ced0, ...(stk || []).map((x) => ({ ...x, local: true }))];
  const by = new Map(ced.map((x) => [x.symbol, x]));
  const out = {};
  for (const x of ced) {
    if (!/^[A-Z0-9.]+$/.test(x.symbol)) continue;
    const base = x.symbol;
    const root = by.get(base.slice(0, -1));
    if (/[DC]$/.test(base) && root && root.c && x.c && x.c < root.c / 100) continue; // es la especie en dólares de otro ticker
    const d = by.get(base + "D"), c = by.get(base + "C");
    out[base] = { ars: x.c || null, bid: x.px_bid || null, ask: x.px_ask || null, chg: x.pct_change ?? null, v: x.v || 0, usd: d?.c || null, usdV: d?.v || 0, cable: c?.c || null, local: !!x.local };
  }
  const implied = {};
  for (const x of ccl || []) if (x.arg_panel === "cedear" && x.CCL_mark) implied[x.ticker_ar] = { ccl: x.CCL_mark, rank: x.volume_rank, volArs: x.ars_volume };
  const liquid = Object.values(implied).filter((x) => x.volArs > 3e8).map((x) => x.ccl).sort((a, b) => a - b);
  const med = liquid.length ? liquid[liquid.length >> 1] : null;
  const dolar = {}; for (const d of dol || []) dolar[d.casa] = { compra: d.compra, venta: d.venta, t: d.fechaActualizacion };
  res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
  return res.status(200).json({ cedears: out, implied, medCcl: med, dolar, at: Date.now() });
}

// GET /api/overview?view=hist&ced=AAPL&sym=AAPL&date=2025-03-10 -> precio en pesos de ese día, SPY y CCL de referencia (GGAL)
async function histView(req, res) {
  const ced = String(req.query.ced || "").toUpperCase(), sym = String(req.query.sym || "").toUpperCase(), date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Fecha inválida" });
  const t = Date.parse(date + "T23:59:59Z");
  const j = (u) => fetch(u, { headers: { "User-Agent": UA } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const onDay = (arr) => { let b = null; for (const p of arr || []) { if (Date.parse(p.date) <= t) b = p; else break; } return b; };
  const ychart = async (s) => { const d = await j(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?period1=${Math.floor(t / 1000) - 12 * 86400}&period2=${Math.floor(t / 1000) + 86400}&interval=1d`); const r = d?.chart?.result?.[0]; const ts = r?.timestamp || [], c = r?.indicators?.quote?.[0]?.close || []; let b = null; ts.forEach((x, i) => { if (x * 1000 <= t && c[i] != null) b = c[i]; }); return b; };
  const [cedH, stkH, ggalL, ggalA, spy, us] = await Promise.all([
    /^[A-Z0-9.]{1,10}$/.test(ced) ? j(`https://data912.com/historical/cedears/${ced}`) : null,
    /^[A-Z0-9.]{1,10}$/.test(ced) ? j(`https://data912.com/historical/stocks/${ced}`) : null,
    j("https://data912.com/historical/stocks/GGAL"), ychart("GGAL"), ychart("SPY"), /^[A-Z0-9.\-^]{1,15}$/.test(sym) ? ychart(sym) : null,
  ]);
  const a = onDay(Array.isArray(cedH) && cedH.length ? cedH : stkH), g = onDay(ggalL);
  const ccl = g?.c && ggalA ? (g.c * 10) / ggalA : null;
  res.setHeader("Cache-Control", "public, s-maxage=86400");
  return res.status(200).json({ date, ars: a?.c ?? null, arsDate: a?.date ?? null, us, spy, ccl });
}

export default async function handler(req, res) {
  if (req.query?.s) return liveQuotes(req, res);
  if (req.query?.view === "hist") return histView(req, res);
  if (req.query?.view === "ars") return arsView(req, res);
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
