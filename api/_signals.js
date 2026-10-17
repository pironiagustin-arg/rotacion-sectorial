// Detector de rotación: sectores/acciones en Improving que se acercan a Leading con volumen acompañando.
// Se calcula siempre sobre velas diarias de 1 año (RRG diario) y se confirma con el RRG semanal (3 años).
import { UA, rrg, round } from "./_lib.js";

export const SECTOR_ETFS = {
  XLK: "Tecnología", XLF: "Financiero", XLV: "Salud", XLY: "Consumo discrecional", XLP: "Consumo básico", XLE: "Energía",
  XLI: "Industrial", XLB: "Materiales", XLU: "Servicios públicos", XLRE: "Bienes raíces", XLC: "Comunicaciones",
};
export const INDUSTRY_ETFS = {
  SMH: "Semiconductores", IGV: "Software", CIBR: "Ciberseguridad", XBI: "Biotecnología", IHI: "Dispositivos médicos",
  KRE: "Bancos regionales", IAI: "Brokers y bolsas", ITA: "Aeroespacial y defensa", XHB: "Constructoras de viviendas",
  XRT: "Retail", XOP: "Petróleo E&P", GDX: "Mineras de oro", COPX: "Mineras de cobre", URA: "Uranio", TAN: "Solar", JETS: "Aerolíneas",
};

async function chartOHLCV(symbol, qs) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}&includeAdjustedClose=true`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ${symbol} sin datos`);
  const ts = res.timestamp || [], q = res.indicators?.quote?.[0] || {}, adj = res.indicators?.adjclose?.[0]?.adjclose;
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const c = adj?.[i] ?? q.close?.[i];
    if (c != null && isFinite(c)) pts.push({ t: ts[i] * 1000, c, v: q.volume?.[i] ?? null });
  }
  return { pts, meta: res.meta || {} };
}

