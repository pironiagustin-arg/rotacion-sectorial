// GET /api/screener?batch=N  -> métricas de un lote fijo del universo (cacheado 6 h en el CDN de Vercel)
// GET /api/screener?meta=1   -> cantidad de lotes
import { BATCH_COUNT, batchSymbols } from "../lib/universe.js";
import { loadSymbols } from "./_screen.js";

export default async function handler(req, res) {
  const { batch, meta } = req.query || {};
  if (meta) return res.status(200).json({ batches: BATCH_COUNT });
  const i = Number(batch);
  if (!Number.isInteger(i) || i < 0 || i >= BATCH_COUNT) return res.status(400).json({ error: `batch debe ser 0..${BATCH_COUNT - 1}` });
  try {
    const rows = await loadSymbols(batchSymbols(i));
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({ batch: i, rows });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
