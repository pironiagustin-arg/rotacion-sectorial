// Motor del score: compartido por el Screener y la ficha de empresa.
// Cada acción se compara en percentiles contra su grupo de pares. Qué métricas cuentan y cuánto pesan
// depende de la familia del sector (un banco no se mide como una tecnológica) y del tipo Lynch.
import { SECTORS, COUNTRIES } from "/lib/universe.js";

export const ok = (v) => v != null && isFinite(v);

// ---------- Catálogo de métricas ----------
// dir: +1 más alto es mejor, -1 más bajo es mejor. pos: solo tiene sentido si es positiva (P/E, PEG, EV/EBITDA).
export const METRICS = {
  peg:      { l: "PEG", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "Cuánto pagás por cada punto de crecimiento. Menos de 1 suele ser barato." },
  fpe:      { l: "P/E forward", f: "x", dir: -1, g: "Valuación", pos: true, q: "Años de ganancias (estimadas a 12 meses) que pagás por la acción." },
  pb:       { l: "Precio / valor libro", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "Precio contra el patrimonio contable. Clave en bancos y empresas de activos." },
  evEbitda: { l: "EV / EBITDA", f: "x", dir: -1, g: "Valuación", pos: true, q: "Valor de la empresa (incluida la deuda) contra su caja operativa. El múltiplo de las cíclicas." },
  fcfY:     { l: "FCF yield", f: "%", dir: 1, g: "Valuación", q: "Caja libre que genera por año como % del precio. Más alto, más barata." },
  roic:     { l: "ROIC", f: "%", dir: 1, g: "Calidad", q: "Retorno sobre el capital invertido. Mide si el negocio crea valor." },
  roe:      { l: "ROE", f: "%", dir: 1, g: "Calidad", q: "Ganancia sobre el patrimonio de los accionistas. La métrica central en bancos." },
  gm:       { l: "Margen bruto", f: "%", dir: 1, g: "Calidad", q: "Cuánto le queda de cada venta después del costo directo. Indica poder de precio." },
  om:       { l: "Margen operativo", f: "%", dir: 1, g: "Calidad", q: "Ganancia del negocio antes de intereses e impuestos, sobre ventas." },
  epsG:     { l: "Crecimiento EPS esperado", f: "%", dir: 1, g: "Crecimiento", q: "Cuánto se espera que crezcan las ganancias por acción (consenso de analistas)." },
  revG:     { l: "Crecimiento de ventas", f: "%", dir: 1, g: "Crecimiento", q: "Variación de las ventas contra el mismo período del año anterior." },
  ndEbitda: { l: "Deuda neta / EBITDA", f: "x", dir: -1, g: "Solidez", q: "Años de caja operativa para pagar la deuda. Más de 3x es exigente." },
  cr:       { l: "Liquidez corriente", f: "x", d: 2, dir: 1, g: "Solidez", q: "Activos de corto plazo sobre deudas de corto plazo. Debajo de 1 hay que mirar." },
  divY:     { l: "Dividend yield", f: "%", dir: 1, g: "Dividendos", q: "Dividendo anual como % del precio." },
};
export const GROUPS = ["Valuación", "Calidad", "Crecimiento", "Solidez", "Dividendos"];

