// GET /api/overview -> foto del mercado para el Dashboard:
// índices y activos clave (precio, variación 1D/1S/1M/YTD y mini serie de 3 meses) + rendimiento de sectores e industrias.
import { UA, round } from "./_lib.js";
import { quotes } from "./_screen.js";
import { SECTOR_ETFS, INDUSTRY_ETFS } from "./_signals.js";

const MARKET = [
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"], ["^VIX", "VIX"],
  ["^TNX", "Tasa 10 años EE.UU."], ["DX-Y.NYB", "Dólar (DXY)"], ["GC=F", "Oro"], ["CL=F", "Petróleo WTI"], ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"],
  ["EEM", "Emergentes"], ["EWZ", "Brasil"], ["ARGT", "Argentina"], ["TLT", "Bonos Tesoro 20a+"], ["HYG", "High yield"], ["SI=F", "Plata"], ["HG=F", "Cobre"],
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

// GET /api/overview?view=chart&sym=AAPL&range=5y&interval=1wk -> cierres ajustados (lo usa el backtest desde GitHub Actions)
async function chartView(req, res) {
  const sym = String(req.query.sym || "").toUpperCase(), range = /^(1y|2y|5y|10y|5d|1mo)$/.test(req.query.range) ? req.query.range : "5y", iv = /^(1d|1wk|1mo)$/.test(req.query.interval) ? req.query.interval : "1wk";
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(sym)) return res.status(400).json({ error: "Símbolo inválido" });
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${iv}`, { headers: { "User-Agent": UA } });
  if (!r.ok) return res.status(r.status).json({ error: "Yahoo " + r.status });
  const x = (await r.json())?.chart?.result?.[0];
  const ts = x?.timestamp || [], c = x?.indicators?.adjclose?.[0]?.adjclose || x?.indicators?.quote?.[0]?.close || [], v = x?.indicators?.quote?.[0]?.volume || [];
  res.setHeader("Cache-Control", "public, s-maxage=43200");
  const vol = req.query.vol === "1";
  return res.status(200).json({ sym, pts: ts.map((t, i) => (vol ? [t * 1000, c[i] != null ? round(c[i], 4) : null, v[i] ?? 0] : [t * 1000, c[i] != null ? round(c[i], 4) : null])).filter((p) => p[1] != null) });
}

// GET /api/overview?view=macro -> calendario económico de EE.UU. (con estimado y resultado) y probabilidades de la Fed
// a partir de los futuros de fed funds (misma lógica que CME FedWatch).
const FOMC = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09", "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08"];
const MCODE = "FGHJKMNQUVXZ";
async function macroView(req, res) {
  const j = (u, h = {}) => fetch(u, { headers: { "User-Agent": UA, ...h } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const now = new Date(), from = new Date(now - 12 * 864e5).toISOString(), to = new Date(+now + 35 * 864e5).toISOString();
  const [cal, effr] = await Promise.all([
    j(`https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=US`, { Origin: "https://www.tradingview.com" }),
    j("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json"),
  ]);
  const events = (cal?.result || []).filter((e) => e.importance >= 1 && !/holiday|speech|speaks|minutes|press conference|election/i.test(e.title))
    .map((e) => ({ t: Date.parse(e.date), title: e.title, period: e.period || "", actual: e.actual, forecast: e.forecast, previous: e.previous, unit: e.unit || "", scale: e.scale || "" }));
  // Futuros de fed funds: tasa promedio implícita de cada mes = 100 - precio
  const r0e = effr?.refRates?.[0], r0 = r0e?.percentRate ?? null;
  const months = []; for (let k = 0; k < 14; k++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)); months.push(d); }
  const px = await Promise.all(months.map((d) => j(`https://query1.finance.yahoo.com/v8/finance/chart/ZQ${MCODE[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}.CBT?range=5d&interval=1d`).then((x) => x?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null)));
  const R = new Map(months.map((d, i) => [`${d.getUTCFullYear()}-${d.getUTCMonth()}`, px[i] ? 100 - px[i] : null]));
  const key = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const meetings = []; let before = r0;
  for (const ds of FOMC) {
    const d = new Date(ds + "T00:00:00Z"); if (d < new Date(now - 864e5)) continue; if (meetings.length >= 7 || before == null) break;
    const N = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), day = d.getUTCDate();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const nextHasMeeting = FOMC.some((x) => x.startsWith(next.toISOString().slice(0, 7)));
    let after = null;
    if (!nextHasMeeting && R.get(key(next)) != null) after = R.get(key(next));
    else if (R.get(key(d)) != null) after = (R.get(key(d)) * N - before * day) / (N - day);
    if (after == null) break;
    const delta = after - before, steps = delta / 0.25;
    const p = { cut: steps < 0 ? Math.min(1, -steps) : 0, hike: steps > 0 ? Math.min(1, steps) : 0 }; p.hold = Math.max(0, 1 - p.cut - p.hike);
    meetings.push({ date: ds, implied: round(after, 3), change: round(delta * 100, 1), cumulative: r0 != null ? round((after - r0) * 100, 1) : null, pHike: round(p.hike * 100, 0), pCut: round(p.cut * 100, 0), pHold: round(p.hold * 100, 0), bigMove: Math.abs(steps) > 1 });
    before = after;
  }
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
  return res.status(200).json({ events, fed: { effr: r0, effrDate: r0e?.effectiveDate || null, target: r0e ? [r0e.targetRateFrom, r0e.targetRateTo] : null, meetings }, at: Date.now() });
}


