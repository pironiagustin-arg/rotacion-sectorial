// Datos de BYMA en pesos (CEDEARs y acciones locales), CCL implícito por especie y cotizaciones del dólar.
const A = { data: null, at: 0, p: null };
export async function fetchArs(maxAge = 20000) {
  if (A.data && Date.now() - A.at < maxAge) return A.data;
  if (A.p) return A.p;
  A.p = fetch("/api/overview?view=ars").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { A.p = null; if (d) { A.data = d; A.at = Date.now(); } return A.data; });
  return A.p;
}
// Info en pesos de un símbolo del universo (r.ced = ticker BYMA)
export function arsOf(d, ced) {
  if (!d || !ced) return null;
  const x = d.cedears?.[ced]; if (!x) return null;
  const imp = d.implied?.[ced]?.ccl ?? null;
  const dev = imp && d.medCcl ? (imp / d.medCcl - 1) * 100 : null;
  return { ...x, ccl: imp, dev, med: d.medCcl };
}
// Ratio del CEDEAR (cuántos CEDEARs equivalen a una acción): CCL × precio en EE.UU. / precio en pesos
export function ratioOf(ars, ccl, usPx) {
  if (!ars || !ccl || !usPx) return null;
  const r = (ccl * usPx) / ars;
  if (r < 0.9) return Math.round(r * 100) / 100;
  const STD = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 25, 26, 27, 30, 32, 36, 40, 45, 48, 50, 60, 65, 72, 75, 80, 90, 100, 120, 125, 144, 150, 200, 250, 300, 400, 500, 1000];
  const best = STD.reduce((b, x) => (Math.abs(x / r - 1) < Math.abs(b / r - 1) ? x : b), STD[0]);
  return Math.abs(best / r - 1) < 0.08 ? best : Math.round(r);
}
export const devTxt = (dev) => dev == null ? "" : Math.abs(dev) < 0.5 ? "en línea" : dev < 0 ? "barato" : "caro";
