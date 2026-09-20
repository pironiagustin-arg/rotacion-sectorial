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
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  epsDiluted: ["EarningsPerShareDiluted"],
  dividendsPerShare: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
  interest: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
  da: ["Depreciation", "DepreciationAndAmortizationIncludingDiscontinuedOperations", "DepreciationAmortizationAndOther", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationDepletionAndAmortization"], // el de menor prioridad va primero (en empates gana el último)
  buyback: ["PaymentsForRepurchaseOfCommonStock"],
  repay: ["RepaymentsOfDebt", "RepaymentsOfLongTermDebt", "RepaymentsOfSeniorDebt", "RepaymentsOfNotesPayable"],
  issue: ["ProceedsFromIssuanceOfDebt", "ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromIssuanceOfSeniorLongTermDebt", "ProceedsFromNotesPayable"],
};
const INSTANT = {
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations"],
  goodwill: ["Goodwill"],
  intangibles: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
  retained: ["RetainedEarningsAccumulatedDeficit"],
  inventory: ["InventoryNet"],
  ccsti: ["CashCashEquivalentsAndShortTermInvestments"],
};
// Conceptos fragmentados entre empresas: para cada fecha se usa el PRIMER alias que tenga dato (no se mezclan ni suman).
const INSTANT_FIRST = {
  sti: ["MarketableSecuritiesCurrent", "ShortTermInvestments", "DebtSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecurities", "MarketableSecurities", "OtherShortTermInvestments"],
  ltNC: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "ConvertibleNotesPayableNoncurrent"],
  stDebt: ["LongTermDebtCurrent", "DebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent", "ShortTermBorrowings"],
  ltTotal: ["LongTermDebt"],
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

