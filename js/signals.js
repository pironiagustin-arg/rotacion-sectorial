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
.sg-note a{color:#93c5fd}`;

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
  el.innerHTML = `<div class="sg-top"><div><h3>${esc(title || "Señales de rotación")}</h3><div class="sub">Improving con volumen que se acerca a Leading · RRG diario de 1 año, confirmado con el semanal</div></div>
    <div style="display:flex;gap:8px"><button class="sg-btn" id="sgNotif">🔔 Avisarme</button><button class="sg-btn" id="sgAll">Ver todos</button></div></div><div id="sgList" class="sg-empty">Calculando señales…</div>${symbols ? "" : `<div class="sg-live"><div class="sg-lh">Seguimiento de las alertas abiertas <a href="/backtest.html#rrg">ver también las cerradas →</a></div><div id="sgLive" class="sg-empty">Cargando…</div></div>`}`;
  if (!symbols) { if (!document.getElementById("rl-css")) { const st = document.createElement("style"); st.id = "rl-css"; st.textContent = RL_CSS + ".sg-live{margin-top:16px;padding-top:12px;border-top:1px solid #1e2a44}.sg-lh{font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:8px;display:flex;justify-content:space-between}.sg-lh a{font-size:12px;font-weight:400;color:#93c5fd;text-decoration:none}"; document.head.appendChild(st); } renderRrgLive(el.querySelector("#sgLive"), { compact: true }); }
  el.querySelector("#sgNotif").onclick = askNotifications;
  let showAll = false, list = [], hist = {};
  // Líderes del sector para las señales fuertes (se cachean)
  const LEAD = {};
  const fillLeaders = () => el.querySelectorAll("[data-leaders]").forEach(async (box) => {
    try {
      const sym = box.dataset.leaders;
      const r = await (LEAD[sym] ||= fetch(`/api/signals?leaders=${encodeURIComponent(sym)}`).then((x) => x.json()));
      const L = (r.leaders || []).slice(0, 3);
      box.querySelector(".sg-d").outerHTML = L.length ? L.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}" title="${esc(x.n)} · ${x.ret >= 0 ? "+" : ""}${x.ret}% en 6 meses">${esc(x.ced || x.s)}<span>${x.rs >= 0 ? "+" : ""}${nf(0).format(x.rs)}% vs sector</span></a>`).join("") : `<span class="sg-d">Sin acciones del sector en el universo.</span>`;
    } catch { box.querySelector(".sg-d").textContent = "No se pudieron calcular."; }
  });
  const draw = () => {
    const box = el.querySelector("#sgList");
    // Tarjetas: lo que está cargando en Improving (lo que pediste ver). Los que ya cruzaron o pierden fuerza van en una línea.
    const cards = list.filter((s) => (showAll ? ["por_explotar", "cargando", "temprano", "estancado"] : ["por_explotar", "cargando"]).includes(s.status));
    const chips = signalChips(list, "cruzo", "Ya cruzaron a Leading:") + signalChips(list, "perdiendo", "Perdiendo fuerza:");
    box.className = "";
    setTimeout(fillLeaders, 0);
    box.innerHTML = (symbols ? "" : `<div class="sg-note"><b>Cómo usar la señal (backtest 2018-2026):</b> sola, la señal del sector no le ganó al S&P 500. Lo que funcionó fue comprar las <b>3 acciones del sector con más fuerza relativa a 6 meses</b> cuando el sector da "Por explotar" y mantenerlas unas 60 ruedas: ~+4% contra el SPY por operación, 63% de aciertos. <a href="/backtest.html#rrg">Ver el backtest →</a></div>`) + (cards.length ? `<div class="sg-wrap">${cards.map((s) => signalCard(s, hist, { link })).join("")}</div>` : `<div class="sg-empty">${list.length ? "Ahora no hay ninguno cargando en Improving hacia Leading." + (showAll ? "" : " Tocá 'Ver todos' para ver los que recién arrancan.") : "Sin datos."}</div>`) + chips;
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
