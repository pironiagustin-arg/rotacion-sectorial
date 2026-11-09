// Score técnico (0-100, estilo Minervini) a partir de cierres diarios (≥ 260) y del S&P 500 en las mismas fechas.
// Lo usan la ficha (/api/fundamentals?detail=1) y el ranking diario (scripts/breadth.mjs).
const rd = (x, d = 1) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rsi(c, k = 14) {
  if (c.length <= k + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= k; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= k; l /= k;
  for (let i = k + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (k - 1) + Math.max(d, 0)) / k; l = (l * (k - 1) + Math.max(-d, 0)) / k; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
export function ema(c, k) { const a = 2 / (k + 1); let e = c.slice(0, k).reduce((x, y) => x + y, 0) / k; for (let i = k; i < c.length; i++) e = c[i] * a + e * (1 - a); return e; }
// Línea de fuerza relativa (precio / S&P 500): nivel vs su media de 50 ruedas y pendiente de 1 y 3 meses.
// Cuadrante estilo RRG: líder (fuerte y mejorando), mejorando (todavía débil pero dando vuelta), debilitándose, rezagada.
export function rsLine(c, spy) {
  if (!spy?.length || spy.length !== c.length || c.length < 70) return null;
  const r = c.map((v, i) => v / spy[i]), n = r.length, last = r[n - 1];
  const avg = (k, end = n) => r.slice(end - k, end).reduce((a, b) => a + b, 0) / k;
  const lvl = (last / avg(126) - 1) * 100;                   // >0: RS sobre su media de 6 meses (fuerte)
  const rs1m = (last / r[n - 22] - 1) * 100, rs3m = (last / r[n - 64] - 1) * 100;
  const mom = (last / r[n - 16] - 1) * 100; // cambio de la línea RS en 3 semanas (lo que se muestra y define el giro)
  const y = r.slice(-252), rsHi = last >= Math.max(...y) * 0.98;   // línea RS en zona de máximos de 1 año
  const quad = lvl >= 0 ? (mom >= 0 ? "lead" : "weak") : mom >= 0 ? "impr" : "lag";
  return { lvl, mom, rs3w: mom, rs1m, rs3m, rsHi, quad };
}
export function techScore(c, spy) {
  const n = c.length, last = c[n - 1];
  if (n < 260) return null;
  const sma = (k, end = n) => c.slice(end - k, end).reduce((a, b) => a + b, 0) / k;
  const m50 = sma(50), m150 = sma(150), m200 = sma(200), m200p = sma(200, n - 21);
  const checks = [[last > m50, "Precio sobre la media de 50"], [last > m150, "Precio sobre la media de 150"], [last > m200, "Precio sobre la media de 200"], [m50 > m150 && m150 > m200, "Medias ordenadas 50 > 150 > 200"], [m200 > m200p, "Media de 200 subiendo (1 mes)"]];
  const trend = checks.filter(([v]) => v).length * 4;
  // Fuerza (20): rendimiento ponderado 3-12 meses contra el S&P 500 (nivel)
  const ret = (a, k) => (a.length > k && a[a.length - 1 - k] ? a[a.length - 1] / a[a.length - 1 - k] - 1 : 0);
  const wr = (a) => 0.4 * ret(a, 63) + 0.2 * ret(a, 126) + 0.2 * ret(a, 189) + 0.2 * ret(a, 252);
  const rsDiff = (wr(c) - (spy?.length ? wr(spy) : 0)) * 100;
  const rs = clamp(((rsDiff + 10) / 50) * 20, 0, 20);
  // Mejora (25): la línea de fuerza relativa sube en 1 y 3 meses y está en máximos
  const L = rsLine(c, spy);
  // "Fuerte" exige las dos cosas: línea RS sobre su media de 6 meses y ganarle al S&P en 3-12 meses (si no, un rebote corto parece líder)
  if (L) { const strong = L.lvl >= 0 && rsDiff >= 0; L.quad = strong ? (L.mom >= 0 ? "lead" : "weak") : L.mom >= 0 ? "impr" : "lag"; }
  const impr = L ? clamp(((L.rs1m + 2) / 17) * 12, 0, 12) + clamp(((L.rs3m + 4) / 34) * 8, 0, 8) + (L.rsHi ? 5 : 0) : 0;
  // Contracción (15): volatilidad y rango achicándose, solo vale con tendencia (una acción muerta también se comprime)
  const lr = c.slice(-61).map((v, i, a) => (i ? Math.log(v / a[i - 1]) : null)).slice(1);
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const volR = sd(lr.slice(-10)) / (sd(lr) || 1);
  const rng = (k) => { const a = c.slice(-k); return (Math.max(...a) / Math.min(...a) - 1) * 100; };
  const rngR = rng(15) / (rng(60) || 1);
  const contr = (clamp(((1.2 - volR) / 0.7) * 8, 0, 8) + clamp(((0.8 - rngR) / 0.6) * 7, 0, 7)) * (trend >= 12 ? 1 : trend / 20);
  // Setup (20): cerca del máximo de 52 semanas, lejos del mínimo y SIN estar estirada sobre la media de 50
  const y = c.slice(-252), hi = Math.max(...y), lo = Math.min(...y), fromHi = (last / hi - 1) * 100, fromLo = (last / lo - 1) * 100;
  const s50 = (last / m50 - 1) * 100;
  const ext = s50 > 30 ? 0 : s50 > 12 ? ((30 - s50) / 18) * 7 : s50 >= -3 ? 7 : clamp(((s50 + 12) / 9) * 7, 0, 7);
  const setup = clamp(((20 + fromHi) / 20) * 8, 0, 8) + clamp((fromLo / 30) * 5, 0, 5) + ext;
  return {
    score: Math.round(trend + rs + impr + contr + setup), trend, rs: rd(rs), impr: rd(impr), contr: rd(contr), setup: rd(setup),
    checks: checks.map(([v, l]) => [!!v, l]), rsDiff: rd(rsDiff), volR: rd(volR, 2), rngR: rd(rngR, 2),
    rs3w: rd(L?.rs3w), rs1m: rd(L?.rs1m), rs3m: rd(L?.rs3m), rsHi: !!L?.rsHi, quad: L?.quad || null, lvl: rd(L?.lvl), mom: rd(L?.mom, 2), ext: s50 > 25,
    hi: rd(hi, 2), lo: rd(lo, 2), pos: rd(((last - lo) / (hi - lo || 1)) * 100, 0), fromHi: rd(fromHi), fromLo: rd(fromLo),
    m50: rd(m50, 2), m150: rd(m150, 2), m200: rd(m200, 2), rsi: rd(rsi(c.slice(-120))), e200: rd((last / ema(c, 200) - 1) * 100), s50: rd(s50),
  };
}

// ---------- Setup "compresión entre techo bajista y AVWAP, ruptura con volumen" ----------
// Lateralización después de una suba: máximos cada vez más bajos (techo bajista) y piso en el VWAP anclado
// al mínimo de los últimos 6 meses. El rango se achica y el volumen se seca; la señal es romper el techo
// con volumen y con el precio sobre las EMA 20, 50 y 200.
export function coilSetup({ h, l, c, v }) {
  const n = c.length; if (n < 210 || !v?.length) return null;
  const last = c[n - 1], tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  const e = (k) => ema(c, k), e20 = e(20), e50 = e(50), e200 = e(200);
  const e200p = ema(c.slice(0, n - 20), 200);
  // AVWAP anclado al mínimo de los últimos 126 días
  let a = n - 126; for (let i = n - 126; i < n; i++) if (l[i] < l[a]) a = i;
  let pv = 0, vv = 0; for (let i = a; i < n; i++) { pv += tp[i] * (v[i] || 0); vv += v[i] || 0; }
  const avwap = vv ? pv / vv : null; if (!avwap) return null;
  // Techo bajista: máximos pivote (±3 ruedas) de las últimas 60 ruedas, ajuste lineal
  const W = 60, piv = [];
  for (let i = n - W; i < n - 3; i++) { let ok = true; for (let j = i - 3; j <= i + 3; j++) if (j !== i && h[j] > h[i]) { ok = false; break; } if (ok) piv.push([i, h[i]]); }
  if (piv.length < 2) return null;
  const mx = piv.reduce((s, p) => s + p[0], 0) / piv.length, my = piv.reduce((s, p) => s + p[1], 0) / piv.length;
  const sl = piv.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (piv.reduce((s, p) => s + (p[0] - mx) ** 2, 0) || 1);
  const ceilAt = (i) => my + sl * (i - mx);
  const ceil = ceilAt(n - 1), ceilP = ceilAt(n - 21);
  const slopePct = (sl / my) * 100 * 20;                  // % que baja el techo cada 20 ruedas
  // Previa: suba antes de la lateralización (precio 60 ruedas atrás vs 120 ruedas atrás)
  const priorUp = (c[n - W] / c[n - W - 60] - 1) * 100;
  const width = ((ceil - avwap) / last) * 100, widthP = ((ceilP - avwap) / c[n - 21]) * 100;
  const avg = (arr, k, end = n) => arr.slice(end - k, end).reduce((s, x) => s + (x || 0), 0) / k;
  const vol50 = avg(v, 50, n - 1), volR = v[n - 1] / (vol50 || 1), dry = avg(v, 10, n - 1) / (vol50 || 1);
  const overEmas = last > e20 && last > e50 && last > e200, e200up = e200 > e200p;
  const base = slopePct <= 0.5 && last >= avwap * 0.98 && width > 0 && e200up && last > e200 && priorUp > 10;
  if (!base) return null;
  let state; const vMax3 = Math.max(v[n - 1], v[n - 2], v[n - 3]) / (vol50 || 1);
  if (last > ceil) {
    // Ruptura reciente (en las últimas 3 ruedas cruzó el techo) y todavía cerca: si no, ya pasó
    const fresh = [2, 3, 4].some((k) => c[n - k] <= ceilAt(n - k) * 1.005) && last <= ceil * 1.06;
    if (!fresh) return null;
    state = vMax3 >= 1.4 && overEmas ? "breakout" : "weak";
  } else state = width <= 12 && width < widthP ? "coil" : "base";
  return { state, ceil: rd(ceil, 2), avwap: rd(avwap, 2), width: rd(width), widthP: rd(widthP), toCeil: rd((ceil / last - 1) * 100), volR: rd(volR, 2), vol3: rd(vMax3, 2), dry: rd(dry, 2), overEmas, slope: rd(slopePct), e20: rd(e20, 2), e50: rd(e50, 2), e200: rd(e200, 2), priorUp: rd(priorUp) };
}