// GET /api/overview?view=regime -> régimen de mercado (risk-on / risk-off) con señales de tendencia, volatilidad,
// crédito, rotación, amplitud, dólar y tasas; más la estructura temporal del VIX.
const sma = (a, n) => (a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null);
const ratio = (A, B) => { const m = new Map(B.map((p) => [Math.round(p.t / 864e5), p.c])); return A.map((p) => ({ t: p.t, c: m.has(Math.round(p.t / 864e5)) ? p.c / m.get(Math.round(p.t / 864e5)) : null })).filter((p) => p.c != null); };
async function regimeView(req, res) {
  const syms = ["SPY", "^VIX", "^VIX9D", "^VIX3M", "HYG", "IEF", "XLY", "XLP", "IWM", "RSP", "DX-Y.NYB", "^TNX", ...Object.keys(SECTOR_ETFS)];
  const got = await Promise.all(syms.map((s) => daily(s).catch(() => [])));
  const S = Object.fromEntries(syms.map((s, i) => [s, got[i]]));
  const cl = (s) => S[s].map((p) => p.c);
  const spark = (pts) => pts.slice(-126).map((p) => round(p.c, 4));
  const sig = [];
  const add = (k, name, state, value, detail, why, pts) => sig.push({ k, name, state, value, detail, why, spark: pts ? spark(pts) : null });

  // 1. Tendencia del S&P 500
  const spy = cl("SPY");
  if (spy.length > 200) {
    const p = spy.at(-1), m50 = sma(spy, 50), m200 = sma(spy, 200);
    const st = p > m50 && p > m200 ? 1 : p < m200 ? -1 : 0;
    add("trend", "Tendencia S&P 500", st, `${round((p / m200 - 1) * 100, 1)}% vs MM200`, `MM50 ${round((p / m50 - 1) * 100, 1)}%`, st > 0 ? "Sobre sus medias de 50 y 200 ruedas: tendencia alcista" : st < 0 ? "Debajo de la media de 200 ruedas: tendencia bajista" : "Entre medias: tendencia indefinida", S.SPY);
    const hi = Math.max(...spy.slice(-252)), dd = (p / hi - 1) * 100;
    add("dd", "Distancia al máximo", dd > -5 ? 1 : dd > -10 ? 0 : -1, `${round(dd, 1)}%`, "vs máximo de 52 semanas", dd > -5 ? "Cerca de máximos" : dd > -10 ? "Retroceso normal (< 10%)" : dd > -20 ? "Corrección (−10% a −20%)" : "Mercado bajista (> −20%)", null);
  }
  // 2. Volatilidad
  const vix = cl("^VIX"), v9 = cl("^VIX9D"), v3m = cl("^VIX3M");
  let vixOut = null;
  if (vix.length) {
    const v = vix.at(-1), pct = round((vix.filter((x) => x <= v).length / vix.length) * 100, 0);
    add("vix", "VIX", v < 16 ? 1 : v <= 25 ? 0 : -1, round(v, 2), `percentil ${pct} del último año`, v < 16 ? "Volatilidad baja: mercado tranquilo" : v <= 25 ? "Volatilidad normal" : v <= 35 ? "Miedo: volatilidad alta" : "Pánico", null);
    const ts = v3m.length ? v / v3m.at(-1) : null;
    if (ts) add("term", "Estructura del VIX", ts < 0.9 ? 1 : ts <= 1 ? 0 : -1, round(ts, 2), "VIX ÷ VIX 3 meses", ts < 0.9 ? "Contango: el mercado espera calma" : ts <= 1 ? "Curva plana: atención" : "Backwardation: estrés de corto plazo (suele marcar pisos cuando revierte)", null);
    vixOut = { v: round(v, 2), v9: v9.length ? round(v9.at(-1), 2) : null, v3m: v3m.length ? round(v3m.at(-1), 2) : null, pct, min: round(Math.min(...vix), 2), max: round(Math.max(...vix), 2),
      avg: round(vix.reduce((a, b) => a + b, 0) / vix.length, 2), chg1d: vix.length > 1 ? round((v / vix.at(-2) - 1) * 100, 1) : null, spark: S["^VIX"].slice(-252).map((p) => round(p.c, 2)), dates: S["^VIX"].slice(-252).map((p) => p.t) };
  }
  // 3. Ratios de apetito por riesgo: sobre / debajo de su media de 50 ruedas
  const ratioSig = (k, name, a, b, onTxt, offTxt, invert = false) => {
    const r = ratio(S[a], S[b]); if (r.length < 60) return;
    const c = r.map((p) => p.c), m = sma(c, 50), d = (c.at(-1) / m - 1) * 100, ch1m = (c.at(-1) / c.at(-22) - 1) * 100;
    let st = d > 0.5 ? 1 : d < -0.5 ? -1 : 0; if (invert) st = -st;
    add(k, name, st, `${ch1m >= 0 ? "+" : ""}${round(ch1m, 1)}% 1M`, `${d >= 0 ? "+" : ""}${round(d, 1)}% vs MM50`, st > 0 ? onTxt : st < 0 ? offTxt : "Sin dirección clara", r);
  };
  ratioSig("credit", "Crédito (HYG / IEF)", "HYG", "IEF", "High yield le gana a bonos del Tesoro: hay apetito por riesgo", "Bonos basura pierden contra el Tesoro: se cierra el crédito");
  ratioSig("cyc", "Cíclico vs defensivo (XLY / XLP)", "XLY", "XLP", "Consumo discrecional lidera: confianza en la economía", "Consumo básico lidera: posición defensiva");
  ratioSig("small", "Small caps (IWM / SPY)", "IWM", "SPY", "Las chicas acompañan: suba amplia", "Las chicas se quedan atrás: suba concentrada");
  ratioSig("ew", "Igual ponderado (RSP / SPY)", "RSP", "SPY", "La acción promedio acompaña al índice", "Pocas mega caps sostienen el índice");
  // 4. Amplitud sectorial
  const secs = Object.keys(SECTOR_ETFS).map((s) => cl(s)).filter((a) => a.length > 200);
  if (secs.length) {
    const a50 = secs.filter((a) => a.at(-1) > sma(a, 50)).length, a200 = secs.filter((a) => a.at(-1) > sma(a, 200)).length;
    const p50 = (a50 / secs.length) * 100;
    add("breadth", "Amplitud sectorial", p50 >= 60 ? 1 : p50 < 40 ? -1 : 0, `${a50}/${secs.length}`, `sobre MM50 · ${a200}/${secs.length} sobre MM200`, p50 >= 60 ? "La mayoría de los sectores en tendencia alcista" : p50 < 40 ? "La mayoría de los sectores débiles" : "Mercado dividido", null);
  }
  // 5. Dólar y tasas
  const dxy = cl("DX-Y.NYB");
  if (dxy.length > 60) { const d = (dxy.at(-1) / sma(dxy, 50) - 1) * 100; add("dxy", "Dólar global (DXY)", d < -0.5 ? 1 : d > 0.5 ? -1 : 0, round(dxy.at(-1), 2), `${d >= 0 ? "+" : ""}${round(d, 1)}% vs MM50`, d < -0.5 ? "Dólar débil: favorece emergentes y materias primas" : d > 0.5 ? "Dólar fuerte: presión sobre emergentes" : "Dólar estable", S["DX-Y.NYB"]); }
  const tnx = cl("^TNX");
  if (tnx.length > 22) { const ch = (tnx.at(-1) - tnx.at(-22)) * 100; add("rates", "Tasa 10 años", ch < -10 ? 1 : ch > 25 ? -1 : 0, `${round(tnx.at(-1), 2)}%`, `${ch >= 0 ? "+" : ""}${round(ch, 0)} pb en 1 mes`, ch < -10 ? "Tasas bajando: alivio para valuaciones" : ch > 25 ? "Tasas subiendo rápido: presión sobre valuaciones" : "Tasas estables", S["^TNX"]); }

  const score = sig.length ? sig.reduce((a, x) => a + x.state, 0) / sig.length : 0;
  const regime = score >= 0.3 ? "on" : score <= -0.3 ? "off" : "neutral";
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
  return res.status(200).json({ regime, score: round(score * 100, 0), signals: sig, vix: vixOut, at: Date.now() });
}

