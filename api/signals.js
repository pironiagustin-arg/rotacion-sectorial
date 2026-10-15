// GET /api/signals                  -> señales de rotación de sectores SPDR + ETFs de industria
// GET /api/signals?symbols=NVDA,AMD -> señales para acciones puntuales (RRG Acciones)
// GET /api/signals?save=1 (header x-sync-secret) -> además guarda la foto del día en Supabase (lo llama el sync diario)
import { computeSignals, SECTOR_ETFS, INDUSTRY_ETFS } from "./_signals.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sdzhnexusnymyshjlhem.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkemhuZXh1c255bXlzaGpsaGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTc5OTAsImV4cCI6MjEwNzU5Mzk5MH0.Wiso-N1_TEcNrgRkmM7VytK-TFG7sGNjnpW_tR0rYX4";

export default async function handler(req, res) {
  try {
    const custom = String(req.query?.symbols || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.\-^]{1,12}$/.test(s)).slice(0, 40);
    const names = custom.length ? {} : { ...SECTOR_ETFS, ...INDUSTRY_ETFS };
    const syms = custom.length ? [...new Set(custom)] : Object.keys(names);
    const list = await computeSignals(syms, names, String(req.query?.benchmark || "SPY").toUpperCase());
    for (const s of list) s.group = SECTOR_ETFS[s.symbol] ? "sector" : INDUSTRY_ETFS[s.symbol] ? "industria" : "accion";
    let saved = null;
    if (req.query?.save && !custom.length) {
      const secret = process.env.SYNC_SECRET;
      if (!secret || req.headers["x-sync-secret"] !== secret) return res.status(401).json({ error: "no autorizado" });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_signals`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: list }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      saved = await r.json();
    }
    res.setHeader("Cache-Control", req.query?.save ? "no-store" : "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ signals: list, saved, last_update: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
