// GET /api/signals                  -> señales de rotación de sectores SPDR + ETFs de industria
// GET /api/signals?symbols=NVDA,AMD -> señales para acciones puntuales (RRG Acciones)
// GET /api/signals?save=1 (header x-sync-secret) -> además guarda la foto del día en Supabase (lo llama el sync diario)
import { computeSignals, SECTOR_ETFS, INDUSTRY_ETFS } from "./_signals.js";
import { UNIVERSE } from "../lib/universe.js";
import { UA } from "./_lib.js";

// Acciones del universo que pertenecen a cada ETF (sector de BYMA o industria de Yahoo)
const SECTOR_OF = { XLK: "tech", XLF: "fin", XLV: "health", XLY: "discr", XLP: "staples", XLE: "energy", XLI: "ind", XLB: "mat", XLU: "util", XLRE: "re", XLC: "comm" };
const IND_RE = { SMH: /Semiconductor/, IGV: /Software/, CIBR: /Software - Infrastructure|Security/, XBI: /Biotechnology/, IHI: /Medical (Devices|Instruments)/, KRE: /Banks - Regional/, IAI: /Capital Markets|Financial Data/, ITA: /Aerospace/, XHB: /Residential Construction|Building Products|Home Improvement/, XRT: /^(?!REIT).*Retail/, XOP: /Oil & Gas E&P/, GDX: /Gold/, COPX: /Copper/, URA: /Uranium/, TAN: /Solar/, JETS: /Airlines/ };
async function closes6m(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=6mo&interval=1d`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const x = (await r.json())?.chart?.result?.[0];
  const c = (x?.indicators?.adjclose?.[0]?.adjclose || x?.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
  return c.length > 60 ? c : null;
}
// Las acciones del sector con más fuerza relativa a 6 meses contra el ETF (la regla que mejor funcionó en el backtest)
async function leaders(etf) {
  let members = [];
  if (SECTOR_OF[etf]) members = UNIVERSE.filter((u) => u[2] === SECTOR_OF[etf]);
  else if (IND_RE[etf]) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/snapshots?select=symbol,data->>ind`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Range: "0-4999" } });
    const ind = new Map((await r.json()).map((d) => [d.symbol, d.ind || ""]));
    members = UNIVERSE.filter((u) => IND_RE[etf].test(ind.get(u[0]) || ""));
  }
  members = members.filter((u) => u[3] !== "AR" && !u[4].includes("REF") && /^[A-Z.\-]+$/.test(u[0])).slice(0, 60);
  const base = await closes6m(etf); if (!base) return [];
  const out = [];
  for (let i = 0; i < members.length; i += 10) {
    const chunk = members.slice(i, i + 10);
    const res = await Promise.all(chunk.map((u) => closes6m(u[0]).catch(() => null)));
    chunk.forEach((u, k) => { const c = res[k]; if (!c) return; const rs = ((c.at(-1) / c[0]) - (base.at(-1) / base[0])) * 100; out.push({ s: u[0], ced: u[5], n: u[1], rs: Math.round(rs * 10) / 10, ret: Math.round((c.at(-1) / c[0] - 1) * 1000) / 10 }); });
  }
  return out.sort((a, b) => b.rs - a.rs).slice(0, 5);
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sdzhnexusnymyshjlhem.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkemhuZXh1c255bXlzaGpsaGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTc5OTAsImV4cCI6MjEwNzU5Mzk5MH0.Wiso-N1_TEcNrgRkmM7VytK-TFG7sGNjnpW_tR0rYX4";

export default async function handler(req, res) {
  try {
    if (req.query?.leaders) {
      const etf = String(req.query.leaders).toUpperCase();
      if (!SECTOR_OF[etf] && !IND_RE[etf]) return res.status(400).json({ error: "ETF desconocido" });
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
      return res.status(200).json({ etf, leaders: await leaders(etf) });
    }
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