function firstSeries(facts, aliases) {
  const map = new Map();
  for (const name of aliases) {
    const node = facts?.["us-gaap"]?.[name];
    const u = node?.units?.USD;
    if (!u) continue;
    for (const e of instantSeries(u)) if (!map.has(e.end)) map.set(e.end, e.val);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([end, val]) => ({ end, val }));
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
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData,price,earningsTrend&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, { headers: { "User-Agent": YH_UA, Cookie: cookie } });
    if (!r.ok) { yhAuth = null; return null; }
    const j = await r.json();
    const res = j?.quoteSummary?.result?.[0];
    if (!res) return null;
    const raw = (o) => (o && typeof o === "object" ? o.raw ?? null : o ?? null);
    const sd = res.summaryDetail || {}, ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, pr = res.price || {};
    // Estimaciones de consenso: NTM = mezcla ponderada del año fiscal en curso (0y) y el siguiente (+1y)
    const tr = (res.earningsTrend?.trend || []);
    const t0 = tr.find((t) => t.period === "0y"), t1 = tr.find((t) => t.period === "+1y");
    let ntmRev = null, ntmEps = null;
    if (t0 && t1 && t0.endDate) {
      const rem = Math.min(1, Math.max(0, (new Date(t0.endDate) - Date.now()) / (365 * 86400000)));
      const mix = (a, b) => (a != null && b != null ? a * rem + b * (1 - rem) : null);
      ntmRev = mix(raw(t0.revenueEstimate?.avg), raw(t1.revenueEstimate?.avg));
      ntmEps = mix(raw(t0.earningsEstimate?.avg), raw(t1.earningsEstimate?.avg));
    }
    return {
      ntmRev, ntmEps,
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
// [key, label, categoría, unidad, dir]  dir: +1 = más alto es mejor, -1 = más bajo es mejor, 0 = sin sentido direccional
const METRIC_DEFS = [
  // Valuación · múltiplos
  ["peRatio", "P/E (LTM)", "Valuación · Múltiplos", "x", -1],
  ["peForward", "P/E (NTM)", "Valuación · Múltiplos", "x", -1],
  ["peg", "PEG", "Valuación · Múltiplos", "x", -1],
  ["psRatio", "P/S (LTM)", "Valuación · Múltiplos", "x", -1],
  ["psForward", "P/S (NTM)", "Valuación · Múltiplos", "x", -1],
  ["pbRatio", "P/B", "Valuación · Múltiplos", "x", -1],
  ["ptbvRatio", "P/TBV", "Valuación · Múltiplos", "x", -1],
  ["pfcfRatio", "P/FCF (LTM)", "Valuación · Múltiplos", "x", -1],
  ["pgpRatio", "P/Utilidad bruta (LTM)", "Valuación · Múltiplos", "x", -1],
  ["evSales", "EV/Ventas (LTM)", "Valuación · Múltiplos", "x", -1],
  ["evSalesFwd", "EV/Ventas (NTM)", "Valuación · Múltiplos", "x", -1],
  ["evEbitda", "EV/EBITDA (LTM)", "Valuación · Múltiplos", "x", -1],
  ["evEbit", "EV/EBIT (LTM)", "Valuación · Múltiplos", "x", -1],
  ["evGp", "EV/Utilidad bruta (LTM)", "Valuación · Múltiplos", "x", -1],
  // Valuación · yields
  ["fcfEvYield", "FCF / EV yield", "Valuación · Yields", "pct", 1],
  ["fcfYield", "FCF / Market cap yield", "Valuación · Yields", "pct", 1],
  ["dividendYield", "Dividend yield", "Valuación · Yields", "pct", 1],
  ["buybackYield", "Buyback yield", "Valuación · Yields", "pct", 1],
  ["debtPaybackYield", "Debt payback yield", "Valuación · Yields", "pct", 1],
  ["shareholderYield", "Shareholder yield", "Valuación · Yields", "pct", 1],
  ["shareholderYieldExDebt", "Shareholder yield sin deuda", "Valuación · Yields", "pct", 1],
  // Márgenes
  ["grossMargin", "Margen bruto (LTM)", "Márgenes", "pct", 1],
  ["ebitdaMargin", "Margen EBITDA (LTM)", "Márgenes", "pct", 1],
  ["opMargin", "Margen EBIT / operativo (LTM)", "Márgenes", "pct", 1],
  ["netMargin", "Margen neto (LTM)", "Márgenes", "pct", 1],
  ["fcfMargin", "Margen FCF (LTM)", "Márgenes", "pct", 1],
  // Rentabilidad
  ["roe", "ROE (LTM)", "Rentabilidad", "pct", 1],
  ["roa", "ROA (LTM)", "Rentabilidad", "pct", 1],
  ["roic", "ROIC / ROC (aprox.)", "Rentabilidad", "pct", 1],
  // Crecimiento
  ["revenueGrowth", "Crecimiento de ingresos (a/a)", "Crecimiento", "pct", 1],
  ["epsGrowth", "Crecimiento del EPS (a/a)", "Crecimiento", "pct", 1],
  // Dividendos
  ["dividendsPerShare", "Dividendo por acción", "Dividendos", "usdps", 1],
  ["payoutRatio", "Payout ratio", "Dividendos", "pct", -1],
  // Apalancamiento / solvencia
  ["debtToEquity", "Deuda total / Patrimonio", "Solvencia", "x", -1],
  ["ltDebtToEquity", "Deuda LP / Patrimonio", "Solvencia", "x", -1],
  ["debtToCapital", "Deuda / Capital total", "Solvencia", "pct", -1],
  ["debtToEbitda", "Deuda total / EBITDA", "Solvencia", "x", -1],
  ["netDebtToEbitda", "Deuda neta / EBITDA", "Solvencia", "x", -1],
  ["netDebtToEbitdaCapex", "Deuda neta / (EBITDA − Capex)", "Solvencia", "x", -1],
  ["currentRatio", "Ratio corriente", "Solvencia", "x", 1],
  ["altmanZ", "Altman Z-Score", "Solvencia", "x", 1],
  // Caja
  ["operatingCashFlow", "Flujo operativo", "Caja", "usd", 1],
  ["fcf", "Free cash flow", "Caja", "usd", 1],
  ["ebitda", "EBITDA", "Caja", "usd", 1],
  // Resultados
  ["revenue", "Ingresos", "Resultados", "usd", 1],
  ["grossProfit", "Utilidad bruta", "Resultados", "usd", 1],
  ["operatingIncome", "Resultado operativo", "Resultados", "usd", 1],
  ["netIncome", "Resultado neto", "Resultados", "usd", 1],
  ["eps", "EPS diluido", "Resultados", "usdps", 1],
  // Balance
  ["totalDebt", "Deuda total", "Balance", "usd", -1],
  ["inventory", "Inventario", "Balance", "usd", 0],
];

// Devuelve { key: { annual: [{p, e, v}], quarterly: [{p, e, v}] } }.
// Anual = ejercicio fiscal. Trimestral = trimestre; los ratios (márgenes, retornos, múltiplos) usan 12 meses móviles (LTM).
function buildSeries(facts, priceMonthly, sharesNow, live) {
  const F = {}, I = {};
  for (const k of Object.keys(FLOW)) F[k] = pickSeries(facts, FLOW[k]);
  for (const k of Object.keys(INSTANT)) I[k] = instantSeries(pickSeries(facts, INSTANT[k]));
  for (const k of Object.keys(INSTANT_FIRST)) I[k] = firstSeries(facts, INSTANT_FIRST[k]);

  const CASHFLOW = new Set(["operatingCashFlow", "capex", "da", "buyback", "repay", "issue"]);
  const A = {}, Q = {};
  for (const k of Object.keys(FLOW)) {
    A[k] = annualFlow(F[k]);
    Q[k] = CASHFLOW.has(k) ? quarterlyFromYTD(F[k]) : k === "dilutedShares" ? quarterlyShares(F[k]) : quarterlyFlow(F[k]);
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
  const avgInstant = (S, end, prevEnd) => {
    const cur = nearestAtOrBefore(S, end);
    const prev = prevEnd ? nearestAtOrBefore(S, prevEnd) : null;
    return cur != null && prev != null ? (cur + prev) / 2 : cur;
  };
  const yearBefore = (end) => { const d = new Date(end); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
  const nz = (v) => (v == null || !isFinite(v) ? null : v);

  // ov = { price, shs, mcap } permite valuar con el precio vivo (para el valor "actual").
  function compute(end, mode, S, ov) {
    const isA = mode === "annual";
    const one = (k) => flowAt(S[k], end);
    const R = (k) => (isA ? one(k) : ttm(S[k], end));
    const inst = (k) => nearestAtOrBefore(I[k], end);

    const oiOf = (get) => get("operatingIncome") ?? (get("pretax") != null ? get("pretax") + (get("interest") ?? 0) : null);
    const rev = R("revenue"), gp = R("grossProfit"), oi = oiOf(R), ni = R("netIncome"), da = R("da");
    const ocf = R("operatingCashFlow"), cap = R("capex"), eps = R("epsDiluted"), divps = R("dividendsPerShare");
    const bb = R("buyback"), rep = R("repay"), iss = R("issue");
    const fcf = ocf != null ? ocf - Math.abs(cap ?? 0) : null;
    const ebitda = oi != null && da != null ? oi + da : null;

    const eq = inst("equity"), ta = inst("totalAssets");
    const tl = inst("totalLiabilities") ?? (ta != null && eq != null ? ta - eq : null);
    const ca = inst("currentAssets"), cl = inst("currentLiabilities");
    const ltNC = inst("ltNC"), stD = inst("stDebt"), ltTot = inst("ltTotal");
    const ltDebt = ltNC ?? ltTot;
    const debt = ltNC != null ? ltNC + (stD ?? 0) : ltTot != null ? ltTot : stD;
    const cashAll = inst("ccsti") ?? (inst("cash") != null || inst("sti") != null ? (inst("cash") ?? 0) + (inst("sti") ?? 0) : null);
    const gw = inst("goodwill") ?? 0, intang = inst("intangibles") ?? 0;

    const prevEnd = yearBefore(end);
    const avgBal = (S) => {
      if (isA) return avgInstant(S, end, prevEnd);
      const pts = [0, 1, 2, 3, 4].map((k) => { const d = new Date(end); d.setDate(d.getDate() - Math.round(k * 91.3) + 12); return nearestAtOrBefore(S, d.toISOString().slice(0, 10), 45); }).filter((x) => x != null);
      return pts.length >= 3 ? pts.reduce((a, b) => a + b, 0) / pts.length : nearestAtOrBefore(S, end);
    };
    const eqAvg = avgBal(I.equity), taAvg = avgBal(I.totalAssets);
    const price = ov?.price ?? priceAt(end);
    const shs = ov?.shs ?? one("dilutedShares") ?? nearestAtOrBefore(S.dilutedShares, end, 130) ?? sharesNow;
    const mcap = ov?.mcap ?? (price != null && shs ? price * shs : null);
    const ev = mcap != null ? mcap + (debt ?? 0) - (cashAll ?? 0) : null;
    const nopat = oi != null ? oi * (1 - TAX_RATE_APPROX) : null;
    const invested = eq != null ? eq + (debt ?? 0) - (inst("cash") ?? 0) : null;
    const tbv = eq != null ? eq - gw - intang : null;
    const netDebt = debt != null ? debt - (cashAll ?? 0) : null;
    const ebitdaCapex = ebitda != null ? ebitda - Math.abs(cap ?? 0) : null;

    const divY = price != null && divps != null ? pct(divps, price) : null;
    const bbY = mcap > 0 && bb != null ? (Math.abs(bb) / mcap) * 100 : null;
    const dpY = mcap > 0 && (rep != null || iss != null) ? (((rep ?? 0) - (iss ?? 0)) / mcap) * 100 : null;
    const sum = (...a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) : null; };
    const wc = ca != null && cl != null ? ca - cl : null, re = inst("retained");
    const z = ta > 0 && tl > 0 && wc != null && re != null && oi != null && rev != null && mcap != null
      ? 1.2 * (wc / ta) + 1.4 * (re / ta) + 3.3 * (oi / ta) + 0.6 * (mcap / tl) + 1.0 * (rev / ta) : null;

    // valores del período puntual (para las series absolutas)
    const oi1 = oiOf(one), da1 = one("da"), ocf1 = one("operatingCashFlow"), cap1 = one("capex");
    return {
      peRatio: price != null && eps > 0 ? price / eps : null,
      psRatio: mcap != null && rev > 0 ? mcap / rev : null,
      pbRatio: mcap != null && eq > 0 ? mcap / eq : null,
      ptbvRatio: mcap != null && tbv > 0 ? mcap / tbv : null,
      pfcfRatio: mcap != null && fcf > 0 ? mcap / fcf : null,
      pgpRatio: mcap != null && gp > 0 ? mcap / gp : null,
      evSales: ev != null && rev > 0 ? ev / rev : null,
      evEbitda: ev != null && ebitda > 0 ? ev / ebitda : null,
      evEbit: ev != null && oi > 0 ? ev / oi : null,
      evGp: ev != null && gp > 0 ? ev / gp : null,
      fcfEvYield: ev > 0 && fcf != null ? (fcf / ev) * 100 : null,
      fcfYield: mcap > 0 && fcf != null ? (fcf / mcap) * 100 : null,
      dividendYield: divY, buybackYield: bbY, debtPaybackYield: dpY,
      shareholderYield: divY != null || bbY != null ? sum(divY, bbY, dpY) : null,
      shareholderYieldExDebt: divY != null || bbY != null ? sum(divY, bbY) : null,
      grossMargin: pct(gp, rev), ebitdaMargin: pct(ebitda, rev), opMargin: pct(oi, rev), netMargin: pct(ni, rev), fcfMargin: pct(fcf, rev),
      roe: pct(ni, eqAvg), roa: pct(ni, taAvg), roic: invested > 0 ? pct(nopat, invested) : null,
      dividendsPerShare: divps,
      payoutRatio: divps != null && eps > 0 ? pct(divps, eps) : null,
      debtToEquity: eq > 0 && debt != null ? debt / eq : null,
      ltDebtToEquity: eq > 0 && ltDebt != null ? ltDebt / eq : null,
      debtToCapital: debt != null && eq != null && debt + eq > 0 ? (debt / (debt + eq)) * 100 : null,
      debtToEbitda: ebitda > 0 && debt != null ? debt / ebitda : null,
      netDebtToEbitda: ebitda > 0 && netDebt != null ? netDebt / ebitda : null,
      netDebtToEbitdaCapex: ebitdaCapex > 0 && netDebt != null ? netDebt / ebitdaCapex : null,
      currentRatio: div(ca, cl),
      altmanZ: z,
      operatingCashFlow: ocf1, fcf: ocf1 != null ? ocf1 - Math.abs(cap1 ?? 0) : null, ebitda: oi1 != null && da1 != null ? oi1 + da1 : null,
      revenue: one("revenue"), grossProfit: one("grossProfit"), operatingIncome: oi1, netIncome: one("netIncome"), eps: one("epsDiluted"),
      totalDebt: debt, inventory: inst("inventory"),
    };
  }

  const out = {};
  for (const [key] of METRIC_DEFS) out[key] = { annual: [], quarterly: [] };
  for (const end of annEnds) {
    const r = compute(end, "annual", A);
    for (const [key] of METRIC_DEFS) if (r[key] !== undefined) out[key].annual.push({ p: end.slice(0, 4), e: end, v: round(nz(r[key]), 4) });
  }
  for (const end of qEnds) {
    const r = compute(end, "quarterly", Q);
    for (const [key] of METRIC_DEFS) if (r[key] !== undefined) out[key].quarterly.push({ p: end, e: end, v: round(nz(r[key]), 4) });
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
  // Valor "actual" con el precio vivo, sobre los últimos 12 meses reportados
  const currentVals = qEnds.length && live?.price ? compute(qEnds[qEnds.length - 1], "quarterly", Q, { price: live.price, shs: live.shares, mcap: live.mcap }) : {};
  return { out, current: currentVals };
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
    const { out: m, current: cv } = buildSeries(facts, monthlyPts, shares, { price, shares, mcap: marketCap });

    // ---- valores actuales (precio vivo + últimos 12 meses reportados) ----
    const current = { ...cv };
    if (current.peRatio == null && summary?.trailingPE != null) current.peRatio = summary.trailingPE;
    // Estimaciones de consenso (NTM): mezcla ponderada del año fiscal en curso y el siguiente
    current.peForward = price && summary?.ntmEps > 0 ? price / summary.ntmEps : summary?.forwardPE ?? null;
    current.psForward = marketCap && summary?.ntmRev > 0 ? marketCap / summary.ntmRev : null;
    const evNow = cv.evSales != null && cv.psRatio != null && cv.psRatio > 0 && marketCap ? marketCap * (cv.evSales / cv.psRatio) : null;
    current.evSalesFwd = evNow && summary?.ntmRev > 0 ? evNow / summary.ntmRev : null;
    // Dividendo indicado y payout: Yahoo (mira hacia adelante)
    if (summary?.dividendYield != null) current.dividendYield = summary.dividendYield * 100;
    if (summary?.payoutRatio != null) current.payoutRatio = summary.payoutRatio * 100;
    // PEG: Yahoo (crecimiento esperado a 5 años); si falta, P/E NTM ÷ crecimiento del EPS 3a
    current.peg = summary?.peg ?? null;
    if (current.peg == null) {
      const e = m.eps.annual.filter((x) => x.v != null && x.v > 0);
      if (e.length >= 4) {
        const cagr = (Math.pow(e.at(-1).v / e.at(-4).v, 1 / 3) - 1) * 100;
        const pe = current.peForward ?? current.peRatio;
        if (cagr > 0 && pe) current.peg = round(pe / cagr, 2);
      }
    }

    const forced = String(req.query?.lynch || "");
    const typeKey = LYNCH_WEIGHTS[forced] ? forced : classifyLynch(m);
    const score = buildScore(m, typeKey);

    // ---- registro genérico ----
    const NOTES = {
      peForward: "Actual = precio ÷ EPS NTM (consenso Yahoo, mezcla del año fiscal en curso y el siguiente). Historia = precio ÷ EPS real de los 12 meses siguientes.",
      peg: "Actual = PEG de Yahoo (crecimiento esperado). Historia = P/E ÷ crecimiento del EPS (CAGR 3 años en anual, interanual del EPS TTM en trimestral; se ocultan valores > 10).",
      psForward: "Precio ÷ ingresos NTM (consenso Yahoo). Solo valor actual.",
      evSalesFwd: "EV ÷ ingresos NTM (consenso Yahoo). Solo valor actual.",
      pfcfRatio: "Se calcula solo con FCF positivo.",
      roic: "NOPAT (EBIT × (1 − 21%)) ÷ (patrimonio + deuda − caja). Aproximación.",
      altmanZ: "Z > 2,99 zona segura; 1,8–2,99 gris; < 1,8 riesgo de quiebra. Con capitalización de mercado.",
      debtPaybackYield: "(Repago de deuda − emisión de deuda) ÷ market cap. Negativo = la empresa se está endeudando.",
      shareholderYield: "Dividendos + recompras + repago neto de deuda, sobre market cap.",
      buybackYield: "Recompras de acciones (LTM) ÷ market cap.",
    };
    const CURRENT_ONLY = new Set(["peForward", "psForward", "evSalesFwd", "peg"]);
    const metrics = {};
    for (const [key, label, category, unit, dir] of METRIC_DEFS) {
      const onlyCurrent = CURRENT_ONLY.has(key);
      const cur = onlyCurrent ? current[key] ?? null : key === "revenueGrowth" || key === "epsGrowth" ? lastVal(m[key].quarterly) ?? lastVal(m[key].annual) : current[key] ?? null;
      // ranking vs. los últimos 3 años (12 trimestres), estilo Koyfin: percentil 1-100
      const hist = m[key].quarterly.slice(-12).map((x) => x.v).filter((v) => v != null && isFinite(v));
      let rank3y = null, avg3y = null;
      if (cur != null && hist.length >= 6) {
        const below = hist.filter((v) => v < cur).length, equal = hist.filter((v) => v === cur).length;
        rank3y = Math.min(100, Math.max(1, Math.round(((below + equal / 2) / hist.length) * 100)));
        avg3y = round(hist.reduce((x, y) => x + y, 0) / hist.length, 4);
      }
      metrics[key] = {
        label, category, unit, dir, note: NOTES[key],
        current: cur == null ? null : round(cur, 4), rank3y, avg3y, n3y: hist.length,
        annual: m[key].annual.map((x) => ({ p: x.p, v: x.v })),
        quarterly: m[key].quarterly.map((x) => ({ p: x.p, v: x.v })),
      };
    }

    // Contrato anterior (lo usa watchlist.html)
    const ann = (k) => m[k].annual;
    const fy = ann("revenue").map((x) => Number(x.p));
    const arr = (k) => ann(k).map((x) => x.v);
    const rg5 = avgOf(m.revenueGrowth.annual.slice(-5));
    const response = {
      ...base,
      marketCap, sharesOutstanding: shares,
      valuation: { peRatio: metrics.peRatio.current, pbRatio: metrics.pbRatio.current, psRatio: metrics.psRatio.current, peForward: current.peForward, peg: current.peg, dividendYield: metrics.dividendYield.current, payoutRatio: metrics.payoutRatio.current },
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
