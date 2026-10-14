// GET /api/sync?batch=N  (header x-sync-secret) -> baja un lote y lo guarda en Supabase.
// Lo llama la GitHub Action diaria (.github/workflows/sync-screener.yml).
// Variables de entorno en Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, SYNC_SECRET
import { BATCH_COUNT, batchSymbols } from "../lib/universe.js";
import { loadSymbols } from "./_screen.js";

async function upsert(table, rows, onConflict) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase ${table}: ${r.status} ${await r.text()}`);
}

export default async function handler(req, res) {
  if (!process.env.SYNC_SECRET || req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) return res.status(401).json({ error: "no autorizado" });
  const i = Number(req.query?.batch ?? 0);
  if (!Number.isInteger(i) || i < 0 || i >= BATCH_COUNT) return res.status(400).json({ error: "batch inválido" });
  try {
    const rows = (await loadSymbols(batchSymbols(i))).filter((r) => r.ok);
    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    if (rows.length) {
      await upsert("snapshots", rows.map((r) => ({ symbol: r.s, data: r, updated_at: now })), "symbol");
      await upsert("snapshot_history", rows.map((r) => ({ symbol: r.s, day, data: r })), "symbol,day");
    }
    return res.status(200).json({ batch: i, saved: rows.length, next: i + 1 < BATCH_COUNT ? i + 1 : null });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e), next: i + 1 < BATCH_COUNT ? i + 1 : null });
  }
}
