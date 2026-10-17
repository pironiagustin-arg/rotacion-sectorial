import { UNIVERSE } from "/lib/universe.js";
import { PROFILES, LYNCH, ok, derive, scoreAll, fmt, fmtCap, nf, scoreCls } from "/js/score.js";
import { $, esc, loadLocal, state, META, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { startLive } from "/js/live.js";
import { renderEarnings, EARN_CSS, logo } from "/js/earnings.js";
import { fetchArs } from "/js/ars.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";
{ const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st); }

const D = { range: "1y", chart: null, hidden: new Set(loadLocal("dash_hidden", [])), ov: null };
const pctTxt = (v, d = 2) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="na">—</span>');
const liveChg = (s, v, d = 2) => `<span data-live-chg="${esc(s)}" data-live-dec="${d}" class="${v >= 0 ? "pos" : "neg"}">${ok(v) ? (v >= 0 ? "+" : "") + nf(d).format(v) + "%" : "—"}</span>`;
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
  const liveAttr = (m) => `data-live-px="${esc(m.symbol)}"${m.symbol === "^TNX" ? ' data-live-suf="%"' : m.symbol === "BTC-USD" ? ' data-live-pre="US$ " data-live-dec="0"' : ""}`;
  const crypto = (sym) => /-USD$/.test(sym);
  const fmtP2 = (m) => (m.symbol === "^TNX" ? nf(2).format(m.price) + "%" : crypto(m.symbol) ? "US$ " + nf(0).format(m.price) : nf(2).format(m.price));
  const attr = (m) => `data-live-px="${esc(m.symbol)}"${m.symbol === "^TNX" ? ' data-live-suf="%"' : crypto(m.symbol) ? ' data-live-pre="US$ " data-live-dec="0"' : ""}`;
  const item = (m) => `<span class="tk-i" title="1 semana ${m.w1 ?? "—"}% · 1 mes ${m.m1 ?? "—"}% · en el año ${m.ytd ?? "—"}%"><span class="n">${esc(m.name)}</span><b ${attr(m)}>${fmtP2(m)}</b><span class="c ${m.d1 >= 0 ? "pos" : "neg"}" data-live-chg="${esc(m.symbol)}">${ok(m.d1) ? (m.d1 >= 0 ? "+" : "") + nf(2).format(m.d1) + "%" : "—"}</span></span>`;
  const row = D.ov.market.map(item).join("");
  $("tapeIn").innerHTML = row + row;
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
}

