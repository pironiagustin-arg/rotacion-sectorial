// Listas del usuario compartidas entre páginas: watchlists y cartera (en la cuenta si inició sesión, si no en el navegador)
import { state, loadLocal, saveLocal, saveOverride } from "/js/core.js";

export function watchSymbols() {
  let wl = loadLocal("watchlists_v2", null);
  const acc = state.ov.get("__watchlists")?.metrics?.lists;
  if (acc) wl = { lists: acc };
  return new Set(Object.values(wl?.lists || {}).flat());
}
export function getPortfolio() {
  const acc = state.ov.get("__portfolio")?.metrics;
  if (acc?.positions) return { positions: acc.positions, cash: acc.cash || {} };
  return loadLocal("cartera_v1", { positions: [], cash: {} });
}
export async function savePortfolio(p) {
  saveLocal("cartera_v1", p);
  if (state.user) await saveOverride("__portfolio", { metrics: p });
}