// ---------- Familias de sector ----------
export const FAMILIES = {
  growth:    { l: "Crecimiento / tecnología", why: "Se priorizan crecimiento, márgenes y PEG.",
               w: { peg: 14, fpe: 8, fcfY: 8, roic: 12, gm: 6, om: 8, epsG: 14, revG: 14, ndEbitda: 8 } },
  defensive: { l: "Consumo defensivo", why: "Pesan la calidad del negocio, la caja y el dividendo más que el crecimiento.",
               w: { peg: 8, fpe: 12, fcfY: 12, roic: 14, om: 10, epsG: 10, revG: 6, ndEbitda: 10, divY: 10 } },
  industrial:{ l: "Industrial", why: "Equilibrio entre valuación, retorno sobre capital y crecimiento.",
               w: { peg: 10, fpe: 10, evEbitda: 8, fcfY: 10, roic: 14, om: 10, epsG: 12, revG: 10, ndEbitda: 10 } },
  commodity: { l: "Commodities (energía y materiales)", why: "El P/E engaña en el pico del ciclo: se mide con EV/EBITDA, caja libre, deuda y valor libro.",
               w: { evEbitda: 16, fcfY: 16, pb: 8, roic: 12, om: 8, ndEbitda: 16, divY: 8, epsG: 4, revG: 4 } },
  bank:      { l: "Financiero", why: "En bancos y aseguradoras no aplican ROIC ni deuda: manda el ROE contra el precio/valor libro.",
               w: { fpe: 16, pb: 16, roe: 22, epsG: 12, revG: 8, divY: 10 } },
  reit:      { l: "Inmobiliario (REITs)", why: "Se mide por la caja que distribuye y el endeudamiento, no por P/E.",
               w: { fcfY: 18, divY: 18, evEbitda: 14, ndEbitda: 16, revG: 10, pb: 8 } },
  utility:   { l: "Servicios públicos", why: "Negocio regulado: pesan el dividendo, la deuda y la estabilidad de las ganancias.",
               w: { fpe: 14, divY: 18, ndEbitda: 16, epsG: 14, roe: 10, evEbitda: 10 } },
};
export const SECTOR_FAMILY = { tech: "growth", comm: "growth", health: "growth", discr: "growth", staples: "defensive",
  ind: "industrial", energy: "commodity", mat: "commodity", fin: "bank", re: "reit", util: "utility" };

// ---------- Tipos Lynch ----------
export const LYNCH = { slow: "Slow Grower", stalwart: "Stalwart", fast: "Fast Grower", cyclical: "Cíclica", turnaround: "Turnaround", asset: "Asset Play" };
export const LYNCH_INFO = {
  slow: "Crece poco (menos de 7% anual). Se compra por dividendo y precio bajo.",
  stalwart: "Empresa grande y sólida que crece 7-18% anual. Se compra barata y se toma ganancia en 30-50%.",
  fast: "Crece más de 18% anual. Lo clave es que el crecimiento siga y el PEG no se dispare (hasta 1,5 tolerado).",
  cyclical: "Ganancias que suben y bajan con el ciclo. Se compra con P/E alto (ganancias en el piso) y se vende con P/E bajo.",
  turnaround: "Viene de pérdidas y se espera que vuelva a ganar. Lo clave es que sobreviva: caja y deuda.",
  asset: "Vale más por lo que tiene (activos) que por lo que gana. Se mira el precio contra el valor libro.",
};
// Multiplicadores por grupo y ajustes de métricas según el tipo
const LYNCH_MOD = {
  fast:       { g: { Crecimiento: 1.5, Dividendos: 0.3 }, m: { peg: 1.3 } },
  stalwart:   { g: { Calidad: 1.3, Valuación: 1.15, Crecimiento: 0.9 }, m: {} },
  slow:       { g: { Dividendos: 2, Valuación: 1.25, Crecimiento: 0.5 }, m: {}, add: { divY: 10 } },
  cyclical:   { g: { Solidez: 1.4, Crecimiento: 0.5 }, m: { peg: 0.3, fpe: 0.5 }, add: { evEbitda: 12, pb: 8 } },
  turnaround: { g: { Solidez: 1.8, Calidad: 0.7 }, m: { peg: 0, fpe: 0.4 }, add: { cr: 10, ndEbitda: 6 } },
  asset:      { g: { Crecimiento: 0.5 }, m: { pb: 2.5 }, add: { pb: 14 } },
};

const CYCLICAL_IND = /auto|airline|steel|chemical|semiconductor equipment|oil|gas|mining|copper|gold|silver|aluminum|metal|homebuild|building material|marine|shipping|trucking|travel|lodging|hotel|resort|cruise|leisure|agricultur|paper|lumber|coal|uranium|rental/i;

