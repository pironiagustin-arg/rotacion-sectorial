// /api/fundamentals?symbol=AAPL
// Fuente principal: SEC EDGAR (companyfacts). Complemento: Yahoo Finance (precio, forward P/E, PEG, dividendos).
// Cada métrica del registro `metrics` trae su propia serie anual y trimestral.

const UA = "agustin-finance-app contacto@example.com"; // la SEC exige identificar al requester
const YH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TAX_RATE_APPROX = 0.21; // tasa estatutaria US para aproximar NOPAT en ROIC

const FLOW = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  epsDiluted: ["EarningsPerShareDiluted"],
  dividendsPerShare: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
};
const INSTANT = {
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  shortTermDebt: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations"],
};

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...(headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
}

async function findCik(symbol) {
  const map = await fetchJson("https://www.sec.gov/files/company_tickers.json");
  const up = symbol.toUpperCase();
  for (const k of Object.keys(map)) {
    if (map[k].ticker === up) return { cik: String(map[k].cik_str).padStart(10, "0"), title: map[k].title };
  }
  return null;
}

// Combina TODOS los tags alias: hay empresas (p.ej. NVDA) que cambian de concepto XBRL a mitad
// de camino; elegir solo el primer alias con datos hace perder los años más recientes.
function pickSeries(facts, aliases) {
  const merged = [];
  for (const name of aliases) {
    const node = facts?.["us-gaap"]?.[name];
    const u = node?.units?.USD || node?.units?.["USD/shares"] || node?.units?.shares;
    if (u && u.length) merged.push(...u);
  }
  return merged;
}

const DAY = 86400000;
const days = (a, b) => (new Date(b) - new Date(a)) / DAY;

// Deduplica por clave quedándose con la presentación más reciente (filed) — captura restatements.
function dedupe(entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(e);
    const prev = m.get(k);
    if (!prev || (e.filed || "") >= (prev.filed || "")) m.set(k, e);
  }
  return [...m.values()];
}

// Serie de flujo anual: períodos de ~1 año (340-380 días), form 10-K.
function annualFlow(entries) {
  const f = entries.filter((e) => e.start && e.end && e.form && /^10-K/.test(e.form) && days(e.start, e.end) > 340 && days(e.start, e.end) < 380);
  return dedupe(f, (e) => e.end).sort((a, b) => a.end.localeCompare(b.end));
}
// Trimestres sueltos (80-100 días), 10-Q.
function quarterFlowRaw(entries) {
  const f = entries.filter((e) => e.start && e.end && days(e.start, e.end) > 80 && days(e.start, e.end) < 100);
  return dedupe(f, (e) => e.end).sort((a, b) => a.end.localeCompare(b.end));
}
// Trimestres completos: los Q1-Q3 vienen de 10-Q; Q4 = anual − (Q1+Q2+Q3).
function quarterlyFlow(entries) {
  const ann = annualFlow(entries);
  const qs = quarterFlowRaw(entries);
  const out = qs.map((q) => ({ end: q.end, val: q.val }));
  for (const a of ann) {
    const inside = qs.filter((q) => q.start >= a.start && q.end <= a.end && q.end !== a.end);
    if (inside.length === 3 && !qs.some((q) => q.end === a.end)) {
      out.push({ end: a.end, val: a.val - inside.reduce((s, q) => s + q.val, 0) });
    }
  }
  return dedupe(out, (e) => e.end).sort((a, b) => a.end.localeCompare(b.end));
}
// Flujos de caja: los 10-Q reportan acumulado del año (3/6/9 meses). Trimestre = diferencia entre acumulados.
function quarterlyFromYTD(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!e.start || !e.end) continue;
    const d = days(e.start, e.end);
    const b = d > 80 && d < 100 ? 1 : d > 170 && d < 195 ? 2 : d > 255 && d < 285 ? 3 : d > 340 && d < 380 ? 4 : 0;
    if (!b) continue;
    const g = groups.get(e.start) || {};
    if (!g[b] || (e.filed || "") >= (g[b].filed || "")) g[b] = e;
    groups.set(e.start, g);
  }
  const out = [];
  for (const g of groups.values()) {
    for (let b = 1; b <= 4; b++) {
      if (!g[b]) continue;
      if (b === 1) out.push({ end: g[1].end, val: g[1].val });
      else if (g[b - 1]) out.push({ end: g[b].end, val: g[b].val - g[b - 1].val });
    }
  }
  return dedupe(out, (e) => e.end).sort((a, b) => a.end.localeCompare(b.end));
}
// Acciones diluidas: trimestres sueltos + el anual como valor del cuarto trimestre.
function quarterlyShares(entries) {
  const raw = quarterFlowRaw(entries).map((q) => ({ end: q.end, val: q.val }));
  const ann = annualFlow(entries).filter((a) => !raw.some((q) => q.end === a.end)).map((a) => ({ end: a.end, val: a.val }));
  return dedupe([...raw, ...ann], (e) => e.end).sort((a, b) => a.end.localeCompare(b.end));
}
// Balance (instantáneo): último valor presentado por fecha.
function instantSeries(entries) {
  const f = entries.filter((e) => e.end && !e.start);
  return dedupe(f, (e) => e.end).sort((a, b) => a.end.localeCompare(b.end)).map((e) => ({ end: e.end, val: e.val }));
}

