// Fundamentales anuales por empresa (últimos ~5 ejercicios) para el score por industria y la comparación
// contra la historia propia. Fuente: estados anuales de Yahoo Finance (igual para EE.UU., ADRs, Brasil y Argentina)
// + backlog contractual (RPO) de la SEC para empresas que reportan en EE.UU.
import { yget } from "./_screen.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SEC_UA = "agustin-finance-app contacto@example.com";
const TYPES = ["TotalRevenue", "CostOfRevenue", "GrossProfit", "OperatingIncome", "EBITDA", "NetIncome", "DilutedEPS",
  "ResearchAndDevelopment", "StockBasedCompensation", "FreeCashFlow", "CapitalExpenditure", "OperatingCashFlow", "TotalDebt",
  "CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments", "StockholdersEquity", "Inventory", "DilutedAverageShares",
  "OrdinarySharesNumber", "CashDividendsPaid", "RepurchaseOfCapitalStock", "InterestExpense", "ReconciledDepreciation",
  "NonInterestExpense", "InvestedCapital", "CurrentAssets", "CurrentLiabilities", "TaxRateForCalcs"];

const ok = (v) => v != null && isFinite(v);
const div = (a, b) => (ok(a) && ok(b) && b !== 0 ? a / b : null);
const pct = (a, b) => { const v = div(a, b); return v == null ? null : v * 100; };
const r4 = (v) => (ok(v) ? Math.round(v * 1e4) / 1e4 : null);

async function statements(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${TYPES.map((t) => "annual" + t).join(",")}&period1=1356998400&period2=${now}`;
  const j = await yget(url);
  const raw = {}; let cur = null;
  for (const r of j?.timeseries?.result || []) {
    const type = r?.meta?.type?.[0]; if (!type) continue;
    const key = type.replace(/^annual/, "");
    for (const pt of r[type] || []) {
      if (!pt?.asOfDate || pt.reportedValue?.raw == null) continue;
      (raw[key] = raw[key] || {})[pt.asOfDate] = pt.reportedValue.raw;
      if (key === "TotalRevenue" && pt.currencyCode) cur = pt.currencyCode;
    }
  }
  const dates = Object.keys(raw.TotalRevenue || raw.NetIncome || {}).sort().slice(-6);
  return { raw, dates, cur };
}

async function weekly(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: { "User-Agent": UA } });
  if (!r.ok) return { pts: [], cur: null };
  const j = await r.json(), res = j?.chart?.result?.[0];
  const ts = res?.timestamp || [], c = res?.indicators?.quote?.[0]?.close || [];
  return { pts: ts.map((t, i) => ({ t: t * 1000, c: c[i] })).filter((p) => p.c != null), cur: res?.meta?.currency || null };
}
const priceAt = (pts, date) => { const t = Date.parse(date) + 3 * 864e5; let best = null; for (const p of pts) { if (p.t <= t) best = p.c; else break; } return best; };

// Backlog contractual (Remaining Performance Obligations) de la SEC
let tickers = null;
async function secRpo(symbol) {
  if (!/^[A-Z][A-Z.\-]*$/.test(symbol)) return null;
  try {
    if (!tickers) {
      const m = await (await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_UA } })).json();
      tickers = new Map(Object.values(m).map((x) => [x.ticker, String(x.cik_str).padStart(10, "0")]));
    }
    const cik = tickers.get(symbol.replace("-", ".")) || tickers.get(symbol);
    if (!cik) return null;
    const r = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/RevenueRemainingPerformanceObligation.json`, { headers: { "User-Agent": SEC_UA } });
    if (!r.ok) return null;
    const u = (await r.json())?.units?.USD || [];
    const last = u.filter((x) => x.end && !x.start).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    return last && Date.now() - Date.parse(last.end) < 400 * 864e5 ? { v: last.val, end: last.end } : null;
  } catch { return null; }
}

