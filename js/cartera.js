import "/js/live.js";
import { UNIVERSE, SECTORS, COUNTRIES } from "/lib/universe.js";
import { PROFILES, LYNCH, ok, derive, scoreAll, nf, scoreCls } from "/js/score.js";
import { $, esc, toast, state, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { fetchArs } from "/js/ars.js";
import { getPortfolio, savePortfolio } from "/js/lists.js";
import { renderEarnings, EARN_CSS } from "/js/earnings.js";

const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st);
document.querySelector('.seg [data-b="cur"]').dataset.b = "profile"; document.querySelector('.seg [data-b="profile"]').textContent = "Industria";

const K = { pf: getPortfolio(), rows: new Map(), ars: null, spy: null, expo: "sec", hist: null };
const BY_CED = new Map(UNIVERSE.filter((u) => u[5]).map((u) => [u[5], u])), BY_SYM = new Map(UNIVERSE.map((u) => [u[0], u]));
const usd = (v, d = 0) => (ok(v) ? "US$ " + nf(d).format(v) : "—");
const ars = (v, d = 0) => (ok(v) ? "$ " + nf(d).format(v) : "—");
const pct = (v, d = 1) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="na">—</span>');
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function resolve(q) {
  q = String(q || "").trim(); if (!q) return null;
  const up = q.toUpperCase().split(" ")[0];
  return BY_CED.get(up) || BY_SYM.get(up) || UNIVERSE.find((u) => u[1].toUpperCase().startsWith(q.toUpperCase())) || null;
}