// GET /api/overview?view=countries -> rendimiento de los ETF de cada país (iShares/Global X) para el mapa
const COUNTRY_ETFS = [
  ["840", "SPY", "Estados Unidos", "América"], ["124", "EWC", "Canadá", "América"], ["484", "EWW", "México", "América"], ["076", "EWZ", "Brasil", "América"],
  ["032", "ARGT", "Argentina", "América"], ["152", "ECH", "Chile", "América"], ["604", "EPU", "Perú", "América"], ["170", "GXG", "Colombia", "América"],
  ["826", "EWU", "Reino Unido", "Europa"], ["276", "EWG", "Alemania", "Europa"], ["250", "EWQ", "Francia", "Europa"], ["380", "EWI", "Italia", "Europa"],
  ["724", "EWP", "España", "Europa"], ["528", "EWN", "Países Bajos", "Europa"], ["756", "EWL", "Suiza", "Europa"], ["752", "EWD", "Suecia", "Europa"],
  ["578", "NORW", "Noruega", "Europa"], ["208", "EDEN", "Dinamarca", "Europa"], ["246", "EFNL", "Finlandia", "Europa"], ["056", "EWK", "Bélgica", "Europa"],
  ["040", "EWO", "Austria", "Europa"], ["372", "EIRL", "Irlanda", "Europa"], ["616", "EPOL", "Polonia", "Europa"], ["300", "GREK", "Grecia", "Europa"],
  ["792", "TUR", "Turquía", "Europa"], ["376", "EIS", "Israel", "Medio Oriente"], ["682", "KSA", "Arabia Saudita", "Medio Oriente"], ["784", "UAE", "Emiratos Árabes", "Medio Oriente"],
  ["634", "QAT", "Qatar", "Medio Oriente"], ["710", "EZA", "Sudáfrica", "África"], ["356", "INDA", "India", "Asia"], ["156", "MCHI", "China", "Asia"],
  ["392", "EWJ", "Japón", "Asia"], ["410", "EWY", "Corea del Sur", "Asia"], ["158", "EWT", "Taiwán", "Asia"], ["036", "EWA", "Australia", "Asia"],
  ["554", "ENZL", "Nueva Zelanda", "Asia"], ["360", "EIDO", "Indonesia", "Asia"], ["764", "THD", "Tailandia", "Asia"], ["458", "EWM", "Malasia", "Asia"],
  ["608", "EPHE", "Filipinas", "Asia"], ["704", "VNM", "Vietnam", "Asia"],
];
async function countriesView(req, res) {
  const got = await Promise.all(COUNTRY_ETFS.map(([, s]) => daily(s).catch(() => [])));
  const rows = COUNTRY_ETFS.map(([id, etf, name, reg], i) => (got[i].length > 5 ? { id, etf, name, reg, ...perf(got[i]) } : null)).filter(Boolean)
    .map(({ spark, t, ...r }) => r);
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json({ rows, at: Date.now() });
}

