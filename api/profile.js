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
const secGet = (u) => fetch(u, { headers: { "User-Agent": SEC_UA } });

// Texto plano de un documento HTML de la SEC, en párrafos
function htmlParas(html) {
  const ent = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", bull: "•" };
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|table)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ent[n.toLowerCase()] ?? m)
    .split(/\n+/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.length > 2);
}

// Qué dijo el management en el último comunicado de resultados: citas de CEO/CFO y outlook
async function mgmtTalk(cik, f) {
  const cands = [];
  for (let i = 0; i < (f.form || []).length && cands.length < 8; i++) {
    if (Date.parse(f.filingDate[i]) < Date.now() - 200 * 864e5) break;
    if ((f.form[i] === "8-K" && String(f.items[i] || "").includes("2.02")) || f.form[i] === "6-K") cands.push(i);
  }
  for (const i of cands) {
    try {
      const acc = f.accessionNumber[i].replace(/-/g, ""), base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/`;
      const idx = await (await secGet(base + "index.json")).json();
      const items = (idx?.directory?.item || []).filter((x) => /\.htm/i.test(x.name) && !/^R\d+\.htm|index/i.test(x.name));
      const files = items.map((x) => x.name);
      const exN = (n) => Number((n.match(/(?:ex|exhibit)[-_]?99[._-]?(\d{1,2})/i) || [, 9])[1]);
      const ex = files.filter((n) => /ex-?99|ex99|exhibit[-_]?99|dex99|press|letter|pr\.htm|earnings|results/i.test(n) && !/supplement|presentation|slides/i.test(n)).sort((a, b) => exN(a) - exN(b));
      const big = items.filter((x) => x.name !== f.primaryDocument[i]).sort((a, b) => Number(b.size || 0) - Number(a.size || 0)).map((x) => x.name);
      const docs = ex.length ? ex.slice(0, 2) : big.length ? big.slice(0, 1) : [f.primaryDocument[i]];
      const doc = docs[0];
      const paras = [];
      for (const d of docs) { const t = await (await secGet(base + d)).text(); paras.push(...htmlParas(t.slice(0, 2_500_000))); }
      const all = paras.join(" ");
      if (f.form[i] === "6-K" && !/(quarter|half[- ]year|fiscal year)[^.]{0,80}(results|financial)|results for the/i.test(all.slice(0, 8000))) continue;
      // Citas
      const quotes = [];
      const TITLE = /(Chief [A-Z][a-z]+(?: [A-Z][a-z]+)? Officer|CEO|CFO|Co-Founder|Founder|President|Chairman|Chairwoman)/;
      for (const p of paras) {
        if (quotes.length >= 4) break;
        if (!/[“"]/.test(p) || !/\b(said|says|commented|stated|added|noted|remarked)\b/i.test(p)) continue;
        const parts = [...p.matchAll(/[“"]([^”"]{40,})[”"]/g)].map((m) => m[1].trim());
        if (!parts.length) continue;
        let who = (p.match(/(?:said|says|commented|stated|added|noted)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})/) || p.match(/([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}),\s+[^,“"]{0,80}?(?:Chief|CEO|CFO|President|Founder|Chairman)/) || [])[1] || null;
        const title = (p.match(TITLE) || [])[1] || null;
        if (!who && !title) continue;
        if (who && /^(The|Our|We|In|For|This)\b/.test(who)) who = null;
        const text = parts.join(" … ").slice(0, 900);
        if (quotes.some((q) => q.text.slice(0, 60) === text.slice(0, 60))) continue;
        quotes.push({ who, title, text });
      }
      // Outlook / guidance
      let outlook = [];
      const hi = paras.findIndex((p) => p.length < 70 && /\b(outlook|guidance)\b/i.test(p));
      const sents = (arr) => arr.join(" ").split(/(?<=[.;])\s+(?=[A-Z(•])|\s*•\s*/).map((x) => x.trim()).filter(Boolean);
      const GUIDE = /\b(expects?|anticipates?|projects?|forecasts?|outlook|guidance|targets?)\b/i;
      const NUM = /\$|%|\bbillion|\bmillion|\bpercent/i;
      if (hi >= 0) outlook = sents(paras.slice(hi + 1, hi + 14).filter((p) => p.length > 30)).filter((x) => GUIDE.test(x) || NUM.test(x));
      if (!outlook.length) outlook = sents(paras).filter((x) => /\b(expects?|anticipates?)\b/i.test(x) && /(revenue|sales|earnings|EPS|margin|growth)/i.test(x) && !/forward-looking|safe harbor|could differ/i.test(x));
      outlook = outlook.filter((x) => x.length > 40 && /\b(expect|anticipat|will|project|guid|outlook|forecast|target)/i.test(x) && x.length < 420 && !/forward-looking|safe harbor|reconciliation|non-GAAP measures? (?:is|are) not/i.test(x)).slice(0, 5);
      const title = paras.find((p) => /results|reports|announces/i.test(p) && p.length < 220) || null;
      if (!quotes.length && !outlook.length) continue;
      return { date: f.filingDate[i], form: f.form[i], url: base + doc, title, quotes, outlook };
    } catch { /* probar el siguiente */ }
  }
  return null;
}

async function secData(symbol) {
  if (!/^[A-Z][A-Z.\-]*$/.test(symbol)) return { filings: [], talk: null };
  try {
    if (!tickers) {
      const m = await (await secGet("https://www.sec.gov/files/company_tickers.json")).json();
      tickers = new Map(Object.values(m).map((x) => [x.ticker, String(x.cik_str).padStart(10, "0")]));
    }
    const cik = tickers.get(symbol.replace("-", ".")) || tickers.get(symbol);
    if (!cik) return { filings: [], talk: null };
    const j = await (await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
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
    const talk = await mgmtTalk(cik, f).catch(() => null);
    return { filings: out.slice(0, 15), talk };
  } catch { return { filings: [], talk: null }; }
}

// Google News (RSS) buscando el nombre de la empresa junto a eventos clave: mejor cobertura que Yahoo
async function gnews(name) {
  if (!name) return [];
  try {
    const clean = name.replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Company|Co\.|Ltd\.?|plc|N\.V\.|S\.A\.|Holdings?|Group|Limited|& Co\.)\b/gi, "").trim();
    const q = `"${clean}" (contract OR agreement OR acquire OR acquisition OR CEO OR buyback OR repurchase OR partnership OR deal OR dividend OR guidance) when:120d`;
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    const tag = (it, t) => (it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || "";
    const dec = (x) => x.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 40).map((m) => {
      const it = m[1], src = dec(tag(it, "source"));
      let title = dec(tag(it, "title")); if (src && title.endsWith(" - " + src)) title = title.slice(0, -(src.length + 3));
      return { title, url: dec(tag(it, "link")), publisher: src || "Google News", t: Date.parse(tag(it, "pubDate")) || 0 };
    }).filter((n) => n.title && n.url);
  } catch { return []; }
}

async function news(symbol) {
  try {
    const j = await yget(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=30`);
    return (j?.news || []).filter((n) => !n.relatedTickers || n.relatedTickers.includes(symbol)).slice(0, 25)
      .map((n) => ({ title: n.title, url: n.link, publisher: n.publisher, t: (n.providerPublishTime || 0) * 1000 }));
  } catch { return []; }
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return res.status(400).json({ error: "Ticker inválido" });
  try {
    const mods = "price,assetProfile,defaultKeyStatistics,netSharePurchaseActivity,upgradeDowngradeHistory,recommendationTrend,calendarEvents,earningsHistory,majorHoldersBreakdown,financialData";
    const [qs, nws, sec] = await Promise.all([
      yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}`).then((j) => j?.quoteSummary?.result?.[0] || {}).catch(() => ({})),
      news(symbol), secData(symbol),
    ]);
    const gn = await gnews(qs.price?.longName || qs.price?.shortName || null);
    const seenT = new Set(nws.map((n) => n.title.toLowerCase().slice(0, 50)));
    for (const n of gn) if (!seenT.has(n.title.toLowerCase().slice(0, 50))) { seenT.add(n.title.toLowerCase().slice(0, 50)); nws.push(n); }
    nws.sort((a, b) => b.t - a.t); nws.splice(50);
    const ap = qs.assetProfile || {}, ks = qs.defaultKeyStatistics || {}, ns = qs.netSharePurchaseActivity || {}, mh = qs.majorHoldersBreakdown || {}, fd = qs.financialData || {};
    const ceo = (ap.companyOfficers || []).find((o) => /chief executive|ceo/i.test(o.title || "")) || (ap.companyOfficers || [])[0] || null;
    const ninety = Date.now() - 120 * 864e5;
    const grades = (qs.upgradeDowngradeHistory?.history || []).filter((g) => g.epochGradeDate * 1000 > ninety).slice(0, 12)
      .map((g) => ({ t: g.epochGradeDate * 1000, firm: g.firm, from: g.fromGrade, to: g.toGrade, action: g.action }));
    const rt = qs.recommendationTrend?.trend?.[0] || null;
    const eh = (qs.earningsHistory?.history || []).map((e) => ({ q: e.period, est: raw(e.epsEstimate), act: raw(e.epsActual), surprise: raw(e.surprisePercent) != null ? raw(e.surprisePercent) * 100 : null }));
    const nextEarn = (qs.calendarEvents?.earnings?.earningsDate || []).map(raw).filter(Boolean)[0] || null;
    const talk = sec.talk;
    const tq = talk ? [...talk.quotes.map((q) => q.text), ...talk.outlook] : [];
    const [summaryEs, ...restEs] = await translate([ap.longBusinessSummary || "", ...nws.map((n) => n.title), ...tq]);
    nws.forEach((n, i) => (n.title_es = restEs[i]));
    if (talk) { const off = nws.length; talk.quotes.forEach((q, i) => (q.es = restEs[off + i] !== q.text ? restEs[off + i] : null)); talk.outlook_es = talk.outlook.map((o, i) => { const t = restEs[off + talk.quotes.length + i]; return t !== o ? t : null; }); }
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
      news: nws, filings: sec.filings, talk,
      last_update: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
