// /api/rrg?symbols=AAPL,MSFT&range=3m|6m|1y|3y[&benchmark=SPY] — RRG de acciones arbitrarias contra un benchmark
import { PALETTE, rangeParams, fetchChart, align, round, rrg, liveQuote } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const bench = String(req.query?.benchmark || "SPY").toUpperCase();
    const list = [...new Set(String(req.query?.symbols || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z.\-^]{1,10}$/.test(s)))].slice(0, 30);
    if (!list.length) { res.status(400).json({ error: "Pasá ?symbols=AAPL,MSFT" }); return; }
    const rp = rangeParams(String(req.query?.range || "1y"));

    const failed = [];
    const [b, ...arr] = await Promise.all([bench, ...list].map((s) => fetchChart(s, rp.qs).catch(() => { failed.push(s); return null; })));
    if (!b) { res.status(502).json({ error: `No pude obtener el benchmark ${bench}` }); return; }
    const data = {};
    list.forEach((s, i) => { if (arr[i]) data[s] = arr[i]; });
    // con rangos semanales / intradiarios la variación del día se toma de barras diarias
    const needsDaily = ["1w", "3y", "5y"].includes(rp.key);
    const dailies = needsDaily ? await Promise.all(list.map((s) => (data[s] ? fetchChart(s, "range=5d&interval=1d").catch(() => null) : null))) : [];
    const { dates, closes } = align(b, data);

    const out = {}, meta = {};
    list.forEach((s, i) => {
      if (!data[s]) return;
      out[s] = rrg(closes[s], closes.__bench, dates);
      const q = liveQuote(needsDaily && dailies[i] ? dailies[i] : data[s]);
      meta[s] = { color: PALETTE[i % PALETTE.length], price: q.price, changePercent: q.changePercent };
    });

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ benchmark: bench, range: rp.key, rrg: out, meta, last_update: new Date().toISOString(), failed_tickers: failed });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
