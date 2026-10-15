// Calendario de resultados: los próximos 30 días, en grilla por semana (lunes a viernes).
// Lo que dijo el management de las que ya reportaron se ve solo en la ficha de cada empresa.
import { esc } from "/js/core.js";

// Logo de la empresa (si no hay, un cuadrito con las iniciales del ticker)
export function logo(sym, label, size = 22) {
  const t = String(label || sym).replace(/\..*$/, "").slice(0, 4);
  const hue = [...t].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360;
  const fb = `<span class=lg-fb style=width:${size}px;height:${size}px;background:hsl(${hue},45%,28%);font-size:${Math.round(size * 0.36)}px>${esc(t)}</span>`;
  const us = /^[A-Z.\-]+$/.test(sym) ? sym.replace(".", "-") : null;
  return us ? `<span class="lg" style="width:${size}px;height:${size}px"><img src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(us)}.png" alt="" loading="lazy" onerror="this.parentNode.outerHTML='${fb.replace(/'/g, "&#39;")}'"></span>` : fb;
}

export async function earningsData(syms) {
  const q = {};
  for (let i = 0; i < syms.length; i += 150) {
    try { const r = await fetch("/api/overview?s=" + encodeURIComponent(syms.slice(i, i + 150).join(","))); if (r.ok) Object.assign(q, (await r.json()).q); } catch {}
  }
  const now = Date.now(), up = [];
  for (const s of syms) {
    const x = q[s]; if (!x) continue;
    const next = [x.earn, x.earnLast].filter((t) => t && t > now - 12 * 3600e3).sort((a, b) => a - b)[0];
    if (next && next - now < 30 * 864e5) up.push({ s, t: next, est: x.earnEst });
  }
  return up.sort((a, b) => a.t - b.t);
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// el: contenedor; syms: tus acciones; label(s): ticker a mostrar; all: (opcional) todo el universo para el selector
export async function renderEarnings(el, syms, label = (s) => s, all = null) {
  const mode = el.dataset.mode || (syms.length || !all ? "mine" : "all");
  el.dataset.mode = mode;
  const list = mode === "all" && all ? all : syms;
  const toggle = all ? `<div class="cal-seg"><button data-m="mine" class="${mode === "mine" ? "on" : ""}">Mis acciones</button><button data-m="all" class="${mode === "all" ? "on" : ""}">Todo el universo</button></div>` : "";
  if (!list.length) { el.innerHTML = toggle + `<div class="na">Agregá acciones a tu watchlist o cartera para ver sus fechas de resultados.</div>`; bind(el, syms, label, all); return; }
  el.innerHTML = toggle + `<div class="na">Buscando fechas…</div>`;
  bind(el, syms, label, all);
  const up = await earningsData(list);
  if (el.dataset.mode !== mode) return;
  const by = new Map();
  for (const x of up) { const k = dayKey(new Date(x.t)); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  // Grilla: desde el lunes de esta semana hasta 30 días adelante
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(today); end.setDate(end.getDate() + 30);
  const weeks = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
  const MAX = 6;
  const cell = (d) => {
    const past = d < today, out = d > end, isT = d.getTime() === today.getTime();
    const items = past || out ? [] : by.get(dayKey(d)) || [];
    const chip = (x) => `<a class="cal-chip" href="/empresa.html?s=${encodeURIComponent(x.s)}" title="${esc(label(x.s))}${x.est ? " · fecha estimada" : ""}">${logo(x.s, label(x.s), 16)}${esc(label(x.s))}${x.est ? "*" : ""}</a>`;
    return `<div class="cal-d ${past || out ? "off" : ""} ${isT ? "today" : ""}"><div class="cal-n">${d.getDate()}${d.getDate() === 1 || d.getTime() === start.getTime() ? " " + d.toLocaleDateString("es-AR", { month: "short" }) : ""}${isT ? " · hoy" : ""}</div>${items.slice(0, MAX).map(chip).join("")}${items.length > MAX ? `<span class="cal-more" title="${esc(items.slice(MAX).map((x) => label(x.s)).join(", "))}">+${items.length - MAX} más</span>` : ""}</div>`;
  };
  el.innerHTML = toggle + `<div class="cal"><div class="cal-h">Lun</div><div class="cal-h">Mar</div><div class="cal-h">Mié</div><div class="cal-h">Jue</div><div class="cal-h">Vie</div>
    ${weeks.map((w) => [0, 1, 2, 3, 4].map((i) => { const d = new Date(w); d.setDate(d.getDate() + i); return cell(d); }).join("")).join("")}</div>
    <div class="na" style="font-size:11.5px;margin-top:6px">${up.length ? `${up.length} empresas reportan en los próximos 30 días · * fecha estimada · tocá un ticker para ver su ficha (ahí está lo que dijo el management después de reportar)` : "Ninguna reporta en los próximos 30 días."}</div>`;
}
function bind(el, syms, label, all) {
  el.querySelectorAll(".cal-seg [data-m]").forEach((b) => (b.onclick = () => { el.dataset.mode = b.dataset.m; renderEarnings(el, syms, label, all); }));
}
export const EARN_CSS = `
.cal{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.cal-h{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em;padding:0 4px 2px}
.cal-d{background:var(--panel2);border-radius:8px;min-height:62px;padding:5px 6px;display:flex;flex-direction:column;gap:3px;border:1px solid transparent}
.cal-d.off{opacity:.35}.cal-d.today{border-color:var(--accent)}
.cal-n{font-size:11px;color:var(--muted)}
.cal-chip{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--text);text-decoration:none;background:var(--panel);border-radius:6px;padding:2px 5px;overflow:hidden;white-space:nowrap}
.cal-chip:hover{color:#93c5fd}.cal-more{font-size:11px;color:var(--dim)}
.cal-seg{display:inline-flex;border:1px solid var(--border2);border-radius:10px;overflow:hidden;margin-bottom:8px}
.cal-seg button{background:transparent;border:none;color:var(--muted);padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit}.cal-seg button.on{background:var(--accent);color:#fff}
.lg{display:inline-flex;border-radius:5px;overflow:hidden;background:#fff;flex:none;align-items:center;justify-content:center}.lg img{width:100%;height:100%;object-fit:contain}
.lg-fb{display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:#fff;font-weight:700;flex:none;letter-spacing:-.02em}
@media (max-width:700px){.cal-chip{font-size:10.5px}.cal-chip .lg,.cal-chip .lg-fb{display:none}}`;
