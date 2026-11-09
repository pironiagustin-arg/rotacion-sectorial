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
function renderTech() {
  const mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  $("techR").innerHTML = [["all", "Universo"], ["mine", "Mis acciones"]].map(([k, l]) => `<button data-trm="${k}" class="${k === D.trMode ? "on" : ""}">${l}</button>`).join("");
  $("techR").querySelectorAll("[data-trm]").forEach((b) => (b.onclick = () => { D.trMode = b.dataset.trm; saveLocal("dash_tr_mode", D.trMode); renderTech(); }));
  const rows = D.tech.rows.filter((r) => D.trMode === "all" || mine.has(r.s)).sort((a, b) => b.score - a.score).slice(0, 10);
  const cell = (v, m) => `<td><span class="tr-b"><i><u style="width:${(v / m) * 100}%;background:${scCol(v / m)}"></u></i><span style="color:${scCol(v / m)}">${nf(0).format(v)}</span></span></td>`;
  $("tech").className = "";
  $("tech").innerHTML = rows.length ? `<table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th>Score</th><th title="Precio sobre medias de 50/150/200, medias ordenadas y subiendo">Tend.</th><th title="Rendimiento ponderado 3-12 meses contra el S&P 500">Fuerza</th><th title="Volatilidad y rango achicándose (compresión antes de un movimiento)">Contr.</th><th title="Cerca del máximo de 52 semanas y lejos del mínimo">Setup</th><th title="RS rating: percentil de fuerza relativa contra todo el universo (1-99)">RS</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span></td><td class="tr-sc" style="color:${scCol(r.score / 100)}">${r.score}</td>${cell(r.trend, 20)}${cell(r.rs, 25)}${cell(r.contr, 35)}${cell(r.setup, 20)}<td style="color:${scCol(r.rsr / 99)};font-weight:700">${r.rsr}</td></tr>`).join("")}</tbody></table>`
    : '<div class="dim">Ninguna de tus acciones tiene datos técnicos (solo se calculan las que cotizan en EE.UU.).</div>';
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
  const c = (v) => (v >= 70 ? "#4ade80" : v >= 40 ? "#fbbf24" : "#f87171");
  const dotE = (v) => `<span class="dot3" style="background:${v >= 0 ? "#22c55e" : "#ef4444"}"></span>`;
  const dotR = (v) => `<span class="dot3" style="background:${v >= 70 ? "#ef4444" : v <= 30 ? "#22c55e" : "#f59e0b"}"></span>`;
  const stocks = D.tech.rows.filter((r) => r.sec === sel.sec).sort((a, b) => b.rsr - a.rsr).slice(0, 9);
  $("secs").className = "";
  $("secs").innerHTML = `<div class="sx-tabs">${S.map((x) => `<button data-sx="${x.etf}" class="${x === sel ? "on" : ""}" title="${esc(SEC_NAME[x.sec] || "")}">${x.etf}<b style="color:${c(x.rsr)}">${x.rsr}</b></button>`).join("")}</div>
    <div class="sx-subs"><span style="border:none;padding-left:0">${esc(SEC_NAME[sel.sec] || sel.etf)} · subsectores:</span>${sel.subs.sort((a, b) => b.rsr - a.rsr).map((u) => `<span title="${esc(u.etf)} · RSI ${nf(1).format(u.rsi)} · ${pt(u.e200)} vs EMA200">${esc(u.l)} <b style="color:${c(u.rsr)}">${u.etf} ${u.rsr}</b></span>`).join("") || '<span>—</span>'}</div>
    <div class="sx-g">${stocks.map((r) => `<div class="sx-c" data-sym="${esc(r.s)}"><div class="h"><span>${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span><span class="${r.d1 >= 0 ? "pos" : "neg"}" style="font-size:12px">${r.d1 >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(r.d1))}%</span></div><div class="nm">${esc(r.n)}</div>
      <div class="kv"><span>vs EMA200</span><b>${dotE(r.e200)}${pt(r.e200)}</b></div><div class="kv"><span>vs SMA50</span><b>${dotE(r.s50)}${pt(r.s50)}</b></div><div class="kv"><span>RSI 14</span><b>${dotR(r.rsi)}${nf(1).format(r.rsi)}</b></div><div class="kv"><span>RS rating</span><b style="color:${c(r.rsr)}">${r.rsr}</b></div></div>`).join("") || '<div class="dim">Sin acciones del universo en este sector.</div>'}</div>`;
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
  tech: "<b>Score técnico (0–100)</b>, estilo Minervini. Suma 4 partes:<br><b>Tendencia (20)</b>: precio sobre medias de 50/150/200 ruedas, ordenadas y subiendo.<br><b>Fuerza (25)</b>: cuánto le gana al S&P 500 en 3–12 meses.<br><b>Contracción (35)</b>: volatilidad y rango achicándose (se prepara para moverse).<br><b>Setup (20)</b>: cerca del máximo y lejos del mínimo de 52 semanas.<br><b>RS</b>: puesto de 1 a 99 contra todo el universo (99 = la más fuerte).<br><span class='g'>70+</span> buena estructura · <span class='y'>45–70</span> en formación · <span class='r'>menos de 45</span> débil.",
  rsi: "<b>RSI de 14 ruedas</b>: mide si la suba o baja reciente fue exagerada.<br><span class='r'>Más de 70 = sobrecomprada</span>: subió muy rápido, puede corregir o lateralizar (en tendencias fuertes puede quedarse arriba de 70 mucho tiempo).<br><span class='g'>Menos de 30 = sobrevendida</span>: cayó fuerte, posible rebote. Sirve más si la acción sigue arriba de su media de 200 (caída dentro de una tendencia alcista).",
  secs: "<b>Fuerza relativa (RS) de cada sector y subsector</b>, de 1 a 99, contra el resto del mercado.<br><span class='g'>70+</span> = lidera · <span class='y'>40–70</span> = en la media · <span class='r'>menos de 40</span> = rezagado.<br>La idea: buscar acciones fuertes dentro de sectores y subsectores fuertes. Las tarjetas muestran las acciones del sector elegido ordenadas por RS, con su distancia a la EMA200 (tendencia larga) y SMA50 (tendencia media).",
});
loadTech().then(() => loadCaps()).then(() => renderHeat());
