// Ficha estilo Koyfin para /api/fundamentals?symbol=X&detail=1
// Combina SEC (historia larga, trimestral desde ~2008) con Yahoo (últimos trimestres, acciones ajustadas por split,
// remuneración en acciones). Si la SEC no coincide con Yahoo en los períodos que comparten, se descarta (pasa en bancos).
const DAY = 86400000;
const YH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const num = (x) => (x == null || !isFinite(x) ? null : +x);
const rd = (x, d = 4) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const median = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cagr = (a, b, yrs) => (a > 0 && b > 0 ? (Math.pow(b / a, 1 / yrs) - 1) * 100 : null);
const qLabel = (t) => { const d = new Date(t); return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`; };

// campo interno → [concepto Yahoo, métrica SEC del registro]
const FLOWS = {
  rev: ["TotalRevenue", "revenue"], ni: ["NetIncome", "netIncome"], fcf: ["FreeCashFlow", "fcf"], ocf: ["OperatingCashFlow", "operatingCashFlow"],
  ebitda: ["EBITDA", "ebitda"], ebit: ["EBIT", "operatingIncome"], opInc: ["OperatingIncome", "operatingIncome"], gp: ["GrossProfit", "grossProfit"],
  sbc: ["StockBasedCompensation", null],
};
const STOCKS = {
  debt: ["TotalDebt", "totalDebt"], cash: ["CashCashEquivalentsAndShortTermInvestments", "cashBalance"], cash2: ["CashAndCashEquivalents", null],
  equity: ["StockholdersEquity", "equityBalance"], assets: ["TotalAssets", "totalAssetsBalance"], ca: ["CurrentAssets", "currentAssetsBalance"],
  cl: ["CurrentLiabilities", "currentLiabilitiesBalance"], ic: ["InvestedCapital", null], shares: ["OrdinarySharesNumber", null], shares2: ["DilutedAverageShares", null],
  tax: ["TaxRateForCalcs", null],
};

async function yahooSeries(symbol) {
  const names = [...Object.values(FLOWS), ...Object.values(STOCKS)].map((x) => x[0]);
  const types = ["quarterly", "annual"].flatMap((p) => names.map((n) => p + n)).join(",");
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=1420070400&period2=${Math.floor(Date.now() / 1000)}`;
  const out = { quarterly: {}, annual: {} };
  try {
    const r = await fetch(url, { headers: { "User-Agent": YH_UA } });
    const j = await r.json();
    for (const x of j?.timeseries?.result || []) {
      const k = x.meta?.type?.[0]; if (!k) continue;
      const per = k.startsWith("quarterly") ? "quarterly" : "annual", name = k.replace(/^(quarterly|annual)/, "");
      out[per][name] = (x[k] || []).filter((e) => e?.reportedValue?.raw != null).map((e) => [Date.parse(e.asOfDate), e.reportedValue.raw]);
    }
  } catch { /* sin Yahoo: queda solo la SEC */ }
  return out;
}

// Une SEC + Yahoo por fecha (Yahoo manda). Si en los períodos compartidos la SEC se desvía > 15% (mediana), no se usa.
function merge(sec, yh) {
  sec = (sec || []).filter((x) => x[1] != null); yh = yh || [];
  const near = (arr, t) => arr.find((x) => Math.abs(x[0] - t) < 20 * DAY);
  const devs = yh.map(([t, v]) => { const s = near(sec, t); return s && v ? Math.abs(s[1] / v - 1) : null; }).filter((x) => x != null);
  // sin períodos compartidos: solo se acepta la SEC si llega hasta donde arranca Yahoo (si no, quedó vieja)
  const fresh = !yh.length || (sec.length && yh[0][0] - sec.at(-1)[0] < 200 * DAY);
  const okSec = sec.length && (devs.length ? median(devs) < 0.15 : fresh);
  const pts = [...yh];
  if (okSec) for (const p of sec) if (!near(yh, p[0])) pts.push(p);
  return pts.sort((a, b) => a[0] - b[0]);
}

function interp(pts, t, sameSign = false) {
  if (!pts.length || t < pts[0][0] - 5 * DAY) return null;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; if (sameSign && v0 * v1 <= 0) return null; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return pts.at(-1)[1];
}

