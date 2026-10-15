import { UNIVERSE } from "/lib/universe.js";
import { PROFILES, LYNCH, ok, derive, scoreAll, fmt, fmtCap, nf, scoreCls } from "/js/score.js";
import { $, esc, loadLocal, state, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { fetchSignals, signalHistory, signalCard, signalChips, notifyNew, askNotifications, SIGNAL_CSS } from "/js/signals.js";

const D = { range: "1y", chart: null, hidden: new Set(loadLocal("dash_hidden", [])), heatMode: "rel", ov: null };
const pctTxt = (v, d = 2) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="na">—</span>');
const go = (s) => { location.href = "/empresa.html?s=" + encodeURIComponent(s); };

function spark(vals, up) {
  const v = vals.filter(ok); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), W = 150, H = 32;
  const pts = vals.map((x, i) => (ok(x) ? `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 2 - ((x - mn) / (mx - mn || 1)) * (H - 4)).toFixed(1)}` : null)).filter(Boolean).join(" ");
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "#22c55e" : "#ef4444"}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------- Mercado ----------
async function loadOverview() {
  const r = await fetch("/api/overview"); if (!r.ok) throw new Error("overview " + r.status);
  D.ov = await r.json();
  const fmtP = (m) => (m.symbol === "^TNX" ? nf(2).format(m.price) + "%" : m.symbol === "BTC-USD" ? "US$ " + nf(0).format(m.price) : nf(2).format(m.price));
  $("tiles").innerHTML = D.ov.market.map((m) => {
    const inv = m.symbol === "^VIX";
    return `<div class="tile" title="1 semana ${m.w1 ?? "—"}% · 1 mes ${m.m1 ?? "—"}% · en el año ${m.ytd ?? "—"}%">
      <div class="n"><span>${esc(m.name)}</span><span>${esc(m.symbol.replace("^", ""))}</span></div>
      <div class="p num">${fmtP(m)}</div>
      <div class="c num">${pctTxt(m.d1)} <span class="na">hoy</span> · ${pctTxt(m.ytd, 1)} <span class="na">año</span></div>
      ${spark(m.spark, inv ? m.spark.at(-1) <= m.spark[0] : m.spark.at(-1) >= m.spark[0])}</div>`;
  }).join("");
  renderHeat();
}
function heatColor(v, scale) {
  if (!ok(v)) return "transparent";
  const a = Math.min(1, Math.abs(v) / scale) * 0.75;
  return v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`;
}
function renderHeat() {
  if (!D.ov) return;
  const rel = D.heatMode === "rel", cols = [["d1", "Hoy", 1.5], ["w1", "1 semana", 3], ["m1", "1 mes", 5], ["m3", "3 meses", 9], ["ytd", "En el año", 15], ["y1", "12 meses", 20]];
  const row = (x) => `<tr><td class="l"><b>${esc(x.symbol)}</b> <span class="na">${esc(x.name)}</span></td><td class="num">${nf(2).format(x.price)}</td>${cols.map(([k, , sc]) => { const v = rel ? x["rel_" + k] : x[k]; return `<td style="background:${heatColor(v, sc)}">${ok(v) ? (v >= 0 ? "+" : "") + nf(1).format(v) + "%" : "—"}</td>`; }).join("")}</tr>`;
  const sort = (a) => [...a].sort((p, q) => (q[(rel ? "rel_" : "") + "m1"] ?? -99) - (p[(rel ? "rel_" : "") + "m1"] ?? -99));
  $("heat").innerHTML = `<thead><tr><th class="l">${rel ? "Diferencia contra el S&P 500" : "Rendimiento"}</th><th>Precio</th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
    <tr><td colspan="8" class="l na" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em">Sectores</td></tr>${sort(D.ov.sectors).map(row).join("")}
    <tr><td colspan="8" class="l na" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em">Industrias</td></tr>${sort(D.ov.industries).map(row).join("")}</tbody>`;
}

