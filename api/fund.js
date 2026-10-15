// GET /api/fund?symbol=AAPL -> fundamentales anuales (5 años) y métricas por industria de una empresa
import { fundExtra } from "./_fund.js";
import { fxRates } from "./_screen.js";

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return res.status(400).json({ error: "Ticker inválido" });
  try {
    const fx = await fxRates().catch(() => ({ USD: 1 }));
    const data = await fundExtra(symbol, fx);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
