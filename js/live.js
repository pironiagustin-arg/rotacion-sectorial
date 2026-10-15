// Precios en vivo: cualquier elemento con data-live-px="SYM" o data-live-chg="SYM" se actualiza solo
// cada 15 segundos mientras la pestaña está visible. Funciona en todas las páginas.
const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const L = { timer: null, last: new Map(), every: 15000, listeners: [] };

if (!document.getElementById("live-css")) {
  const st = document.createElement("style"); st.id = "live-css";
  st.textContent = `.flash-up{animation:fu 1.2s ease}.flash-dn{animation:fd 1.2s ease}@keyframes fu{0%{background:rgba(34,197,94,.35)}100%{background:transparent}}@keyframes fd{0%{background:rgba(239,68,68,.35)}100%{background:transparent}}
  .livedot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-right:5px;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:lp 2s infinite}@keyframes lp{70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
  .ext{color:var(--dim,#64748b);font-size:.82em;margin-left:6px}`;
  document.head.appendChild(st);
}

function fmtPx(v, el) {
  const d = Number(el.dataset.liveDec ?? (v >= 1000 ? 2 : v < 1 ? 4 : 2));
  return (el.dataset.livePre || "") + nf(d).format(v) + (el.dataset.liveSuf || "");
}
function fmtChg(v, el) {
  const d = Number(el.dataset.liveDec ?? 2);
  el.classList.toggle("pos", v >= 0); el.classList.toggle("neg", v < 0);
  return (v >= 0 ? "+" : "") + nf(d).format(v) + "%" + (el.dataset.liveSuf || "");
}

async function tick() {
  if (document.hidden) return;
  const els = [...document.querySelectorAll("[data-live-px],[data-live-chg]")];
  const syms = [...new Set(els.map((e) => e.dataset.livePx || e.dataset.liveChg))];
  if (!syms.length) return;
  const q = {};
  for (let i = 0; i < syms.length; i += 150) {
    try { const r = await fetch("/api/quote?s=" + encodeURIComponent(syms.slice(i, i + 150).join(","))); if (r.ok) Object.assign(q, (await r.json()).q); } catch {}
  }
  for (const el of els) {
    const s = el.dataset.livePx || el.dataset.liveChg, x = q[s]; if (!x) continue;
    if (el.dataset.livePx && x.px != null) {
      const prev = L.last.get(s); const txt = fmtPx(x.px, el);
      if (el.textContent !== txt) { el.textContent = txt; if (prev != null && prev !== x.px) { el.classList.remove("flash-up", "flash-dn"); void el.offsetWidth; el.classList.add(x.px > prev ? "flash-up" : "flash-dn"); } }
      if (el.dataset.liveExt != null) {
        let ex = el.nextElementSibling?.classList?.contains("ext") ? el.nextElementSibling : null;
        if (x.ext) { if (!ex) { ex = document.createElement("span"); ex.className = "ext"; el.after(ex); } ex.textContent = `${x.ext.l === "pre" ? "Pre" : "After"}: ${nf(2).format(x.ext.p)} (${x.ext.c >= 0 ? "+" : ""}${nf(2).format(x.ext.c)}%)`; }
        else if (ex) ex.remove();
      }
    }
    if (el.dataset.liveChg && x.chg != null) el.textContent = fmtChg(x.chg, el);
  }
  for (const s of syms) if (q[s]?.px != null) L.last.set(s, q[s].px);
  L.listeners.forEach((f) => { try { f(q); } catch {} });
}

export function onLive(fn) { L.listeners.push(fn); }
export function startLive(every = 15000) {
  L.every = every;
  if (L.timer) return;
  const loop = () => { L.timer = setTimeout(async () => { await tick(); loop(); }, L.every); };
  setTimeout(tick, 1500); loop();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}
export const refreshLive = tick;