async function loadMarket() {
  const r = await fetch("/api/market"); if (!r.ok) throw new Error("market " + r.status);
  const m = await r.json(), fg = m.fearGreed || {}, vix = m.vix || {};
  const lbl = { "extreme fear": "Miedo extremo", fear: "Miedo", neutral: "Neutral", greed: "Codicia", "extreme greed": "Codicia extrema" };
  $("sentiment").innerHTML = `<h3>Sentimiento</h3>
    <div class="gauge"><div class="big num">${ok(fg.score) ? Math.round(fg.score) : "—"}</div><div><b>${esc(lbl[fg.rating] || fg.rating || "")}</b><div class="na" style="font-size:12px">Fear & Greed de CNN (0-100)</div></div></div>
    <div class="meter"><i style="left:calc(${fg.score ?? 50}% - 2px)"></i></div>
    <div class="kv"><span>Hace una semana</span><span class="num">${ok(fg.previousWeek) ? Math.round(fg.previousWeek) : "—"}</span></div>
    <div class="kv"><span>Hace un mes</span><span class="num">${ok(fg.previousMonth) ? Math.round(fg.previousMonth) : "—"}</span></div>
    <div class="kv"><span>VIX (volatilidad esperada)</span><span class="num">${ok(vix.value) ? nf(2).format(vix.value) : "—"} ${ok(vix.changePercent) ? pctTxt(vix.changePercent) : ""}</span></div>
    <div class="na" style="font-size:11.5px;margin-top:6px">${ok(vix.value) ? (vix.value < 15 ? "Calma: el mercado no espera sobresaltos." : vix.value < 22 ? "Volatilidad normal." : vix.value < 30 ? "Nervios: coberturas caras." : "Pánico: históricamente, zona de oportunidades.") : ""}</div>`;
  const t = (m.treasuries || []).filter((x) => ok(x.yield));
  const mx = Math.max(...t.map((x) => x.yield), 1), mn = Math.min(...t.map((x) => x.yield), 0) * 0.85;
  const y2 = t.find((x) => x.key === "2y")?.yield, y10 = t.find((x) => x.key === "10y")?.yield, y3m = t.find((x) => x.key === "3m")?.yield;
  const sp = ok(y2) && ok(y10) ? (y10 - y2) * 100 : null, sp3 = ok(y3m) && ok(y10) ? (y10 - y3m) * 100 : null;
  $("curve").innerHTML = `<h3>Curva de tasas EE.UU.</h3>
    <div class="curve">${t.map((x) => `<div style="height:${8 + ((x.yield - mn) / (mx - mn || 1)) * 70}px"><b>${nf(2).format(x.yield)}%</b></div>`).join("")}</div>
    <div class="curve-l">${t.map((x) => `<span>${esc(x.label)}</span>`).join("")}</div>
    <div class="kv" style="margin-top:8px"><span>Spread 10 años − 2 años</span><span class="num ${sp >= 0 ? "pos" : "neg"}">${ok(sp) ? (sp >= 0 ? "+" : "") + nf(0).format(sp) + " pb" : "—"}</span></div>
    <div class="kv"><span>Spread 10 años − 3 meses</span><span class="num ${sp3 >= 0 ? "pos" : "neg"}">${ok(sp3) ? (sp3 >= 0 ? "+" : "") + nf(0).format(sp3) + " pb" : "—"}</span></div>
    <div class="na" style="font-size:11.5px;margin-top:6px">${ok(sp) ? (sp < 0 ? "Curva invertida: históricamente anticipa desaceleración." : sp < 50 ? "Curva casi plana." : "Curva con pendiente positiva: escenario normal de crecimiento.") : ""}</div>`;
}

// ---------- Señales de rotación ----------
async function loadSignals() {
  if (!document.getElementById("sg-css")) { const st = document.createElement("style"); st.id = "sg-css"; st.textContent = SIGNAL_CSS; document.head.appendChild(st); }
  const [list, hist] = await Promise.all([fetchSignals(), signalHistory()]);
  const strong = list.filter((s) => ["por_explotar", "cargando"].includes(s.status)).slice(0, 8);
  $("signals").innerHTML = (strong.length ? `<div class="sg-wrap">${strong.map((s) => signalCard(s, hist)).join("")}</div>` : `<div class="card na">Ahora no hay sectores ni industrias cargando en Improving hacia Leading.</div>`) +
    signalChips(list, "cruzo", "Ya cruzaron a Leading:") + signalChips(list, "perdiendo", "Perdiendo fuerza:") +
    `<div class="sg-more"><a href="#" id="notifBtn" style="color:#93c5fd">🔔 Avisarme cuando aparezca una señal fuerte</a></div>`;
  $("notifBtn").onclick = (e) => { e.preventDefault(); askNotifications(); };
  notifyNew(list);
}