// Alinea sobre las fechas del benchmark
function alignTo(bench, d) {
  const m = new Map(d.pts.map((p) => [new Date(p.t).toISOString().slice(0, 10), p]));
  let last = null;
  return bench.pts.map((b) => { const p = m.get(new Date(b.t).toISOString().slice(0, 10)); if (p) last = p; return p || (last ? { ...last, v: 0 } : null); });
}
const mean = (a) => { const v = a.filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const quad = (p) => (p.x >= 100 ? (p.y >= 100 ? "leading" : "weakening") : p.y >= 100 ? "improving" : "lagging");

export function analyze(trail, wtrail, px, bpx) {
  if (!trail || trail.length < 12) return null;
  const n = trail.length, p = trail[n - 1], p5 = trail[n - 6];
  const q = quad(p);
  const dx5 = p.x - p5.x, dy5 = p.y - p5.y;
  // Días consecutivos en el cuadrante actual
  let days = 0; for (let i = n - 1; i >= 0 && quad(trail[i]) === q; i--) days++;
  // Volumen relativo (10 vs 60 ruedas), normalizado por el del benchmark para descontar días de volumen alto en todo el mercado
  const vol = px.map((x) => x?.v ?? null), bvol = bpx.map((x) => x?.v ?? null);
  const rv = (arr) => { const a = mean(arr.slice(-10)), b = mean(arr.slice(-70, -10)); return a && b ? a / b : null; };
  const relVol = rv(vol) != null && rv(bvol) ? rv(vol) / rv(bvol) : rv(vol);
  // Acumulación relativa: volumen en días que le gana al benchmark vs días que pierde (20 ruedas)
  let up = 0, dn = 0;
  for (let i = px.length - 20; i < px.length; i++) {
    if (i < 1 || !px[i] || !px[i - 1] || !bpx[i] || !bpx[i - 1]) continue;
    const rel = px[i].c / px[i - 1].c - bpx[i].c / bpx[i - 1].c;
    if (rel > 0) up += px[i].v || 0; else if (rel < 0) dn += px[i].v || 0;
  }
  const accum = dn > 0 ? up / dn : up > 0 ? 3 : null;
  const wq = wtrail?.length ? quad(wtrail[wtrail.length - 1]) : null;
  const wUp = wtrail?.length >= 3 ? wtrail.at(-1).x - wtrail.at(-3).x : null;
  const eta = q === "improving" && dx5 > 0 ? Math.round((100 - p.x) / (dx5 / 5)) : null;

  let score = 0, status = null;
  if (q === "improving") {
    const prox = clamp(1 - (100 - p.x) / 3) * 30;
    const speed = clamp(dx5 / 1.2) * 20;
    const mom = clamp((p.y - 100) / 2) * 10;
    const vScore = relVol != null ? clamp((relVol - 0.95) / 0.45) * 15 : 0;
    const aScore = accum != null ? clamp((accum - 0.9) / 0.7) * 20 : 0;
    // El semanal confirma (o no) lo que muestra el diario
    const wk = wq === "improving" || wq === "leading" ? 5 : wq === "lagging" && !(wUp > 0) ? -5 : 0;
    score = Math.max(0, Math.round(prox + speed + mom + vScore + aScore + wk));
    // "Por explotar" exige volumen arriba del promedio Y que ese volumen sea comprador (acumulación)
    status = dx5 <= 0 ? "estancado" : score >= 62 && (eta ?? 99) <= 12 && (relVol ?? 0) >= 1.05 && (accum ?? 0) >= 1 ? "por_explotar" : score >= 45 ? "cargando" : "temprano";
  } else if (q === "leading") {
    const was = trail.slice(-8, -1).some((t) => quad(t) === "improving");
    if (was && days <= 7) { status = "cruzo"; score = Math.round(40 + clamp(((relVol ?? 1) - 0.95) / 0.5) * 20 + clamp(((accum ?? 1) - 0.9) / 0.7) * 25 + (wq === "leading" || wq === "improving" ? 15 : 0)); }
  } else if (q === "weakening") {
    const was = trail.slice(-8, -1).some((t) => quad(t) === "leading");
    if (was && days <= 7) { status = "perdiendo"; score = Math.round(50 + clamp(-dy5 / 2) * 50); }
  }
  return {
    status, score, quadrant: q, days, x: round(p.x, 2), y: round(p.y, 2), dx5: round(dx5, 2), dy5: round(dy5, 2), eta,
    relVol: round(relVol, 2), accum: round(accum, 2), weekly: wq, tail: trail.slice(-15).map((t) => ({ x: round(t.x, 2), y: round(t.y, 2) })),
  };
}

// Industrias (no XL): solo se da alerta "Por explotar" si la señal es muy clara; si no, queda en "Cargando"
export const STRICT_OK = (a) => a.score >= 75 && (a.relVol ?? 0) >= 1.2 && (a.accum ?? 0) >= 1.2 && (a.weekly === "improving" || a.weekly === "leading");
export async function computeSignals(symbols, names = {}, benchmark = "SPY", { strict = new Set() } = {}) {
  const all = [benchmark, ...symbols];
  const pull = (qs) => Promise.all(all.map((s) => chartOHLCV(s, qs).catch(() => null)));
  const [D, W] = await Promise.all([pull("range=1y&interval=1d"), pull("range=3y&interval=1wk")]);
  const bD = D[0], bW = W[0];
  if (!bD) throw new Error(`Sin datos del benchmark ${benchmark}`);
  const out = [];
  symbols.forEach((s, i) => {
    const d = D[i + 1], w = W[i + 1];
    if (!d) return;
    const px = alignTo(bD, d);
    const closes = px.map((p) => p?.c ?? null), bc = bD.pts.map((p) => p.c), dates = bD.pts.map((p) => p.t);
    const trail = rrg(closes, bc, dates);
    let wtrail = null;
    if (w && bW) { const wp = alignTo(bW, w); wtrail = rrg(wp.map((p) => p?.c ?? null), bW.pts.map((p) => p.c), bW.pts.map((p) => p.t)); }
    const a = analyze(trail, wtrail, px, bD.pts);
    if (!a) return;
    // Tendencia: precio sobre la EMA de 20 y de 200 ruedas (en el backtest filtra falsas alarmas)
    const cl = d.pts.map((p) => p.c), ema = (n) => { const k = 2 / (n + 1); let e = cl[0]; for (const c of cl) e = c * k + e * (1 - k); return e; };
    const e20 = ema(20), e200 = ema(200), lastC = cl.at(-1);
    a.ema20 = round(e20, 2); a.ema200 = round(e200, 2); a.aboveEma20 = lastC > e20; a.aboveEma200 = lastC > e200;
    if (a.status === "por_explotar" && !(a.aboveEma20 && a.aboveEma200)) { a.status = "cargando"; a.strictNote = `Falta superar la EMA ${!a.aboveEma20 && !a.aboveEma200 ? "20 y 200" : !a.aboveEma20 ? "20" : "200"} para dar alerta`; }
    if (strict.has(s) && a.status === "por_explotar" && !STRICT_OK(a)) { a.status = "cargando"; a.strictNote = "Industria: falta una señal más clara para dar alerta"; }
    const last = d.pts.at(-1), prev = d.pts.at(-2);
    out.push({ symbol: s, name: names[s] || d.meta.shortName || s, price: round(last?.c, 2), chg: prev ? round((last.c / prev.c - 1) * 100, 2) : null, ...a });
  });
  const order = { por_explotar: 0, cruzo: 1, cargando: 2, temprano: 3, perdiendo: 4, estancado: 5 };
  out.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (strict.has(a.symbol) ? 1 : 0) - (strict.has(b.symbol) ? 1 : 0) || b.score - a.score);
  return out;
}
