// GET /api/company?symbol=AAPL -> historia anual normalizada para la ficha de empresa.
// Fuente 1: SEC EDGAR (10-K, vía /api/fundamentals) para empresas que reportan en EE.UU. en dólares.
// Fuente 2: Yahoo Finance (estados contables anuales) para el resto: ADRs, Brasil, Argentina, etc.
import fundamentals from "./fundamentals.js";
import { yget } from "./_screen.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const KEYS = ["revenue", "grossProfit", "operatingIncome", "netIncome", "fcf", "operatingCashFlow", "eps", "dps", "debt", "cash", "equity", "shares"];

function callFundamentals(symbol) {
  return new Promise((resolve) => {
    const res = {
      code: 200, setHeader() {},
      status(c) { this.code = c; return this; },
      json(j) { resolve(this.code === 200 ? j : null); },
    };
    fundamentals({ query: { symbol } }, res).catch(() => resolve(null));
  });
}

function fromSec(f) {
  const m = f?.metrics;
  if (!m?.revenue?.annual?.length) return null;
  const map = {
    revenue: "revenue", grossProfit: "grossProfit", operatingIncome: "operatingIncome", netIncome: "netIncome",
    fcf: "fcf", operatingCashFlow: "operatingCashFlow", eps: "eps", dps: "dividendsPerShare",
    debt: "totalDebt", cash: "cashBalance", equity: "equityBalance",
  };
  const years = [...new Set(m.revenue.annual.map((x) => x.p))].sort();
  const series = {};
  for (const [k, src] of Object.entries(map)) {
    const byYear = new Map((m[src]?.annual || []).map((x) => [x.p, x.v]));
    series[k] = years.map((y) => byYear.get(y) ?? null);
  }
  return { source: "SEC (10-K)", currency: "USD", years, series };
}

async function fromYahoo(symbol) {
  const T = {
    revenue: "TotalRevenue", grossProfit: "GrossProfit", operatingIncome: "OperatingIncome", netIncome: "NetIncome",
    fcf: "FreeCashFlow", operatingCashFlow: "OperatingCashFlow", eps: "DilutedEPS", debt: "TotalDebt",
    cash: "CashAndCashEquivalents", equity: "StockholdersEquity", shares: "DilutedAverageShares", divPaid: "CashDividendsPaid",
  };
  const now = Math.floor(Date.now() / 1000);
  const types = Object.values(T).map((t) => "annual" + t).join(",");
  const j = await yget(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=946684800&period2=${now}`);
  const res = j?.timeseries?.result || [];
  const raw = {}; let currency = null;
  for (const r of res) {
    const type = r?.meta?.type?.[0]; if (!type) continue;
    const key = Object.keys(T).find((k) => "annual" + T[k] === type);
    for (const pt of r[type] || []) {
      if (!pt?.asOfDate || pt.reportedValue?.raw == null) continue;
      const y = pt.asOfDate.slice(0, 4);
      (raw[key] = raw[key] || {})[y] = pt.reportedValue.raw;
      if (pt.currencyCode && key === "revenue") currency = pt.currencyCode;
    }
  }
  const years = Object.keys(raw.revenue || raw.netIncome || {}).sort();
  if (!years.length) return null;
  const series = {};
  for (const k of KEYS) series[k] = years.map((y) => raw[k]?.[y] ?? null);
  // Dividendo por acción aproximado = dividendos pagados ÷ acciones
  series.dps = years.map((y) => raw.divPaid?.[y] != null && raw.shares?.[y] ? Math.abs(raw.divPaid[y]) / raw.shares[y] : null);
  return { source: "Yahoo Finance (estados anuales)", currency, years, series };
}

async function priceHistory(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk&includeAdjustedClose=true`, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const ts = res?.timestamp || [], c = res?.indicators?.quote?.[0]?.close || [];
  return ts.map((t, i) => ({ t: t * 1000, c: c[i] })).filter((p) => p.c != null).map((p) => ({ t: p.t, c: Math.round(p.c * 100) / 100 }));
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return res.status(400).json({ error: "Ticker inválido" });
  try {
    const [f, px] = await Promise.all([
      /^[A-Z.\-]+$/.test(symbol) && !symbol.endsWith(".SA") && !symbol.endsWith(".BA") ? callFundamentals(symbol) : null,
      priceHistory(symbol).catch(() => []),
    ]);
    let hist = fromSec(f);
    if (!hist || hist.years.length < 3) {
      const y = await fromYahoo(symbol).catch(() => null);
      if (y && (!hist || y.years.length > hist.years.length)) hist = y;
    }
    // Limpieza: los últimos 10 ejercicios
    if (hist && hist.years.length > 10) {
      const cut = hist.years.length - 10;
      hist.years = hist.years.slice(cut);
      for (const k of Object.keys(hist.series)) hist.series[k] = hist.series[k].slice(cut);
    }
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
    return res.status(200).json({
      symbol, history: hist, price: px,
      cagr: f?.metrics ? {
        revenue5y: f.metrics.revenueCagr5y?.current ?? null, eps5y: f.metrics.epsCagr5y?.current ?? null,
        fcf5y: f.metrics.fcfCagr5y?.current ?? null, shares5y: f.metrics.sharesCagr5y?.current ?? null,
      } : null,
      sector: f?.sector || null, industry: f?.industry || null,
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
