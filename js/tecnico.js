// Página Técnico: mapa de calor, ranking técnico, RSI extremos y sectores/subsectores (data/tech.json)
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

// ---------- Ranking técnico, RSI extremos y sectores/subsectores (data/tech.json, se recalcula cada día hábil) ----------
D.trMode = loadLocal("tec_tr_mode", "entry");
async function loadTech() {
  D.tech = await fetch("/data/tech.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!D.tech) { ["tech", "rsi", "secs", "heat"].forEach((id) => ($(id).innerHTML = '<div class="dim">Se genera con la próxima actualización diaria.</div>')); return; }
  const dd = new Date(D.tech.date + "T12:00:00"); $("asof").textContent = `Cierre del ${dd.getDate()}/${dd.getMonth() + 1} · se actualiza cada día hábil`;
  renderTech(); renderTop(); renderRsi(); renderSecs();
}
const scCol = (r) => (r >= 0.75 ? "#22c55e" : r >= 0.45 ? "#f59e0b" : "#ef4444");
const tkOf = (r) => esc(r.ced || r.s);
const goSym = (el) => el.querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => (location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym))));
// Cuadrante de la línea de fuerza relativa (como el RRG)
const QUAD = { lead: ["Líder", "#22c55e", "Fuerte y sigue ganando contra el S&P 500"], impr: ["Mejorando", "#3b82f6", "Todavía debajo de su media de fuerza, pero en las últimas 3 semanas le gana al S&P 500: está dando vuelta"], weak: ["Debilitándose", "#f59e0b", "Fue fuerte pero en las últimas 3 semanas pierde contra el S&P 500"], lag: ["Rezagada", "#ef4444", "Débil y sigue perdiendo contra el S&P 500"] };
const qChip = (q) => (QUAD[q] ? `<span class="qd" style="background:${QUAD[q][1]}22;color:${QUAD[q][1]}" title="${esc(QUAD[q][2])}">${QUAD[q][0]}</span>` : "");
// Puntaje de entrada: acción de calidad técnica (tendencia + fuerza) que HOY está en zona de compra,
// es decir, cerca de su media de 50, con RSI tranquilo y comprimiéndose. No premia a las que ya se escaparon.
const lin = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const tri = (v, a, b, c, e) => (v < b ? lin(v, a, b) : v <= c ? 1 : 1 - lin(v, c, e));
function entry(r) {
  if (r.trend < 12 || r.quad === "lag" || r.rs < 5) return null;
  const q = (r.trend / 20) * 15 + (r.rs / 20) * 15 + (r.impr / 25) * 10;
  const n = tri(r.s50, -10, -4, 5, 15) * 25 + tri(r.rsi, 30, 40, 55, 68) * 15 + (r.contr / 15) * 10 + tri(r.pos, 40, 60, 100, 101) * 10;
  return { v: Math.round(q + n), q, n };
}
// "Dando vuelta": todavía débiles pero girando. Giro (50) = cuánto le gana al S&P en 3 semanas + mejora de la línea RS + medias que empieza a recuperar
function turn(r) {
  if (r.quad !== "impr" || r.trend < 8) return null;
  const q = lin(r.rs3w, 0, 15) * 25 + (r.impr / 25) * 15 + (r.trend / 20) * 10;
  const n = (tri(r.s50, -10, -4, 5, 15) * 25 + tri(r.rsi, 30, 40, 58, 72) * 15 + (r.contr / 15) * 10 + tri(r.pos, 15, 35, 100, 101) * 10) * (50 / 60);
  return { v: Math.round(q + n), q, n };
}
const setupOf = (r) => (r.s50 < -4 ? ["Debajo de la media 50", "Todavía no recuperó su media de 50: entrada cuando la pase y se mantenga arriba"] : r.s50 >= -4 && r.s50 <= 3 ? ["Retroceso a la media 50", "Precio apoyado en su media de 50: entrada si rebota con volumen"] : r.contr >= 9 && r.pos >= 80 ? ["Base apretada", "Rango y volatilidad achicándose cerca de máximos: entrada si rompe el techo de la base"] : r.pos >= 95 ? ["En máximos", "Rompiendo máximos de 52 semanas: entrada en la ruptura, no después de que se estire"] : ["Consolidando", "Lateral sobre su media de 50: esperar ruptura o retroceso a la media"]);
const stopRisk = (r) => (1 - 0.97 / (1 + r.s50 / 100)) * 100; // stop 3% debajo de la media de 50
function renderTech() {
  const mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  const MODES = [["entry", "Cerca de entrada"], ["impr", "Dando vuelta"], ["mine", "Mis acciones"]];
  if (!MODES.some(([k]) => k === D.trMode)) D.trMode = "entry";
  $("techR").innerHTML = MODES.map(([k, l]) => `<button data-trm="${k}" class="${k === D.trMode ? "on" : ""}">${l}</button>`).join("");
  $("techR").querySelectorAll("[data-trm]").forEach((b) => (b.onclick = () => { D.trMode = b.dataset.trm; saveLocal("tec_tr_mode", D.trMode); renderTech(); }));
  const rs1 = (v) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}" style="font-size:11px;font-weight:600">${v >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(v))}%</span>` : "");
  $("tech").className = "";
  const cell = (v, m) => `<td><span class="tr-b"><i><u style="width:${(v / m) * 100}%;background:${scCol(v / m)}"></u></i><span style="color:${scCol(v / m)}">${nf(0).format(v ?? 0)}</span></span></td>`;
  if (D.trMode === "entry" || D.trMode === "impr") {
    const E = D.trMode === "entry";
    const rows = D.tech.rows.map((r) => ({ ...r, e: E ? entry(r) : turn(r) })).filter((r) => r.e).sort((a, b) => b.e.v - a.e.v).slice(0, 15);
    const [qL, qM, qT, nM] = E ? ["Calidad", 40, "Tendencia, fuerza contra el S&P 500 y mejora de esa fuerza", 60] : ["Giro", 50, "Cuánto le gana al S&P 500 en 3 semanas, mejora de la línea de fuerza y medias que empieza a recuperar", 50];
    const intro = E ? "Acciones en tendencia alcista y más fuertes que el S&P 500 que <b>hoy están en zona de compra</b>: cerca de su media de 50, con RSI tranquilo (40–55) y sin estirarse. No son las que más subieron, son las que tienen mejor relación riesgo/beneficio para entrar ahora."
      : "Acciones <b>todavía débiles que están dando vuelta</b>: en las últimas 3 semanas le ganan al S&P 500 y el precio empieza a recuperar sus medias. Entrada temprana: más riesgo que <b>Cerca de entrada</b>, pero más recorrido si el giro se confirma. Conviene esperar que pase la media de 200 o entrar con posición chica.";
    $("tech").innerHTML = `<div class="tr-int">${intro}</div>
      <table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th title="0-100">${E ? "Entrada" : "Giro + entrada"}</th><th title="${qT}">${qL}<br>/${qM}</th><th title="Cercanía a la media de 50, RSI tranquilo, compresión y posición en el rango del año">Zona compra<br>/${nM}</th><th class="l">Setup</th><th class="l">Estado · RS 3 sem</th><th title="Distancia del precio a su media de 50 ruedas">vs media<br>50</th><th>RSI</th><th title="Pérdida si ponés el stop 3% debajo de la media de 50. Ideal: menos de 8%">Riesgo<br>al stop</th></tr></thead><tbody>
      ${rows.map((r, i) => { const [st, tip] = setupOf(r), rk = stopRisk(r); return `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span></td><td class="tr-sc" style="color:${scCol(r.e.v / 100)}">${r.e.v}</td>${cell(r.e.q, qM)}${cell(r.e.n, nM)}<td class="l" title="${esc(tip)}" style="font-size:12.5px">${st}</td><td class="l">${qChip(r.quad)} ${rs1(r.rs3w)}</td><td class="${Math.abs(r.s50) <= 5 ? "pos" : Math.abs(r.s50) >= 12 ? "neg" : ""}">${pt(r.s50)}</td><td>${nf(0).format(r.rsi)}</td><td class="${rk <= 0 ? "dim" : rk <= 8 ? "pos" : rk >= 12 ? "neg" : ""}" ${rk <= 0 ? 'title="El precio está debajo de la media de 50: el stop se define cuando la recupere"' : ""}>${rk > 0 ? "−" + nf(1).format(rk) + "%" : "—"}</td></tr>`; }).join("") || '<tr><td colspan="10" class="dim">Hoy no hay acciones en esta situación.</td></tr>'}</tbody></table>`;
    goSym($("tech")); return;
  }
  // "Dando vuelta": cuadrante Mejorando con tendencia que se empieza a armar (precio al menos sobre 2 medias)
  const rows = D.tech.rows.filter((r) => (D.trMode === "mine" ? mine.has(r.s) : D.trMode === "impr" ? r.quad === "impr" && r.trend >= 8 : true)).sort((a, b) => b.score - a.score).slice(0, D.trMode === "mine" ? 30 : 12);
  const intro = { all: "Las más fuertes técnicamente <b>hoy</b>. Sirven para saber quién lidera, pero muchas ya subieron mucho: usalas como lista para vigilar y esperá un retroceso (pestaña <b>Cerca de entrada</b>).", impr: "Todavía débiles, pero en las últimas 3 semanas le ganan al S&P 500 y el precio empieza a pasar sus medias. Entrada temprana: más riesgo, más recorrido.", mine: "Tus acciones (cartera y watchlist) ordenadas por score técnico." }[D.trMode];
  $("tech").innerHTML = `<div class="tr-int">${intro}</div>` + (rows.length ? `<table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th>Score</th><th title="Precio sobre medias de 50/150/200, ordenadas y con la de 200 subiendo">Tend.<br>/20</th><th title="Rendimiento ponderado 3-12 meses contra el S&P 500 (nivel)">Fuerza<br>/20</th><th title="La línea de fuerza relativa sube en 1 y 3 meses y está en máximos">Mejora<br>/25</th><th title="Volatilidad y rango achicándose. Solo suma si hay tendencia">Contr.<br>/15</th><th title="Cerca del máximo de 52 semanas, lejos del mínimo y sin estar estirada sobre la media de 50">Setup<br>/20</th><th class="l" title="Estado de la línea de fuerza relativa y cuánto le ganó (▲) o perdió (▼) al S&P 500 en 3 semanas">Estado · RS 3 sem</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}${r.ext ? `<span class="qd" style="background:#f59e0b22;color:#fbbf24" title="${nf(0).format(r.s50)}% sobre la media de 50: estirada, mejor esperar un retroceso">⚠ estirada</span>` : ""}</span></td><td class="tr-sc" style="color:${scCol(r.score / 100)}">${r.score}</td>${cell(r.trend, 20)}${cell(r.rs, 20)}${cell(r.impr, 25)}${cell(r.contr, 15)}${cell(r.setup, 20)}<td class="l">${qChip(r.quad)} ${rs1(r.rs3w)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="dim">${D.trMode === "mine" ? "Ninguna de tus acciones tiene datos técnicos (solo se calculan las que cotizan en EE.UU.)." : "Hoy no hay acciones dando vuelta con tendencia armándose."}</div>`);
  goSym($("tech"));
}
function renderTop() {
  const rows = [...D.tech.rows].sort((a, b) => b.score - a.score).slice(0, 10);
  $("top").className = "";
  $("top").innerHTML = rows.map((r, i) => `<div class="t10" data-sym="${esc(r.s)}"><span class="n">${i + 1}</span><span class="tr-tk" style="min-width:0">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}<span class="nm2">${esc((r.n || "").slice(0, 20))}</span></span><span>${qChip(r.quad)}${r.ext ? `<span class="qd" style="background:#f59e0b22;color:#fbbf24" title="${nf(0).format(r.s50)}% sobre la media de 50: esperar retroceso">⚠ estirada</span>` : ""}</span><span class="${r.s50 >= 0 ? "pos" : "neg"}" style="font-size:12px" title="Distancia a la media de 50">${pt(r.s50)}</span><span class="sc2" style="color:${scCol(r.score / 100)}">${r.score}</span></div>`).join("") + `<div class="dim" style="font-size:11.5px;margin-top:8px">El % es la distancia a la media de 50. Más de 12% = ya subió mucho: vigilar y esperar retroceso.</div>`;
  goSym($("top"));
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
    D.fund = new Map([...snap.rows.values()].map((r) => { const x = derive(r); return [r.s, { revG: x.revG, epsG: x.epsG }]; }));
  } catch (e) { console.warn(e); }
  if (!D.mcap?.size) D.mcap = new Map(D.tech?.rows.map((r) => [r.s, 1]) || []);
}