// ---------- Formulario ----------
$("tickers").innerHTML = UNIVERSE.filter((u) => u[5]).map((u) => `<option value="${esc(u[5])}">${esc(u[1])}</option>`).join("");
$("fD").value = today(); $("fD").max = today();
let hintSeq = 0;
async function prefill() {
  const u = resolve($("fT").value), d = $("fD").value, date = d; K.hist = null;
  if (!u || !d) return;
  const seq = ++hintSeq;
  $("fHint").textContent = `Buscando el precio de ${u[5] || u[0]} del ${d}…`;
  const h = await fetch(`/api/overview?view=hist&ced=${encodeURIComponent(u[5] || "")}&sym=${encodeURIComponent(u[0])}&date=${d}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (seq !== hintSeq) return;
  K.hist = h;
  if (h && !h.ars && h.us && h.ccl && u[5]) {
    // BYMA no tiene historia de ese día (p. ej. cambio de ratio): se estima con el precio en EE.UU. y el CCL de ese día
    const [a, q] = await Promise.all([fetchArs(), fetch("/api/overview?s=" + encodeURIComponent(u[0])).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    const x = a?.cedears?.[u[5]], ccl = a?.implied?.[u[5]]?.ccl, usNow = q?.q?.[u[0]]?.px;
    if (x?.ars && ccl && usNow) { const ratio = (ccl * usNow) / x.ars; h.ars = (h.us * h.ccl) / ratio; h.arsDate = date + " (estimado)"; }
    if (seq !== hintSeq) return;
  }
  if (!h?.ars) { $("fHint").textContent = "No encontré el precio de ese día en BYMA: cargalo a mano."; return; }
  const p = $("fC").value === "ARS" ? h.ars : h.ccl ? h.ars / h.ccl : null;
  if (p && !$("fP").dataset.touched) $("fP").value = p < 100 ? p.toFixed(2) : Math.round(p);
  $("fHint").innerHTML = `Cierre del ${h.arsDate}: ${ars(h.ars, h.ars < 100 ? 2 : 0)}${h.ccl ? ` · CCL ese día ${ars(h.ccl, 2)}` : ""}${h.spy ? ` · SPY ${nf(2).format(h.spy)}` : ""}`;
}
$("fT").onchange = prefill; $("fD").onchange = prefill; $("fC").onchange = () => { $("fP").dataset.touched = ""; prefill(); };
$("fP").oninput = () => ($("fP").dataset.touched = "1");
$("fAdd").onclick = async () => {
  const u = resolve($("fT").value), qty = Number($("fQ").value), price = Number($("fP").value), cur = $("fC").value, date = $("fD").value;
  if (!u) return toast("No encontré ese activo en el universo");
  if (!(qty > 0) || !(price > 0) || !date) return toast("Completá cantidad, precio y fecha");
  if (!K.hist || K.hist.date !== date) await prefill();
  const h = K.hist || {}, ccl0 = h.ccl || K.ars?.medCcl || null;
  const costArs = cur === "ARS" ? qty * price : ccl0 ? qty * price * ccl0 : null;
  const costUsd = cur === "USD" ? qty * price : ccl0 ? (qty * price) / ccl0 : null;
  K.pf.positions.push({ id: Date.now().toString(36), s: u[0], ced: u[5] || u[0], qty, price, cur, date, costArs, costUsd, ccl0, spy0: h.spy || null });
  await savePortfolio(K.pf);
  $("fQ").value = ""; $("fP").value = ""; $("fP").dataset.touched = ""; $("fT").value = ""; K.hist = null;
  toast(`${u[5] || u[0]} agregada a tu cartera`); render(); earnings();
};

// ---------- Valuación ----------
function value(p) {
  const a = K.ars, x = a?.cedears?.[p.ced], ccl = a?.implied?.[p.ced]?.ccl || a?.medCcl || null;
  const r = K.rows.get(p.s), local = BY_SYM.get(p.s)?.[3] === "AR";
  const pxArs = x?.ars ?? null;
  const vArs = ok(pxArs) ? p.qty * pxArs : null;
  const vUsd = ok(vArs) && ccl ? vArs / (local ? a?.medCcl || ccl : ccl) : null;
  const spyNow = K.spy, spyVal = p.costUsd && p.spy0 && spyNow ? (p.costUsd * spyNow) / p.spy0 : null;
  return { pxArs, chg: x?.chg ?? null, vArs, vUsd, spyVal, r };
}
function groups() {
  const g = new Map();
  for (const p of K.pf.positions) {
    const v = value(p), k = p.s;
    const cur = g.get(k) || { s: p.s, ced: p.ced, qty: 0, costArs: 0, costUsd: 0, vArs: 0, vUsd: 0, spyVal: 0, chg: v.chg, pxArs: v.pxArs, r: v.r, lots: 0, miss: false };
    cur.qty += p.qty; cur.costArs += p.costArs || 0; cur.costUsd += p.costUsd || 0; cur.lots++;
    if (ok(v.vArs)) cur.vArs += v.vArs; else cur.miss = true;
    if (ok(v.vUsd)) cur.vUsd += v.vUsd;
    if (ok(v.spyVal)) cur.spyVal += v.spyVal;
    g.set(k, cur);
  }
  return [...g.values()].sort((a, b) => b.vUsd - a.vUsd);
}

function render() {
  const G = groups();
  if (!G.length) {
    $("kpis").innerHTML = ""; $("view").innerHTML = `<div class="empty">Tu cartera está vacía. Agregá tu primera compra arriba: ticker, fecha, cantidad y precio.</div>`; $("expo").innerHTML = ""; return;
  }
  const T = G.reduce((t, x) => ({ vUsd: t.vUsd + x.vUsd, vArs: t.vArs + x.vArs, cUsd: t.cUsd + x.costUsd, cArs: t.cArs + x.costArs, spy: t.spy + x.spyVal, day: t.day + (ok(x.chg) ? x.vArs - x.vArs / (1 + x.chg / 100) : 0) }), { vUsd: 0, vArs: 0, cUsd: 0, cArs: 0, spy: 0, day: 0 });
  const gU = T.vUsd - T.cUsd, gA = T.vArs - T.cArs, vsSpy = T.spy ? (T.vUsd / T.spy - 1) * 100 : null;
  const card = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="s">${s || ""}</div></div>`;
  $("kpis").innerHTML = card("Valor de la cartera", usd(T.vUsd), ars(T.vArs)) +
    card("Ganancia en dólares", `<span class="${gU >= 0 ? "pos" : "neg"}">${gU >= 0 ? "+" : ""}${usd(gU)}</span>`, T.cUsd ? `${pct((gU / T.cUsd) * 100)} sobre ${usd(T.cUsd)} invertidos` : "") +
    card("Ganancia en pesos", `<span class="${gA >= 0 ? "pos" : "neg"}">${gA >= 0 ? "+" : ""}${ars(gA)}</span>`, T.cArs ? `${pct((gA / T.cArs) * 100)} · incluye la suba del dólar` : "") +
    card("Contra el S&P 500", ok(vsSpy) ? pct(vsSpy) : "—", ok(vsSpy) ? (vsSpy >= 0 ? `Le ganás al SPY: con la misma plata en SPY tendrías ${usd(T.spy)}` : `Con la misma plata en SPY tendrías ${usd(T.spy)}`) : "Mismas fechas y montos invertidos en SPY") +
    card("Hoy", `<span class="${T.day >= 0 ? "pos" : "neg"}">${T.day >= 0 ? "+" : ""}${ars(T.day)}</span>`, T.vArs ? pct((T.day / (T.vArs - T.day)) * 100, 2) : "");
  const rowsHtml = G.map((x) => {
    const r = x.r, meta = BY_SYM.get(x.s), w = T.vUsd ? (x.vUsd / T.vUsd) * 100 : null;
    const gu = x.costUsd ? (x.vUsd / x.costUsd - 1) * 100 : null, vs = x.spyVal ? (x.vUsd / x.spyVal - 1) * 100 : null;
    return `<tr><td class="l"><a href="/empresa.html?s=${encodeURIComponent(x.s)}"><b>${esc(x.ced)}</b></a> <span class="na">${esc((meta?.[1] || "").slice(0, 26))}</span>${x.lots > 1 ? ` <span class="na">· ${x.lots} compras</span>` : ""}</td>
      <td class="num">${nf(x.qty % 1 ? 2 : 0).format(x.qty)}</td>
      <td class="num">${ars(x.costArs / x.qty, x.costArs / x.qty < 100 ? 2 : 0)}</td>
      <td class="num">${ars(x.pxArs, x.pxArs < 100 ? 2 : 0)} ${pct(x.chg)}</td>
      <td class="num">${usd(x.vUsd)}</td><td class="num">${ars(x.vArs)}</td>
      <td class="num">${ok(gu) ? `${pct(gu)} <span class="na">${usd(x.vUsd - x.costUsd)}</span>` : "—"}</td>
      <td class="num">${pct(vs)}</td><td class="num">${ok(w) ? nf(1).format(w) + "%" : "—"}</td>
      <td>${r && ok(r.score) ? `<span class="score ${scoreCls(r.score)}">${r.score}</span>` : "—"}</td></tr>`;
  }).join("");
  const lots = [...K.pf.positions].sort((a, b) => b.date.localeCompare(a.date));
  $("view").innerHTML = `<div class="tablewrap"><table><thead><tr><th class="l">Activo</th><th>Cantidad</th><th>Precio promedio</th><th>Precio hoy</th><th>Valor US$</th><th>Valor $</th><th>Ganancia US$</th><th title="Contra haber comprado SPY en las mismas fechas">vs SPY</th><th>Peso</th><th>Score</th></tr></thead>
    <tbody>${rowsHtml}</tbody><tfoot><tr><td class="l">Total</td><td></td><td></td><td></td><td class="num">${usd(T.vUsd)}</td><td class="num">${ars(T.vArs)}</td><td class="num">${pct(T.cUsd ? (gU / T.cUsd) * 100 : null)}</td><td class="num">${pct(vsSpy)}</td><td class="num">100%</td><td></td></tr></tfoot></table></div>
    <details style="margin-top:10px"><summary class="na" style="cursor:pointer;font-size:13px">Compras registradas (${lots.length})</summary>
      <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th class="l">Fecha</th><th class="l">Activo</th><th>Cantidad</th><th>Precio</th><th>Costo US$</th><th>CCL del día</th><th></th></tr></thead><tbody>
      ${lots.map((p) => `<tr><td class="l">${esc(p.date)}</td><td class="l">${esc(p.ced)}</td><td class="num">${nf(p.qty % 1 ? 2 : 0).format(p.qty)}</td><td class="num">${p.cur === "ARS" ? ars(p.price, p.price < 100 ? 2 : 0) : usd(p.price, 2)}</td><td class="num">${usd(p.costUsd)}</td><td class="num">${ars(p.ccl0, 2)}</td><td><button class="rm" data-rm="${esc(p.id)}" aria-label="Borrar compra">×</button></td></tr>`).join("")}</tbody></table></div></details>`;
  // Exposición
  const by = K.expo, agg = new Map();
  for (const x of G) {
    const r = x.r, m = BY_SYM.get(x.s);
    const key = by === "sec" ? SECTORS[r?.sec || m?.[2]] : by === "c" ? COUNTRIES[r?.c || m?.[3]] || m?.[3] : by === "lynch" ? LYNCH[r?.lynch] || "Sin clasificar" : PROFILES[r?.profile]?.l || "—";
    agg.set(key || "—", (agg.get(key || "—") || 0) + x.vUsd);
  }
  const list = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  $("expo").innerHTML = list.map(([k, v]) => { const p = T.vUsd ? (v / T.vUsd) * 100 : 0; return `<div class="r"><span title="${esc(k)}">${esc(k)}</span><div class="b"><i style="width:${p}%"></i></div><span class="num">${nf(1).format(p)}%</span></div>`; }).join("") +
    (list[0] && T.vUsd && list[0][1] / T.vUsd > 0.4 ? `<div class="na" style="font-size:12px;margin-top:6px">⚠ Más del 40% en ${esc(list[0][0])}: cartera concentrada.</div>` : "");
}
$("view").onclick = async (e) => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  K.pf.positions = K.pf.positions.filter((p) => p.id !== b.dataset.rm);
  await savePortfolio(K.pf); render(); toast("Compra borrada");
};
$("expoBy").onclick = (e) => { const b = e.target.closest("[data-b]"); if (!b) return; K.expo = b.dataset.b; document.querySelectorAll("#expoBy button").forEach((x) => x.classList.toggle("on", x === b)); render(); };
$("btnCsv").onclick = () => {
  const lines = [["fecha", "activo", "cantidad", "precio", "moneda", "costo_usd", "ccl_dia"], ...K.pf.positions.map((p) => [p.date, p.ced, p.qty, p.price, p.cur, p.costUsd?.toFixed(2), p.ccl0?.toFixed(2)])];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(",")).join("\n")], { type: "text/csv" })); a.download = "cartera.csv"; a.click();
};
function earnings() {
  const syms = [...new Set(K.pf.positions.map((p) => p.s))].filter((s) => BY_SYM.get(s)?.[3] !== "AR");
  renderEarnings($("earn"), syms, (s) => BY_SYM.get(s)?.[5] || s);
}

async function refreshPrices() {
  const [a, q] = await Promise.all([fetchArs(0), fetch("/api/overview?s=SPY").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  if (a) K.ars = a;
  if (q?.q?.SPY?.px) K.spy = q.q.SPY.px;
  render();
  $("dot").className = "dot on";
  $("statusTxt").innerHTML = `<span class="livedot"></span>Precios de BYMA en vivo · ${state.user ? "guardada en tu cuenta" : "guardada en este navegador (iniciá sesión para tenerla en todos tus dispositivos)"}`;
}
(async () => {
  $("dot").className = "dot load";
  render();
  await initSupabase();
  await loadOverrides();
  K.pf = getPortfolio(); render(); earnings();
  refreshPrices();
  const [snap] = await Promise.all([loadSnapshots(), loadFund()]);
  const rows = [...snap.rows.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(rows, { userMult: userMult(), profW: userProfW() });
  K.rows = new Map(rows.map((r) => [r.s, r])); render();
  setInterval(() => { if (!document.hidden) refreshPrices(); }, 30000);
  state.onAuth = () => { K.pf = getPortfolio(); render(); earnings(); };
})();