// ---------- Rotación acumulada (gráfico) ----------
const RANGES = [["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["1y", "1A"], ["3y", "3A"]];
async function loadChart() {
  $("ranges").innerHTML = RANGES.map(([k, l]) => `<button data-r="${k}" class="${k === D.range ? "on" : ""}">${l}</button>`).join("");
  const r = await fetch(`/api/sectors?range=${D.range}`); if (!r.ok) throw new Error("sectors " + r.status);
  const j = await r.json();
  const series = j.series.filter((s) => !s.is_benchmark);
  const labels = (series[0]?.dates || []).map((t) => new Date(t).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: D.range === "3y" ? "2-digit" : undefined }));
  const sets = series.map((s) => ({ label: `${s.symbol} · ${s.name}`, sym: s.symbol, data: s.rel_spread_pct, borderColor: s.color, backgroundColor: s.color, borderWidth: 1.8, pointRadius: 0, tension: 0.2, hidden: D.hidden.has(s.symbol), spanGaps: true }));
  if (D.chart) D.chart.destroy();
  D.chart = new Chart($("relChart"), {
    type: "line", data: { labels, datasets: [...sets, { label: "S&P 500", data: labels.map(() => 0), borderColor: "#64748b", borderDash: [4, 4], borderWidth: 1, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { itemSort: (a, b) => b.raw - a.raw, callbacks: { label: (c) => `${c.dataset.label}: ${ok(c.raw) ? (c.raw >= 0 ? "+" : "") + nf(1).format(c.raw) + "%" : "—"}` } } },
      scales: { x: { ticks: { color: "#64748b", maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { color: "#64748b", callback: (v) => v + "%" }, grid: { color: "#1e2a44" } } } },
  });
  const last = (s) => s.rel_spread_pct.filter(ok).at(-1);
  $("legend").innerHTML = [...series].sort((a, b) => (last(b) ?? -99) - (last(a) ?? -99)).map((s) => `<span data-s="${s.symbol}" class="${D.hidden.has(s.symbol) ? "off" : ""}"><i style="background:${s.color}"></i>${esc(s.symbol)} ${esc(s.name)} <b class="${last(s) >= 0 ? "pos" : "neg"}">${ok(last(s)) ? (last(s) >= 0 ? "+" : "") + nf(1).format(last(s)) + "%" : ""}</b></span>`).join("");
  // Alertas de fuerza relativa
  const alerts = Object.entries(j.alerts || {}).filter(([, a]) => ok(a.z)).sort((a, b) => b[1].z - a[1].z);
  const tag = (st) => st === "rotacion_alcista" ? '<span class="badge cand">Entra plata</span>' : st === "rotacion_bajista" ? '<span class="badge" style="background:var(--bad-bg);color:var(--bad-tx);border-color:transparent">Sale plata</span>' : '<span class="badge">Neutral</span>';
  $("alerts").innerHTML = `<table class="mini"><tbody>${alerts.map(([s, a]) => `<tr><td class="l"><b>${esc(s)}</b> <span class="na">${esc(j.meta?.[s]?.name || "")}</span></td><td class="num">${pctTxt(a.momentum_20d, 1)} <span class="na">vs S&P en 20 ruedas</span></td><td class="num">z ${nf(2).format(a.z)}</td><td>${tag(a.status)}</td></tr>`).join("")}</tbody></table>`;
  $("alerts").className = "";
}

// ---------- Universo: candidatas, movers, amplitud y watchlist ----------
async function loadUniverse() {
  await initSupabase();
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  const rows = [...snap.rows.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(rows, { userMult: userMult(), profW: userProfW() });
  const ext = rows.filter((r) => r.c !== "AR" && !(r.mk || "").includes("REF"));
  const line = (r, extra) => `<tr data-s="${esc(r.s)}"><td class="l"><b>${esc(r.ced || r.s)}</b> <span class="na">${esc((r.n || "").slice(0, 26))}</span></td>${extra}</tr>`;
  const cands = ext.filter((r) => r.cand && r.profile !== "crypto").sort((a, b) => b.score - a.score).slice(0, 8);
  $("cands").className = ""; $("cands").innerHTML = cands.length ? `<table class="mini"><tbody>${cands.map((r) => line(r, `<td class="l na">${esc(PROFILES[r.profile].l)}</td><td class="na">${LYNCH[r.lynch] || ""}</td><td class="num">${pctTxt(r.chg, 1)}</td><td><span class="score ${scoreCls(r.score)}">${r.score}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Hoy no hay candidatas.</div>`;
  const withChg = ext.filter((r) => ok(r.chg) && ok(r.mcap) && r.mcap > 2e9);
  const up = [...withChg].sort((a, b) => b.chg - a.chg).slice(0, 5), dn = [...withChg].sort((a, b) => a.chg - b.chg).slice(0, 5);
  $("movers").className = ""; $("movers").innerHTML = `<table class="mini"><tbody>${[...up, ...dn].map((r) => line(r, `<td class="l na">${esc(PROFILES[r.profile].l)}</td><td class="num">${fmtCap(r.mcap)}</td><td class="num">${pctTxt(r.chg)}</td>`)).join("")}</tbody></table>`;
  // Amplitud
  const n = withChg.length, upN = withChg.filter((r) => r.chg > 0).length;
  const near = ext.filter((r) => ok(r.d52) && r.d52 > -5).length, far = ext.filter((r) => ok(r.d52) && r.d52 < -30).length, all52 = ext.filter((r) => ok(r.d52)).length;
  const medScore = ext.map((r) => r.score).filter(ok).sort((a, b) => a - b);
  $("breadth").innerHTML = `<h3>Amplitud del universo CEDEAR</h3><div class="sub2">${nf(0).format(ext.length)} acciones operables desde Argentina (sin locales)</div>
    <div class="breadth">
      <div><div class="v num">${n ? nf(0).format((upN / n) * 100) : "—"}%</div><div class="l">Suben hoy</div><div class="bar2"><b style="width:${n ? (upN / n) * 100 : 0}%"></b></div></div>
      <div><div class="v num">${all52 ? nf(0).format((near / all52) * 100) : "—"}%</div><div class="l">A menos de 5% de su máximo de 52 semanas</div></div>
      <div><div class="v num">${all52 ? nf(0).format((far / all52) * 100) : "—"}%</div><div class="l">Más de 30% debajo de su máximo</div></div>
      <div><div class="v num">${nf(0).format(ext.filter((r) => r.cand).length)}</div><div class="l">Candidatas del Screener</div></div>
    </div>`;
  // Watchlist
  let wl = loadLocal("watchlists_v2", null);
  const acc = state.ov.get("__watchlists")?.metrics?.lists;
  if (acc) wl = { lists: acc, active: Object.keys(acc)[0] };
  const name = wl?.active && wl.lists?.[wl.active] ? wl.active : Object.keys(wl?.lists || {})[0];
  const syms = name ? wl.lists[name] : [];
  $("wlName").textContent = name ? `Lista "${name}" · ${syms.length} acciones` : "";
  const wrows = syms.map((s) => rows.find((r) => r.s === s || r.ced === s)).filter(Boolean);
  $("wl").className = ""; $("wl").innerHTML = wrows.length ? `<table class="mini"><tbody>${wrows.map((r) => line(r, `<td class="num">${fmt(r.px)} <span class="na">${esc(r.cur || "")}</span></td><td class="num">${pctTxt(r.chg)}</td><td class="num">${ok(r.fairUp) ? pctTxt(r.fairUp, 0) + ' <span class="na">a tu P. justo</span>' : ""}</td><td><span class="score ${scoreCls(r.score)}">${r.score ?? "—"}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Tu watchlist está vacía. Agregá acciones desde la Watchlist o el Screener.</div>`;
  document.querySelectorAll(".mini tr[data-s]").forEach((tr) => (tr.onclick = () => go(tr.dataset.s)));
  return snap.updated;
}

async function loadAll() {
  $("dot").className = "dot load"; $("statusTxt").textContent = "Cargando el mercado…";
  const tasks = [loadOverview(), loadMarket(), loadSignals(), loadChart(), loadUniverse()];
  const res = await Promise.allSettled(tasks);
  const fails = res.filter((r) => r.status === "rejected");
  fails.forEach((f) => console.warn(f.reason));
  $("dot").className = "dot on";
  $("statusTxt").textContent = `Actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}${fails.length ? ` · ${fails.length} bloques sin datos` : ""} · precios con hasta 15 min de demora`;
}

$("btnReload").onclick = loadAll;
$("heatMode").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; D.heatMode = b.dataset.m; document.querySelectorAll("#heatMode button").forEach((x) => x.classList.toggle("on", x === b)); renderHeat(); };
$("ranges").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; D.range = b.dataset.r; loadChart().catch(() => {}); };
$("legend").onclick = (e) => {
  const s = e.target.closest("[data-s]"); if (!s || !D.chart) return;
  const sym = s.dataset.s; D.hidden.has(sym) ? D.hidden.delete(sym) : D.hidden.add(sym);
  try { localStorage.setItem("dash_hidden", JSON.stringify([...D.hidden])); } catch {}
  const ds = D.chart.data.datasets.find((d) => d.sym === sym); if (ds) ds.hidden = D.hidden.has(sym);
  s.classList.toggle("off", D.hidden.has(sym)); D.chart.update();
};
loadAll();