function nearestAtOrBefore(series, end, maxGapDays = 100) {
  let best = null;
  for (const s of series) {
    if (s.end <= end) best = s; else break;
  }
  if (best && days(best.end, end) <= maxGapDays) return best.val;
  return null;
}

const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const pct = (a, b) => { const v = div(a, b); return v == null ? null : v * 100; };
const round = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---- Yahoo ----
let yhAuth = null; // cache por instancia caliente
async function yahooAuth() {
  if (yhAuth && Date.now() - yhAuth.t < 30 * 60 * 1000) return yhAuth;
  const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": YH_UA }, redirect: "manual" });
  let cookie = "";
  if (typeof r1.headers.getSetCookie === "function") cookie = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  else cookie = (r1.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": YH_UA, Cookie: cookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error("no crumb");
  yhAuth = { cookie, crumb, t: Date.now() };
  return yhAuth;
}

async function yahooChart(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true`;
  const r = await fetch(url, { headers: { "User-Agent": YH_UA } });
  if (!r.ok) throw new Error(`Yahoo chart ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error("Yahoo chart vacío");
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose;
  const pts = ts.map((t, i) => ({ t: t * 1000, c: q.close?.[i] ?? null, adj: adj?.[i] ?? q.close?.[i] ?? null })).filter((p) => p.c != null);
  return { meta: res.meta || {}, pts };
}

async function yahooSummary(symbol) {
  try {
    const { cookie, crumb } = await yahooAuth();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData,price&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, { headers: { "User-Agent": YH_UA, Cookie: cookie } });
    if (!r.ok) { yhAuth = null; return null; }
    const j = await r.json();
    const res = j?.quoteSummary?.result?.[0];
    if (!res) return null;
    const raw = (o) => (o && typeof o === "object" ? o.raw ?? null : o ?? null);
    const sd = res.summaryDetail || {}, ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, pr = res.price || {};
    return {
      forwardPE: raw(sd.forwardPE) ?? raw(ks.forwardPE),
      trailingPE: raw(sd.trailingPE),
      peg: raw(ks.pegRatio),
      dividendYield: raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield),
      payoutRatio: raw(sd.payoutRatio),
      forwardEps: raw(ks.forwardEps),
      marketCap: raw(pr.marketCap) ?? raw(sd.marketCap),
      shares: raw(ks.sharesOutstanding),
      revenueGrowth: raw(fd.revenueGrowth),
      earningsGrowth: raw(fd.earningsGrowth),
    };
  } catch (e) {
    yhAuth = null;
    return null;
  }
}