export function classifyLynch(r) {
  if (ok(r.eps) && r.eps <= 0 && ok(r.feps) && r.feps > 0) return "turnaround";
  if (ok(r.eps) && r.eps <= 0) return "turnaround";
  if (r.sec !== "fin" && ok(r.pb) && r.pb > 0 && r.pb < 0.8) return "asset";
  if (r.sec === "energy" || r.sec === "mat" || CYCLICAL_IND.test(r.ind || "")) return "cyclical";
  const g = ok(r.epsG) ? r.epsG : r.revG;
  if (!ok(g)) return null;
  return g < 7 ? "slow" : g < 18 ? "stalwart" : "fast";
}

// Pesos efectivos de una acción: familia del sector + ajuste por tipo Lynch + multiplicadores del usuario
export function weightsFor(r, userMult = {}) {
  const fam = FAMILIES[SECTOR_FAMILY[r.sec] || "growth"];
  const w = { ...fam.w };
  const mod = LYNCH_MOD[r.lynch];
  if (mod) {
    for (const [k, v] of Object.entries(mod.add || {})) if (!(k in w)) w[k] = v;
    for (const [k, v] of Object.entries(mod.m || {})) if (k in w) w[k] *= v;
    for (const k of Object.keys(w)) w[k] *= mod.g?.[METRICS[k].g] ?? 1;
  }
  // En financieras no aplican ROIC, deuda ni EV
  if (r.sec === "fin") for (const k of ["roic", "ndEbitda", "evEbitda", "cr", "fcfY"]) delete w[k];
  for (const k of Object.keys(w)) w[k] *= userMult[METRICS[k].g] ?? 1;
  return w;
}

// ---------- Preparación de cada fila ----------
export function derive(raw, ov) {
  const r = { ...raw };
  r.epsG = raw.epsLT ?? raw.epsNY ?? (raw.feps > 0 && raw.eps > 0 ? (raw.feps / raw.eps - 1) * 100 : null) ?? raw.epsQ;
  if (r.sec === "fin") { r.roic = null; r.de = null; r.ndEbitda = null; }
  if (ok(r.roic) && Math.abs(r.roic) > 150) r.roic = null;
  if (ok(r.evEbitda) && (r.evEbitda <= 0 || r.evEbitda > 200)) r.evEbitda = null;
  r.d52 = ok(raw.px) && raw.hi52 ? (raw.px / raw.hi52 - 1) * 100 : null;
  r.edited = new Set();
  for (const [k, v] of Object.entries(ov?.metrics || {})) if (v !== "" && v != null && isFinite(Number(v))) { r[k] = Number(v); r.edited.add(k); }
  r.peg = ok(r.fpe) && r.fpe > 0 && ok(r.epsG) && r.epsG > 0 ? r.fpe / r.epsG : null;
  r.lynchAuto = classifyLynch(r);
  r.lynch = ov?.lynch_type || r.lynchAuto;
  r.fair = ov?.fair_value != null && ov.fair_value !== "" && isFinite(Number(ov.fair_value)) ? Number(ov.fair_value) : null;
  r.fairUp = r.fair && r.px ? (r.fair / r.px - 1) * 100 : null;
  r.notes = ov?.notes || "";
  r.thesis = ov?.metrics?.thesis || null;
  r.hasThesis = !!(r.fair || r.notes || ov?.lynch_type || r.thesis);
  r.family = SECTOR_FAMILY[r.sec] || "growth";
  return r;
}

