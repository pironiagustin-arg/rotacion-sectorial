// Puntaje de régimen 0-100 (mismo cálculo en Dashboard y Técnico)
export function regimeGroups(R, B) {
  const sg = R?.signals || [], st = Object.fromEntries(sg.map((x) => [x.k, x.state]));
  const part = (k, w) => (st[k] == null ? null : ((st[k] + 1) / 2) * w);
  const lin = (v, a, b2, w) => Math.max(0, Math.min(1, (v - a) / (b2 - a))) * w;
  const a200 = B?.above200?.at(-1), nh = B?.nh?.at(-1), nl = B?.nl?.at(-1);
  const groups = [
    ["📈", "Índices (S&P, Nasdaq, small caps)", [[part("trend", 15), 15], [part("dd", 10), 10], [part("ew", 7.5), 7.5], [part("small", 7.5), 7.5]]],
    ["🌐", "Amplitud (cuántas acciones acompañan)", [[a200 != null ? lin(a200, 30, 70, 15) : null, 15], [nh != null ? lin(nh - nl, -15, 15, 5) : null, 5], [part("breadth", 5), 5]]],
    ["🧠", "Sentimiento (VIX)", [[part("vix", 8), 8], [part("term", 7), 7]]],
    ["🏦", "Crédito y macro", [[part("credit", 8), 8], [part("cyc", 4), 4], [part("dxy", 4), 4], [part("rates", 4), 4]]],
  ].map(([ic, l, xs]) => { const v = xs.filter(([p]) => p != null); return [ic, l, v.reduce((a, [p]) => a + p, 0), v.reduce((a, [, w]) => a + w, 0)]; });
  const got = groups.reduce((a, g) => a + g[2], 0), max = groups.reduce((a, g) => a + g[3], 0);
  return { groups, score: max ? Math.round((got / max) * 100) : 50, a200, nh, nl };
}
export const expoOf = (score) => (score >= 70 ? ["75–100%", "cartera completa, sumar en retrocesos", "#22c55e"] : score >= 50 ? ["50–75%", "exposición normal, selectividad", "#84cc16"] : score >= 35 ? ["25–50%", "posiciones chicas, stops cortos", "#f59e0b"] : ["0–25%", "priorizar caja y defensivas", "#ef4444"]);
