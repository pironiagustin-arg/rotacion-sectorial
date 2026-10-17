// Dashboard: pocas palabras, un dato protagonista por tarjeta.
import { UNIVERSE } from "/lib/universe.js";
import { ok, derive, scoreAll, fmt, nf } from "/js/score.js";
import { $, esc, loadLocal, saveLocal, state, META, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { startLive } from "/js/live.js";
import { renderEarnings, EARN_CSS, logo } from "/js/earnings.js";
import { fetchArs } from "/js/ars.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";
{ const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st); }

const D = { range: loadLocal("dash_range", "3m"), mcap: new Map() };
const pc = (v, d = 1) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="dim">—</span>');
const liveChg = (s, v, d = 1) => `<span data-live-chg="${esc(s)}" data-live-dec="${d}" class="${v >= 0 ? "pos" : "neg"}">${ok(v) ? (v >= 0 ? "+" : "") + nf(d).format(v) + "%" : "—"}</span>`;
const scPill = (s) => `<span class="sc ${!ok(s) ? "" : s >= 65 ? "g" : s >= 45 ? "m" : "b"}">${s ?? "—"}</span>`;
const go = (s) => { location.href = "/empresa.html?s=" + encodeURIComponent(s); };

function spark(vals, up, W = 120, H = 36) {
  const v = vals.filter(ok); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v);
  const pts = vals.map((x, i) => (ok(x) ? `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 2 - ((x - mn) / (mx - mn || 1)) * (H - 4)).toFixed(1)}` : null)).filter(Boolean).join(" ");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "#22c55e" : "#ef4444"}" stroke-width="1.8"/></svg>`;
}

// ---------- Cinta de cotizaciones ----------
async function loadTape() {
  const r = await fetch("/api/overview"); if (!r.ok) throw new Error("overview");
  const ov = await r.json();
  const crypto = (s) => /-USD$/.test(s);
  const fp = (m) => (m.symbol === "^TNX" ? nf(2).format(m.price) + "%" : crypto(m.symbol) ? "US$ " + nf(0).format(m.price) : nf(2).format(m.price));
  const attr = (m) => `data-live-px="${esc(m.symbol)}"${m.symbol === "^TNX" ? ' data-live-suf="%"' : crypto(m.symbol) ? ' data-live-pre="US$ " data-live-dec="0"' : ""}`;
  const row = ov.market.map((m) => `<span class="tk-i"><span class="n">${esc(m.name)}</span><b ${attr(m)}>${fp(m)}</b><span class="c ${m.d1 >= 0 ? "pos" : "neg"}" data-live-chg="${esc(m.symbol)}">${ok(m.d1) ? (m.d1 >= 0 ? "+" : "") + nf(2).format(m.d1) + "%" : "—"}</span></span>`).join("");
  $("tapeIn").innerHTML = row + row;
}

