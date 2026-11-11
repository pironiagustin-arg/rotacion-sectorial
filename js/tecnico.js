// Página Técnico: una sola estrategia (mercado → sector → acción → gatillo) + mapa de calor. Datos: data/tech.json
import { ok, nf, derive } from "/js/score.js";
import { regimeGroups, expoOf } from "/js/regime.js";
import { $, esc, loadLocal, saveLocal, initSupabase, loadSnapshots } from "/js/core.js";
import { EARN_CSS, logo } from "/js/earnings.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";
import { mountHelp } from "/js/help.js";
{ const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st); }
const D = {};
const pt = (v, d = 1) => (ok(v) ? `${v >= 0 ? "+" : ""}${nf(d).format(v)}%` : "—");
const mineSet = () => new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);

async function loadTech() {
  D.tech = await fetch("/data/tech.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!D.tech) { ["sig", "secs", "heat"].forEach((id) => ($(id).innerHTML = '<div class="dim">Se genera con la próxima actualización diaria.</div>')); return; }
  const dd = new Date(D.tech.date + "T12:00:00"); $("asof").textContent = `Cierre del ${dd.getDate()}/${dd.getMonth() + 1} · se actualiza cada día hábil a la noche`;
}
const scCol = (r) => (r >= 0.75 ? "#22c55e" : r >= 0.45 ? "#f59e0b" : "#ef4444");
const tkOf = (r) => esc(r.ced || r.s);
const goSym = (el) => el.querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => (location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym))));
// Cuadrante de la línea de fuerza relativa (como el RRG)
const QUAD = { lead: ["Líder", "#22c55e", "Fuerte y sigue ganando contra el S&P 500"], impr: ["Mejorando", "#3b82f6", "Todavía debajo de su media de fuerza, pero en las últimas 3 semanas le gana al S&P 500: está dando vuelta"], weak: ["Debilitándose", "#f59e0b", "Fue fuerte pero en las últimas 3 semanas pierde contra el S&P 500"], lag: ["Rezagada", "#ef4444", "Débil y sigue perdiendo contra el S&P 500"] };
const qChip = (q) => (QUAD[q] ? `<span class="qd" style="background:${QUAD[q][1]}22;color:${QUAD[q][1]}" title="${esc(QUAD[q][2])}">${QUAD[q][0]}</span>` : "");
const SEC_NAME = { tech: "Tecnología", fin: "Financiero", health: "Salud", discr: "Consumo discrecional", staples: "Consumo básico", energy: "Energía", ind: "Industrial", mat: "Materiales", util: "Servicios públicos", re: "Bienes raíces", comm: "Comunicaciones" };

