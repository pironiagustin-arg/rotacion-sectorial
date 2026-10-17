// Panel de señales de rotación (RRG): quién está cargando en Improving con volumen y por cruzar a Leading.
// Lo usan RRG, RRG Acciones y el Dashboard.
import { state, initSupabase, esc, toast } from "/js/core.js";
import { renderRrgLive, RL_CSS } from "/js/rrglive.js";

export const STATUS = {
  por_explotar: { l: "Por explotar", c: "#22c55e", bg: "#14532d", tx: "#86efac", d: "Improving muy cerca de Leading, acelerando y con volumen arriba del promedio." },
  cruzo: { l: "Cruzó a Leading", c: "#3b82f6", bg: "#172554", tx: "#93c5fd", d: "Entró a Leading en los últimos días." },
  cargando: { l: "Cargando", c: "#eab308", bg: "#713f12", tx: "#fde68a", d: "En Improving, avanzando hacia Leading. Falta distancia o volumen." },
  temprano: { l: "Temprano", c: "#64748b", bg: "#1e293b", tx: "#cbd5e1", d: "Recién gana momentum: todavía lejos de Leading." },
  perdiendo: { l: "Perdiendo fuerza", c: "#ef4444", bg: "#7f1d1d", tx: "#fca5a5", d: "Pasó de Leading a Weakening en los últimos días." },
  estancado: { l: "Estancado", c: "#64748b", bg: "#1e293b", tx: "#94a3b8", d: "En Improving pero sin avanzar hacia Leading." },
};
const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