// ---- Construcción de métricas ----
const METRIC_DEFS = [
  // key, label, categoría, unidad
  ["revenue", "Ingresos", "Resultados", "usd"],
  ["grossProfit", "Utilidad bruta", "Resultados", "usd"],
  ["operatingIncome", "Resultado operativo", "Resultados", "usd"],
  ["netIncome", "Resultado neto", "Resultados", "usd"],
  ["eps", "EPS diluido", "Resultados", "usdps"],
  ["revenueGrowth", "Crecimiento de ingresos (a/a)", "Crecimiento", "pct"],
  ["epsGrowth", "Crecimiento del EPS (a/a)", "Crecimiento", "pct"],
  ["grossMargin", "Margen bruto", "Márgenes", "pct"],
  ["opMargin", "Margen operativo", "Márgenes", "pct"],
  ["netMargin", "Margen neto", "Márgenes", "pct"],
  ["fcfMargin", "Margen FCF", "Márgenes", "pct"],
  ["roe", "ROE", "Rentabilidad", "pct"],
  ["roa", "ROA", "Rentabilidad", "pct"],
  ["roic", "ROIC (aprox.)", "Rentabilidad", "pct"],
  ["operatingCashFlow", "Flujo operativo", "Caja", "usd"],
  ["fcf", "Free cash flow", "Caja", "usd"],
  ["peRatio", "P/E", "Valuación", "x"],
  ["peForward", "P/E forward", "Valuación", "x"],
  ["peg", "PEG", "Valuación", "x"],
  ["pbRatio", "P/B", "Valuación", "x"],
  ["psRatio", "P/S", "Valuación", "x"],
  ["dividendYield", "Dividend yield", "Dividendos", "pct"],
  ["dividendsPerShare", "Dividendo por acción", "Dividendos", "usdps"],
  ["payoutRatio", "Payout ratio", "Dividendos", "pct"],
  ["debtToEquity", "Deuda / Patrimonio", "Solvencia", "x"],
  ["currentRatio", "Ratio corriente", "Solvencia", "x"],
];