export async function fundExtra(symbol, fx) {
  const [st, px, rpo] = await Promise.all([statements(symbol), weekly(symbol).catch(() => ({ pts: [], cur: null })), secRpo(symbol)]);
  const { raw, dates, cur } = st;
  if (!dates.length) return { s: symbol, ok: false };
  const g = (k, d) => raw[k]?.[d] ?? null;
  const prev = (i) => (i > 0 ? dates[i - 1] : null);
  const avg = (k, i) => { const a = g(k, dates[i]), b = prev(i) ? g(k, prev(i)) : null; return ok(a) && ok(b) ? (a + b) / 2 : a; };
  const sameCur = !!cur && !!px.cur && cur.toUpperCase() === px.cur.toUpperCase();
  const fy = {}; const put = (k, i, v) => { (fy[k] = fy[k] || Array(dates.length).fill(null))[i] = r4(v); };

  dates.forEach((d, i) => {
    const rev = g("TotalRevenue", d), oi = g("OperatingIncome", d), ni = g("NetIncome", d), ebitda = g("EBITDA", d);
    const fcf = g("FreeCashFlow", d) ?? (ok(g("OperatingCashFlow", d)) ? g("OperatingCashFlow", d) + (g("CapitalExpenditure", d) ?? 0) : null);
    const debt = g("TotalDebt", d), cash = g("CashCashEquivalentsAndShortTermInvestments", d) ?? g("CashAndCashEquivalents", d);
    const tax = g("TaxRateForCalcs", d); const t = ok(tax) && tax >= 0 && tax < 0.5 ? tax : 0.21;
    const divPaid = Math.abs(g("CashDividendsPaid", d) ?? 0), buy = Math.abs(g("RepurchaseOfCapitalStock", d) ?? 0);
    const shares = g("DilutedAverageShares", d) ?? g("OrdinarySharesNumber", d);
    const da = g("ReconciledDepreciation", d) ?? (ok(ebitda) && ok(oi) ? ebitda - oi : null);
    const ffo = ok(ni) && ok(da) ? ni + da : null;
    put("gm", i, pct(g("GrossProfit", d), rev)); put("om", i, pct(oi, rev)); put("nm", i, pct(ni, rev));
    put("fcfM", i, pct(fcf, rev)); put("roe", i, pct(ni, avg("StockholdersEquity", i)));
    put("roic", i, ok(oi) && g("InvestedCapital", d) > 0 ? pct(oi * (1 - t), avg("InvestedCapital", i)) : null);
    put("revG", i, i > 0 && g("TotalRevenue", prev(i)) > 0 ? pct(rev - g("TotalRevenue", prev(i)), g("TotalRevenue", prev(i))) : null);
    const e0 = i > 0 ? g("DilutedEPS", prev(i)) : null, e1 = g("DilutedEPS", d);
    put("epsG", i, e0 > 0 && ok(e1) ? pct(e1 - e0, e0) : null);
    put("payout", i, ni > 0 && divPaid ? pct(divPaid, ni) : null);
    put("ndEbitda", i, ebitda > 0 && ok(debt) ? (debt - (cash ?? 0)) / ebitda : null);
    put("rnd", i, pct(g("ResearchAndDevelopment", d), rev)); put("sbc", i, pct(g("StockBasedCompensation", d), rev));
    put("invTurn", i, avg("Inventory", i) > 0 && ok(g("CostOfRevenue", d)) ? g("CostOfRevenue", d) / avg("Inventory", i) : null);
    put("eff", i, rev > 0 && ok(g("NonInterestExpense", d)) ? pct(g("NonInterestExpense", d), rev) : null);
    put("capexInt", i, rev > 0 && ok(g("CapitalExpenditure", d)) ? pct(Math.abs(g("CapitalExpenditure", d)), rev) : null);
    put("intCov", i, ok(oi) && Math.abs(g("InterestExpense", d) ?? 0) > 0 ? oi / Math.abs(g("InterestExpense", d)) : null);
    put("dps", i, shares > 0 && divPaid ? divPaid / shares : null);
    put("ffoPS", i, shares > 0 && ok(ffo) ? ffo / shares : null);
    // Múltiplos al cierre de cada ejercicio (solo si la cotización y los balances están en la misma moneda)
    if (sameCur && shares > 0) {
      const p = priceAt(px.pts, d);
      if (ok(p)) {
        const mcap = p * shares, ev = mcap + (debt ?? 0) - (cash ?? 0);
        put("pe", i, e1 > 0 ? p / e1 : null); put("evEbitda", i, ebitda > 0 ? ev / ebitda : null); put("evRev", i, rev > 0 ? ev / rev : null);
        put("pb", i, g("StockholdersEquity", d) > 0 ? mcap / g("StockholdersEquity", d) : null);
        put("fcfY", i, ok(fcf) ? pct(fcf, mcap) : null); put("pffo", i, ffo > 0 ? mcap / ffo : null);
        put("divY", i, divPaid ? pct(divPaid, mcap) : null); put("shY", i, divPaid || buy ? pct(divPaid + buy, mcap) : null);
      }
    }
  });

  const L = dates.length - 1, last = dates[L];
  const toUsd = (v) => { if (!ok(v)) return null; if (!cur || cur.toUpperCase() === "USD") return v; const r = fx?.[cur.toUpperCase()]; return r ? v / r : null; };
  const lastOf = (k) => fy[k]?.[L] ?? null;
  const dpsArr = fy.dps || [];
  const firstDps = dpsArr.findIndex((x) => ok(x) && x > 0);
  const divG = firstDps >= 0 && firstDps < L && dpsArr[L] > 0 ? (Math.pow(dpsArr[L] / dpsArr[firstDps], 1 / (L - firstDps)) - 1) * 100 : null;
  const fcfLast = g("FreeCashFlow", last), cashLast = g("CashCashEquivalentsAndShortTermInvestments", last) ?? g("CashAndCashEquivalents", last);
  const ffoLast = ok(g("NetIncome", last)) ? g("NetIncome", last) + (g("ReconciledDepreciation", last) ?? 0) : null;
  const divPaidLast = Math.abs(g("CashDividendsPaid", last) ?? 0), buyLast = Math.abs(g("RepurchaseOfCapitalStock", last) ?? 0);
  return {
    s: symbol, ok: true, cur, qcur: px.cur, years: dates.map((d) => d.slice(0, 4)), fyEnd: last,
    fy,
    latest: {
      fcfM: lastOf("fcfM"), rnd: lastOf("rnd"), sbc: lastOf("sbc"), invTurn: lastOf("invTurn"), eff: lastOf("eff"),
      capexInt: lastOf("capexInt"), intCov: lastOf("intCov"), divG: r4(divG),
      runway: fcfLast < 0 && cashLast > 0 ? r4(cashLast / -fcfLast) : null,
      ffoUsd: toUsd(ffoLast), payoutsUsd: toUsd(divPaidLast + buyLast),
      rpoUsd: rpo?.v ?? null, rpoEnd: rpo?.end ?? null,
      backlog: rpo?.v && g("TotalRevenue", last) > 0 && (!cur || cur === "USD") ? r4(rpo.v / g("TotalRevenue", last)) : null,
      revUsd: toUsd(g("TotalRevenue", last)),
    },
    t: Date.now(),
  };
}