export async function fetchSignals(symbols) {
  const q = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const r = await fetch(`/api/signals${q}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return (await r.json()).signals || [];
}

// Racha: desde cuántos días cada símbolo está en su estado actual (historial guardado por el sync diario)
export async function signalHistory() {
  try {
    if (!state.sb) await initSupabase();
    if (!state.sb) return {};
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data } = await state.sb.from("rrg_signals").select("day,symbol,status").gte("day", since).order("day", { ascending: false });
    const by = {};
    for (const r of data || []) (by[r.symbol] = by[r.symbol] || []).push(r);
    return by;
  } catch { return {}; }
}
function streak(hist, sym, status) {
  const h = hist[sym]; if (!h?.length) return null;
  let n = 0; for (const r of h) { if (r.status === status) n++; else break; }
  const prev = h.find((r) => r.status !== status);
  return { n, prev: prev?.status || null };
}

function miniRRG(tail, color) {
  if (!tail?.length) return "";
  const xs = tail.map((p) => p.x), ys = tail.map((p) => p.y);
  const pad = 0.6, x0 = Math.min(97.5, ...xs) - pad, x1 = Math.max(102.5, ...xs) + pad, y0 = Math.min(97.5, ...ys) - pad, y1 = Math.max(102.5, ...ys) + pad;
  const W = 120, H = 90, X = (x) => ((x - x0) / (x1 - x0)) * W, Y = (y) => H - ((y - y0) / (y1 - y0)) * H;
  const pts = tail.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const L = tail.at(-1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recorrido en el RRG">
    <rect x="${X(100)}" y="0" width="${W - X(100)}" height="${Y(100)}" fill="#22c55e" opacity=".08"/>
    <rect x="0" y="0" width="${X(100)}" height="${Y(100)}" fill="#3b82f6" opacity=".08"/>
    <line x1="${X(100)}" x2="${X(100)}" y1="0" y2="${H}" stroke="#2b3a5c"/><line x1="0" x2="${W}" y1="${Y(100)}" y2="${Y(100)}" stroke="#2b3a5c"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" opacity=".9"/>
    <circle cx="${X(L.x)}" cy="${Y(L.y)}" r="4" fill="${color}"/></svg>`;
}

// Línea compacta para los que ya cruzaron o están perdiendo fuerza
export function signalChips(list, status, label) {
  const xs = list.filter((s) => s.status === status);
  if (!xs.length) return "";
  const st = STATUS[status];
  return `<div class="sg-chips"><span class="sg-cl" style="color:${st.tx}">${label}</span>${xs.map((s) => `<span class="sg-chip" title="${esc(s.name || "")} · fuerza ${s.score}/100 · volumen ${s.relVol != null ? (s.relVol >= 1 ? "+" : "") + nf(0).format((s.relVol - 1) * 100) + "%" : "—"} · acumulación ${s.accum ?? "—"}x"><b>${esc(s.symbol)}</b> ${esc(s.name || "")} <span style="color:${st.c}">${s.score}</span></span>`).join("")}</div>`;
}
export function signalCard(s, hist = {}, opts = {}) {
  const st = STATUS[s.status]; if (!st) return "";
  const k = streak(hist, s.symbol, s.status);
  const isNew = k && k.n <= 1 && k.prev !== s.status;
  const facts = [];
  if (s.quadrant === "improving" && s.eta != null && s.eta > 0) facts.push(`Llegaría a Leading en ~${s.eta} ruedas`);
  if (s.relVol != null) facts.push(`Volumen ${s.relVol >= 1 ? "+" : ""}${nf(0).format((s.relVol - 1) * 100)}% vs su promedio`);
  if (s.accum != null) facts.push(`Acumulación ${nf(2).format(s.accum)}x ${s.accum >= 1.2 ? "(entra plata)" : s.accum < 0.9 ? "(sale plata)" : ""}`);
  if (s.weekly) facts.push(`RRG semanal: ${s.weekly}`);
  const link = opts.link ? opts.link(s) : null;
  return `<div class="sg" style="border-top-color:${st.c}">
    <div class="sg-h"><div><b>${esc(s.symbol)}</b> <span class="sg-n">${esc(s.name || "")}</span></div>
      <span class="sg-b" style="background:${st.bg};color:${st.tx}" title="${esc(st.d)}">${st.l}${isNew ? " · nuevo" : ""}</span></div>
    <div class="sg-body">${miniRRG(s.tail, st.c)}
      <div class="sg-f"><div class="sg-score">Fuerza de la señal <b>${s.score ?? "—"}</b>/100</div>
        ${facts.map((f) => `<div>${esc(f)}</div>`).join("")}
        ${s.strictNote ? `<div class="sg-d" style="color:#fbbf24">${esc(s.strictNote)}</div>` : ""}
        <div class="sg-d">${k ? `En este estado hace ${k.n} ${k.n === 1 ? "día" : "días"}` : `${s.days} ruedas en ${s.quadrant}`}${s.chg != null ? ` · hoy ${s.chg >= 0 ? "+" : ""}${nf(2).format(s.chg)}%` : ""}</div>
        ${link ? `<a href="${link}" class="sg-l">Ver →</a>` : ""}</div></div>
    ${s.group && s.group !== "accion" && (s.status === "por_explotar" || s.status === "cargando") ? `<div class="sg-lead" data-leaders="${esc(s.symbol)}"><span class="sg-lt">Acciones a mirar: líderes del sector a 6 meses</span><span class="sg-d">Buscando…</span></div>` : ""}</div>`;
}

export const SIGNAL_CSS = `
.sg-wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
.sg{background:#111a2e;border:1px solid #1e2a44;border-top:3px solid #2b3a5c;border-radius:14px;padding:12px 14px;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e2e8f0}
.sg-h{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;font-size:14px}
.sg-n{color:#94a3b8;font-size:12.5px}
.sg-b{font-size:11.5px;padding:3px 9px;border-radius:99px;white-space:nowrap;font-weight:600}
.sg-body{display:flex;gap:12px;margin-top:8px;align-items:center}
.sg-f{font-size:12.5px;color:#94a3b8;display:grid;gap:3px}
.sg-score{color:#e2e8f0}.sg-d{color:#64748b;font-size:11.5px}
.sg-l{color:#93c5fd;font-size:12px;text-decoration:none}
.sg-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.sg-top h3{margin:0;font-size:16px;font-weight:600;color:#e2e8f0}
.sg-top .sub{color:#64748b;font-size:12.5px}
.sg-btn{background:#16213a;border:1px solid #2b3a5c;color:#e2e8f0;padding:7px 12px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:12.5px}
.sg-btn:hover{border-color:#3b82f6}
.sg-empty{color:#94a3b8;font-size:13px;padding:10px 0}
.sg-more{color:#64748b;font-size:12px;margin-top:8px}
.sg-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;font-family:Inter,sans-serif}
.sg-cl{font-size:12px;font-weight:600;margin-right:4px}
.sg-chip{font-size:12px;color:#94a3b8;background:#16213a;border:1px solid #1e2a44;border-radius:99px;padding:3px 10px}
.sg-chip b{color:#e2e8f0}
.sg-lead{margin-top:10px;padding-top:9px;border-top:1px solid #1e2a44;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sg-lt{width:100%;font-size:11.5px;color:#94a3b8}
.sg-lead a{font-size:12px;color:#e2e8f0;text-decoration:none;background:#16213a;border:1px solid #2b3a5c;border-radius:8px;padding:3px 8px}
.sg-lead a:hover{border-color:#3b82f6}.sg-lead a span{color:#86efac;margin-left:4px}
.sg-note{font-size:12px;color:#94a3b8;background:#16213a;border:1px solid #1e2a44;border-radius:10px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
.sg-note a{color:#93c5fd}
.sg-alert{border:1px solid #22c55e;background:linear-gradient(135deg,rgba(34,197,94,.16),rgba(34,197,94,.03));border-radius:14px;padding:14px 16px;margin-bottom:12px;box-shadow:0 0 0 3px rgba(34,197,94,.08);font-family:Inter,sans-serif;animation:sgGlow 2.4s ease-in-out infinite}
@keyframes sgGlow{50%{box-shadow:0 0 0 6px rgba(34,197,94,.14)}}
.sg-al-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sg-al-badge{background:#22c55e;color:#052e16;font-weight:800;font-size:11.5px;letter-spacing:.06em;border-radius:6px;padding:4px 8px}
.sg-al-t{font-size:18px;color:#e2e8f0}.sg-al-t b{font-size:20px}.sg-al-s{margin-left:auto;color:#86efac;font-weight:600;font-size:13px}
.sg-al-f{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:12.5px;color:#cbd5e1;align-items:center}
.sg-ema{font-size:11px;border-radius:99px;padding:2px 8px;margin-right:4px;white-space:nowrap}.sg-ema.ok{background:#14532d;color:#86efac}.sg-ema.no{background:#3f1d1d;color:#fca5a5}
.sg-lead a em{font-style:normal;font-size:10.5px;margin-left:6px}.sg-lead a em.ok{color:#86efac}.sg-lead a em.no{color:#fca5a5}
.sg-noalert{font-size:13px;color:#94a3b8;background:#16213a;border:1px dashed #2b3a5c;border-radius:12px;padding:12px 14px;margin-bottom:12px;line-height:1.5}
.sg-sub{font-size:12px;color:#94a3b8;margin:4px 0 6px}
.sg-tw{overflow-x:auto;border:1px solid #1e2a44;border-radius:12px}
table.sg-t{width:100%;border-collapse:collapse;font-family:Inter,sans-serif;font-size:13px;color:#e2e8f0}
table.sg-t th{font-size:11.5px;font-weight:500;color:#94a3b8;text-align:right;padding:8px 10px;border-bottom:1px solid #1e2a44;white-space:nowrap}
table.sg-t td{text-align:right;padding:8px 10px;border-bottom:1px solid #16213a;white-space:nowrap;font-variant-numeric:tabular-nums}
table.sg-t .l{text-align:left}table.sg-t tr.sg-r{cursor:pointer}table.sg-t tr.sg-r:hover td{background:#16213a}
table.sg-t tr.sg-x td{background:#0f1830}
.sg-pill{font-size:11px;border-radius:99px;padding:2px 8px;font-weight:600}
.sg-bar{display:inline-block;width:60px;height:5px;background:#1e2a44;border-radius:3px;overflow:hidden;vertical-align:middle;margin-right:6px}.sg-bar i{display:block;height:100%}
.sg-dim{color:#64748b;font-size:12px}.sg-ind{font-size:10.5px;color:#94a3b8;border:1px solid #2b3a5c;border-radius:99px;padding:0 6px}
.sg-mini{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;color:#cbd5e1;margin-top:10px;align-items:center}.sg-mini a{color:#93c5fd;text-decoration:none;margin-left:auto}`;

// Avisos del navegador cuando aparece una señal fuerte nueva
const SEEN = "rrg_signal_seen";
export function notifyNew(list, label = "") {
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(SEEN) || "{}"); } catch {}
  const strong = list.filter((s) => s.status === "por_explotar" || s.status === "cruzo");
  const fresh = strong.filter((s) => seen[s.symbol] !== s.status);
  for (const s of list) seen[s.symbol] = s.status;
  try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch {}
  if (!fresh.length) return;
  const msg = fresh.map((s) => `${s.symbol}: ${STATUS[s.status].l}`).join(" · ");
  toast?.(`Rotación${label}: ${msg}`);
  try { if ("Notification" in window && Notification.permission === "granted") new Notification("Señal de rotación", { body: msg }); } catch {}
}
export async function askNotifications() {
  if (!("Notification" in window)) return toast("Tu navegador no soporta avisos");
  const p = await Notification.requestPermission();
  toast(p === "granted" ? "Listo: te aviso cuando aparezca una señal fuerte mientras la app esté abierta" : "Avisos bloqueados en el navegador");
}

