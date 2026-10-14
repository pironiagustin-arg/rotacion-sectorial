// GET /api/sync?batch=N  (header x-sync-secret) -> baja un lote y lo guarda en Supabase.
// Lo llama la GitHub Action diaria (.github/workflows/sync-screener.yml).
// Escribe vía la función sync_snapshots de Supabase, que valida el secreto: no hace falta la service key.
// Variable de entorno en Vercel: SYNC_SECRET
import { BATCH_COUNT, batchSymbols } from "../lib/universe.js";
import { loadSymbols } from "./_screen.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sdzhnexusnymyshjlhem.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkemhuZXh1c255bXlzaGpsaGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTc5OTAsImV4cCI6MjEwNzU5Mzk5MH0.Wiso-N1_TEcNrgRkmM7VytK-TFG7sGNjnpW_tR0rYX4";

export default async function handler(req, res) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || req.headers["x-sync-secret"] !== secret) return res.status(401).json({ error: "no autorizado" });
  const i = Number(req.query?.batch ?? 0);
  if (!Number.isInteger(i) || i < 0 || i >= BATCH_COUNT) return res.status(400).json({ error: "batch inválido" });
  const next = i + 1 < BATCH_COUNT ? i + 1 : null;
  try {
    const rows = (await loadSymbols(batchSymbols(i))).filter((r) => r.ok);
    let saved = 0;
    if (rows.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_snapshots`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      saved = await r.json();
    }
    return res.status(200).json({ batch: i, saved, next });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e), next });
  }
}