// Devuelve { annual: [{p, v}], quarterly: [{p, v}] } por métrica.
function buildSeries(facts, priceMonthly, sharesNow) {
  const F = {}, I = {};
  for (const k of Object.keys(FLOW)) F[k] = pickSeries(facts, FLOW[k]);
  for (const k of Object.keys(INSTANT)) I[k] = instantSeries(pickSeries(facts, INSTANT[k]));

  const A = {}, Q = {};
  for (const k of Object.keys(FLOW)) {
    A[k] = annualFlow(F[k]);
    Q[k] = k === "operatingCashFlow" || k === "capex" ? quarterlyFromYTD(F[k]) : k === "dilutedShares" ? quarterlyShares(F[k]) : quarterlyFlow(F[k]);
  }

  const annEnds = A.revenue.length ? A.revenue.map((e) => e.end) : A.netIncome.map((e) => e.end);
  const qEnds = Q.revenue.length ? Q.revenue.map((e) => e.end) : Q.netIncome.map((e) => e.end);

  const flowAt = (S, end) => S.find((e) => e.end === end)?.val ?? null;
  const priceAt = (end) => {
    let best = null;
    const tEnd = new Date(end).getTime();
    for (const p of priceMonthly) { if (p.t <= tEnd + 5 * DAY) best = p; else break; }
    return best && tEnd - best.t < 45 * DAY ? best.c : null;
  };
  const ttm = (S, end) => {
    const i = S.findIndex((e) => e.end === end);
    if (i < 3) return null;
    const last4 = S.slice(i - 3, i + 1);
    if (days(last4[0].end, last4[3].end) > 300) return null; // hueco en la serie
    return last4.reduce((s, e) => s + e.val, 0);
  };
  const avgInstant = (S, end, prevEndGuess) => {
    const cur = nearestAtOrBefore(S, end);
    const prev = prevEndGuess ? nearestAtOrBefore(S, prevEndGuess) : null;
    return cur != null && prev != null ? (cur + prev) / 2 : cur;
  };
  const yearBefore = (end) => { const d = new Date(end); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };

  const out = {};
  for (const [key] of METRIC_DEFS) out[key] = { annual: [], quarterly: [] };

  // Cálculo genérico para un período (annual o quarterly). `getFlow(k, end)` devuelve el flujo del período
  // (anual: valor FY; trimestral: TTM para ratios de retorno, trimestre suelto para márgenes).
  function compute(end, mode, seriesFlow) {
    const isA = mode === "annual";
    const cur = (k) => flowAt(seriesFlow[k], end);
    const roll = (k) => (isA ? cur(k) : ttm(seriesFlow[k], end)); // base para retornos
    const rev = cur("revenue"), gp = cur("grossProfit"), oi = cur("operatingIncome"), ni = cur("netIncome");
    const ocf = cur("operatingCashFlow"), cap = cur("capex");
    const fcf = ocf != null ? ocf - Math.abs(cap ?? 0) : null;
    const rev_r = roll("revenue"), ni_r = roll("netIncome"), oi_r = roll("operatingIncome");
    const eps_r = roll("epsDiluted");
    const prevEnd = yearBefore(end);
    const eq = nearestAtOrBefore(I.equity, end), ta = nearestAtOrBefore(I.totalAssets, end);
    const eqAvg = avgInstant(I.equity, end, prevEnd), taAvg = avgInstant(I.totalAssets, end, prevEnd);
    const debt = (nearestAtOrBefore(I.longTermDebt, end) ?? 0) + (nearestAtOrBefore(I.shortTermDebt, end) ?? 0);
    const cash = nearestAtOrBefore(I.cash, end) ?? 0;
    const nopat = oi_r != null ? oi_r * (1 - TAX_RATE_APPROX) : null;
    const investedCap = eq != null ? eq + debt - cash : null;
    const price = priceAt(end);
    const shs = cur("dilutedShares") ?? nearestAtOrBefore(seriesFlow.dilutedShares, end, 130) ?? sharesNow;
    const divps = isA ? cur("dividendsPerShare") : ttm(seriesFlow.dividendsPerShare, end);

    const r = {
      revenue: rev, grossProfit: gp, operatingIncome: oi, netIncome: ni, eps: isA ? cur("epsDiluted") : cur("epsDiluted"),
      operatingCashFlow: ocf, fcf,
      grossMargin: pct(gp, rev), opMargin: pct(oi, rev), netMargin: pct(ni, rev), fcfMargin: pct(fcf, rev),
      roe: pct(ni_r, eqAvg), roa: pct(ni_r, taAvg),
      roic: investedCap && investedCap > 0 ? pct(nopat, investedCap) : null,
      peRatio: price != null && eps_r ? (eps_r > 0 ? price / eps_r : null) : null,
      pbRatio: price != null && eq && shs ? div(price * shs, eq) : null, // acciones diluidas promedio del período
      psRatio: price != null && rev_r && shs ? div(price * shs, rev_r) : null,
      dividendsPerShare: divps,
      dividendYield: price != null && divps != null ? pct(divps, price) : null,
      payoutRatio: divps != null && eps_r ? (eps_r > 0 ? pct(divps, eps_r) : null) : null,
      debtToEquity: div(debt || (nearestAtOrBefore(I.longTermDebt, end) ?? null), eq),
      currentRatio: div(nearestAtOrBefore(I.currentAssets, end), nearestAtOrBefore(I.currentLiabilities, end)),
    };
    return r;
  }

  const A2 = A, Q2 = Q;
  for (const end of annEnds) {
    const r = compute(end, "annual", A2);
    for (const [key] of METRIC_DEFS) if (r[key] !== undefined) out[key].annual.push({ p: end.slice(0, 4), e: end, v: round(r[key], 4) });
  }
  for (const end of qEnds) {
    const r = compute(end, "quarterly", Q2);
    for (const [key] of METRIC_DEFS) if (r[key] !== undefined) out[key].quarterly.push({ p: end, e: end, v: round(r[key], 4) });
  }
  // Crecimientos a/a
  const growth = (arr, lag) => arr.map((pt, i) => {
    const prev = arr[i - lag];
    return { p: pt.p, e: pt.e, v: prev && prev.v && pt.v != null && prev.v > 0 ? round(((pt.v / prev.v) - 1) * 100, 3) : null };
  });
  out.revenueGrowth.annual = growth(out.revenue.annual, 1);
  out.revenueGrowth.quarterly = growth(out.revenue.quarterly, 4);
  out.epsGrowth.annual = growth(out.eps.annual, 1);
  out.epsGrowth.quarterly = growth(out.eps.quarterly, 4);

  // P/E forward y PEG históricos (Yahoo solo da el valor actual):
  //  - P/E forward(t) = precio(t) / EPS realizado de los 12 meses siguientes
  //  - PEG(t)         = P/E(t) / crecimiento del EPS (CAGR 3a en anual; interanual del EPS TTM en trimestral). Se descartan PEG > 10.
  const epsAt = (end) => flowAt(A.epsDiluted, end);
  out.peForward.annual = annEnds.map((end, i) => {
    const next = annEnds[i + 1] ? epsAt(annEnds[i + 1]) : null;
    const price = priceAt(end);
    return { p: end.slice(0, 4), e: end, v: price != null && next > 0 ? round(price / next, 4) : null };
  });
  out.peg.annual = annEnds.map((end, i) => {
    const pe = out.peRatio.annual[i]?.v;
    const a = i >= 3 ? epsAt(annEnds[i - 3]) : null, b = epsAt(end);
    const cagr = a > 0 && b > 0 ? (Math.pow(b / a, 1 / 3) - 1) * 100 : null;
    const v = pe > 0 && cagr > 0 ? pe / cagr : null;
    return { p: end.slice(0, 4), e: end, v: v != null && v <= 10 ? round(v, 4) : null };
  });
  const ttmEps = qEnds.map((e) => ttm(Q.epsDiluted, e));
  out.peForward.quarterly = qEnds.map((end, i) => {
    const fwd = ttmEps[i + 4], fEnd = qEnds[i + 4];
    const ok = fwd > 0 && fEnd && days(end, fEnd) > 330 && days(end, fEnd) < 400;
    const price = priceAt(end);
    return { p: end, e: end, v: ok && price != null ? round(price / fwd, 4) : null };
  });
  out.peg.quarterly = qEnds.map((end, i) => {
    const pe = out.peRatio.quarterly[i]?.v;
    const cur = ttmEps[i], prev = i >= 4 ? ttmEps[i - 4] : null;
    const g = prev > 0 && cur > 0 ? (cur / prev - 1) * 100 : null;
    const v = pe > 0 && g > 0 ? pe / g : null;
    return { p: end, e: end, v: v != null && v <= 10 ? round(v, 4) : null };
  });
  return out;
}

