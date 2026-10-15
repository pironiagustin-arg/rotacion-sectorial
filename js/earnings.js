// Calendario de resultados para un conjunto de acciones + resumen del management de las que ya reportaron
import { esc } from "/js/core.js";
import { talkRead, trEs } from "/js/talk.js";

const fd = (t) => new Date(t).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
export async function earningsData(syms) {
  const q = {};
  for (let i = 0; i < syms.length; i += 150) {
    try { const r = await fetch("/api/overview?s=" + encodeURIComponent(syms.slice(i, i + 150).join(","))); if (r.ok) Object.assign(q, (await r.json()).q); } catch {}
  }
  const now = Date.now(), up = [], recent = [];
  for (const s of syms) {
    const x = q[s]; if (!x) continue;
    const e = [x.earn, x.earnLast].filter(Boolean);
    const next = e.filter((t) => t > now - 12 * 3600e3).sort((a, b) => a - b)[0];
    const last = e.filter((t) => t <= now).sort((a, b) => b - a)[0];
    if (next && next - now < 60 * 864e5) up.push({ s, t: next, est: x.earnEst });
    if (last && now - last < 12 * 864e5) recent.push({ s, t: last });
  }
  return { up: up.sort((a, b) => a.t - b.t), recent: recent.sort((a, b) => b.t - a.t) };
}
// el: contenedor; syms: símbolos Yahoo; label(s): nombre a mostrar
export async function renderEarnings(el, syms, label = (s) => s) {
  if (!syms.length) { el.innerHTML = `<div class="na">Agregá acciones a tu watchlist o cartera para ver sus fechas de resultados.</div>`; return; }
  el.innerHTML = `<div class="na">Buscando fechas…</div>`;
  const { up, recent } = await earningsData(syms);
  const go = (s) => `/empresa.html?s=${encodeURIComponent(s)}`;
  const days = (t) => { const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`; };
  el.innerHTML = `
    ${recent.length ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Ya reportaron</div><div id="erRecent">${recent.map((x) => `<div class="er-row" data-s="${esc(x.s)}"><a href="${go(x.s)}"><b>${esc(label(x.s))}</b></a> <span class="na">${fd(x.t)}</span><div class="er-talk na">Leyendo el comunicado…</div></div>`).join("")}</div>` : ""}
    <div style="font-size:12px;color:var(--muted);margin:${recent.length ? "12px" : "0"} 0 6px">Próximos resultados</div>
    ${up.length ? up.map((x) => `<div class="er-row"><a href="${go(x.s)}"><b>${esc(label(x.s))}</b></a> <span>${fd(x.t)}</span> <span class="na">· ${days(x.t)}${x.est ? " · fecha estimada" : ""}</span></div>`).join("") : '<div class="na">Ninguna reporta en los próximos 60 días.</div>'}`;
  // Resumen del management de las que ya reportaron (máximo 6)
  for (const x of recent.slice(0, 6)) {
    fetch(`/api/profile?symbol=${encodeURIComponent(x.s)}`).then((r) => (r.ok ? r.json() : null)).then(async (pr) => {
      const box = el.querySelector(`.er-row[data-s="${CSS.escape(x.s)}"] .er-talk`); if (!box) return;
      const tk = pr?.talk;
      if (!tk || Date.parse(tk.date) < x.t - 3 * 864e5) { box.innerHTML = `Todavía no está el comunicado en la SEC. <a href="${go(x.s)}" style="color:#93c5fd">Ver ficha</a>`; return; }
      const t = talkRead(tk), q0 = tk.quotes[0];
      const q = q0 ? { ...q0, text: q0.es || (await trEs(q0.text.slice(0, 400))) || q0.text } : null;
      box.innerHTML = `${t.toneTxt ? `<span class="${t.toneTxt === "Optimista" ? "pos" : t.toneTxt === "Cauto" ? "neg" : ""}">Tono ${t.toneTxt.toLowerCase()}</span>` : ""}${t.g ? ` · <span class="${t.g[1]}">${t.g[2].toLowerCase()}</span>` : ""}${t.themes.length ? ` · ${esc(t.themes.slice(0, 3).join(", "))}` : ""}${q ? `<div style="margin-top:3px;color:var(--text)">“${esc(q.text.slice(0, 220))}${q.text.length > 220 ? "…" : ""}” <span class="na">— ${esc(q.who || "Management")}</span></div>` : ""} <a href="${go(x.s)}" style="color:#93c5fd">Leer completo →</a>`;
    }).catch(() => {});
  }
}
export const EARN_CSS = `.er-row{padding:7px 0;border-top:1px solid var(--border);font-size:13px}.er-row a{color:var(--text);text-decoration:none}.er-row a:hover{color:#93c5fd}.er-talk{font-size:12.5px;margin-top:3px;line-height:1.5}`;
