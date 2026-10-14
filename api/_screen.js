// Descarga de datos del Screener desde Yahoo Finance (lo usan /api/screener y /api/sync).
// El prefijo _ evita que Vercel lo exponga como endpoint.
import { UNIVERSE } from "../lib/universe.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const META = new Map(UNIVERSE.map((r) => [r[0], r]));

let auth = null;
async function yahooAuth(force = false) {
  if (!force && auth && Date.now() - auth.t < 30 * 60 * 1000) return auth;
  const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" });
  const cookie = typeof r1.headers.getSetCookie === "function"
    ? r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
    : (r1.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error("Yahoo: no se pudo obtener crumb");
  auth = { cookie, crumb, t: Date.now() };
  return auth;
}

async function yget(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await yahooAuth(attempt > 0);
    const sep = url.includes("?") ? "&" : "?";
    const r = await fetch(`${url}${sep}crumb=${encodeURIComponent(a.crumb)}`, { headers: { "User-Agent": UA, Cookie: a.cookie } });
    if (r.status === 401 || r.status === 403) continue;
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    return r.json();
  }
  throw new Error("Yahoo: acceso denegado");
}

const raw = (o) => (o && typeof o === "object" ? (o.raw ?? null) : (o ?? null));
const num = (v) => (v == null || !isFinite(v) ? null : v);

async function quotes(symbols) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const j = await yget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(","))}`);
    for (const q of j?.quoteResponse?.result || []) out.set(q.symbol, q);
  }
  return out;
}

async function summary(symbol) {
  try {
    const j = await yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics,summaryDetail,earningsTrend`);
    return j?.quoteSummary?.result?.[0] || null;
  } catch { return null; }
}

async function pool(items, n, fn) {
  const res = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; res[i] = await fn(items[i]); }
  }));
  return res;
}

// Devuelve una fila por símbolo con métricas crudas en USD donde aplica.
export async function loadSymbols(symbols) {
  const q = await quotes(symbols);
  const deep = await pool(symbols, 8, summary);

  // Tipos de cambio a USD: "XXX=X" en Yahoo = unidades de XXX por 1 USD
  const curs = new Set();
  symbols.forEach((s, i) => {
    const c1 = q.get(s)?.currency; const c2 = deep[i]?.financialData?.financialCurrency;
    [c1, c2].forEach((c) => { if (c && c !== "USD") curs.add(c.toUpperCase() === "GBP" || c === "GBp" ? "GBP" : c.toUpperCase()); });
  });
  const fx = { USD: 1 };
  if (curs.size) {
    const fq = await quotes([...curs].map((c) => `${c}=X`));
    for (const c of curs) { const p = fq.get(`${c}=X`)?.regularMarketPrice; if (p) fx[c] = p; }
  }
  const toUsd = (v, cur) => {
    if (v == null || !cur) return null;
    if (cur === "GBp") return fx.GBP ? v / 100 / fx.GBP : null;
    const r = fx[cur.toUpperCase()]; return r ? v / r : null;
  };

  return symbols.map((s, i) => {
    const m = META.get(s) || [s, s, null, null, ""];
    const qt = q.get(s) || {};
    const d = deep[i] || {};
    const fd = d.financialData || {}, ks = d.defaultKeyStatistics || {}, sd = d.summaryDetail || {};
    const tr = d.earningsTrend?.trend || [];
    const g = (p) => { const t = tr.find((x) => x.period === p); const v = raw(t?.growth); return v == null ? null : v * 100; };
    const fcur = fd.financialCurrency || qt.financialCurrency || qt.currency;
    const rev = raw(fd.totalRevenue), om = raw(fd.operatingMargins);
    const equity = raw(ks.bookValue) != null && raw(ks.sharesOutstanding) != null ? raw(ks.bookValue) * raw(ks.sharesOutstanding) : null;
    const invested = equity != null ? (raw(fd.totalDebt) || 0) + equity - (raw(fd.totalCash) || 0) : null;
    let roic = rev != null && om != null && invested > 0 ? (om * rev * 0.79) / invested * 100 : null;
    // En bancos/aseguradoras el ROIC no tiene sentido; y valores extremos suelen venir de ADRs con acciones mal mapeadas
    if (m[2] === "fin" || (roic != null && Math.abs(roic) > 150)) roic = null;
    const px = num(qt.regularMarketPrice);
    const mcapUsd = toUsd(qt.marketCap ?? raw(sd.marketCap), qt.currency);
    const fcfUsd = toUsd(raw(fd.freeCashflow), fcur);
    const tgt = raw(fd.targetMeanPrice);
    const pct = (v) => (v == null ? null : v * 100);
    return {
      s, n: qt.longName || qt.shortName || m[1], sec: m[2], c: m[3], mk: m[4],
      cur: qt.currency || null, px, chg: num(qt.regularMarketChangePercent),
      mcap: mcapUsd, pe: num(qt.trailingPE) ?? raw(sd.trailingPE), fpe: num(qt.forwardPE) ?? raw(ks.forwardPE),
      pb: num(qt.priceToBook), eps: num(qt.epsTrailingTwelveMonths), feps: num(qt.epsForward) ?? raw(ks.forwardEps),
      hi52: num(qt.fiftyTwoWeekHigh), lo52: num(qt.fiftyTwoWeekLow),
      roe: pct(raw(fd.returnOnEquity)), roic, gm: pct(raw(fd.grossMargins)), om: pct(om), nm: pct(raw(fd.profitMargins)),
      revG: pct(raw(fd.revenueGrowth)), epsQ: pct(raw(fd.earningsGrowth)),
      epsCY: g("0y"), epsNY: g("+1y"), epsLT: g("+5y"),
      fcf: fcfUsd, fcfY: fcfUsd != null && mcapUsd ? (fcfUsd / mcapUsd) * 100 : null,
      de: m[2] !== "fin" && raw(fd.debtToEquity) != null ? raw(fd.debtToEquity) / 100 : null,
      pegY: raw(ks.pegRatio), tgt, upside: tgt && px ? (tgt / px - 1) * 100 : null,
      rec: raw(fd.recommendationMean), nAn: raw(fd.numberOfAnalystOpinions), beta: raw(sd.beta),
      ok: !!qt.regularMarketPrice, deep: !!d.financialData,
      t: Date.now(),
    };
  });
}