// Panel completo para las páginas de RRG
export async function mountPanel(el, { symbols = null, title, link } = {}) {
  if (!document.getElementById("sg-css")) { const st = document.createElement("style"); st.id = "sg-css"; st.textContent = SIGNAL_CSS + `.toast{position:fixed;bottom:20px;right:20px;background:#16213a;border:1px solid #2b3a5c;color:#e2e8f0;padding:10px 14px;border-radius:10px;display:none;z-index:60;font-family:Inter,sans-serif;font-size:13px}.toast.show{display:block}`; document.head.appendChild(st); }
  el.innerHTML = `<div class="sg-top"><div><h3>${esc(title || "Señales de rotación")}</h3><div class="sub">${symbols ? "Improving con volumen que se acerca a Leading" : "Alerta de compra cuando un sector pasa a Leading con volumen comprador y tendencia (EMA 20 y 200)"}</div></div>
    <div style="display:flex;gap:8px"><button class="sg-btn" id="sgNotif">🔔 Avisarme</button><button class="sg-btn" id="sgAll">Ver todos</button></div></div><div id="sgList" class="sg-empty">Calculando señales…</div>${symbols ? "" : `<div class="sg-live"><div class="sg-lh">Seguimiento de las alertas abiertas <a href="/backtest.html#rrg">ver también las cerradas →</a></div><div id="sgLive" class="sg-empty">Cargando…</div></div>`}`;
  if (!symbols) { if (!document.getElementById("rl-css")) { const st = document.createElement("style"); st.id = "rl-css"; st.textContent = RL_CSS + ".sg-live{margin-top:16px;padding-top:12px;border-top:1px solid #1e2a44}.sg-lh{font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:8px;display:flex;justify-content:space-between}.sg-lh a{font-size:12px;font-weight:400;color:#93c5fd;text-decoration:none}"; document.head.appendChild(st); } renderRrgLive(el.querySelector("#sgLive"), { compact: true }); }
  el.querySelector("#sgNotif").onclick = askNotifications;
  let showAll = false, list = [], hist = {};
  // Líderes del sector para las señales fuertes (se cachean)
  const LEAD = {};
  const fillOne = async (box) => {
    if (!box || box.dataset.done) return; box.dataset.done = "1";
    try {
      const sym = box.dataset.leaders;
      const r = await (LEAD[sym] ||= fetch(`/api/signals?leaders=${encodeURIComponent(sym)}`).then((x) => x.json()));
      const L = (r.leaders || []).slice(0, 3);
      box.querySelector(".sg-d").outerHTML = L.length ? L.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}" title="${esc(x.n)} · ${x.ret >= 0 ? "+" : ""}${x.ret}% en 6 meses · ${x.e20 ? "sobre" : "debajo de"} EMA 20 · ${x.e200 ? "sobre" : "debajo de"} EMA 200">${esc(x.ced || x.s)}<span>${x.rs >= 0 ? "+" : ""}${nf(0).format(x.rs)}% vs sector</span><em class="${x.e20 && x.e200 ? "ok" : "no"}">${x.e20 && x.e200 ? "tendencia ✓" : "bajo EMA"}</em></a>`).join("") : `<span class="sg-d">Sin acciones del sector en el universo.</span>`;
    } catch { box.querySelector(".sg-d").textContent = "No se pudieron calcular."; }
  };
  const fillLeaders = () => el.querySelectorAll("[data-leaders]").forEach((b) => fillOne(b));
  // Vista minimalista para sectores e industrias: alerta destacada arriba + lista compacta
  const emaB = (s) => `<span class="sg-ema ${s.aboveEma20 ? "ok" : "no"}" title="Precio ${s.aboveEma20 ? "sobre" : "debajo de"} la media exponencial de 20 ruedas">EMA 20 ${s.aboveEma20 ? "✓" : "✗"}</span><span class="sg-ema ${s.aboveEma200 ? "ok" : "no"}" title="Precio ${s.aboveEma200 ? "sobre" : "debajo de"} la media exponencial de 200 ruedas">EMA 200 ${s.aboveEma200 ? "✓" : "✗"}</span>`;
  const pctS = (v) => (v == null ? "—" : `${v >= 1 ? "+" : ""}${nf(0).format((v - 1) * 100)}%`);
  const alertBox = (s) => `<div class="sg-alert">
      <div class="sg-al-h"><span class="sg-al-badge">ALERTA DE COMPRA</span><span class="sg-al-t"><b>${esc(s.symbol)}</b> ${esc(s.name || "")}</span><span class="sg-al-s">Fuerza ${s.score}/100</span></div>
      <div class="sg-al-f"><span>Llegaría a Leading en ~${s.eta ?? "—"} ruedas</span><span>Volumen ${pctS(s.relVol)}</span><span>Acumulación ${s.accum != null ? nf(2).format(s.accum) + "x" : "—"}</span><span>Semanal: ${esc(s.weekly || "—")}</span>${emaB(s)}</div>
      <div class="sg-lead" data-leaders="${esc(s.symbol)}"><span class="sg-lt">Qué comprar: las 3 líderes del sector a 6 meses (mantener ~60 ruedas)</span><span class="sg-d">Buscando…</span></div></div>`;
  const rowS = (s) => { const st = STATUS[s.status]; return `<tr class="sg-r" data-sym="${esc(s.symbol)}"><td class="l"><b>${esc(s.symbol)}</b> <span class="sg-n">${esc(s.name || "")}</span>${s.group === "industria" ? ' <span class="sg-ind">industria</span>' : ""}</td>
      <td class="l"><span class="sg-pill" style="background:${st.bg};color:${st.tx}">${st.l}</span></td>
      <td><div class="sg-bar"><i style="width:${Math.min(100, s.score)}%;background:${st.c}"></i></div><span class="sg-dim">${s.score}</span></td>
      <td>${s.quadrant === "improving" && s.eta ? `~${s.eta} r.` : "—"}</td><td>${pctS(s.relVol)}</td><td>${s.accum != null ? nf(2).format(s.accum) + "x" : "—"}</td><td class="l">${emaB(s)}</td>
      <td class="l sg-dim">${esc(s.strictNote || "")}</td></tr>
      <tr class="sg-x" data-x="${esc(s.symbol)}" hidden><td colspan="8"><div class="sg-lead" data-leaders="${esc(s.symbol)}" data-lazy="1"><span class="sg-lt">Líderes del sector a 6 meses</span><span class="sg-d">Buscando…</span></div></td></tr>`; };
  const draw = () => {
    const box = el.querySelector("#sgList");
    box.className = "";
    if (symbols) {
      const cards = list.filter((s) => (showAll ? ["por_explotar", "cargando", "temprano", "estancado"] : ["por_explotar", "cargando"]).includes(s.status));
      const chips = signalChips(list, "cruzo", "Ya cruzaron a Leading:") + signalChips(list, "perdiendo", "Perdiendo fuerza:");
      setTimeout(fillLeaders, 0);
      box.innerHTML = (cards.length ? `<div class="sg-wrap">${cards.map((s) => signalCard(s, hist, { link })).join("")}</div>` : `<div class="sg-empty">${list.length ? "Ahora no hay ninguna cargando en Improving hacia Leading." : "Sin datos."}</div>`) + chips;
      return;
    }
    const alerts = list.filter((s) => s.status === "por_explotar");
    const rest = list.filter((s) => (showAll ? ["cargando", "temprano", "estancado"] : ["cargando"]).includes(s.status)).sort((a, b) => (a.group === "industria") - (b.group === "industria") || b.score - a.score);
    const lead = list.filter((s) => s.status === "cruzo").map((s) => s.symbol), lose = list.filter((s) => s.status === "perdiendo").map((s) => s.symbol);
    box.innerHTML = (alerts.length ? alerts.map(alertBox).join("") : `<div class="sg-noalert">Hoy no hay alertas de compra. Para que haya una, un sector XL tiene que estar a punto de pasar a Leading, con volumen comprador y el precio sobre las EMA 20 y 200 (en industrias, además, con una señal muy clara).</div>`)
      + (rest.length ? `<div class="sg-sub">En seguimiento (todavía no son alerta) · tocá una fila para ver sus líderes</div><div class="sg-tw"><table class="sg-t"><thead><tr><th class="l">Sector</th><th class="l">Estado</th><th>Fuerza</th><th>A Leading</th><th>Volumen</th><th>Acumulación</th><th class="l">Tendencia</th><th class="l"></th></tr></thead><tbody>${rest.map(rowS).join("")}</tbody></table></div>` : "")
      + `<div class="sg-mini">${lead.length ? `<span><b style="color:#93c5fd">Ya en Leading:</b> ${lead.join(" · ")}</span>` : ""}${lose.length ? `<span><b style="color:#fca5a5">Perdiendo fuerza:</b> ${lose.join(" · ")}</span>` : ""}<a href="/backtest.html#rrg">Cómo funcionó la señal en el pasado →</a></div>`;
    setTimeout(() => el.querySelectorAll("[data-leaders]:not([data-lazy])").forEach((b) => fillOne(b)), 0);
    box.querySelectorAll("tr.sg-r").forEach((tr) => (tr.onclick = () => { const x = box.querySelector(`tr[data-x="${CSS.escape(tr.dataset.sym)}"]`); x.hidden = !x.hidden; if (!x.hidden) fillOne(x.querySelector("[data-leaders]")); }));
  };
  el.querySelector("#sgAll").onclick = () => { showAll = !showAll; el.querySelector("#sgAll").textContent = showAll ? "Ver solo las fuertes" : "Ver todos"; draw(); };
  try {
    const syms = typeof symbols === "function" ? symbols() : symbols;
    if (Array.isArray(syms) && !syms.length) { el.querySelector("#sgList").textContent = "Agregá acciones al RRG para ver sus señales."; return; }
    [list, hist] = await Promise.all([fetchSignals(syms), syms ? Promise.resolve({}) : signalHistory()]);
    draw(); notifyNew(list, syms ? " (acciones)" : "");

  } catch (e) { el.querySelector("#sgList").textContent = "No se pudieron calcular las señales: " + e.message; }
  return { reload: () => mountPanel(el, { symbols, title, link }) };
}
