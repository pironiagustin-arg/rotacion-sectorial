// GET /api/sync-fund?batch=N (header x-sync-secret): fundamentales anuales de un lote de 12 empresas -> Supabase (fund_extra).
// Lo llama la GitHub Action semanal (.github/workflows/sync-fund.yml).
import { SYMBOLS } from "../lib/universe.js";
import { fundExtra } from "./_fund.js";
import { fxRates } from "./_screen.js";

const SIZE = 12;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sdzhnexusnymyshjlhem.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkemhuZXh1c255bXlzaGpsaGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTc5OTAsImV4cCI6MjEwNzU5Mzk5MH0.Wiso-N1_TEcNrgRkmM7VytK-TFG7sGNjnpW_tR0rYX4";

export default async function handler(req, res) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || req.headers["x-sync-secret"] !== secret) return res.status(401).json({ error: "no autorizado" });
  const total = Math.ceil(SYMBOLS.length / SIZE);
  const i = Number(req.query?.batch ?? 0);
  if (!Number.isInteger(i) || i < 0 || i >= total) return res.status(400).json({ error: "batch inválido" });
  const next = i + 1 < total ? i + 1 : null;
  try {
    const fx = await fxRates().catch(() => ({ USD: 1 }));
    const syms = SYMBOLS.slice(i * SIZE, (i + 1) * SIZE);
    const out = [];
    let k = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (k < syms.length) { const s = syms[k++]; try { const d = await fundExtra(s, fx); if (d.ok) out.push(d); } catch {} }
    }));
    let saved = 0;
    if (out.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_fund`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: out }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      saved = await r.json();
    }
    return res.status(200).json({ batch: i, saved, of: syms.length, next });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e), next });
  }
}