// ---------- Sentimiento y tasas ----------
function gauge(v) {
  const cx = 90, cy = 86, R = 70, P = (p) => { const a = Math.PI * (1 - p / 100); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const seg = (f, t, c) => { const [x1, y1] = P(f), [x2, y2] = P(t); return `<path d="M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}" stroke="${c}" stroke-width="12" fill="none"/>`; };
  const [x, y] = P(Math.max(0, Math.min(100, v)));
  return `<svg width="180" height="100" viewBox="0 0 180 100" role="img" aria-label="Índice de miedo y codicia: ${Math.round(v)}">${seg(0, 25, "#b91c1c")}${seg(25, 45, "#ef4444")}${seg(45, 55, "#eab308")}${seg(55, 75, "#22c55e")}${seg(75, 100, "#15803d")}
    <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="#e2e8f0"/></svg>`;
}
async function loadMarket() {
  const r = await fetch("/api/market"); if (!r.ok) throw new Error("market");
  const m = await r.json(), fg = m.fearGreed || {}, vix = m.vix || {};
  const lbl = { "extreme fear": "Miedo extremo", fear: "Miedo", neutral: "Neutral", greed: "Codicia", "extreme greed": "Codicia extrema" };
  const keep = $("breadth")?.innerHTML;
  $("sentiment").innerHTML = `<div class="lbl">Sentimiento</div>
    <div class="gauge">${ok(fg.score) ? gauge(fg.score) : ""}</div>
    <div style="text-align:center;margin-top:-6px"><div class="big" style="font-size:28px">${ok(fg.score) ? Math.round(fg.score) : "—"}</div><div class="cap">${esc(lbl[fg.rating] || "")} <span class="dim">· hace 1 semana ${ok(fg.previousWeek) ? Math.round(fg.previousWeek) : "—"}</span></div></div>
    <div class="kpis2" style="margin-top:12px"><div><div class="v">${ok(vix.value) ? nf(1).format(vix.value) : "—"}</div><div class="l">VIX ${pc(vix.changePercent)}</div></div><div id="breadth">${keep && !/—/.test(keep) ? keep : '<div class="v">—</div><div class="l">suben hoy</div>'}</div></div>`;
  if (D.breadth) $("breadth").innerHTML = D.breadth;
  const t = (m.treasuries || []).filter((x) => ok(x.yield));
  const mx = Math.max(...t.map((x) => x.yield)), mn = Math.min(...t.map((x) => x.yield)) - 0.6;
  const y2 = t.find((x) => x.key === "2y")?.yield, y10 = t.find((x) => x.key === "10y")?.yield;
  const sp = ok(y2) && ok(y10) ? (y10 - y2) * 100 : null;
  $("curve").innerHTML = `<div class="lbl">Tasas EE.UU.</div>
    <div class="curve">${t.map((x) => `<div><b>${nf(2).format(x.yield)}</b><i style="height:${12 + ((x.yield - mn) / (mx - mn || 1)) * 70}%"></i><span>${esc(x.label.replace(" años", "a").replace(" meses", "m"))}</span></div>`).join("")}</div>
    ${ok(sp) ? `<span class="chip">10a − 2a: <b class="${sp >= 0 ? "pos" : "neg"}">${sp >= 0 ? "+" : ""}${nf(0).format(sp)} pb</b> · ${sp < 0 ? "invertida" : sp < 50 ? "casi plana" : "normal"}</span>` : ""}`;
}

// ---------- Sectores: barras ordenadas contra el S&P 500 ----------
const RANGES = [["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["1y", "1A"]];
async function loadSectors() {
  $("ranges").innerHTML = RANGES.map(([k, l]) => `<button data-r="${k}" class="${k === D.range ? "on" : ""}">${l}</button>`).join("");
  const r = await fetch(`/api/sectors?range=${D.range}`); if (!r.ok) throw new Error("sectors");
  const j = await r.json();
  const rows = j.series.filter((s) => !s.is_benchmark).map((s) => ({ s: s.symbol, n: s.name, v: s.rel_spread_pct.filter(ok).at(-1) })).filter((x) => ok(x.v)).sort((a, b) => b.v - a.v);
  const M = Math.max(...rows.map((x) => Math.abs(x.v)), 1);
  $("sectors").className = "";
  $("sectors").innerHTML = `<div class="bars">${rows.map((x) => { const w = (Math.abs(x.v) / M) * 50; return `<div class="br"><span class="n"><b>${esc(x.s)}</b><span class="dim">${esc(x.n)}</span></span><div class="t"><i style="${x.v >= 0 ? `left:50%;width:${w}%;background:#22c55e` : `right:50%;width:${w}%;background:#ef4444`}"></i></div><span class="v ${x.v >= 0 ? "pos" : "neg"}">${x.v >= 0 ? "+" : ""}${nf(1).format(x.v)}%</span></div>`; }).join("")}</div>`;
}

// ---------- Universo: candidatas, watchlist y amplitud ----------
const item = (r, right) => `<div class="li" data-s="${esc(r.s)}">${logo(r.s, r.ced || r.s, 28)}<div style="min-width:0"><div class="tk">${esc(r.ced || r.s)}</div><div class="nm">${esc(r.n || "")}</div></div>${right}</div>`;
async function loadUniverse() {
  await initSupabase();
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  const rows = [...snap.rows.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(rows, { userMult: userMult(), profW: userProfW() });
  D.mcap = new Map(rows.map((r) => [r.s, r.mcap]));
  const ext = rows.filter((r) => r.c !== "AR" && !(r.mk || "").includes("REF"));
  const cands = ext.filter((r) => r.cand && r.profile !== "crypto").sort((a, b) => b.score - a.score).slice(0, 6);
  $("cands").className = "";
  $("cands").innerHTML = cands.length ? cands.map((r) => item(r, `<span class="px">${liveChg(r.s, r.chg)}</span>${scPill(r.score)}`)).join("") : `<div class="dim">Hoy no hay candidatas.</div>`;
  // Watchlist
  let wl = loadLocal("watchlists_v2", null);
  const acc = state.ov.get("__watchlists")?.metrics?.lists;
  if (acc) wl = { lists: acc, active: Object.keys(acc)[0] };
  const name = wl?.active && wl.lists?.[wl.active] ? wl.active : Object.keys(wl?.lists || {})[0];
  const wrows = (name ? wl.lists[name] : []).map((s) => rows.find((r) => r.s === s || r.ced === s)).filter(Boolean).slice(0, 6);
  $("wlName").textContent = name ? `Watchlist · ${name}` : "Watchlist";
  $("wl").className = "";
  $("wl").innerHTML = wrows.length ? wrows.map((r) => item(r, `<span class="px"><span data-live-px="${esc(r.s)}">${fmt(r.px)}</span><div>${liveChg(r.s, r.chg)}</div></span>${scPill(r.score)}`)).join("") : `<div class="dim">Agregá acciones desde el Screener o la Watchlist.</div>`;
  document.querySelectorAll(".li[data-s]").forEach((el) => (el.onclick = () => go(el.dataset.s)));
  // Amplitud (dentro de la tarjeta de sentimiento)
  const wc = ext.filter((r) => ok(r.chg)), up = wc.filter((r) => r.chg > 0).length;
  if (wc.length) { D.breadth = `<div class="v">${nf(0).format((up / wc.length) * 100)}%</div><div class="l">del universo sube hoy</div>`; if ($("breadth")) $("breadth").innerHTML = D.breadth; }
}

// ---------- Fed y agenda macro ----------
const ES = [[/^Core PCE Price Index YoY/i, "PCE núcleo"], [/^Core PCE Price Index MoM/i, "PCE núcleo m/m"], [/^PCE Price Index YoY/i, "PCE"], [/^PCE Price Index MoM/i, "PCE m/m"],
  [/^Core Inflation Rate YoY/i, "CPI núcleo"], [/^Core Inflation Rate MoM/i, "CPI núcleo m/m"], [/^Inflation Rate YoY/i, "Inflación (CPI)"], [/^Inflation Rate MoM/i, "CPI m/m"],
  [/^Non Farm Payrolls/i, "Empleo (NFP)"], [/^Unemployment Rate/i, "Desempleo"], [/^Fed Interest Rate Decision/i, "Decisión de la Fed"], [/^GDP Growth Rate/i, "PBI"],
  [/^Retail Sales MoM/i, "Ventas minoristas"], [/^PPI MoM/i, "Precios mayoristas"], [/^ISM Manufacturing PMI/i, "ISM manufactura"], [/^ISM Services PMI/i, "ISM servicios"]];
const esName = (t) => (ES.find(([re]) => re.test(t))?.[1]) || t;
const hawkDir = (t) => (/unemployment|jobless/i.test(t) ? -1 : /inflation|pce|ppi|payroll|retail|gdp|ism|jolts/i.test(t) ? 1 : 0);
const KEY = /^(inflation rate yoy|core inflation rate yoy|core pce price index|pce price index yoy|non farm payrolls|unemployment rate|fed interest rate decision|gdp growth rate|retail sales mom|ppi mom|ism)/i;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
async function loadMacro() {
  const r = await fetch("/api/overview?view=macro"); if (!r.ok) throw new Error("macro");
  const M = await r.json(), F = M.fed || {}, mt = F.meetings || [], now = Date.now();
  const val = (v, e) => (v == null ? "—" : `${nf(Math.abs(v) < 10 && v % 1 ? (String(v).split(".")[1]?.length > 1 ? 2 : 1) : 0).format(v)}${e.unit === "%" ? "%" : e.scale ? e.scale : ""}`);
  const ev = M.events.filter((e) => KEY.test(e.title)).sort((a, b) => a.t - b.t);
  const next = ev.filter((e) => e.t >= now - 3600e3).slice(0, 4), past = ev.filter((e) => e.t < now && e.actual != null).slice(-3).reverse();
  const dt = (t) => { const d = new Date(t); return `<div class="dt"><b>${d.getDate()}</b><span>${MES[d.getMonth()]}</span></div>`; };
  const surprise = (e) => { if (e.forecast == null || e.actual == null || e.actual === e.forecast) return ["#64748b", "en línea con lo esperado"]; const h = hawkDir(e.title), hawk = h === 0 ? null : (e.actual > e.forecast ? h > 0 : h < 0); return [hawk == null ? "#64748b" : hawk ? "#ef4444" : "#22c55e", `${e.actual > e.forecast ? "arriba" : "abajo"} de lo esperado${hawk == null ? "" : hawk ? ": presiona a subir tasas" : ": alivio para tasas"}`]; };
  $("econ").className = "";
  $("econ").innerHTML = `${next.map((e) => `<div class="ev">${dt(e.t)}<div class="nm">${esc(esName(e.title))}<small>${esc(e.period)}</small></div><div class="vv">${e.forecast != null ? val(e.forecast, e) : val(e.previous, e)}<small>${e.forecast != null ? "estimado" : "previo"}</small></div></div>`).join("") || '<div class="dim">Sin datos clave en las próximas semanas.</div>'}
    <div class="sub-l">Últimos datos</div>
    ${past.map((e) => { const [c, t] = surprise(e); return `<div class="ev" title="${t}">${dt(e.t)}<div class="nm"><span class="dot2" style="background:${c}"></span>${esc(esName(e.title))}<small>${esc(e.period)}</small></div><div class="vv"><b>${val(e.actual, e)}</b><small>est. ${val(e.forecast, e)}</small></div></div>`; }).join("")}`;
  // Fed
  const n0 = mt[0];
  if (!n0) { $("fed").innerHTML = `<div class="lbl">Fed</div><div class="dim">Sin datos de futuros.</div>`; return; }
  const d0 = new Date(n0.date + "T12:00:00");
  const main = n0.pHold >= Math.max(n0.pHike, n0.pCut) ? ["mantenga", n0.pHold, "#e2e8f0"] : n0.pHike > n0.pCut ? ["suba", n0.pHike, "#f87171"] : ["baje", n0.pCut, "#4ade80"];
  const lastC = mt.at(-1), steps = Math.round((lastC.cumulative || 0) / 25);
  const lo = Math.min(F.effr, ...mt.map((m) => m.implied)) - 0.15, hi = Math.max(F.effr, ...mt.map((m) => m.implied));
  const nextKey = M.events.filter((e) => e.t > now && /^(inflation rate yoy|core pce price index|non farm payrolls)/i.test(e.title)).sort((a, b) => a.t - b.t)[0];
  const ly = new Date(lastC.date + "T12:00:00");
  $("fed").innerHTML = `<div class="lbl"><span>Fed · ${d0.getDate()} ${MES[d0.getMonth()]}</span><span style="text-transform:none;letter-spacing:0;font-weight:500">tasa ${F.target ? nf(2).format(F.target[0]) + "–" + nf(2).format(F.target[1]) + "%" : "—"}</span></div>
    <div class="big" style="color:${main[2]}">${main[1]}%</div><div class="cap">de que <b>${main[0]}</b> la tasa</div>
    <div class="pbar"><i style="width:${n0.pCut}%;background:#22c55e"></i><i style="width:${n0.pHold}%;background:#475569"></i><i style="width:${n0.pHike}%;background:#ef4444"></i></div>
    <div class="plg"><span>Baja ${n0.pCut}%</span><span>Mantiene ${n0.pHold}%</span><span>Sube ${n0.pHike}%</span></div>
    <div class="path" title="Cambio acumulado de tasa que descuenta el mercado, en puntos básicos">${mt.map((m) => { const d = new Date(m.date + "T12:00:00"); return `<div title="${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}: tasa implícita ${nf(2).format(m.implied)}%"><b class="${m.cumulative > 2 ? "neg" : m.cumulative < -2 ? "pos" : "dim"}">${m.cumulative >= 0 ? "+" : ""}${nf(0).format(m.cumulative)}</b><i style="height:${8 + ((m.implied - lo) / (hi - lo || 1)) * 72}%;background:${m.cumulative > 2 ? "rgba(239,68,68,.45)" : m.cumulative < -2 ? "rgba(34,197,94,.45)" : "#334155"};border-top:2px solid ${m.cumulative > 2 ? "#ef4444" : m.cumulative < -2 ? "#22c55e" : "#64748b"}"></i><span>${MES[d.getMonth()]}</span></div>`; }).join("")}</div>
    <div class="take">${Math.abs(steps) >= 1 ? `Descuenta <b>${Math.abs(steps)} ${steps > 0 ? "subas" : "bajas"}</b> hasta ${MES[ly.getMonth()]} '${String(ly.getFullYear()).slice(2)}.` : "No descuenta cambios de tasa."}${nextKey ? ` Próximo dato clave: <b>${esc(esName(nextKey.title))}</b> el ${new Date(nextKey.t).getDate()}/${new Date(nextKey.t).getMonth() + 1}.` : ""}</div>`;
}

// ---------- Cripto ----------
async function loadCrypto() {
  const [q, ch, fg] = await Promise.all([
    fetch("/api/overview?s=BTC-USD,ETH-USD,SOL-USD").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/overview?view=chart&sym=BTC-USD&range=1y&interval=1d").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("https://api.alternative.me/fng/?limit=1").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const Q = q?.q || {}, b = Q["BTC-USD"]; if (!b) throw new Error("cripto");
  const pts = (ch?.pts || []).map((p) => p[1]);
  const back = (n) => (pts.length > n ? (pts.at(-1) / pts[pts.length - 1 - n] - 1) * 100 : null);
  const f = fg?.data?.[0] ? Number(fg.data[0].value) : null;
  const flbl = (v) => (v < 25 ? "miedo extremo" : v < 45 ? "miedo" : v <= 55 ? "neutral" : v < 75 ? "codicia" : "codicia extrema");
  const row = (sym, nm) => { const x = Q[sym]; return x ? `<div class="li" style="cursor:default;grid-template-columns:28px 1fr auto 56px">${logo(sym.replace("-", ""), nm, 26)}<div class="tk">${nm}</div><span class="px"><span data-live-px="${sym}" data-live-pre="US$ " data-live-dec="${x.px > 1000 ? 0 : 2}">US$ ${nf(x.px > 1000 ? 0 : 2).format(x.px)}</span></span><span class="px">${liveChg(sym, x.chg)}</span></div>` : ""; };
  $("crypto").className = "";
  $("crypto").innerHTML = `<div class="btc"><div><div class="cap" style="margin:0 0 6px">Bitcoin</div><div class="big" style="font-size:28px" data-live-px="BTC-USD" data-live-pre="US$ " data-live-dec="0">US$ ${nf(0).format(b.px)}</div>
      <div class="rets"><span>24h <b>${pc(b.chg)}</b></span><span>7d <b>${pc(back(7))}</b></span><span>1a <b>${pc(back(pts.length - 1), 0)}</b></span></div></div>${spark(pts.slice(-90), back(90) >= 0)}</div>
    <div style="margin-top:10px">${row("ETH-USD", "ETH")}${row("SOL-USD", "SOL")}</div>
    ${f != null ? `<div class="fgl"><span>Miedo/codicia</span><div class="meter"><i style="left:calc(${f}% - 1px)"></i></div><b>${f}</b><span>${flbl(f)}</span></div>` : ""}`;
}

// ---------- Dólar ----------
async function loadDolar() {
  const d = await fetchArs(0); if (!d) throw new Error("ars");
  const dl = d.dolar || {}, m = (v) => (ok(v) ? "$" + nf(0).format(v) : "—");
  const byCed = new Map(UNIVERSE.filter((u) => u[5]).map((u) => [u[5], u]));
  const liq = Object.entries(d.implied).filter(([k, x]) => x.volArs > 3e8 && byCed.has(k)).map(([k, x]) => ({ k, s: byCed.get(k)[0], dev: (x.ccl / d.medCcl - 1) * 100 })).filter((x) => Math.abs(x.dev) <= 8).sort((a, b) => a.dev - b.dev);
  const chip = (x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.k, 22)}${esc(x.k)} <small class="${x.dev < 0 ? "pos" : "neg"}">${x.dev >= 0 ? "+" : ""}${nf(1).format(x.dev)}%</small></a>`;
  $("dolar").className = "";
  $("dolar").innerHTML = `<div class="nums"><div><div class="v">${m(d.medCcl)}</div><div class="l">CCL CEDEARs</div></div><div><div class="v">${m(dl.bolsa?.venta)}</div><div class="l">MEP</div></div><div><div class="v">${m(dl.oficial?.venta)}</div><div class="l">Oficial${ok(dl.oficial?.venta) && ok(d.medCcl) ? ` · brecha ${nf(0).format((d.medCcl / dl.oficial.venta - 1) * 100)}%` : ""}</div></div><div><div class="v">${m(dl.blue?.venta)}</div><div class="l">Blue</div></div></div>
    <div class="pick"><span class="t">Más baratos para comprar hoy</span>${liq.slice(0, 3).map(chip).join("")}</div>
    <div class="pick" style="margin-top:8px"><span class="t">Más caros</span>${liq.slice(-3).reverse().map(chip).join("")}</div>`;
}

// ---------- Cartera ----------
async function loadPf() {
  const pf = getPortfolio();
  if (!pf.positions.length) { $("pf").className = ""; $("pf").innerHTML = `<div class="dim">Cargá tus compras en <a href="/cartera.html" style="color:#93c5fd">Cartera</a> para ver tu resultado en dólares y contra el S&amp;P 500.</div>`; return; }
  const [d, q] = await Promise.all([fetchArs(), fetch("/api/overview?s=SPY").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  const spy = q?.q?.SPY?.px;
  let vU = 0, vA = 0, cU = 0, sV = 0, day = 0; const per = new Map();
  for (const p of pf.positions) {
    const x = d?.cedears?.[p.ced]; if (!x?.ars) continue;
    const ccl = META.get(p.s)?.[3] === "AR" ? d.medCcl : d.implied?.[p.ced]?.ccl || d.medCcl;
    const a = p.qty * x.ars, u = a / ccl;
    vA += a; vU += u; cU += p.costUsd || 0; if (p.spy0 && spy) sV += (p.costUsd * spy) / p.spy0;
    if (ok(x.chg)) day += a - a / (1 + x.chg / 100);
    if (!per.has(p.ced)) per.set(p.ced, { ced: p.ced, s: p.s, chg: x.chg });
  }
  const g = vU - cU, vs = sV ? (vU / sV - 1) * 100 : null;
  const movers = [...per.values()].filter((x) => ok(x.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
  $("pf").className = "";
  $("pf").innerHTML = `<div class="nums"><div><div class="v">US$ ${nf(0).format(vU)}</div><div class="l">$ ${nf(0).format(vA)}</div></div>
    <div><div class="v">${pc(vA ? (day / (vA - day)) * 100 : null, 2)}</div><div class="l">hoy</div></div>
    <div><div class="v ${g >= 0 ? "pos" : "neg"}">${g >= 0 ? "+" : "−"}US$ ${nf(0).format(Math.abs(g))}</div><div class="l">ganancia ${pc(cU ? (g / cU) * 100 : null)}</div></div>
    <div><div class="v">${pc(vs)}</div><div class="l">vs S&amp;P 500</div></div></div>
    ${movers.length ? `<div class="pick"><span class="t">Lo que más se mueve hoy</span>${movers.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.ced, 22)}${esc(x.ced)} <small class="${x.chg >= 0 ? "pos" : "neg"}">${x.chg >= 0 ? "+" : ""}${nf(1).format(x.chg)}%</small></a>`).join("")}</div>` : ""}`;
}

async function loadAll() {
  $("dot").className = "dot load"; $("statusTxt").textContent = "Cargando…";
  const res = await Promise.allSettled([
    loadTape(), loadMarket(), loadSectors(), loadMacro(), loadCrypto(), loadDolar(),
    loadUniverse().then(() => {
      const syms = [...new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)])].filter((s) => META.get(s)?.[3] !== "AR");
      const all = UNIVERSE.filter((r) => r[3] !== "AR" && !r[4].includes("REF")).map((r) => r[0]);
      $("earn").className = ""; renderEarnings($("earn"), syms, (s) => META.get(s)?.[5] || s, all, (s) => D.mcap.get(s));
      return loadPf();
    }),
  ]);
  const fails = res.filter((r) => r.status === "rejected"); fails.forEach((f) => console.warn(f.reason));
  $("dot").className = "dot on";
  $("statusTxt").innerHTML = `En vivo · ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}${fails.length ? ` · ${fails.length} sin datos` : ""}`;
}

$("btnReload").onclick = loadAll;
$("ranges").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; D.range = b.dataset.r; saveLocal("dash_range", D.range); loadSectors().catch(() => {}); };
loadAll();
startLive(15000);