function avgOf(arr) {
  const v = arr.map((x) => x.v).filter((x) => x != null && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function lastVal(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].v != null) return arr[i].v;
  return null;
}
function stdev(vals) {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1));
}
// Percentil de `x` dentro de `arr` (0-100).
function percentile(arr, x) {
  const v = arr.filter((y) => y != null && isFinite(y));
  if (v.length < 3 || x == null) return null;
  return (v.filter((y) => y <= x).length / v.length) * 100;
}

const LYNCH_LABELS = {
  fastGrower: "Fast Grower (crecimiento rápido)",
  stalwart: "Stalwart (crecimiento estable)",
  slowGrower: "Slow Grower (crecimiento lento)",
  cyclical: "Cíclica",
  turnaround: "Turnaround (recuperación)",
  assetPlay: "Asset Play (activos ocultos)",
};
const LYNCH_WEIGHTS = {
  fastGrower: { growth: 1.8, profitability: 1, valuation: 1, health: 0.8 },
  stalwart: { growth: 1, profitability: 1.2, valuation: 1, health: 1 },
  slowGrower: { growth: 0.6, profitability: 1, valuation: 1.2, health: 1.2 },
  cyclical: { growth: 1, profitability: 1, valuation: 1.2, health: 1.4 },
  turnaround: { growth: 1, profitability: 0.8, valuation: 1, health: 1.8 },
  assetPlay: { growth: 0.6, profitability: 0.8, valuation: 1.5, health: 1.2 },
};