export async function buildDetail({ symbol, m, daily, summary, base, secShares, splits = [] }) {
  const Y = await yahooSeries(symbol);
  const secPts = (key, per) => (key && m?.[key]?.[per] ? m[key][per].map((x) => [Date.parse(x.e || x.p), num(x.v)]) : []);
  // Acciones de la SEC: vienen como se reportaron, se ajustan por los splits posteriores
  // (algunas presentaciones ya vienen ajustadas y otras no: se elige el factor que deja la serie continua)
  const ref0 = Y.quarterly.OrdinarySharesNumber?.at(-1)?.[1] ?? Y.annual.OrdinarySharesNumber?.at(-1)?.[1] ?? summary?.shares;
  const adj = (arr) => {
    const pts = (arr || []).map((e) => [Date.parse(e.end), e.val]).filter((x) => x[1] > 0).sort((a, b) => b[0] - a[0]);
    const sp = [...splits].sort((a, b) => a.t - b.t);
    let ref = ref0; const out = [];
    for (const [t, v] of pts) {
      const after = sp.filter((x) => x.t > t);
      let facs = [1]; for (const x of after.slice(-8)) facs = [...facs, ...facs.map((f) => f * x.r)]; // cualquier combinación de splits no incorporados
      const best = ref ? facs.reduce((b, fc) => (Math.abs(Math.log((v * fc) / ref)) < Math.abs(Math.log((v * b) / ref)) ? fc : b), 1) : facs.at(-1);
      if (ref && Math.abs(Math.log((v * best) / ref)) > Math.log(2)) continue; // dato roto (unidades mal cargadas)
      out.push([t, v * best]); ref = v * best;
    }
    return out.reverse();
  };
  const SECX = { shares2: { quarterly: adj(secShares?.sharesQ), annual: adj(secShares?.sharesA) } };
  const Q = {}, A = {};
  for (const [k, [y, s]] of Object.entries({ ...FLOWS, ...STOCKS })) {
    Q[k] = merge(SECX[k]?.quarterly || secPts(s, "quarterly"), Y.quarterly[y]);
    A[k] = merge(SECX[k]?.annual || secPts(s, "annual"), Y.annual[y]);
  }
  for (const [a, b] of [["cash", "cash2"]]) { if (!Q[a].length) Q[a] = Q[b]; if (!A[a].length) A[a] = A[b]; }
  // acciones: ordinarias donde hay; para la historia, diluidas promedio (SEC ajustada + Yahoo)
  for (const P of [Q, A]) { const own = P.shares; P.shares = [...own, ...P.shares2.filter((x) => !own.some((o) => Math.abs(o[0] - x[0]) < 20 * DAY))].sort((a, b) => a[0] - b[0]); }

  // TTM por campo: 4 trimestres consecutivos; si no, cierre anual
  const ttm = {};
  for (const k of Object.keys(FLOWS)) {
    const pts = [], q = Q[k];
    for (let i = 3; i < q.length; i++) { const w = q.slice(i - 3, i + 1); if (w[3][0] - w[0][0] < 300 * DAY) pts.push([w[3][0], w.reduce((a, x) => a + x[1], 0)]); }
    for (const p of A[k]) if (!pts.some((x) => Math.abs(x[0] - p[0]) < 40 * DAY)) pts.push(p);
    ttm[k] = pts.sort((a, b) => a[0] - b[0]);
  }
  const bal = {};
  for (const k of Object.keys(STOCKS)) bal[k] = [...Q[k], ...A[k]].sort((a, b) => a[0] - b[0]).filter((p, i, arr) => !i || p[0] - arr[i - 1][0] > 20 * DAY);

  const pts = (daily?.pts || []).filter((p) => p.c != null);
  const dates = pts.map((p) => p.t), close = pts.map((p) => p.c);
  const price = base.price ?? close.at(-1);
  const sharesNow = summary?.shares || bal.shares.at(-1)?.[1] || null;
  const sharesAt = (t) => interp(bal.shares, t) ?? sharesNow; // antes del primer dato de Yahoo: el más viejo conocido

  // ── múltiplos diarios ──
  const M = { per: [], peg: [], ps: [], pfcf: [], pocf: [], pop: [], evebitda: [], evebit: [] };
  const pos = (n, d) => { if (n == null || d == null || d <= 0) return null; const v = n / d; return v > 0 && v < 1000 ? rd(v, 2) : null; };
  const ebitAt = (t) => interp(ttm.ebit.length ? ttm.ebit : ttm.opInc, t, true);
  const isBank = /financial/i.test(summary?.sector || "") && /bank|insurance|capital markets|credit/i.test(summary?.industry || "");
  dates.forEach((t, i) => {
    const sh = sharesAt(t); const mcap = sh ? close[i] * sh : null;
    const ev = mcap != null ? mcap + (interp(bal.debt, t) ?? 0) - (interp(bal.cash, t) ?? 0) : null;
    const g = (k) => interp(ttm[k], t, true);
    M.per.push(pos(mcap, g("ni"))); M.ps.push(pos(mcap, g("rev"))); M.pfcf.push(pos(mcap, g("fcf"))); M.pocf.push(pos(mcap, g("ocf")));
    M.pop.push(pos(mcap, g("opInc")));
    // en bancos la deuda y la caja son el negocio: VE y flujo de caja no tienen sentido
    M.evebitda.push(isBank ? null : pos(ev, g("ebitda"))); M.evebit.push(isBank ? null : pos(ev, ebitAt(t)));
    if (isBank) { M.pfcf[i] = null; M.pocf[i] = null; }
  });

  // PEG = PER ÷ CAGR 3 años del BPA de 12 meses (en %); solo con crecimiento positivo
  const epsAt = (t) => { const ni = interp(ttm.ni, t), sh = sharesAt(t); return ni != null && sh ? ni / sh : null; };
  dates.forEach((t, i) => {
    const pe = M.per[i], e1 = epsAt(t), e0 = epsAt(t - 3 * 365 * DAY);
    const g = e1 > 0 && e0 > 0 ? (Math.pow(e1 / e0, 1 / 3) - 1) * 100 : null;
    const v = pe != null && g > 0 ? pe / g : null;
    M.peg.push(v != null && v < 10 ? rd(v, 3) : null);
  });

  // ── tabla de crecimiento y valoración ──
  const now = dates.at(-1) ?? Date.now();
  const annual = (k) => A[k].filter((x) => x[1] != null && x[1] !== 0);
  const annEps = A.ni.map(([t, v]) => [t, sharesAt(t) ? v / sharesAt(t) : null]).filter((x) => x[1] != null);
  const cagrN = (p, n) => { if (p.length <= n) return null; const a = p.at(-1 - n), b = p.at(-1); return Math.abs((b[0] - a[0]) / (365 * DAY) - n) < 0.3 ? cagr(a[1], b[1], n) : null; };
  const g12 = (k, perShare) => {
    const l = ttm[k].at(-1); if (!l) return null; const t0 = l[0] - 365 * DAY, p = interp(ttm[k], t0);
    if (!(p > 0)) return null; return perShare ? ((l[1] / sharesAt(l[0])) / (p / sharesAt(t0)) - 1) * 100 : (l[1] / p - 1) * 100;
  };
  const win = (arr, yrs) => arr.filter((_, i) => dates[i] >= now - yrs * 365 * DAY);
  const mcapNow = summary?.marketCap || (sharesNow ? price * sharesNow : null);
  let prevY = 0;
  const est = (summary?.est || []).map((x) => ({
    label: "AF" + String((prevY = Math.max(new Date(x.end).getUTCFullYear(), prevY + 1))).slice(2) + "e",
    revG: x.revG, epsG: x.epsG, per: x.eps > 0 ? price / x.eps : null, ps: x.rev > 0 && mcapNow ? mcapNow / x.rev : null,
  }));
  const r1 = (v) => rd(v, 1);
  const table = {
    cols: ["10A", "5A", "3A", "Últ. 12M", ...est.map((e) => e.label)],
    rows: [
      { k: "Ingresos", pct: true, v: [cagrN(annual("rev"), 10), cagrN(annual("rev"), 5), cagrN(annual("rev"), 3), g12("rev"), ...est.map((e) => e.revG)] },
      { k: "BPA", pct: true, v: [cagrN(annEps, 10), cagrN(annEps, 5), cagrN(annEps, 3), g12("ni", true), ...est.map((e) => e.epsG)] },
      { k: "PER", v: [null, median(win(M.per, 5)), median(win(M.per, 3)), median(win(M.per, 1)), ...est.map((e) => e.per)] },
      { k: "P/V", v: [null, median(win(M.ps, 5)), median(win(M.ps, 3)), median(win(M.ps, 1)), ...est.map((e) => e.ps)] },
    ].map((r) => ({ ...r, v: r.v.map(r1) })),
    firstData: ttm.rev[0] ? new Date(ttm.rev[0][0]).toISOString().slice(0, 10) : null,
  };
  if (table.rows.every((r) => r.v[0] == null)) { table.cols.shift(); table.rows.forEach((r) => r.v.shift()); }

  // ── negocio trimestral / anual ──
  const cap = (v) => (v == null || Math.abs(v) > 300 ? null : rd(v, 1)); // patrimonio casi nulo → ratio sin sentido
  const at = (arr, t) => arr.find((x) => Math.abs(x[0] - t) < 20 * DAY)?.[1] ?? null;
  const business = (S, isQ) => {
    const ends = [...new Set([...S.rev, ...S.ni].map((x) => x[0]))].sort((a, b) => a - b)
      .filter((t, i, arr) => !i || t - arr[i - 1] > 20 * DAY);
    return ends.map((t) => {
      const g = (k) => at(S[k], t), rev = g("rev"), mg = (x) => (x != null && rev > 0 ? rd((x / rev) * 100, 1) : null);
      const niT = isQ ? interp(ttm.ni, t) : g("ni"), ebitT = isQ ? ebitAt(t) : (g("ebit") ?? g("opInc"));
      // capital invertido con la misma definición en toda la serie: patrimonio + deuda − caja (sin inversiones CP)
      const eq = interp(bal.equity, t), as = interp(bal.assets, t), cashOnly = interp(bal.cash2, t) ?? interp(bal.cash, t) ?? 0;
      const ic = eq != null ? eq + (interp(bal.debt, t) ?? 0) - cashOnly : null;
      const tax = at(S.tax, t) ?? 0.21, debt = g("debt"), sh = g("shares") ?? g("shares2");
      const ca = g("ca"), cl = g("cl"), ni = g("ni");
      return {
        t, label: isQ ? qLabel(t) : String(new Date(t - 182 * DAY).getUTCFullYear()),
        rev, ni, fcf: g("fcf"), ocf: g("ocf"), ebitda: g("ebitda"), sbc: g("sbc"), debt, cash: g("cash") ?? g("cash2"), shares: sh,
        eps: ni != null && sharesAt(t) ? rd(ni / sharesAt(t), 2) : null,
        mGross: mg(g("gp")), mOp: mg(g("opInc")), mNet: mg(ni), mFcf: mg(g("fcf")),
        roe: cap(niT != null && eq > 0 ? (niT / eq) * 100 : null), roa: cap(niT != null && as > 0 ? (niT / as) * 100 : null),
        roic: cap(ebitT != null && ic > 0 ? ((ebitT * (1 - tax)) / ic) * 100 : null),
        cur: ca && cl ? rd(ca / cl, 2) : null, de: debt != null && eq > 0 ? rd(debt / eq, 2) : null,
        // bancos: flujo de caja, márgenes de FCF y liquidez corriente no tienen sentido
        ...(isBank ? { fcf: null, ocf: null, mFcf: null, ebitda: null, cur: null, roic: null } : {}),
      };
    });
  };

  // PEG proyectado (fórmula clásica): PER actual ÷ crecimiento esperado del BPA en % (promedio compuesto
  // del consenso para el año fiscal en curso y el siguiente; Yahoo ya no publica el estimado a 5 años)
  const gs = (summary?.est || []).map((x) => x.epsG).filter((g) => g != null && g > -100);
  const gProj = gs.length ? (Math.pow(gs.reduce((a, g) => a * (1 + g / 100), 1), 1 / gs.length) - 1) * 100 : null;
  const perNow = [...M.per].reverse().find((v) => v != null);
  const pegFwd = perNow != null && gProj > 0 ? rd(perNow / gProj, 2) : null;

  return {
    symbol, asOf: new Date().toISOString(),
    head: {
      name: summary?.longName || base.name, sector: summary?.sector, industry: summary?.industry, website: summary?.website,
      price: rd(price, 2), chg: summary?.changePct != null ? rd(summary.changePct * 100, 2) : null, mcap: mcapNow,
      fpe: rd(summary?.ntmEps > 0 ? price / summary.ntmEps : summary?.forwardPE, 1), fpeSrc: summary?.ntmEps > 0 ? "ntm" : "yahoo", // NTM = mezcla del año fiscal en curso y el siguiente, como Koyfin currency: base.currency,
      pegFwd, gProj: rd(gProj, 1), perNow: rd(perNow, 1),
    },
    table,
    prices: { d: dates.map((t) => new Date(t).toISOString().slice(0, 10)), c: close.map((x) => rd(x, 2)) },
    mult: M,
    quarters: business(Q, true),
    years: business(A, false),
    source: m ? "SEC EDGAR + Yahoo Finance" : "Yahoo Finance",
  };
}