// ---------- Mapa de calor del universo (estilo Finviz): tamaño = capitalización, color = variación del día ----------
function squarify(items, x, y, w, h) {
  // items: [{v, ...}] ordenados desc; devuelve [{...item, x, y, w, h}]
  const out = [], total = items.reduce((a, b) => a + b.v, 0); if (!total) return out;
  let rest = items.map((it) => ({ ...it, a: (it.v / total) * w * h }));
  while (rest.length) {
    const side = Math.min(w, h); let row = [], best = Infinity;
    for (const it of rest) {
      const r2 = [...row, it], s2 = r2.reduce((a, b) => a + b.a, 0), mx = Math.max(...r2.map((z) => z.a)), mn = Math.min(...r2.map((z) => z.a));
      const worst = Math.max((side * side * mx) / (s2 * s2), (s2 * s2) / (side * side * mn));
      if (worst > best) break; best = worst; row = r2;
    }
    const s2 = row.reduce((a, b) => a + b.a, 0), thick = s2 / side; let off = 0;
    for (const it of row) { const len = it.a / thick; if (w >= h) out.push({ ...it, x, y: y + off, w: thick, h: len }); else out.push({ ...it, x: x + off, y, w: len, h: thick }); off += len; }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}

// ---------- Mapa de calor: tamaño = capitalización, color = variación del período ----------
const PER = [["d1", "Hoy"], ["w1", "1 semana"], ["m1", "1 mes"], ["m3", "3 meses"]];
const SCALE = { d1: 3, w1: 6, m1: 12, m3: 20 }; // % que satura el color
D.hp = loadLocal("tec_heat_p", "d1"); D.hu = loadLocal("tec_heat_u", "all"); D.hz = null;
function hcol(v, m) { const a = Math.min(1, Math.abs(v) / m); if (Math.abs(v) < m * 0.04) return "rgb(58,64,78)"; return v >= 0 ? `rgb(${Math.round(52 - 34 * a)},${Math.round(70 + 105 * a)},${Math.round(80 - 18 * a)})` : `rgb(${Math.round(70 + 155 * a)},${Math.round(62 - 26 * a)},${Math.round(74 - 30 * a)})`; }
function renderHeat() {
  const el = $("heat"); if (!el || !D.tech) return;
  const P = D.hp, M = SCALE[P], mine = mineSet();
  $("heatP").innerHTML = PER.map(([k, l]) => `<button data-hp="${k}" class="${k === P ? "on" : ""}">${l}</button>`).join("");
  $("heatU").innerHTML = [["all", "Universo"], ["mine", "Mis acciones"]].map(([k, l]) => `<button data-hu="${k}" class="${k === D.hu ? "on" : ""}">${l}</button>`).join("");
  $("heatLeg").innerHTML = `<span class="neg">−${M}%</span><i style="background:linear-gradient(90deg,${hcol(-M, M)},${hcol(-M / 2, M)},rgb(58,64,78),${hcol(M / 2, M)},${hcol(M, M)})"></i><span class="pos">+${M}%</span>`;
  $("heatZ").innerHTML = D.hz ? `<button class="hm-back" id="hzBack">← Todos los sectores</button>` : "";
  let rows = D.tech.rows.map((r) => ({ ...r, mcap: D.mcap?.get(r.s) || 0, v: P === "d1" && ok(D.live?.get(r.s)) ? D.live.get(r.s) : r[P] })).filter((r) => r.mcap > 0 && ok(r.v));
  if (D.hu === "mine") rows = rows.filter((r) => mine.has(r.s));
  if (D.hz) rows = rows.filter((r) => r.sec === D.hz);
  rows = rows.sort((a, b) => b.mcap - a.mcap).slice(0, D.hz || D.hu === "mine" ? 120 : 180);
  if (!rows.length) { el.className = ""; el.innerHTML = `<div class="dim">${D.hu === "mine" ? "Ninguna de tus acciones cotiza en EE.UU. con datos técnicos." : "Sin datos."}</div>`; $("heatN").textContent = ""; return; }
  const bySec = new Map(); for (const r of rows) { if (!bySec.has(r.sec)) bySec.set(r.sec, []); bySec.get(r.sec).push(r); }
  const secs = [...bySec.entries()].map(([k, l]) => { const cap = l.reduce((a, b) => a + b.mcap, 0); return { k, l, v: cap, avg: l.reduce((a, b) => a + b.v * b.mcap, 0) / cap }; }).sort((a, b) => b.v - a.v);
  const up = rows.filter((r) => r.v > 0).length, tot = rows.reduce((a, b) => a + b.mcap, 0), avg = rows.reduce((a, b) => a + b.v * b.mcap, 0) / tot;
  $("heatN").innerHTML = `${rows.length} acciones · <span class="pos">${up} suben</span> · <span class="neg">${rows.length - up} bajan</span> · promedio ponderado <b class="${avg >= 0 ? "pos" : "neg"}">${pt(avg)}</b>`;
  el.className = "hm";
  const W0 = el.clientWidth || 1200, H0 = el.clientHeight || 520;
  D.hcells = new Map();
  el.innerHTML = squarify(secs, 0, 0, 100, 100).map((S) => {
    const sw = (S.w / 100) * W0, sh = (S.h / 100) * H0;
    const cells = squarify(S.l.map((r) => ({ ...r, v0: r.v, v: r.mcap })), 0, sh > 30 ? (16 / sh) * 100 : 0, 100, sh > 30 ? 100 - (16 / sh) * 100 : 100);
    return `<div class="sc" style="left:${S.x}%;top:${S.y}%;width:${S.w}%;height:${S.h}%;background:#0b1220">${sw > 60 && sh > 30 ? `<span data-hz="${S.k}" title="Ver solo ${esc(SEC_NAME[S.k] || S.k)}">${esc(SEC_NAME[S.k] || S.k)} <b class="${S.avg >= 0 ? "pos" : "neg"}" style="text-shadow:none">${pt(S.avg)}</b></span>` : ""}${cells.map((c) => {
      D.hcells.set(c.s, c);
      const cw = (c.w / 100) * sw, ch = (c.h / 100) * sh, fs = Math.max(9, Math.min(22, Math.sqrt(cw * ch) / 5.5)), tk = esc(c.ced || c.s);
      const showT = cw > tk.length * fs * 0.62 + 4 && ch > fs + 4, showV = showT && ch > fs * 2.3 + 4 && cw > 40;
      return `<div class="cl ${mine.has(c.s) ? "mine" : ""}" data-sym="${esc(c.s)}" style="left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%;background:${hcol(c.v0, M)}">${showT ? `<b style="font-size:${fs.toFixed(0)}px">${tk}</b>` : ""}${showV ? `<i style="font-size:${Math.max(9, fs * 0.72).toFixed(0)}px">${pt(c.v0)}</i>` : ""}</div>`;
    }).join("")}</div>`;
  }).join("");
  goSym(el);
  el.querySelectorAll("[data-hz]").forEach((s) => (s.onclick = (e) => { e.stopPropagation(); D.hz = s.dataset.hz; renderHeat(); }));
  if ($("hzBack")) $("hzBack").onclick = () => { D.hz = null; renderHeat(); };
  $("heatP").querySelectorAll("[data-hp]").forEach((b) => (b.onclick = () => { D.hp = b.dataset.hp; saveLocal("tec_heat_p", D.hp); renderHeat(); }));
  $("heatU").querySelectorAll("[data-hu]").forEach((b) => (b.onclick = () => { D.hu = b.dataset.hu; saveLocal("tec_heat_u", D.hu); D.hz = null; renderHeat(); }));
  const tip = $("tip");
  el.onmousemove = (e) => {
    const c = D.hcells.get(e.target.closest("[data-sym]")?.dataset.sym); if (!c) { tip.style.display = "none"; return; }
    const r = (l, v) => `<div class="r"><span>${l}</span><b>${v}</b></div>`;
    tip.innerHTML = `<div style="margin-bottom:5px"><b>${esc(c.ced || c.s)}</b> · ${esc(c.n || "")}</div>${r("Hoy", `<span class="${c.d1 >= 0 ? "pos" : "neg"}">${pt(P === "d1" ? c.v0 : c.d1)}</span>`)}${r("1 semana", pt(c.w1))}${r("1 mes", pt(c.m1))}${r("3 meses", pt(c.m3))}${r("Score técnico", c.score)}${r("RSI 14", nf(0).format(c.rsi))}${r("Cap.", `US$ ${nf(0).format(c.mcap / 1e9)} MM`)}`;
    tip.style.display = "block";
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = e.clientY + 14 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  el.onmouseleave = () => (tip.style.display = "none");
}
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(renderHeat, 150); });