function classifyLynch(m) {
  const revG = avgOf(m.revenueGrowth.annual.slice(-5));
  const revGs = m.revenueGrowth.annual.slice(-6).map((x) => x.v).filter((x) => x != null);
  const ni = m.netIncome.annual.map((x) => x.v);
  const niLast = ni[ni.length - 1];
  const netMg = m.netMargin.annual.map((x) => x.v).filter((x) => x != null);
  const pb = lastVal(m.pbRatio.annual);
  if (niLast != null && niLast < 0) return "turnaround";
  if (netMg.length >= 4 && netMg[netMg.length - 1] < netMg.slice(-4)[0] - 8 && netMg[netMg.length - 1] < 5) return "turnaround";
  if (pb != null && pb > 0 && pb < 1) return "assetPlay";
  if (revGs.length >= 4 && stdev(revGs) > 15 && (revG ?? 0) < 20) return "cyclical";
  if (revG != null && revG >= 20) return "fastGrower";
  if (revG != null && revG >= 8) return "stalwart";
  return "slowGrower";
}

function buildScore(m, typeKey) {
  const comp = {};
  const pctile = (metric, higherBetter) => {
    const s = m[metric].annual.map((x) => x.v);
    const cur = lastVal(m[metric].annual);
    const p = percentile(s, cur);
    if (p == null) return null;
    return Math.round(higherBetter ? p : 100 - p);
  };
  const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  comp.growth = mean([pctile("revenueGrowth", true), pctile("epsGrowth", true)]);
  comp.profitability = mean([pctile("opMargin", true), pctile("netMargin", true), pctile("roe", true), pctile("roic", true)]);
  comp.valuation = mean([pctile("peRatio", false), pctile("psRatio", false), pctile("pbRatio", false)]);
  comp.health = mean([pctile("debtToEquity", false), pctile("currentRatio", true)]);
  const w = LYNCH_WEIGHTS[typeKey];
  let num = 0, den = 0;
  for (const k of Object.keys(comp)) if (comp[k] != null) { num += comp[k] * w[k]; den += w[k]; }
  return { total: den ? Math.round(num / den) : null, components: comp, weights: w };
}