const median = (a) => { const b = a.filter(ok).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export { median };

// Valor usable para comparar: múltiplos negativos o nulos (pérdidas) no compiten
function cmpVal(r, k) {
  const v = r[k];
  if (!ok(v)) return null;
  if (METRICS[k].pos && v <= 0) return null;
  return v;
}

// Calcula percentiles, score, tipo, fundamentos y alertas para todas las filas
export function scoreAll(rows, { peer = "sector", userMult = {} } = {}) {
  const key = (r) => (peer === "sector-country" ? r.sec + "|" + r.c : r.sec);
  const groups = new Map(), bySector = new Map();
  for (const r of rows) {
    if (!groups.has(key(r))) groups.set(key(r), []); groups.get(key(r)).push(r);
    if (!bySector.has(r.sec)) bySector.set(r.sec, []); bySector.get(r.sec).push(r);
  }
  for (const r of rows) {
    let peers = groups.get(key(r));
    r.peerLabel = peer === "sector-country" ? `${SECTORS[r.sec]} · ${COUNTRIES[r.c] || r.c}` : SECTORS[r.sec];
    if (peers.length < 6) { peers = bySector.get(r.sec); r.peerLabel = SECTORS[r.sec]; }
    r.peerN = peers.length; r.pct = {}; r.med = {};
    for (const k of Object.keys(METRICS)) {
      r.med[k] = median(peers.map((p) => cmpVal(p, k)));
      const v = cmpVal(r, k);
      // P/E o PEG negativos = pérdidas o crecimiento negativo: peor percentil
      if (v == null) { if (METRICS[k].pos && ok(r[k]) && r[k] <= 0) r.pct[k] = 0; if (k === "peg" && r.peg == null && ok(r.fpe) && (r.fpe <= 0 || (ok(r.epsG) && r.epsG <= 0))) r.pct[k] = 0; continue; }
      const vals = peers.map((p) => cmpVal(p, k)).filter(ok);
      if (vals.length < 4) continue;
      let below = 0, eq = 0;
      for (const x of vals) { if (x < v) below++; else if (x === v) eq++; }
      let p = ((below + eq / 2) / vals.length) * 100;
      if (METRICS[k].dir < 0) p = 100 - p;
      r.pct[k] = Math.round(p);
    }
    for (const k of ["pe", "gm", "nm", "upside", "d52", "beta", "payout", "evRev"]) r.med[k] = median(peers.map((p) => p[k]));
    // Score ponderado
    r.weights = weightsFor(r, userMult);
    let tot = 0, sw = 0, ss = 0; const gs = {};
    for (const [k, w] of Object.entries(r.weights)) {
      tot += w; const g = METRICS[k].g; gs[g] = gs[g] || { s: 0, w: 0 };
      if (r.pct[k] == null || !w) continue;
      sw += w; ss += w * r.pct[k]; gs[g].s += w * r.pct[k]; gs[g].w += w;
    }
    r.coverage = tot ? sw / tot : 0;
    r.score = r.coverage >= 0.55 ? Math.round(ss / sw) : null;
    r.gscore = Object.fromEntries(GROUPS.map((g) => [g, gs[g]?.w ? Math.round(gs[g].s / gs[g].w) : null]));
    // Fundamentos y alertas en lenguaje claro
    r.why = []; r.alerts = [];
    for (const [k, w] of Object.entries(r.weights)) {
      const p = r.pct[k], m = METRICS[k];
      if (p == null || !ok(r[k]) || !w) continue;
      if (p >= 80) r.why.push({ k, w, p, t: `${m.l} de ${fmt(r[k], m.f, m.d)}: mejor que el ${p}% de ${r.peerLabel}` });
      if (p <= 20) r.alerts.push({ k, w, p, t: `${m.l} de ${fmt(r[k], m.f, m.d)}: peor que el ${100 - p}% de ${r.peerLabel}` });
    }
    if (ok(r.fcf) && r.fcf < 0 && r.sec !== "fin") r.alerts.push({ w: 99, t: "Quema caja: el free cash flow es negativo" });
    if (ok(r.eps) && r.eps <= 0) r.alerts.push({ w: 98, t: "Hoy pierde plata (EPS de los últimos 12 meses negativo)" });
    if (ok(r.revG) && r.revG < -5) r.alerts.push({ w: 97, t: `Ventas cayendo ${fmt(-r.revG, "%")} interanual` });
    if (ok(r.ndEbitda) && r.ndEbitda > 4 && r.family !== "reit" && r.family !== "utility") r.alerts.push({ w: 96, t: `Deuda alta: ${fmt(r.ndEbitda, "x")} su EBITDA` });
    if (ok(r.payout) && r.payout > 100 && r.sec !== "re") r.alerts.push({ w: 95, t: `Paga más dividendo que lo que gana (payout ${fmt(r.payout, "%", 0)})` });
    r.why.sort((a, b) => b.w * b.p - a.w * a.p);
    r.alerts.sort((a, b) => b.w - a.w);
    // Candidata: score alto, valuación razonable y PEG en rango si el tipo lo pide
    const val = r.gscore["Valuación"];
    const pegMax = r.lynch === "fast" ? 1.5 : 1.2;
    const pegOk = !["fast", "stalwart"].includes(r.lynch) || (ok(r.peg) && r.peg <= pegMax);
    r.cand = (ok(r.score) && r.score >= 70 && ok(val) && val >= 55 && pegOk) || (ok(r.fairUp) && r.fairUp >= 15);
    r.candReason = ok(r.score) && r.score >= 70 && ok(val) && val >= 55 && pegOk
      ? `Score ${r.score} con valuación mejor que el ${val}% de su grupo${["fast", "stalwart"].includes(r.lynch) ? ` y PEG ${fmt(r.peg, "x", 2)}` : ""}`
      : r.cand ? `Tu precio justo deja ${fmt(r.fairUp, "%", 0)} de margen` : "";
    r.verdict = verdict(r);
  }
  return rows;
}

// Frases cortas para la ficha
function verdict(r) {
  const lv = (s) => (!ok(s) ? null : s >= 70 ? "good" : s >= 45 ? "mid" : "bad");
  const g = r.gscore;
  const v = {
    Calidad: { q: "¿Es buen negocio?", s: g["Calidad"], t: { good: "Sí: rentabilidad por encima de sus pares.", mid: "Normal para su sector.", bad: "Rentabilidad por debajo de sus pares." } },
    Crecimiento: { q: "¿Crece?", s: g["Crecimiento"], t: { good: "Crece más rápido que su sector.", mid: "Crece en línea con su sector.", bad: "Crece menos que su sector." } },
    Valuación: { q: "¿Está barata?", s: g["Valuación"], t: { good: "Barata contra sus pares.", mid: "Precio en línea con sus pares.", bad: "Cara contra sus pares." } },
    Solidez: { q: "¿Está sana?", s: g["Solidez"] ?? (r.sec === "fin" ? null : undefined), t: { good: "Deuda baja y buena liquidez.", mid: "Deuda manejable.", bad: "Deuda o liquidez para vigilar." } },
  };
  for (const x of Object.values(v)) { x.lv = lv(x.s); x.txt = x.lv ? x.t[x.lv] : "Sin datos suficientes."; }
  return v;
}

// ---------- Formato ----------
const nfCache = {};
export const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
export function fmt(v, f, d) {
  if (!ok(v)) return "—";
  const dd = d ?? (f === "%" || f === "x" ? 1 : 2);
  if (Math.abs(v) < 0.5 * 10 ** -dd) v = 0;
  if (f === "%") return nf(dd).format(v) + "%";
  if (f === "x") return nf(dd).format(v) + "x";
  return nf(dd).format(v);
}
export function fmtCap(v) {
  if (!ok(v)) return "—";
  if (Math.abs(v) >= 1e12) return "US$ " + nf(2).format(v / 1e12) + " T";
  if (Math.abs(v) >= 1e9) return "US$ " + nf(1).format(v / 1e9) + " B";
  return "US$ " + nf(0).format(v / 1e6) + " M";
}
export function fmtBig(v, cur) {
  if (!ok(v)) return "—";
  const a = Math.abs(v), s = cur && cur !== "USD" ? cur + " " : "US$ ";
  if (a >= 1e12) return s + nf(2).format(v / 1e12) + " T";
  if (a >= 1e9) return s + nf(1).format(v / 1e9) + " B";
  if (a >= 1e6) return s + nf(0).format(v / 1e6) + " M";
  return s + nf(0).format(v);
}
export const scoreCls = (s) => (!ok(s) ? "s-na" : s >= 70 ? "s-good" : s >= 45 ? "s-mid" : "s-bad");