// ---------- Universo: candidatas, movers, amplitud y watchlist ----------
async function loadUniverse() {
  await initSupabase();
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  const rows = [...snap.rows.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(rows, { userMult: userMult(), profW: userProfW() });
  D.mcap = new Map(rows.map((r) => [r.s, r.mcap]));
  const ext = rows.filter((r) => r.c !== "AR" && !(r.mk || "").includes("REF"));
  const line = (r, extra) => `<tr data-s="${esc(r.s)}"><td class="l"><b>${esc(r.ced || r.s)}</b> <span class="na">${esc((r.n || "").slice(0, 18))}</span></td>${extra}</tr>`;
  const cands = ext.filter((r) => r.cand && r.profile !== "crypto").sort((a, b) => b.score - a.score).slice(0, 7);
  $("cands").className = ""; $("cands").innerHTML = cands.length ? `<table class="mini"><tbody>${cands.map((r) => line(r, `<td class="l na" style="font-size:11.5px">${esc(PROFILES[r.profile].l)}</td><td class="num">${liveChg(r.s, r.chg, 1)}</td><td><span class="score ${scoreCls(r.score)}">${r.score}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Hoy no hay candidatas.</div>`;
  const withChg = ext.filter((r) => ok(r.chg) && ok(r.mcap) && r.mcap > 2e9);
  const up = [...withChg].sort((a, b) => b.chg - a.chg).slice(0, 5), dn = [...withChg].sort((a, b) => a.chg - b.chg).slice(0, 5);
  // Amplitud
  const spyChg = (await fetch("/api/overview?s=SPY").then((r) => (r.ok ? r.json() : null)).catch(() => null))?.q?.SPY?.chg;
  const n = withChg.length, upN = withChg.filter((r) => r.chg > 0).length;
  const near = ext.filter((r) => ok(r.d52) && r.d52 > -5).length, far = ext.filter((r) => ok(r.d52) && r.d52 < -30).length, all52 = ext.filter((r) => ok(r.d52)).length;
  const medScore = ext.map((r) => r.score).filter(ok).sort((a, b) => a - b);
  $("breadth").innerHTML = `<h3>Amplitud del universo CEDEAR</h3><div class="sub2">${nf(0).format(ext.length)} acciones operables desde Argentina (sin locales)</div>
    <div class="breadth">
      <div><div class="v num">${n ? nf(0).format((upN / n) * 100) : "—"}%</div><div class="l">Suben hoy</div><div class="bar2"><b style="width:${n ? (upN / n) * 100 : 0}%"></b></div></div>
      <div><div class="v num">${all52 ? nf(0).format((near / all52) * 100) : "—"}%</div><div class="l">A menos de 5% de su máximo de 52 semanas</div></div>
      <div><div class="v num">${all52 ? nf(0).format((far / all52) * 100) : "—"}%</div><div class="l">Más de 30% debajo de su máximo</div></div>
      <div><div class="v num">${ok(spyChg) && n ? nf(0).format((withChg.filter((r) => r.chg > spyChg).length / n) * 100) + "%" : "—"}</div><div class="l">Le ganan hoy al S&P 500${ok(spyChg) ? ` (${spyChg >= 0 ? "+" : ""}${nf(2).format(spyChg)}%)` : ""}</div></div>
    </div>`;
  // Watchlist
  let wl = loadLocal("watchlists_v2", null);
  const acc = state.ov.get("__watchlists")?.metrics?.lists;
  if (acc) wl = { lists: acc, active: Object.keys(acc)[0] };
  const name = wl?.active && wl.lists?.[wl.active] ? wl.active : Object.keys(wl?.lists || {})[0];
  const syms = name ? wl.lists[name] : [];
  $("wlName").textContent = name ? `Lista "${name}" · ${syms.length} acciones` : "";
  const wrows = syms.map((s) => rows.find((r) => r.s === s || r.ced === s)).filter(Boolean);
  $("wl").className = ""; $("wl").innerHTML = wrows.length ? `<table class="mini"><tbody>${wrows.map((r) => line(r, `<td class="num"><span data-live-px="${esc(r.s)}">${fmt(r.px)}</span> <span class="na">${esc(r.cur || "")}</span></td><td class="num">${liveChg(r.s, r.chg)}</td><td><span class="score ${scoreCls(r.score)}">${r.score ?? "—"}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Tu watchlist está vacía. Agregá acciones desde la Watchlist o el Screener.</div>`;
  document.querySelectorAll(".mini tr[data-s]").forEach((tr) => (tr.onclick = () => go(tr.dataset.s)));
  return snap.updated;
}

// ---------- Dólar y CEDEARs ----------
async function loadDolar() {
  const d = await fetchArs(0); if (!d) throw new Error("ars");
  const dl = d.dolar || {}, money = (v) => (ok(v) ? "$ " + nf(2).format(v) : "—");
  const byCed = new Map(UNIVERSE.filter((u) => u[5]).map((u) => [u[5], u]));
  const liq = Object.entries(d.implied).filter(([k, x]) => x.volArs > 3e8 && byCed.has(k)).map(([k, x]) => ({ k, s: byCed.get(k)[0], dev: (x.ccl / d.medCcl - 1) * 100 })).filter((x) => Math.abs(x.dev) <= 8).sort((a, b) => a.dev - b.dev);
  const card = (x, i) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.k, 30)}<div><b>${esc(x.k)}</b><small class="${x.dev < 0 ? "pos" : "neg"}">${x.dev >= 0 ? "+" : ""}${nf(2).format(x.dev)}%</small> <span class="rk">#${i + 1}</span></div></a>`;
  $("dolar").className = "";
  $("dolar").innerHTML = `<div class="breadth"><div><div class="v num">${money(d.medCcl)}</div><div class="l">CCL implícito (mediana CEDEARs)</div></div><div><div class="v num">${money(dl.bolsa?.venta)}</div><div class="l">MEP</div></div><div><div class="v num">${money(dl.oficial?.venta)}</div><div class="l">Oficial${ok(dl.oficial?.venta) && ok(d.medCcl) ? ` · brecha ${nf(1).format((d.medCcl / dl.oficial.venta - 1) * 100)}%` : ""}</div></div><div><div class="v num">${money(dl.blue?.venta)}</div><div class="l">Blue</div></div></div>
    <div class="cclh">Más baratos: comprás la acción con un dólar más bajo</div><div class="ccl3">${liq.slice(0, 3).map(card).join("")}</div>
    <div class="cclh">Más caros: conviene evitarlos o esperar</div><div class="ccl3">${liq.slice(-3).reverse().map(card).join("")}</div>`;
}

// ---------- Macro: Fed y calendario económico ----------
const ES = [[/^Core PCE Price Index YoY/i, "PCE núcleo anual"], [/^Core PCE Price Index MoM/i, "PCE núcleo mensual"], [/^PCE Price Index YoY/i, "PCE anual"], [/^PCE Price Index MoM/i, "PCE mensual"],
  [/^Core Inflation Rate YoY/i, "CPI núcleo anual"], [/^Core Inflation Rate MoM/i, "CPI núcleo mensual"], [/^Inflation Rate YoY/i, "CPI anual (inflación)"], [/^Inflation Rate MoM/i, "CPI mensual"],
  [/^Non Farm Payrolls/i, "Empleo no agrícola (NFP)"], [/^Unemployment Rate/i, "Desempleo"], [/^Fed Interest Rate Decision/i, "Decisión de tasa de la Fed"], [/^GDP Growth Rate/i, "PBI trimestral"],
  [/^Retail Sales MoM/i, "Ventas minoristas"], [/^PPI MoM/i, "Precios mayoristas (PPI)"], [/^ISM Manufacturing PMI/i, "ISM manufacturero"], [/^ISM Services PMI/i, "ISM servicios"],
  [/^Michigan Consumer Sentiment/i, "Confianza del consumidor (Michigan)"], [/^JOLTs/i, "Vacantes laborales (JOLTS)"], [/^Existing Home Sales/i, "Venta de casas usadas"], [/^Housing Starts/i, "Inicio de viviendas"],
  [/^Building Permits/i, "Permisos de construcción"], [/^Durable Goods/i, "Bienes durables"], [/^Personal Income/i, "Ingreso personal"], [/^Personal Spending/i, "Gasto personal"], [/^Initial Jobless Claims/i, "Pedidos de subsidio por desempleo"], [/^ADP/i, "Empleo privado ADP"]];
const esName = (t) => (ES.find(([re]) => re.test(t))?.[1]) || t;
// Dirección: +1 si un dato más alto empuja a la Fed a subir (halcón); -1 si lo contrario (desempleo); 0 neutro
const hawkDir = (t) => (/unemployment|jobless/i.test(t) ? -1 : /inflation|pce|ppi|payroll|retail|gdp|ism|durable|jolts|adp|spending|income/i.test(t) ? 1 : 0);
const KEY = /inflation rate|pce|payroll|unemployment rate|interest rate decision|gdp/i;
async function loadMacro() {
  const r = await fetch("/api/overview?view=macro"); if (!r.ok) throw new Error("macro");
  const M = await r.json(), F = M.fed || {}, mt = F.meetings || [], now = Date.now();
  const fd = (t) => new Date(t).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  const fdd = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
  const val = (v, e) => (v == null ? "—" : `${nf(Math.abs(v) < 10 && v % 1 ? (String(v).split(".")[1]?.length > 1 ? 2 : 1) : 0).format(v)}${e.unit === "%" ? "%" : e.scale ? " " + e.scale : ""}`);
  // ---- Calendario
  const ev = M.events.sort((a, b) => a.t - b.t);
  const past = ev.filter((e) => e.t < now && e.actual != null).slice(-8), next = ev.filter((e) => e.t >= now - 3600e3).slice(0, 10);
  const read = (e) => {
    if (e.actual == null || e.forecast == null) return "";
    const d = e.actual - e.forecast, h = hawkDir(e.title);
    if (Math.abs(d) < 1e-9) return `<span class="tag" style="background:var(--panel2);color:var(--muted)">En línea</span>`;
    const up = d > 0, hawk = h === 0 ? null : (up ? h > 0 : h < 0);
    return `<span class="tag" style="background:${hawk == null ? "var(--panel2)" : hawk ? "var(--bad-bg)" : "var(--good-bg)"};color:${hawk == null ? "var(--muted)" : hawk ? "var(--bad-tx)" : "var(--good-tx)"}">${up ? "Arriba" : "Abajo"} del estimado${hawk == null ? "" : hawk ? " · halcón" : " · paloma"}</span>`;
  };
  const rowE = (e, isNext) => `<tr class="${isNext && KEY.test(e.title) ? "next" : ""}"><td class="l na">${fd(e.t)}</td><td class="l"><b style="font-weight:${KEY.test(e.title) ? 600 : 500}">${esc(esName(e.title))}</b> <span class="na">${esc(e.period)}</span></td><td class="num"><b>${val(e.actual, e)}</b></td><td class="num na">${val(e.forecast, e)}</td><td class="num na">${val(e.previous, e)}</td><td class="l">${read(e)}</td></tr>`;
  $("econ").className = "";
  $("econ").innerHTML = `<div class="tablewrap" style="border:none"><table class="econ"><thead><tr><th class="l">Fecha</th><th class="l">Dato</th><th>Resultado</th><th>Estimado</th><th>Previo</th><th class="l">Lectura</th></tr></thead><tbody>
    <tr><td colspan="6" class="l na" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Próximos</td></tr>${next.map((e) => rowE(e, true)).join("") || '<tr><td colspan="6" class="na">Sin datos importantes en las próximas semanas.</td></tr>'}
    <tr><td colspan="6" class="l na" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Últimos resultados</td></tr>${past.reverse().map((e) => rowE(e)).join("")}</tbody></table></div>
    <div class="na" style="font-size:11.5px;margin-top:6px">"Halcón" = presiona a la Fed a subir tasas (suele pesar en tecnología, small caps y bonos largos). "Paloma" = lo contrario. Fuente: TradingView.</div>`;
  // ---- Fed
  const n0 = mt[0];
  if (!n0) { $("fed").innerHTML = `<h3>Fed: qué descuenta el mercado</h3><div class="na">Sin datos de futuros de fed funds.</div>`; return; }
  const bar = (m) => `<div class="pbar"><i style="width:${m.pCut}%;background:#22c55e"></i><i style="width:${m.pHold}%;background:#64748b"></i><i style="width:${m.pHike}%;background:#ef4444"></i></div>`;
  const lastC = mt.at(-1), steps = Math.round((lastC.cumulative || 0) / 25);
  const lastOf = (re) => [...ev].reverse().find((e) => re.test(e.title) && e.actual != null);
  const cpi = lastOf(/^Inflation Rate YoY/i), core = lastOf(/^Core Inflation Rate YoY/i), nfp = lastOf(/^Non Farm Payrolls/i), un = lastOf(/^Unemployment Rate/i);
  const nextKey = next.find((e) => /inflation rate yoy|pce|payroll|interest rate decision/i.test(e.title));
  const dir = n0.pHike >= 50 ? "suba" : n0.pCut >= 50 ? "baja" : "pausa";
  const txt = [];
  txt.push(`<b>Próxima reunión (${fdd(n0.date)}):</b> ${n0.pHold >= 50 ? `lo más probable es que la Fed <b>mantenga la tasa</b> (${n0.pHold}%)` : `el mercado espera una <b>${dir}</b> (${Math.max(n0.pHike, n0.pCut)}%)`}${n0.pHike >= 10 && n0.pHold >= 50 ? `, con ${n0.pHike}% de chances de suba` : ""}${n0.pCut >= 10 && n0.pHold >= 50 ? `, con ${n0.pCut}% de chances de baja` : ""}.`);
  txt.push(`<b>Camino de tasas:</b> hasta ${fdd(lastC.date)} los futuros descuentan ${lastC.cumulative >= 0 ? "+" : ""}${nf(0).format(lastC.cumulative)} pb${Math.abs(steps) >= 1 ? ` (unas ${Math.abs(steps)} ${steps > 0 ? "subas" : "bajas"} de 0,25)` : " (sin cambios relevantes)"}${mt.find((m) => m.pHike >= 50) ? `; la primera suba con más de 50% es el ${fdd(mt.find((m) => m.pHike >= 50).date)}` : mt.find((m) => m.pCut >= 50) ? `; la primera baja con más de 50% es el ${fdd(mt.find((m) => m.pCut >= 50).date)}` : ""}.`);
  if (cpi) txt.push(`<b>Por qué:</b> la inflación (CPI) está en ${nf(1).format(cpi.actual)}%${cpi.forecast != null ? `, ${cpi.actual > cpi.forecast ? "arriba" : cpi.actual < cpi.forecast ? "abajo" : "en línea con"} ${cpi.actual === cpi.forecast ? "lo esperado" : "de lo esperado"} (${nf(1).format(cpi.forecast)}%)` : ""}${cpi.previous != null ? ` y ${cpi.actual > cpi.previous ? "subiendo" : cpi.actual < cpi.previous ? "bajando" : "estable"} contra el mes anterior` : ""}${core ? `; la núcleo, ${nf(1).format(core.actual)}%` : ""}.${nfp ? ` El empleo ${nfp.actual < (nfp.forecast ?? nfp.actual) ? "se enfría" : "sigue firme"} (${nf(0).format(nfp.actual)}K puestos vs ${nfp.forecast != null ? nf(0).format(nfp.forecast) + "K esperados" : "—"}${un ? `, desempleo ${nf(1).format(un.actual)}%` : ""}).` : ""}`);
  if (nextKey) txt.push(`<b>Qué mirar:</b> ${esc(esName(nextKey.title))} el ${fd(nextKey.t)}${nextKey.forecast != null ? ` (estimado ${val(nextKey.forecast, nextKey)})` : ""}. ${/interest rate/i.test(nextKey.title) ? "Más que la decisión, importa el tono de la conferencia." : `Si sale <b>arriba</b> del estimado, sube la probabilidad de ${steps >= 0 ? "más subas" : "que la Fed demore las bajas"}: suele pesar en tecnología, small caps y bonos largos, y fortalece al dólar. Si sale <b>abajo</b>, alivio para acciones de crecimiento.`}`);
  txt.push(`<b>Escenario más probable:</b> ${steps >= 2 ? "Fed en modo ajuste: sectores defensivos, energía y financieras suelen aguantar mejor que tecnología de alto múltiplo." : steps <= -2 ? "Fed bajando tasas: favorece small caps, tecnología, real estate y bonos largos." : "Fed en pausa: el mercado se mueve más por resultados de empresas que por tasas."}`);
  $("fed").innerHTML = `<h3>Fed: qué descuenta el mercado <span class="na" style="font-weight:400;font-size:12px">futuros de fed funds (método FedWatch)</span></h3>
    <div class="fedTop"><div class="fedBig"><div class="l">Tasa actual</div><div class="v num">${F.target ? nf(2).format(F.target[0]) + "–" + nf(2).format(F.target[1]) + "%" : "—"}</div><div class="l">efectiva ${nf(2).format(F.effr)}%</div></div>
      <div class="fedBig" style="flex:1.6"><div class="l">Próxima reunión · ${fdd(n0.date)}</div>${bar(n0)}<div style="display:flex;justify-content:space-between;font-size:12.5px"><span class="pos">Baja ${n0.pCut}%</span><span>Mantiene ${n0.pHold}%</span><span class="neg">Suba ${n0.pHike}%</span></div></div></div>
    <div class="tablewrap" style="border:none;margin-top:8px"><table class="fedPath"><thead><tr><th class="l">Reunión</th><th>Tasa implícita</th><th>Cambio vs hoy</th><th class="l">Probabilidad en esa reunión</th></tr></thead><tbody>
      ${mt.map((m) => `<tr><td class="l">${fdd(m.date)}</td><td class="num">${nf(2).format(m.implied)}%</td><td class="num ${m.cumulative > 0 ? "neg" : m.cumulative < 0 ? "pos" : ""}">${m.cumulative >= 0 ? "+" : ""}${nf(0).format(m.cumulative)} pb</td><td class="l" style="font-size:12px">${m.pHike >= m.pCut ? (m.pHike ? `<span class="neg">suba ${m.pHike}%</span>` : "sin cambios") : `<span class="pos">baja ${m.pCut}%</span>`}</td></tr>`).join("")}</tbody></table></div>
    <div class="fedNote">${txt.map((t) => `<div style="margin-bottom:5px">${t}</div>`).join("")}</div>`;
}

// ---------- Cripto ----------
async function loadCrypto() {
  const [q, ch, fg, gl] = await Promise.all([
    fetch("/api/overview?s=BTC-USD,ETH-USD,SOL-USD").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/overview?view=chart&sym=BTC-USD&range=1y&interval=1d").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("https://api.alternative.me/fng/?limit=31").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    (async () => { try { const c = JSON.parse(localStorage.getItem("cg_global") || "null"); if (c && Date.now() - c.t < 15 * 60e3) return c.d; } catch {} const d = await fetch("https://api.coingecko.com/api/v3/global").then((r) => (r.ok ? r.json() : null)).catch(() => null); if (d) try { localStorage.setItem("cg_global", JSON.stringify({ t: Date.now(), d })); } catch {} return d; })(),
  ]);
  const Q = q?.q || {}, b = Q["BTC-USD"]; if (!b) throw new Error("cripto");
  const pts = (ch?.pts || []).map((p) => p[1]);
  const back = (n) => (pts.length > n ? (pts.at(-1) / pts[pts.length - 1 - n] - 1) * 100 : null);
  const usd = (v, d = 0) => "US$ " + nf(d).format(v);
  const F = fg?.data || [], now = F[0] ? Number(F[0].value) : null, w = F[7] ? Number(F[7].value) : null, m = F[30] ? Number(F[30].value) : null;
  const lbl = (v) => (v == null ? "" : v < 25 ? "Miedo extremo" : v < 45 ? "Miedo" : v <= 55 ? "Neutral" : v < 75 ? "Codicia" : "Codicia extrema");
  const dom = gl?.data?.market_cap_percentage?.btc, mcap = gl?.data?.total_market_cap?.usd, mchg = gl?.data?.market_cap_change_percentage_24h_usd;
  const row = (sym, name, x) => x ? `<div class="cx-row"><span class="tk">${logo(sym.replace("-", ""), sym.replace("-USD", ""), 20)}<b>${name}</b></span><span class="num"><span data-live-px="${sym}" data-live-pre="US$ " data-live-dec="${x.px > 1000 ? 0 : 2}">${usd(x.px, x.px > 1000 ? 0 : 2)}</span> <span data-live-chg="${sym}" class="${x.chg >= 0 ? "pos" : "neg"}">${x.chg >= 0 ? "+" : ""}${nf(2).format(x.chg)}%</span></span></div>` : "";
  $("crypto").className = "";
  $("crypto").innerHTML = `<div class="cx-main"><div><div class="na" style="font-size:12px">Bitcoin</div><div class="p num" data-live-px="BTC-USD" data-live-pre="US$ " data-live-dec="0">${usd(b.px)}</div>
      <div class="cx-chg"><span>24 h ${pctTxt(b.chg)}</span><span>7 d ${pctTxt(back(7), 1)}</span><span>30 d ${pctTxt(back(30), 1)}</span><span>1 año ${pctTxt(back(pts.length - 1), 0)}</span></div></div>
      <div style="width:130px">${spark(pts.slice(-90), back(90) >= 0)}</div></div>
    ${row("ETH-USD", "Ethereum", Q["ETH-USD"])}${row("SOL-USD", "Solana", Q["SOL-USD"])}
    ${ok(dom) ? `<div class="cx-row"><span class="na">Dominancia de BTC · mercado total</span><span class="num">${nf(1).format(dom)}% · US$ ${nf(2).format(mcap / 1e12)} B ${pctTxt(mchg, 1)}</span></div>` : ""}
    ${now != null ? `<div class="fg"><div class="n num" style="color:${now < 45 ? "#f87171" : now > 55 ? "#4ade80" : "#e2e8f0"}">${now}</div><div class="m"><b>${lbl(now)}</b> <span class="na" style="font-size:12px">· Fear & Greed cripto</span>
      <div class="meter"><i style="left:calc(${now}% - 2px)"></i></div><div class="na" style="font-size:11.5px">Hace una semana ${w ?? "—"} · hace un mes ${m ?? "—"}${now < 25 ? " · históricamente, zona de compra" : now > 75 ? " · euforia: cuidado" : ""}</div></div></div>` : ""}`;
}

// ---------- Tu cartera hoy ----------
async function loadPf() {
  const pf = getPortfolio();
  if (!pf.positions.length) { $("pf").className = ""; $("pf").innerHTML = `<div class="na">Todavía no cargaste tu cartera. <a href="/cartera.html" style="color:#93c5fd">Cargá tus compras</a> para ver cuánto ganás en dólares y contra el S&P 500.</div>`; return; }
  const [d, q] = await Promise.all([fetchArs(), fetch("/api/overview?s=SPY").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  const spy = q?.q?.SPY?.px;
  let vU = 0, vA = 0, cU = 0, sV = 0, day = 0; const per = new Map();
  for (const p of pf.positions) {
    const x = d?.cedears?.[p.ced]; if (!x?.ars) continue;
    const ccl = META.get(p.s)?.[3] === "AR" ? d.medCcl : d.implied?.[p.ced]?.ccl || d.medCcl;
    const a = p.qty * x.ars, u = a / ccl;
    vA += a; vU += u; cU += p.costUsd || 0; if (p.spy0 && spy) sV += (p.costUsd * spy) / p.spy0;
    if (ok(x.chg)) day += a - a / (1 + x.chg / 100);
    const g = per.get(p.ced) || { ced: p.ced, s: p.s, chg: x.chg, u: 0 }; g.u += u; per.set(p.ced, g);
  }
  const g = vU - cU, vs = sV ? (vU / sV - 1) * 100 : null, money = (v) => "$ " + nf(0).format(v), usd = (v) => "US$ " + nf(0).format(v);
  const movers = [...per.values()].filter((x) => ok(x.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
  $("pf").className = "";
  $("pf").innerHTML = `<div class="breadth">
    <div><div class="v num">${usd(vU)}</div><div class="l">${money(vA)}</div></div>
    <div><div class="v num ${day >= 0 ? "pos" : "neg"}">${day >= 0 ? "+" : ""}${money(day)}</div><div class="l">Hoy (${pctTxt(vA ? (day / (vA - day)) * 100 : null)})</div></div>
    <div><div class="v num ${g >= 0 ? "pos" : "neg"}">${g >= 0 ? "+" : ""}${usd(g)}</div><div class="l">Ganancia en dólares (${pctTxt(cU ? (g / cU) * 100 : null, 1)})</div></div>
    <div><div class="v num">${ok(vs) ? pctTxt(vs, 1) : "—"}</div><div class="l">Contra el S&P 500</div></div></div>
    ${movers.length ? `<div class="cclh">Lo que más se mueve hoy</div><div class="ccl3" style="grid-template-columns:repeat(${Math.min(4, movers.length)},1fr)">${movers.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.ced, 26)}<div><b>${esc(x.ced)}</b><small class="${x.chg >= 0 ? "pos" : "neg"}">${x.chg >= 0 ? "+" : ""}${nf(1).format(x.chg)}%</small></div></a>`).join("")}</div>` : ""}`;
}

async function loadAll() {
  $("dot").className = "dot load"; $("statusTxt").textContent = "Cargando el mercado…";
  const tasks = [loadOverview(), loadMarket(), loadChart(), loadUniverse().then((u) => { const syms = [...new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)])].filter((s) => META.get(s)?.[3] !== "AR"); $("earn").className = ""; const all = UNIVERSE.filter((r) => r[3] !== "AR" && !r[4].includes("REF")).map((r) => r[0]); renderEarnings($("earn"), syms, (s) => META.get(s)?.[5] || s, all, (s) => D.mcap?.get(s)); loadPf().catch(() => {}); return u; }), loadDolar(), loadCrypto(), loadMacro()];
  const res = await Promise.allSettled(tasks);
  const fails = res.filter((r) => r.status === "rejected");
  fails.forEach((f) => console.warn(f.reason));
  $("dot").className = "dot on";
  $("statusTxt").innerHTML = `Actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}${fails.length ? ` · ${fails.length} bloques sin datos` : ""} · <span class="livedot"></span>precios en vivo`;
}

$("btnReload").onclick = loadAll;
$("ranges").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; D.range = b.dataset.r; loadChart().catch(() => {}); };
$("legend").onclick = (e) => {
  const s = e.target.closest("[data-s]"); if (!s || !D.chart) return;
  const sym = s.dataset.s; D.hidden.has(sym) ? D.hidden.delete(sym) : D.hidden.add(sym);
  try { localStorage.setItem("dash_hidden", JSON.stringify([...D.hidden])); } catch {}
  const ds = D.chart.data.datasets.find((d) => d.sym === sym); if (ds) ds.hidden = D.hidden.has(sym);
  s.classList.toggle("off", D.hidden.has(sym)); D.chart.update();
};
loadAll();
startLive(15000);
