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
  $("tiles").innerHTML = D.ov.market.map((m) => {
    const inv = m.symbol === "^VIX";
    return `<div class="tile" title="1 semana ${m.w1 ?? "—"}% · 1 mes ${m.m1 ?? "—"}% · en el año ${m.ytd ?? "—"}%">
      <div class="n"><span>${esc(m.name)}</span><span>${esc(m.symbol.replace("^", ""))}</span></div>
      <div class="p num" ${liveAttr(m)}>${fmtP(m)}</div>
      <div class="c num"><span data-live-chg="${esc(m.symbol)}" class="${m.d1 >= 0 ? "pos" : "neg"}">${ok(m.d1) ? (m.d1 >= 0 ? "+" : "") + nf(2).format(m.d1) + "%" : "—"}</span> <span class="na">hoy</span> · ${pctTxt(m.ytd, 1)} <span class="na">año</span></div>
      ${spark(m.spark, inv ? m.spark.at(-1) <= m.spark[0] : m.spark.at(-1) >= m.spark[0])}</div>`;
  }).join("");
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
  const line = (r, extra) => `<tr data-s="${esc(r.s)}"><td class="l"><b>${esc(r.ced || r.s)}</b> <span class="na">${esc((r.n || "").slice(0, 26))}</span></td>${extra}</tr>`;
  const cands = ext.filter((r) => r.cand && r.profile !== "crypto").sort((a, b) => b.score - a.score).slice(0, 8);
  $("cands").className = ""; $("cands").innerHTML = cands.length ? `<table class="mini"><tbody>${cands.map((r) => line(r, `<td class="l na">${esc(PROFILES[r.profile].l)}</td><td class="na">${LYNCH[r.lynch] || ""}</td><td class="num">${liveChg(r.s, r.chg, 1)}</td><td><span class="score ${scoreCls(r.score)}">${r.score}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Hoy no hay candidatas.</div>`;
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
  $("wl").className = ""; $("wl").innerHTML = wrows.length ? `<table class="mini"><tbody>${wrows.map((r) => line(r, `<td class="num"><span data-live-px="${esc(r.s)}">${fmt(r.px)}</span> <span class="na">${esc(r.cur || "")}</span></td><td class="num">${liveChg(r.s, r.chg)}</td><td class="num">${ok(r.fairUp) ? pctTxt(r.fairUp, 0) + ' <span class="na">a tu P. justo</span>' : ""}</td><td><span class="score ${scoreCls(r.score)}">${r.score ?? "—"}</span></td>`)).join("")}</tbody></table>` : `<div class="na">Tu watchlist está vacía. Agregá acciones desde la Watchlist o el Screener.</div>`;
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
  const tasks = [loadOverview(), loadMarket(), loadChart(), loadUniverse().then((u) => { const syms = [...new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)])].filter((s) => META.get(s)?.[3] !== "AR"); $("earn").className = ""; const all = UNIVERSE.filter((r) => r[3] !== "AR" && !r[4].includes("REF")).map((r) => r[0]); renderEarnings($("earn"), syms, (s) => META.get(s)?.[5] || s, all, (s) => D.mcap?.get(s)); loadPf().catch(() => {}); return u; }), loadDolar(), loadCrypto()];
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
