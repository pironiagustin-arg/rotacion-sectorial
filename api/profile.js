// GET /api/profile?symbol=NVDA -> presentación de la empresa y evidencia para la tesis:
// qué hace (Yahoo, traducido), management e insiders, analistas, próximos resultados, noticias recientes
// y hechos relevantes presentados a la SEC (contratos, adquisiciones, cambios de management).
import { yget } from "./_screen.js";

const SEC_UA = "agustin-finance-app contacto@example.com";
const raw = (o) => (o && typeof o === "object" ? (o.raw ?? null) : (o ?? null));

async function translate(texts) {
  // Traductor público de Google (sin clave). Si falla, se devuelve el original en inglés.
  const out = [];
  for (const t of texts) {
    if (!t) { out.push(t); continue; }
    try {
      const chunks = t.match(/[\s\S]{1,1800}(?:\.\s|$)/g) || [t];
      let res = "";
      for (const c of chunks) {
        const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(c)}`);
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        res += (j?.[0] || []).map((x) => x[0]).join("");
      }
      out.push(res || t);
    } catch { out.push(t); }
  }
  return out;
}

let tickers = null;
async function secFilings(symbol) {
  if (!/^[A-Z][A-Z.\-]*$/.test(symbol)) return [];
  try {
    if (!tickers) {
      const m = await (await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_UA } })).json();
      tickers = new Map(Object.values(m).map((x) => [x.ticker, String(x.cik_str).padStart(10, "0")]));
    }
    const cik = tickers.get(symbol.replace("-", ".")) || tickers.get(symbol);
    if (!cik) return [];
    const j = await (await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "User-Agent": SEC_UA } })).json();
    const f = j?.filings?.recent || {};
    const since = Date.now() - 400 * 864e5, out = [];
    const ITEMS = { "1.01": "Acuerdo o contrato relevante", "2.01": "Compra o venta de activos", "5.02": "Cambio en directorio o management", "1.02": "Fin de un contrato relevante", "2.03": "Nueva deuda relevante", "3.02": "Venta de acciones no registrada", "8.01": "Otro hecho relevante" };
    for (let i = 0; i < (f.form || []).length; i++) {
      if (f.form[i] !== "8-K") continue;
      if (Date.parse(f.filingDate[i]) < since) break;
      const items = String(f.items[i] || "").split(",").map((x) => x.trim()).filter((x) => ITEMS[x]);
      if (!items.length) continue;
      const acc = f.accessionNumber[i].replace(/-/g, "");
      out.push({ date: f.filingDate[i], items, labels: items.map((x) => ITEMS[x]), url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${f.primaryDocument[i]}` });
    }
    return out.slice(0, 15);
  } catch { return []; }
}

async function news(symbol) {
  try {
    const j = await yget(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=12`);
    return (j?.news || []).filter((n) => !n.relatedTickers || n.relatedTickers.includes(symbol)).slice(0, 10)
      .map((n) => ({ title: n.title, url: n.link, publisher: n.publisher, t: (n.providerPublishTime || 0) * 1000 }));
  } catch { return []; }
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return res.status(400).json({ error: "Ticker inválido" });
  try {
    const mods = "assetProfile,defaultKeyStatistics,netSharePurchaseActivity,upgradeDowngradeHistory,recommendationTrend,calendarEvents,earningsHistory,majorHoldersBreakdown,financialData";
    const [qs, nws, sec] = await Promise.all([
      yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}`).then((j) => j?.quoteSummary?.result?.[0] || {}).catch(() => ({})),
      news(symbol), secFilings(symbol),
    ]);
    const ap = qs.assetProfile || {}, ks = qs.defaultKeyStatistics || {}, ns = qs.netSharePurchaseActivity || {}, mh = qs.majorHoldersBreakdown || {}, fd = qs.financialData || {};
    const ceo = (ap.companyOfficers || []).find((o) => /chief executive|ceo/i.test(o.title || "")) || (ap.companyOfficers || [])[0] || null;
    const ninety = Date.now() - 120 * 864e5;
    const grades = (qs.upgradeDowngradeHistory?.history || []).filter((g) => g.epochGradeDate * 1000 > ninety).slice(0, 12)
      .map((g) => ({ t: g.epochGradeDate * 1000, firm: g.firm, from: g.fromGrade, to: g.toGrade, action: g.action }));
    const rt = qs.recommendationTrend?.trend?.[0] || null;
    const eh = (qs.earningsHistory?.history || []).map((e) => ({ q: e.period, est: raw(e.epsEstimate), act: raw(e.epsActual), surprise: raw(e.surprisePercent) != null ? raw(e.surprisePercent) * 100 : null }));
    const nextEarn = (qs.calendarEvents?.earnings?.earningsDate || []).map(raw).filter(Boolean)[0] || null;
    const [summaryEs, ...titlesEs] = await translate([ap.longBusinessSummary || "", ...nws.map((n) => n.title)]);
    nws.forEach((n, i) => (n.title_es = titlesEs[i]));
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({
      symbol,
      profile: {
        summary: summaryEs || null, summary_en: ap.longBusinessSummary || null, industry: ap.industry || null, sector: ap.sector || null,
        employees: ap.fullTimeEmployees || null, city: ap.city || null, country: ap.country || null, website: ap.website || null,
        ceo: ceo ? { name: ceo.name, title: ceo.title, age: ceo.age || null, pay: raw(ceo.totalPay) } : null,
        officers: (ap.companyOfficers || []).slice(0, 5).map((o) => ({ name: o.name, title: o.title, age: o.age || null })),
      },
      owners: {
        insiders: raw(mh.insidersPercentHeld) ?? raw(ks.heldPercentInsiders), institutions: raw(mh.institutionsPercentHeld) ?? raw(ks.heldPercentInstitutions),
        shortFloat: raw(ks.shortPercentOfFloat), shortRatio: raw(ks.shortRatio),
        insiderNet6m: raw(ns.netInfoShares), insiderBuys6m: raw(ns.buyInfoCount), insiderSells6m: raw(ns.sellInfoCount), insiderNetPct: raw(ns.netPercentInsiderShares),
      },
      analysts: { trend: rt, grades, targetMean: raw(fd.targetMeanPrice), targetHigh: raw(fd.targetHighPrice), targetLow: raw(fd.targetLowPrice), recKey: fd.recommendationKey || null, n: raw(fd.numberOfAnalystOpinions) },
      earnings: { history: eh, next: nextEarn ? nextEarn * 1000 : null },
      news: nws, filings: sec,
      last_update: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