mountHelp({
  check: "<b>Checklist de compra para momentum.</b> Arriba: si el mercado acompaña (régimen ≥50 = comprar normal; 35–50 = mitad del tamaño; menos de 35 = no comprar).<br>Después, 8 criterios por acción: <b>sector fuerte</b> (Líder o Mejorando), <b>acción Líder</b>, <b>tendencia ≥16/20</b>, <b>entrada ≥80</b>, <b>stop a 8% o menos</b>, <b>sin estirar</b> (menos de 12% sobre la media de 50 y RSI ≤65), <b>crece</b> (ventas y BPA en suba) y <b>sin balance en 7 días</b>.<br>Ordenadas por cuántos cumplen. <b>Cómo comprar:</b> entrá según el setup (rebote en la media 50, ruptura de la base o de máximos), stop 3% debajo de la media de 50 (máx. 7–8%), tamaño para perder 1% de la cartera si salta el stop, vendé un tercio a +20–25% y salí del resto si cierra 2 días bajo la media de 50.",
  heat: "<b>Cada cuadrado es una acción</b>: el tamaño es su capitalización y el color cuánto subió o bajó en el período elegido.<br><span class='g'>Verde</span> = sube · <span class='r'>rojo</span> = baja · gris = casi sin cambio. La barra de colores dice qué % satura el color.<br>Tocá el <b>nombre del sector</b> para ver solo ese sector, y una acción para abrir su ficha. Si un sector está todo verde en 1 mes y 3 meses, ahí está entrando el dinero.",
  tech: "<b>Qué busca:</b> acciones que <b>están mejorando</b> contra el S&P 500, con tendencia armada y sin estar estiradas.<br><b>Tendencia (20)</b>: precio sobre las medias de 50/150/200, ordenadas y con la de 200 subiendo.<br><b>Fuerza (20)</b>: cuánto le ganó al S&P 500 en 3–12 meses.<br><b>Mejora (25)</b>: la línea de fuerza relativa (precio ÷ S&P 500) sube en 1 y 3 meses; suma extra si está en máximos del año.<br><b>Contracción (15)</b>: volatilidad y rango achicándose (se prepara para moverse). Solo suma con tendencia.<br><b>Setup (20)</b>: cerca del máximo de 52 semanas y no más de ~12% sobre la media de 50.<br><b>Estado</b>: <span style='color:#22c55e'>Líder</span> = fuerte y sigue ganando · <span style='color:#3b82f6'>Mejorando</span> = débil pero dando vuelta · <span class='y'>Debilitándose</span> = fuerte pero perdiendo ritmo · <span class='r'>Rezagada</span>.<br><b>Cómo usarlo para comprar:</b> 1) elegí score 70+ en estado Líder o Mejorando; 2) sin ⚠ estirada (si está estirada, esperá que vuelva hacia la media de 50); 3) mejor si su sector también está Líder o Mejorando; 4) entrada cuando rompe el máximo de la consolidación con volumen, o en un retroceso a la media de 50 que rebota; 5) stop debajo del último mínimo o de la media de 50 (−7/−8% máximo). <br><b>Pestañas:</b> <b>Cerca de entrada</b> (la principal) = acciones fuertes que hoy están en zona de compra, ordenadas por puntaje de entrada: calidad técnica (40) + cercanía a la media de 50, RSI 40–55, compresión y posición en el rango (60). Muestra el tipo de setup y cuánto perdés si ponés el stop 3% debajo de la media de 50 (ideal menos de 8%). <b>Dando vuelta</b> = todavía débiles pero girando, ordenadas por Giro (cuánto le ganan al S&P en 3 semanas, mejora de la fuerza, medias que recuperan) + zona de compra: más riesgo, pero entrás antes.",
  top: "<b>Las 10 acciones con mayor score técnico</b> de todo el universo (tendencia, fuerza, mejora, contracción y setup).<br>Son las líderes del mercado, pero muchas ya subieron fuerte: el % al lado es la distancia a su media de 50. <span class='g'>Cerca de 0–5%</span> = todavía comprable · <span class='y'>más de 12% o ⚠ estirada</span> = esperar un retroceso a la media antes de entrar.<br>Para entradas concretas usá el cuadro <b>Cerca de entrada</b>.",
  rsi: "<b>RSI de 14 ruedas</b>: mide si la suba o baja reciente fue exagerada. No es señal de compra por sí solo: <b>se usa para el momento de entrada</b>.<br><span class='r'>Más de 70 = sobrecomprada</span>: no conviene entrar ahí; esperá que lateralice o retroceda (una acción líder puede quedarse arriba de 70 mucho tiempo, no es para vender por eso).<br><span class='g'>Menos de 30 = sobrevendida</span>: sirve solo si la acción sigue en tendencia alcista (sobre su media de 200) y su estado es Líder o Mejorando: es un retroceso dentro de una suba. Si está Rezagada, puede seguir cayendo.",
  secs: "<b>Qué busca:</b> en qué sectores y subsectores está <b>entrando</b> el dinero.<br>Cada sector tiene un punto de color con su <b>estado</b> (igual que el RRG): <span style='color:#22c55e'>verde Líder</span>, <span style='color:#3b82f6'>azul Mejorando</span>, <span class='y'>amarillo Debilitándose</span>, <span class='r'>rojo Rezagado</span>. La flecha es cuánto le ganó (▲) o perdió (▼) al S&P 500 en las últimas 3 semanas; están ordenados de mayor a menor mejora.<br><b>RS rating</b> (1–99): fuerza de 12 meses comparada con los otros sectores/subsectores.<br><b>Cómo usarlo:</b> buscá sectores en azul o verde con flecha ▲, después el subsector más fuerte dentro de ese sector, y adentro las acciones Líder o Mejorando con buen score técnico. Evitá comprar en sectores rojos aunque la acción se vea barata.",
});
async function loadMkt() {
  const [R, B, w0, w1] = await Promise.all([fetch("/api/overview?view=regime").then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch("/data/breadth.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null), ...[0, 1].map((w) => fetch("/api/overview?view=week&w=" + w).then((r) => (r.ok ? r.json() : null)).catch(() => null))]);
  D.reg = R ? regimeGroups(R, B) : null;
  D.earn = new Map(); for (const W of [w0, w1]) for (const d of W?.days || []) for (const e of d.earnings || []) D.earn.set(e.s, d.date);
}
// ---------- Checklist de compra (método momentum) ----------
const CRIT = [
  ["sec", "Sector fuerte", "Su sector está Líder o Mejorando (el dinero entra ahí)"],
  ["lead", "Acción Líder", "Fuerte contra el S&P 500 y sigue ganando"],
  ["trend", "Tendencia ≥16", "Precio sobre medias de 50/150/200, ordenadas y subiendo"],
  ["ent", "Entrada ≥80", "Puntaje de entrada: calidad + zona de compra"],
  ["risk", "Stop ≤8%", "Stop 3% debajo de la media de 50 a menos de 8% de distancia"],
  ["calm", "Sin estirar", "Menos de 12% sobre la media de 50 y RSI 65 o menos"],
  ["grow", "Crece", "Ventas y ganancias por acción creciendo"],
  ["earn", "Sin balance 7 días", "No presenta resultados en los próximos 7 días (un balance puede saltar el stop)"],
];
function renderCheck() {
  if (!D.tech) return;
  const secQ = new Map(D.tech.sectors.map((x) => [x.sec, x.quad]));
  const today = new Date(), lim = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10), t0 = today.toISOString().slice(0, 10);
  const rows = D.tech.rows.map((r) => {
    const e = entry(r), rk = stopRisk(r), f = D.fund?.get(r.s), ed = D.earn?.get(r.s);
    const c = {
      sec: [["lead", "impr"].includes(secQ.get(r.sec)), `Sector: ${QUAD[secQ.get(r.sec)]?.[0] || "—"}`],
      lead: [r.quad === "lead", `Estado: ${QUAD[r.quad]?.[0] || "—"}`],
      trend: [r.trend >= 16, `Tendencia ${r.trend}/20`],
      ent: [(e?.v ?? 0) >= 80, `Entrada ${e?.v ?? "—"}`],
      risk: [rk > 0 && rk <= 8, rk > 0 ? `Riesgo al stop −${nf(1).format(rk)}%` : "Debajo de la media de 50"],
      calm: [r.s50 <= 12 && r.rsi <= 65, `${pt(r.s50)} vs media 50 · RSI ${nf(0).format(r.rsi)}`],
      grow: [f ? f.revG > 0 && f.epsG > 0 : false, f ? `Ventas ${pt(f.revG)} · BPA ${pt(f.epsG)}` : "Sin datos"],
      earn: [!(ed && ed >= t0 && ed <= lim), ed && ed >= t0 && ed <= lim ? `Balance el ${ed.slice(8)}/${ed.slice(5, 7)}` : "Sin balance cercano"],
    };
    return { ...r, e, rk, c, n: CRIT.filter(([k]) => c[k][0]).length };
  }).sort((a, b) => b.n - a.n || (b.e?.v ?? 0) - (a.e?.v ?? 0)).slice(0, 15);
  const g = D.reg, sc = g?.score, ex = sc != null ? expoOf(sc) : null;
  const mk = sc == null ? "" : `<div class="ck-mk" style="border-color:${ex[2]};background:${ex[2]}14"><div><b style="color:${ex[2]};font-size:20px">${sc}</b><span>/100</span></div><div><b>Régimen de mercado: ${sc >= 50 ? "se puede comprar" : sc >= 35 ? "comprar con la mitad del tamaño" : "no es momento de comprar"}</b><br><span>Exposición sugerida ${ex[0]} · ${ex[1]}. ${sc < 50 ? "Con el mercado así, aunque una acción cumpla todo, usá posiciones chicas." : ""}</span></div></div>`;
  const ic = (v, tip) => `<td title="${esc(tip)}"><span class="ck ${v ? "y" : "n"}">${v ? "✓" : "✗"}</span></td>`;
  $("check").className = "";
  $("check").innerHTML = mk + `<div class="tr-int">Las acciones que más criterios del método cumplen hoy. Pasá el mouse por cada ✓/✗ para ver el dato. Ideal: <b>8/8</b>; con 6–7 revisá qué le falta.</div>
    <table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th>Cumple</th>${CRIT.map(([, l, t]) => `<th title="${esc(t)}">${l}</th>`).join("")}<th class="l">Setup</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span></td><td class="tr-sc" style="color:${scCol(r.n / 8)}">${r.n}/8</td>${CRIT.map(([k]) => ic(r.c[k][0], r.c[k][1])).join("")}<td class="l" style="font-size:12.5px">${setupOf(r)[0]}</td></tr>`).join("")}</tbody></table>`;
  goSym($("check"));
}
loadTech().then(() => Promise.all([loadCaps(), loadMkt()])).then(() => { renderHeat(); renderCheck(); });