// GET /api/overview?view=week&w=0 -> eventos de la semana (lunes a viernes): datos macro de EE.UU. y resultados de empresas
// grandes (Nasdaq: EPS estimado, antes/después del mercado y, si ya reportó, EPS real y sorpresa). w=1 = semana siguiente.
const money = (s) => { const v = Number(String(s || "").replace(/[$,()]/g, "")); return isFinite(v) && String(s || "").trim() && s !== "N/A" ? (String(s).includes("(") ? -v : v) : null; };
async function weekView(req, res) {
  const now = new Date(), d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7) + (dow === 6 || dow === 0 ? 7 : 0) + 7 * (Number(req.query?.w) || 0));
  const days = [0, 1, 2, 3, 4].map((i) => new Date(+d + i * 864e5).toISOString().slice(0, 10));
  const minCap = Number(req.query?.cap) || 15e9;
  const NUA = { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" };
  const [cal, ...earn] = await Promise.all([
    fetch(`https://economic-calendar.tradingview.com/events?from=${days[0]}T00:00:00Z&to=${days[4]}T23:59:59Z&countries=US`, { headers: { "User-Agent": UA, Origin: "https://www.tradingview.com" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ...days.map((dd) => fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dd}`, { headers: NUA }).then((r) => (r.ok ? r.json() : null)).catch(() => null)),
  ]);
  const out = days.map((dd, i) => {
    const macro = (cal?.result || []).filter((e) => e.date?.slice(0, 10) === dd && e.importance >= 0 && !/holiday|speaks|speech|election/i.test(e.title))
      .map((e) => ({ t: Date.parse(e.date), title: e.title, period: e.period || "", actual: e.actual, forecast: e.forecast, previous: e.previous, unit: e.unit || "", scale: e.scale || "", high: e.importance >= 1 }))
      .sort((a, b) => b.high - a.high || a.t - b.t);
    const rows = earn[i]?.data?.rows || [];
    const er = rows.map((r) => ({ s: r.symbol, n: r.name, cap: money(r.marketCap), est: money(r.epsForecast), eps: money(r.eps), surp: r.surprise != null && r.surprise !== "N/A" ? Number(r.surprise) : null,
      when: /pre-market/.test(r.time) ? "pre" : /after-hours/.test(r.time) ? "post" : "" }))
      .filter((r) => r.cap >= minCap && !/\.[A-Z]$/.test(r.s)).sort((a, b) => b.cap - a.cap).slice(0, 40);
    return { date: dd, macro, earnings: er, nEarn: rows.length };
  });
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
  return res.status(200).json({ days: out, at: Date.now() });
}

export default async function handler(req, res) {
  if (req.query?.view === "regime") return regimeView(req, res);
  if (req.query?.view === "countries") return countriesView(req, res);
  if (req.query?.view === "week") return weekView(req, res);
  if (req.query?.view === "macro") return macroView(req, res);
  if (req.query?.view === "chart") return chartView(req, res);
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
