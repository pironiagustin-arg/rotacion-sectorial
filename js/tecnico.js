// Página Técnico: mapa de calor, ranking técnico, RSI extremos y sectores/subsectores (data/tech.json)
import { ok, nf } from "/js/score.js";
import { $, esc, loadLocal, saveLocal, initSupabase, loadSnapshots } from "/js/core.js";
import { EARN_CSS, logo } from "/js/earnings.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";
import { mountHelp } from "/js/help.js";
{ const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st); }
const D = {};
const pt = (v, d = 1) => (ok(v) ? `${v >= 0 ? "+" : ""}${nf(d).format(v)}%` : "—");
const mineSet = () => new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);

// ---------- Ranking técnico, RSI extremos y sectores/subsectores (data/tech.json, se recalcula cada día hábil) ----------
D.trMode = loadLocal("dash_tr_mode", "all");
async function loadTech() {
  D.tech = await fetch("/data/tech.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!D.tech) { ["tech", "rsi", "secs", "heat"].forEach((id) => ($(id).innerHTML = '<div class="dim">Se genera con la próxima actualización diaria.</div>')); return; }
  const dd = new Date(D.tech.date + "T12:00:00"); $("asof").textContent = `Cierre del ${dd.getDate()}/${dd.getMonth() + 1} · se actualiza cada día hábil`;
  renderTech(); renderRsi(); renderSecs();
}
const scCol = (r) => (r >= 0.75 ? "#22c55e" : r >= 0.45 ? "#f59e0b" : "#ef4444");
const tkOf = (r) => esc(r.ced || r.s);
const goSym = (el) => el.querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => (location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym))));
// Cuadrante de la línea de fuerza relativa (como el RRG)
const QUAD = { lead: ["Líder", "#22c55e", "Fuerte y sigue ganando contra el S&P 500"], impr: ["Mejorando", "#3b82f6", "Todavía debajo de su media de fuerza, pero en las últimas 3 semanas le gana al S&P 500: está dando vuelta"], weak: ["Debilitándose", "#f59e0b", "Fue fuerte pero en las últimas 3 semanas pierde contra el S&P 500"], lag: ["Rezagada", "#ef4444", "Débil y sigue perdiendo contra el S&P 500"] };
const qChip = (q) => (QUAD[q] ? `<span class="qd" style="background:${QUAD[q][1]}22;color:${QUAD[q][1]}" title="${esc(QUAD[q][2])}">${QUAD[q][0]}</span>` : "");
function renderTech() {
  const mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  const MODES = [["all", "Top score"], ["impr", "Dando vuelta"], ["mine", "Mis acciones"]];
  if (!MODES.some(([k]) => k === D.trMode)) D.trMode = "all";
  $("techR").innerHTML = MODES.map(([k, l]) => `<button data-trm="${k}" class="${k === D.trMode ? "on" : ""}">${l}</button>`).join("");
  $("techR").querySelectorAll("[data-trm]").forEach((b) => (b.onclick = () => { D.trMode = b.dataset.trm; saveLocal("dash_tr_mode", D.trMode); renderTech(); }));
  // "Dando vuelta": cuadrante Mejorando con tendencia que se empieza a armar (precio al menos sobre 2 medias)
  const rows = D.tech.rows.filter((r) => (D.trMode === "mine" ? mine.has(r.s) : D.trMode === "impr" ? r.quad === "impr" && r.trend >= 8 : true)).sort((a, b) => b.score - a.score).slice(0, D.trMode === "mine" ? 30 : 12);
  const cell = (v, m) => `<td><span class="tr-b"><i><u style="width:${(v / m) * 100}%;background:${scCol(v / m)}"></u></i><span style="color:${scCol(v / m)}">${nf(0).format(v ?? 0)}</span></span></td>`;
  const rs1 = (v) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}" style="font-size:11px;font-weight:600">${v >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(v))}%</span>` : "");
  $("tech").className = "";
  $("tech").innerHTML = rows.length ? `<table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th>Score</th><th title="Precio sobre medias de 50/150/200, ordenadas y con la de 200 subiendo">Tend.<br>/20</th><th title="Rendimiento ponderado 3-12 meses contra el S&P 500 (nivel)">Fuerza<br>/20</th><th title="La línea de fuerza relativa sube en 1 y 3 meses y está en máximos">Mejora<br>/25</th><th title="Volatilidad y rango achicándose. Solo suma si hay tendencia">Contr.<br>/15</th><th title="Cerca del máximo de 52 semanas, lejos del mínimo y sin estar estirada sobre la media de 50">Setup<br>/20</th><th class="l" title="Estado de la línea de fuerza relativa y cuánto le ganó (▲) o perdió (▼) al S&P 500 en 3 semanas">Estado · RS 3 sem</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}${r.ext ? `<span class="qd" style="background:#f59e0b22;color:#fbbf24" title="${nf(0).format(r.s50)}% sobre la media de 50: estirada, mejor esperar un retroceso">⚠ estirada</span>` : ""}</span></td><td class="tr-sc" style="color:${scCol(r.score / 100)}">${r.score}</td>${cell(r.trend, 20)}${cell(r.rs, 20)}${cell(r.impr, 25)}${cell(r.contr, 15)}${cell(r.setup, 20)}<td class="l">${qChip(r.quad)} ${rs1(r.rs3w)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="dim">${D.trMode === "mine" ? "Ninguna de tus acciones tiene datos técnicos (solo se calculan las que cotizan en EE.UU.)." : "Hoy no hay acciones dando vuelta con tendencia armándose."}</div>`;
  goSym($("tech"));
}
function renderRsi() {
  const r = D.tech.rows.filter((x) => ok(x.rsi));
  const list = (arr, cls) => arr.map((x, i) => `<div class="rsi-r" data-sym="${esc(x.s)}"><span class="n">${i + 1}</span>${logo(x.s, x.ced || x.s, 20)}<b>${tkOf(x)}</b><span class="dim" style="font-size:11.5px">${esc((x.n || "").slice(0, 18))}</span><span class="v ${cls}">${nf(1).format(x.rsi)}</span></div>`).join("");
  $("rsi").className = "";
  $("rsi").innerHTML = `<div class="rsi-l"><h5><span class="dot3" style="background:#ef4444"></span>Sobrecompradas (RSI más alto)</h5>${list([...r].sort((a, b) => b.rsi - a.rsi).slice(0, 5), "ob")}</div>
    <div class="rsi-l"><h5><span class="dot3" style="background:#22c55e"></span>Sobrevendidas (RSI más bajo)</h5>${list([...r].sort((a, b) => a.rsi - b.rsi).slice(0, 5), "os")}</div>`;
  goSym($("rsi"));
}
D.secSel = null;
function renderSecs() {
  const S = D.tech.sectors; if (!S?.length) return;
  const sel = S.find((x) => x.etf === D.secSel) || S[0];
  const dotE = (v) => `<span class="dot3" style="background:${v >= 0 ? "#22c55e" : "#ef4444"}"></span>`;
  const dotR = (v) => `<span class="dot3" style="background:${v >= 70 ? "#ef4444" : v <= 30 ? "#22c55e" : "#f59e0b"}"></span>`;
  const qc = (q) => QUAD[q]?.[1] || "#94a3b8";
  const arr = (v) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(v))}%</span>` : "");
  const stocks = D.tech.rows.filter((r) => r.sec === sel.sec).sort((a, b) => (b.quad === "impr" || b.quad === "lead") - (a.quad === "impr" || a.quad === "lead") || b.score - a.score).slice(0, 9);
  $("secs").className = "";
  $("secs").innerHTML = `<div class="sx-tabs">${S.map((x) => `<button data-sx="${x.etf}" class="${x === sel ? "on" : ""}" title="${esc(SEC_NAME[x.sec] || "")} · ${QUAD[x.quad]?.[0] || ""} · RS 3 semanas ${pt(x.rs3w)} · 1 mes ${pt(x.rs1m)} · 3 meses ${pt(x.rs3m)} · RS rating ${x.rsr}"><i class="dot3" style="background:${qc(x.quad)}"></i>${x.etf} <small>${arr(x.rs3w)}</small></button>`).join("")}</div>
    <div class="sx-sum"><b>${esc(SEC_NAME[sel.sec] || sel.etf)}</b> ${qChip(sel.quad)} <span>vs S&P 500: 3 semanas ${arr(sel.rs3w)} · 1 mes ${arr(sel.rs1m)} · 3 meses ${arr(sel.rs3m)} · RS rating <b>${sel.rsr}</b>/99</span></div>
    <div class="sx-subs"><span style="border:none;padding-left:0">Subsectores:</span>${[...sel.subs].sort((a, b) => b.rs3w - a.rs3w).map((u) => `<span title="${esc(QUAD[u.quad]?.[2] || "")} · 1 mes ${pt(u.rs1m)} · 3 meses ${pt(u.rs3m)} · RSI ${nf(0).format(u.rsi)} · ${pt(u.e200)} vs EMA200"><i class="dot3" style="background:${qc(u.quad)}"></i>${esc(u.l)} <b>${u.etf}</b> ${arr(u.rs3w)}</span>`).join("") || "<span>—</span>"}</div>
    <div class="sx-g">${stocks.map((r) => `<div class="sx-c" data-sym="${esc(r.s)}"><div class="h"><span>${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span>${qChip(r.quad)}</div><div class="nm">${esc(r.n)}</div>
      <div class="kv"><span>Score técnico</span><b style="color:${scCol(r.score / 100)}">${r.score}</b></div><div class="kv"><span>vs S&P 3 sem.</span><b>${arr(r.rs3w)}</b></div><div class="kv"><span>vs EMA200</span><b>${dotE(r.e200)}${pt(r.e200)}</b></div><div class="kv"><span>vs SMA50</span><b>${dotE(r.s50)}${pt(r.s50)}${r.ext ? " ⚠" : ""}</b></div><div class="kv"><span>RSI 14</span><b>${dotR(r.rsi)}${nf(1).format(r.rsi)}</b></div></div>`).join("") || '<div class="dim">Sin acciones del universo en este sector.</div>'}</div>`;
  $("secs").querySelectorAll("[data-sx]").forEach((b) => (b.onclick = () => { D.secSel = b.dataset.sx; renderSecs(); }));
  goSym($("secs"));
}
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
  } catch (e) { console.warn(e); }
  if (!D.mcap?.size) D.mcap = new Map(D.tech?.rows.map((r) => [r.s, 1]) || []);
}

mountHelp({
  heat: "<b>Cada cuadrado es una acción</b>: el tamaño es su capitalización y el color cuánto subió o bajó en el período elegido.<br><span class='g'>Verde</span> = sube · <span class='r'>rojo</span> = baja · gris = casi sin cambio. La barra de colores dice qué % satura el color.<br>Tocá el <b>nombre del sector</b> para ver solo ese sector, y una acción para abrir su ficha. Si un sector está todo verde en 1 mes y 3 meses, ahí está entrando el dinero.",
  tech: "<b>Qué busca:</b> acciones que <b>están mejorando</b> contra el S&P 500, con tendencia armada y sin estar estiradas.<br><b>Tendencia (20)</b>: precio sobre las medias de 50/150/200, ordenadas y con la de 200 subiendo.<br><b>Fuerza (20)</b>: cuánto le ganó al S&P 500 en 3–12 meses.<br><b>Mejora (25)</b>: la línea de fuerza relativa (precio ÷ S&P 500) sube en 1 y 3 meses; suma extra si está en máximos del año.<br><b>Contracción (15)</b>: volatilidad y rango achicándose (se prepara para moverse). Solo suma con tendencia.<br><b>Setup (20)</b>: cerca del máximo de 52 semanas y no más de ~12% sobre la media de 50.<br><b>Estado</b>: <span style='color:#22c55e'>Líder</span> = fuerte y sigue ganando · <span style='color:#3b82f6'>Mejorando</span> = débil pero dando vuelta · <span class='y'>Debilitándose</span> = fuerte pero perdiendo ritmo · <span class='r'>Rezagada</span>.<br><b>Cómo usarlo para comprar:</b> 1) elegí score 70+ en estado Líder o Mejorando; 2) sin ⚠ estirada (si está estirada, esperá que vuelva hacia la media de 50); 3) mejor si su sector también está Líder o Mejorando; 4) entrada cuando rompe el máximo de la consolidación con volumen, o en un retroceso a la media de 50 que rebota; 5) stop debajo del último mínimo o de la media de 50 (−7/−8% máximo). La pestaña <b>Dando vuelta</b> muestra las que recién están girando: más riesgo, pero entrás antes.",
  rsi: "<b>RSI de 14 ruedas</b>: mide si la suba o baja reciente fue exagerada. No es señal de compra por sí solo: <b>se usa para el momento de entrada</b>.<br><span class='r'>Más de 70 = sobrecomprada</span>: no conviene entrar ahí; esperá que lateralice o retroceda (una acción líder puede quedarse arriba de 70 mucho tiempo, no es para vender por eso).<br><span class='g'>Menos de 30 = sobrevendida</span>: sirve solo si la acción sigue en tendencia alcista (sobre su media de 200) y su estado es Líder o Mejorando: es un retroceso dentro de una suba. Si está Rezagada, puede seguir cayendo.",
  secs: "<b>Qué busca:</b> en qué sectores y subsectores está <b>entrando</b> el dinero.<br>Cada sector tiene un punto de color con su <b>estado</b> (igual que el RRG): <span style='color:#22c55e'>verde Líder</span>, <span style='color:#3b82f6'>azul Mejorando</span>, <span class='y'>amarillo Debilitándose</span>, <span class='r'>rojo Rezagado</span>. La flecha es cuánto le ganó (▲) o perdió (▼) al S&P 500 en las últimas 3 semanas; están ordenados de mayor a menor mejora.<br><b>RS rating</b> (1–99): fuerza de 12 meses comparada con los otros sectores/subsectores.<br><b>Cómo usarlo:</b> buscá sectores en azul o verde con flecha ▲, después el subsector más fuerte dentro de ese sector, y adentro las acciones Líder o Mejorando con buen score técnico. Evitá comprar en sectores rojos aunque la acción se vea barata.",
});
loadTech().then(() => loadCaps()).then(() => renderHeat());