export default async function handler(req, res) {
  try {
    const symbol = String(req.query?.symbol || "").trim().toUpperCase();
    if (!/^[A-Z.\-]{1,10}$/.test(symbol)) { res.status(400).json({ error: "Ticker inválido" }); return; }

    const [daily, monthly, summary, cikInfo] = await Promise.all([
      yahooChart(symbol, "5y", "1d").catch(() => null),
      yahooChart(symbol, "max", "1mo").catch(() => null),
      yahooSummary(symbol),
      findCik(symbol).catch(() => null),
    ]);
    if (!daily && !cikInfo) { res.status(404).json({ error: `No encontré datos para ${symbol}` }); return; }

    const meta = daily?.meta || {};
    const price = meta.regularMarketPrice ?? daily?.pts?.at(-1)?.c ?? null;
    const priceHist = (daily?.pts || []).map((p) => ({ t: p.t, c: p.c }));
    const base = {
      symbol,
      name: meta.longName || meta.shortName || cikInfo?.title || symbol,
      cik: cikInfo?.cik || null,
      price,
      currency: meta.currency || "USD",
      exchange: meta.fullExchangeName || meta.exchangeName || null,
      last_update: new Date().toISOString(),
    };

    let cf = null;
    if (cikInfo) cf = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cikInfo.cik}.json`).catch(() => null);

    if (!cikInfo || !cf) {
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
      res.status(200).json({
        ...base, marketCap: summary?.marketCap ?? null,
        note: "No hay estados contables en la SEC para este ticker (ETF, empresa extranjera o no listada en EE.UU.). Se muestra solo el precio.",
        history: { source: "yahoo_price_only", price: priceHist },
      });
      return;
    }

    const facts = cf.facts || {};
    // Acciones en circulación: dei (portada del 10-K/10-Q) o Yahoo.
    const dei = facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [];
    const sharesSec = dei.length ? dei.slice().sort((a, b) => a.end.localeCompare(b.end)).at(-1).val : null;
    const shares = summary?.shares || sharesSec || null;
    const marketCap = summary?.marketCap || (price && shares ? price * shares : null);

    const monthlyPts = (monthly?.pts || []).map((p) => ({ t: p.t, c: p.c }));
    const m = buildSeries(facts, monthlyPts, shares);

    // Métricas de mercado (actuales) que no tienen historia en SEC
    const ttmEps = (() => { const q = m.eps.quarterly.filter((x) => x.v != null); return q.length >= 4 ? q.slice(-4).reduce((s, x) => s + x.v, 0) : lastVal(m.eps.annual); })();
    const peNow = summary?.trailingPE ?? (price && ttmEps > 0 ? price / ttmEps : null);
    const eqSeries = instantSeries(pickSeries(facts, INSTANT.equity));
    const eqNow = eqSeries.length ? eqSeries.at(-1).val : null;
    const pbNow = marketCap && eqNow > 0 ? marketCap / eqNow : null;
    const psNow = (() => { const r = m.revenue.quarterly.slice(-4); return r.length === 4 && marketCap ? div(marketCap, r.reduce((s, x) => s + (x.v || 0), 0)) : null; })();

    const current = {
      peRatio: peNow, peForward: summary?.forwardPE ?? null, peg: summary?.peg ?? null,
      pbRatio: pbNow ?? lastVal(m.pbRatio.annual), psRatio: psNow ?? lastVal(m.psRatio.annual),
      dividendYield: summary?.dividendYield != null ? summary.dividendYield * 100 : lastVal(m.dividendYield.quarterly),
      payoutRatio: summary?.payoutRatio != null ? summary.payoutRatio * 100 : lastVal(m.payoutRatio.annual),
    };

    // PEG calculado si Yahoo no lo trae: P/E fwd (o trailing) / crecimiento de EPS estimado (aprox. crecimiento EPS 3a CAGR)
    if (current.peg == null) {
      const e = m.eps.annual.filter((x) => x.v != null && x.v > 0);
      if (e.length >= 4) {
        const a = e.at(-4).v, b = e.at(-1).v;
        const cagr = (Math.pow(b / a, 1 / 3) - 1) * 100;
        const pe = current.peForward ?? current.peRatio;
        if (cagr > 0 && pe) current.peg = round(pe / cagr, 2);
      }
    }

    const forced = String(req.query?.lynch || "");
    const typeKey = LYNCH_WEIGHTS[forced] ? forced : classifyLynch(m);
    const score = buildScore(m, typeKey);

    // Registro genérico: cada métrica con su serie anual y trimestral y su valor actual
    const metrics = {};
    for (const [key, label, category, unit] of METRIC_DEFS) {
      const onlyCurrent = key === "peForward" || key === "peg";
      const cur = onlyCurrent ? current[key] ?? null : current[key] !== undefined && current[key] !== null ? current[key] : lastVal(m[key].quarterly) ?? lastVal(m[key].annual);
      metrics[key] = {
        label, category, unit,
        note: key === "peForward"
          ? "Historia = precio ÷ EPS real de los 12 meses siguientes (no son estimaciones de la época). La línea punteada es el P/E forward actual de Yahoo, basado en estimaciones."
          : key === "peg"
          ? "Historia = P/E ÷ crecimiento del EPS (CAGR 3 años en anual, variación interanual del EPS TTM en trimestral; se ocultan valores > 10). La línea punteada es el PEG actual de Yahoo, basado en estimaciones."
          : undefined,
        current: cur == null ? null : round(cur, 4),
        annual: m[key].annual.map((x) => ({ p: x.p, v: x.v })),
        quarterly: m[key].quarterly.map((x) => ({ p: x.p, v: x.v })),
      };
    }
    metrics.peRatio.current = round(current.peRatio, 3) ?? metrics.peRatio.current;
    metrics.pbRatio.current = round(current.pbRatio, 3) ?? metrics.pbRatio.current;
    metrics.psRatio.current = round(current.psRatio, 3) ?? metrics.psRatio.current;
    metrics.dividendYield.current = round(current.dividendYield, 3) ?? metrics.dividendYield.current;
    metrics.payoutRatio.current = round(current.payoutRatio, 3) ?? metrics.payoutRatio.current;

    // Contrato anterior (lo usa watchlist.html)
    const ann = (k) => m[k].annual;
    const fy = ann("revenue").map((x) => Number(x.p));
    const arr = (k) => ann(k).map((x) => x.v);
    const rg5 = avgOf(m.revenueGrowth.annual.slice(-5));
    const response = {
      ...base,
      marketCap, sharesOutstanding: shares,
      valuation: { peRatio: current.peRatio, pbRatio: current.pbRatio, psRatio: current.psRatio, peForward: current.peForward, peg: current.peg, dividendYield: current.dividendYield, payoutRatio: current.payoutRatio },
      profitability: {
        grossMarginLatest: lastVal(m.grossMargin.annual), opMarginLatest: lastVal(m.opMargin.annual), netMarginLatest: lastVal(m.netMargin.annual),
        roeLatest: lastVal(m.roe.annual), roaLatest: lastVal(m.roa.annual), roicLatest: lastVal(m.roic.annual),
      },
      growth: { revenueGrowthAvg5y: round(rg5, 2), revenueGrowthLatest: lastVal(m.revenueGrowth.annual) },
      financialHealth: { debtToEquityLatest: lastVal(m.debtToEquity.annual), currentRatioLatest: lastVal(m.currentRatio.annual) },
      lynch: { type: typeKey, label: LYNCH_LABELS[typeKey], forced: LYNCH_WEIGHTS[forced] ? true : false, auto: classifyLynch(m) },
      lynchOptions: Object.fromEntries(Object.entries(LYNCH_LABELS)),
      score,
      metrics,
      history: {
        source: "sec",
        annualYears: ann("revenue").length,
        quarterlyPeriods: m.revenue.quarterly.length,
        annual: { fy, revenue: arr("revenue"), netIncome: arr("netIncome"), grossMargin: arr("grossMargin"), opMargin: arr("opMargin"), netMargin: arr("netMargin"), roe: arr("roe"), roa: arr("roa"), debtToEquity: arr("debtToEquity"), currentRatio: arr("currentRatio") },
        quarterly: { end: m.revenue.quarterly.map((x) => x.p), revenue: m.revenue.quarterly.map((x) => x.v), netIncome: m.netIncome.quarterly.map((x) => x.v) },
        price: priceHist,
      },
    };
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
