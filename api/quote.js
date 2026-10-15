// GET /api/quote?s=AAPL,MSFT,^VIX -> precios en vivo (Yahoo v7, tiempo real para EE.UU.), incluido pre y post mercado.
import { quotes } from "./_screen.js";

export default async function handler(req, res) {
  const syms = [...new Set(String(req.query?.s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.\-^=]{1,15}$/.test(x)))].slice(0, 200);
  if (!syms.length) return res.status(400).json({ error: "Sin símbolos" });
  try {
    const q = await quotes(syms), out = {};
    for (const [s, x] of q) {
      const st = x.marketState || "";
      const ext = st.startsWith("PRE") ? { p: x.preMarketPrice, c: x.preMarketChangePercent, l: "pre" } : /POST|CLOSED/.test(st) && x.postMarketPrice ? { p: x.postMarketPrice, c: x.postMarketChangePercent, l: "post" } : null;
      out[s] = { px: x.regularMarketPrice ?? null, chg: x.regularMarketChangePercent ?? null, t: (x.regularMarketTime || 0) * 1000, st, ext: ext && ext.p ? ext : null };
    }
    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
    return res.status(200).json({ q: out, at: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