async function loadCaps() {
  try {
    await initSupabase(); const snap = await loadSnapshots();
    D.mcap = new Map([...snap.rows.values()].map((r) => [r.s, r.mcap]));
    D.live = new Map([...snap.rows.values()].filter((r) => ok(r.chg)).map((r) => [r.s, r.chg]));
    D.fund = new Map([...snap.rows.values()].map((r) => { const x = derive(r); return [r.s, { revG: x.revG, epsG: x.epsG }]; }));
  } catch (e) { console.warn(e); }
  if (!D.mcap?.size) D.mcap = new Map(D.tech?.rows.map((r) => [r.s, 1]) || []);
}
async function loadMkt() {
  const [R, B, w0, w1] = await Promise.all([fetch("/api/overview?view=regime").then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch("/data/breadth.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null), ...[0, 1].map((w) => fetch("/api/overview?view=week&w=" + w).then((r) => (r.ok ? r.json() : null)).catch(() => null))]);
  D.reg = R ? regimeGroups(R, B) : null;
  D.earn = new Map(Object.entries(D.tech?.earn || {})); for (const W of [w0, w1]) for (const d of W?.days || []) for (const e of d.earnings || []) if (!D.earn.has(e.s)) D.earn.set(e.s, d.date);
}

// =====================================================================================================
// UNA SOLA ESTRATEGIA: 1) mercado  2) sector fuerte  3) acción con las 5 condiciones  4) comprar en el gatillo
// =====================================================================================================
const PIL = [
  ["trendD", "Tend. diaria", "EMA20 > EMA50 > EMA200, precio sobre la EMA50 y la EMA200 subiendo"],
  ["trendW", "Tend. semanal", "En el gráfico semanal: precio sobre la EMA20, EMA20 sobre la EMA50 y precio sobre la EMA200"],
  ["rs", "Fuerza relativa", "La línea precio ÷ S&P 500 está sobre su promedio de 6 meses y subió en las últimas 3 semanas"],
  ["mom", "MACD + RSI", "MACD diario sobre su señal y RSI entre 45 y 70 (alcista sin sobrecompra)"],
  ["vol", "Volumen", "En las últimas 50 ruedas hubo más volumen en días de suba que en días de baja (alguien está comprando)"],
];
const pilTip = (k, x) => ({
  trendD: `Precio $${nf(2).format(x.px)} · EMA20 $${nf(2).format(x.e20)} · EMA50 $${nf(2).format(x.e50)} · EMA200 $${nf(2).format(x.e200)}`,
  trendW: `Semanal: precio $${nf(2).format(x.cw)} · EMA20 $${nf(2).format(x.w20)} · EMA50 $${nf(2).format(x.w50)}${x.w200 != null ? ` · EMA200 $${nf(2).format(x.w200)}` : ""}`,
  rs: `Línea RS ${pt(x.rsLvl)} vs su promedio de 6 meses · ${pt(x.rs3w)} contra el S&P en 3 semanas`,
  mom: `MACD ${nf(2).format(x.macd)} vs señal ${nf(2).format(x.macdSig)} · RSI ${nf(0).format(x.rsi)}`,
  vol: `Volumen en subas ÷ en bajas (50 ruedas): ${nf(2).format(x.ud)}x · hoy ${nf(1).format(x.volR)}x el promedio`,
})[k];
// Veredicto por sector: el dinero fluye en sentido horario (Mejorando → Líder → Debilitándose → Rezagado)
const SECV = {
  lead: ["Comprar acá", "#22c55e", 0, "Lidera y sigue ganando: el momentum tiende a continuar"],
  impr: ["Comprar acá (temprano)", "#3b82f6", 1, "Dando vuelta hacia Líder: es el mejor momento para entrar si la tendencia acompaña"],
  weak: ["No sumar", "#f59e0b", 2, "Fue líder pero pierde ritmo: mantener lo que tenés, no abrir posiciones nuevas"],
  lag: ["Evitar", "#ef4444", 4, "Débil y sigue perdiendo: aunque parezca barato, en momentum se evita"],
  watch: ["Vigilar", "#94a3b8", 3, "Le gana al S&P hace unas semanas pero su tendencia semanal todavía es bajista: esperar que se confirme"],
};
// Mejorando solo cuenta si el ETF ya tiene tendencia semanal (si no, es un rebote dentro de una baja)
const secV = (x) => (x.quad === "impr" && !x.trendW ? "watch" : x.quad);
const secOk = (x) => !!x && ["lead", "impr"].includes(secV(x));
const SIG = {
  buy: ["COMPRAR", "#22c55e", 0, "Cumple todo y hoy se activó el gatillo"],
  ready: ["Preparada", "#3b82f6", 1, "Cumple todo: comprar si cierra arriba del gatillo con volumen"],
  wait: ["Esperar", "#f59e0b", 2, "Cumple todo pero está estirada o con el stop lejos: esperar retroceso a la EMA20"],
  near: ["Le falta 1", "#94a3b8", 3, "Cumple 4 de 5 condiciones"],
  no: ["No", "#64748b", 4, "Cumple 3 o menos"],
};
const chip = (t, c, tip = "") => `<span class="qd" style="background:${c}22;color:${c};margin-left:0" title="${esc(tip)}">${t}</span>`;

function renderMkt() {
  const g = D.reg, sc = g?.score; if (sc == null) { $("mkt").innerHTML = ""; return; }
  const ex = expoOf(sc), t = sc >= 50 ? "Se puede comprar con tamaño normal" : sc >= 35 ? "Comprar solo las señales más claras, con la mitad del tamaño" : "No es momento de abrir posiciones";
  $("mkt").innerHTML = `<div class="ck-mk" style="border-color:${ex[2]};background:${ex[2]}14;margin:0"><div><b style="color:${ex[2]};font-size:22px">${sc}</b><span>/100</span></div><div><b>Paso 1 · Mercado: ${t}.</b><br><span>Régimen de mercado (tendencia de los índices, amplitud, VIX y crédito). Exposición sugerida ${ex[0]}.</span></div></div>`;
}

D.secOpen = null;
function renderSecs() {
  const S = [...D.tech.sectors].sort((a, b) => SECV[secV(a)][2] - SECV[secV(b)][2] || b.rs3w - a.rs3w);
  const arr = (v) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(v))}%</span>` : "—");
  const ck = (v, tip) => `<span class="ck ${v ? "y" : "n"}" title="${esc(tip)}">${v ? "✓" : "✗"}</span>`;
  const nBuy = (sec) => D.tech.rows.filter((r) => r.sec === sec && r.st && ["buy", "ready"].includes(r.st.sig)).length;
  $("secs").className = "";
  $("secs").innerHTML = `<div class="tr-int"><b>Paso 2 · ¿En qué sector comprar?</b> Donde está entrando el dinero: sectores <b style="color:#22c55e">Líder</b> (siguen ganándole al S&P 500) o <b style="color:#3b82f6">Mejorando</b> (dando vuelta hacia Líder, el mejor momento para entrar). Los <b>rezagados no se compran</b> aunque parezcan baratos: en momentum lo que va primero tiende a seguir primero. Tocá un sector para ver sus subsectores.</div>
    <table class="tr-t"><thead><tr><th class="l">Sector</th><th class="l">Qué hacer</th><th class="l">Estado</th><th title="Cuánto le ganó (▲) o perdió (▼) al S&P 500 en 3 semanas">vs S&P 3 sem</th><th title="Cuánto le ganó al S&P en 3 meses">3 meses</th><th title="ETF del sector con tendencia diaria (EMA20>50>200)">Tend. D</th><th title="ETF del sector con tendencia semanal">Tend. S</th><th title="Acciones del sector con señal COMPRAR o Preparada">Señales</th></tr></thead><tbody>
    ${S.map((x) => { const v = SECV[secV(x)], op = D.secOpen === x.etf, nb = secOk(x) ? nBuy(x.sec) : 0;
      return `<tr class="sx-row" data-sx="${x.etf}" style="cursor:pointer"><td class="l"><b>${esc(SEC_NAME[x.sec] || x.etf)}</b> <span class="dim">${x.etf} ${op ? "▾" : "▸"}</span></td><td class="l">${chip(v[0], v[1], v[3])}</td><td class="l">${qChip(x.quad)}</td><td>${arr(x.rs3w)}</td><td>${arr(x.rs3m)}</td><td>${ck(x.trendD, "Tendencia diaria del ETF")}</td><td>${ck(x.trendW, "Tendencia semanal del ETF")}</td><td>${nb ? `<b class="pos">${nb}</b>` : '<span class="dim">0</span>'}</td></tr>
      ${op ? `<tr><td colspan="8" class="l" style="background:var(--panel2)"><div class="sx-subs" style="margin:2px 0">${[...x.subs].sort((a, b) => SECV[secV(a)][2] - SECV[secV(b)][2] || b.rs3w - a.rs3w).map((u) => `<span title="${esc(SECV[secV(u)][3])} · 3 meses ${pt(u.rs3m)}"><i class="dot3" style="background:${SECV[secV(u)][1]}"></i>${esc(u.l)} <b>${u.etf}</b> ${arr(u.rs3w)} · ${SECV[secV(u)][0]}</span>`).join("") || "<span>Sin subsectores</span>"}</div></td></tr>` : ""}`; }).join("")}</tbody></table>`;
  $("secs").querySelectorAll("[data-sx]").forEach((t) => (t.onclick = () => { D.secOpen = D.secOpen === t.dataset.sx ? null : t.dataset.sx; renderSecs(); }));
}

D.sgMode = loadLocal("tec_sg_mode", "buy");
function renderSig() {
  const secQ = new Map(D.tech.sectors.map((x) => [x.sec, x])), mine = mineSet();
  const today = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const MODES = [["buy", "Para comprar"], ["near", "Les falta 1"], ["mine", "Mis acciones"]];
  $("sigR").innerHTML = MODES.map(([k, l]) => `<button data-sg="${k}" class="${k === D.sgMode ? "on" : ""}">${l}</button>`).join("");
  $("sigR").querySelectorAll("[data-sg]").forEach((b) => (b.onclick = () => { D.sgMode = b.dataset.sg; saveLocal("tec_sg_mode", D.sgMode); renderSig(); }));
  let rows = D.tech.rows.filter((r) => r.st).map((r) => {
    const x = r.st, so = secOk(secQ.get(r.sec)), ed = D.earn?.get(r.s), earnSoon = ed && ed >= today && ed <= lim;
    // Tu setup (compresión entre techo bajista y AVWAP): si está armado, el gatillo es el techo
    const coil = r.coil && ["coil", "base"].includes(r.coil.state) ? r.coil : null;
    const pivot = coil ? coil.ceil : x.pivot, toPivot = coil ? coil.toCeil : x.toPivot;
    let sig = x.sig; if (r.coil?.state === "breakout" && sig === "ready") sig = "buy";
    if ((sig === "buy" || sig === "ready") && !so) sig = "near";                 // sector débil: no se compra
    return { ...r, x, so, sig, ed: earnSoon ? ed : null, pivot, toPivot, coil, trig: r.coil?.state === "breakout" ? "techo" : x.trig };
  });
  rows = D.sgMode === "mine" ? rows.filter((r) => mine.has(r.s)) : D.sgMode === "near" ? rows.filter((r) => r.sig === "near") : rows.filter((r) => ["buy", "ready", "wait"].includes(r.sig));
  rows.sort((a, b) => SIG[a.sig][2] - SIG[b.sig][2] || b.x.nOk - a.x.nOk || (a.x.risk ?? 99) - (b.x.risk ?? 99));
  const nWait = D.sgMode === "buy" ? rows.filter((r) => r.sig === "wait").length : 0;
  if (nWait && !D.showWait) rows = rows.filter((r) => r.sig !== "wait");
  const ck = (v, tip) => `<td title="${esc(tip)}"><span class="ck ${v ? "y" : "n"}">${v ? "✓" : "✗"}</span></td>`;
  const trigTxt = (r) => r.sig === "buy" ? (r.trig === "breakout" ? "Rompió el máximo de 20 ruedas con volumen" : r.trig === "techo" ? "Rompió el techo bajista con volumen" : "Rebotó en la EMA20/50 y superó el máximo de ayer")
    : r.sig === "wait" ? (r.x.why === "estirada" ? `Estirada (${pt(r.x.d20)} sobre la EMA20): esperar retroceso` : `Stop a ${nf(1).format(r.x.risk)}%: esperar retroceso a la EMA20`)
    : `Cerrar arriba de $${nf(2).format(r.pivot)}${r.coil ? " (techo bajista)" : ""} con volumen`;
  const intro = { buy: "<b>Paso 3 · Las acciones que cumplen las 5 condiciones</b> en un sector fuerte. <b style='color:#22c55e'>COMPRAR</b> = hoy se activó el gatillo · <b style='color:#3b82f6'>Preparada</b> = poné una alerta en el precio gatillo · <b style='color:#f59e0b'>Esperar</b> = buena, pero estirada o con el stop lejos.", near: "Cumplen 4 de las 5 condiciones (o las 5 pero su sector es débil). El ✗ te dice qué falta: si se completa, pasan a <b>Para comprar</b>.", mine: "Tus acciones (cartera y watchlist) con las mismas condiciones: si alguna pierde 2 o más ✓, revisá si mantenerla." }[D.sgMode];
  $("sig").className = "";
  $("sig").innerHTML = `<div class="tr-int">${intro}</div>` + (rows.length ? `<table class="tr-t"><thead><tr><th class="l">Acción</th><th class="l">Señal</th><th class="l" title="El sector tiene que estar Líder o Mejorando">Sector</th>${PIL.map(([, l, t]) => `<th title="${esc(t)}">${l}</th>`).join("")}<th class="l">Paso 4 · Cuándo comprar</th><th title="Stop 1% debajo del mínimo de las últimas 5 ruedas o de la EMA20 (el más bajo)">Stop</th><th title="Cuánto perdés si salta el stop. Ideal: menos de 8%">Riesgo</th></tr></thead><tbody>
    ${rows.slice(0, 40).map((r) => `<tr data-sym="${esc(r.s)}"><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span>${r.ed ? `<span class="qd" style="background:#ef444422;color:#f87171" title="Presenta balance el ${r.ed.slice(8)}/${r.ed.slice(5, 7)}: no comprar antes, puede saltar el stop">balance ${r.ed.slice(8)}/${r.ed.slice(5, 7)}</span>` : ""}</td><td class="l">${chip(SIG[r.sig][0], SIG[r.sig][1], SIG[r.sig][3])}</td><td class="l" style="font-size:12px"><span class="${r.so ? "pos" : "neg"}">${r.so ? "✓" : "✗"}</span> ${esc(SEC_NAME[r.sec] || "")}</td>${PIL.map(([k]) => ck(r.x.pillars[k], pilTip(k, r.x))).join("")}<td class="l" style="font-size:12px">${trigTxt(r)}</td><td>$${nf(2).format(r.x.stop)}</td><td class="${r.x.risk <= 8 ? "pos" : "neg"}">−${nf(1).format(r.x.risk)}%</td></tr>`).join("")}</tbody></table>${nWait ? `<button class="hm-back" id="sgWait" style="margin-top:10px">${D.showWait ? "Ocultar" : "Ver"} las ${nWait} que hay que esperar (estiradas o con stop lejos)</button>` : ""}`
    : `<div class="dim">${D.sgMode === "mine" ? "Ninguna de tus acciones cotiza en EE.UU. con datos." : "Hoy ninguna acción cumple. Con el mercado débil es normal: no hay que comprar todos los días."}</div>`);
  goSym($("sig"));
  if ($("sgWait")) $("sgWait").onclick = () => { D.showWait = !D.showWait; renderSig(); };
}

mountHelp({
  how: "<b>La estrategia, en 4 pasos (siempre en este orden):</b><br>1) <b>Mercado</b>: con el régimen en 50 o más se compra normal; entre 35 y 50, mitad del tamaño; menos de 35, no se compra.<br>2) <b>Sector</b>: solo sectores Líder o Mejorando.<br>3) <b>Acción</b>: las 5 condiciones ✓ — tendencia diaria (EMA 20/50/200), tendencia semanal, fuerza relativa contra el S&P 500, MACD+RSI y volumen de acumulación.<br>4) <b>Gatillo</b>: comprar cuando rompe el máximo reciente (o el techo bajista) con volumen 1,4x, o cuando rebota en la EMA20/50. Nunca antes de un balance.<br><b>Riesgo</b>: stop 1% debajo del mínimo de 5 ruedas o de la EMA20 (el más bajo); tamaño para perder 1% de la cartera si salta (posición = 1% ÷ riesgo%). Vender un tercio a +20%, el resto cuando cierre debajo de la EMA50.",
  secs: "<b>¿Compro sectores que van primeros o atrasados?</b> Primeros. La fuerza relativa persiste: los sectores que le ganan al S&P 500 suelen seguir ganándole por meses.<br><span style='color:#3b82f6'>Mejorando</span> = el mejor momento (recién gira hacia Líder, más recorrido), siempre que su tendencia semanal ya sea alcista; si no, figura como <b>Vigilar</b> · <span style='color:#22c55e'>Líder</span> = comprar las acciones fuertes del sector · <span class='y'>Debilitándose</span> = no abrir posiciones nuevas · <span class='r'>Rezagado</span> = evitar, aunque esté barato (comprar lo atrasado es una estrategia de valor/reversión, no de momentum).<br>Ordenados de mejor a peor. <b>Tend. D / S</b> = si el ETF del sector tiene tendencia diaria y semanal. <b>Señales</b> = cuántas acciones del sector están para comprar.",
  sig: "<b>Las 5 condiciones</b> (pasá el mouse por cada ✓/✗ para ver los números):<br><b>Tend. diaria</b>: EMA20 > EMA50 > EMA200, precio sobre la EMA50 y EMA200 subiendo.<br><b>Tend. semanal</b>: lo mismo en el gráfico semanal (precio sobre EMA20, EMA20 > EMA50, sobre EMA200).<br><b>Fuerza relativa</b>: la acción le gana al S&P 500 y lo sigue haciendo en las últimas 3 semanas.<br><b>MACD + RSI</b>: MACD sobre su señal y RSI entre 45 y 70.<br><b>Volumen</b>: más volumen en días de suba que de baja en 50 ruedas (acumulación).<br><b>Señal</b>: COMPRAR = todo ✓ y hoy se activó el gatillo (ruptura con volumen o rebote en EMA20/50) · Preparada = todo ✓, falta el gatillo: poné alerta en el precio indicado · Esperar = todo ✓ pero estirada (más de 8% sobre la EMA20 o RSI arriba de 70) o con stop a más de 8%.<br>Si dice <b>balance</b>, no comprar antes de esa fecha.",
  heat: "<b>Cada cuadrado es una acción</b>: el tamaño es su capitalización y el color cuánto subió o bajó en el período elegido. Sirve para ver de un vistazo qué sectores se mueven. Tocá el nombre de un sector para verlo solo, y una acción para abrir su ficha.",
});
loadTech().then(() => { if (!D.tech) return; renderSecs(); return Promise.all([loadCaps(), loadMkt()]); }).then(() => { if (!D.tech) return; renderMkt(); renderSig(); renderHeat(); });
