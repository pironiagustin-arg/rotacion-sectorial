import { UNIVERSE, SECTORS, COUNTRIES, MARKETS, SYMBOLS, BATCH_SIZE } from "/lib/universe.js";
import { METRICS, GROUPS, PROFILES, LYNCH, LYNCH_INFO, ok, derive, scoreAll, fmt, fmtCap, fmtBig, nf, scoreCls, scoreLabel, profileOf, relevant } from "/js/score.js";
import { startLive } from "/js/live.js";
import { talkRead } from "/js/talk.js";
import { fetchArs, arsOf, ratioOf, devTxt } from "/js/ars.js";
import { $, esc, toast, loadLocal, saveLocal, state, initSupabase, loadSnapshots, loadOverrides, saveOverride, userMult, userProfW, withMeta, META, loadFund } from "/js/core.js";

const P = { sym: null, rows: [], r: null, hist: null, charts: [] };
const today = () => new Date().toLocaleDateString("es-AR");
const lvl = (s) => (!ok(s) ? "na" : s >= 70 ? "good" : s >= 45 ? "mid" : "bad");
const COL = { good: "#22c55e", mid: "#eab308", bad: "#ef4444", na: "#64748b" };

// ---------- Búsqueda ----------
function resolve(q) {
  q = (q || "").trim().toUpperCase();
  if (!q) return null;
  const byY = UNIVERSE.find((u) => u[0] === q), byC = UNIVERSE.find((u) => (u[5] || "").toUpperCase() === q);
  if (byY) return byY[0]; if (byC) return byC[0];
  const m = q.match(/^([A-Z0-9.\-]+)\s+·/); if (m) return resolve(m[1]);
  const byN = UNIVERSE.find((u) => u[1].toUpperCase().includes(q));
  return byN ? byN[0] : null;
}
function initSearch() {
  $("tickers").innerHTML = [...UNIVERSE].sort((a, b) => (a[3] === "AR") - (b[3] === "AR")).map((u) => `<option value="${esc(u[5] || u[0])} · ${esc(u[1])}">`).join("");
  const goTo = () => { const s = resolve($("q").value); if (s) { history.pushState({}, "", "?s=" + encodeURIComponent(s)); load(s); } else toast("No está en el universo operable desde Argentina"); };
  $("go").addEventListener("click", goTo);
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") goTo(); });
  $("q").addEventListener("change", () => { if (resolve($("q").value)) goTo(); });
  window.addEventListener("popstate", () => { const s = new URLSearchParams(location.search).get("s"); if (s) load(resolve(s) || s); });
}

// ---------- Carga ----------
async function loadRows(sym) {
  if (!P.rows.length) {
    const snap = await loadSnapshots();
    P.rawMap = snap.rows; P.updated = snap.updated;
  }
  if (!P.rawMap.has(sym)) {
    const i = SYMBOLS.indexOf(sym);
    if (i >= 0) {
      const j = await fetch(`/api/screener?batch=${Math.floor(i / BATCH_SIZE)}`).then((r) => r.json()).catch(() => null);
      for (const row of j?.rows || []) if (row.ok) { const x = withMeta(row); if (x) P.rawMap.set(row.s, x); }
    }
  }
  P.rows = [...P.rawMap.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(P.rows, { userMult: userMult(), profW: userProfW() });
}

async function load(sym) {
  P.sym = sym; P.hist = null;
  const meta = META.get(sym);
  $("root").innerHTML = `<div class="skeleton">Cargando ${esc(meta?.[5] || sym)}…</div>`;
  document.title = `${meta?.[5] || sym} · Ficha`;
  await loadRows(sym);
  P.r = P.rows.find((x) => x.s === sym);
  if (!P.r) { $("root").innerHTML = `<div class="empty">No encontré datos de ${esc(sym)}. Puede que Yahoo no tenga cotización hoy.</div>`; return; }
  P.prof = null;
  render();
  fetch(`/api/profile?symbol=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then(async (pr) => {
      if (P.sym !== sym) return;
      P.prof = pr || { error: true }; renderAbout(); renderThesis();
      // Si el servidor no pudo traducir, se traduce desde el navegador
      const talk = pr?.talk;
      if (talk && talk.quotes.some((q) => !q.es) || talk?.outlook?.length && !(talk.outlook_es || []).some(Boolean)) {
        const src = [...talk.quotes.map((q) => q.text), ...talk.outlook];
        translateEs(src.join("\n")).then((t) => {
          if (!t || P.sym !== sym) return;
          const arr = t.split("\n");
          if (arr.length !== src.length) return;
          talk.quotes.forEach((q, i) => (q.es = arr[i])); talk.outlook_es = talk.outlook.map((_, i) => arr[talk.quotes.length + i]);
          renderThesis();
        });
      }
      if (pr && !pr.error) {
        const needSum = pr.profile?.summary && pr.profile.summary === pr.profile.summary_en;
        const todo = (pr.news || []).filter((n) => !n.title_es || n.title_es === n.title);
        const [sum, titles] = await Promise.all([needSum ? translateEs(pr.profile.summary) : null, todo.length ? translateEs(todo.map((n) => n.title.replace(/\n/g, " ")).join("\n")) : null]);
        if (P.sym !== sym) return;
        if (sum) pr.profile.summary = sum;
        const tl = titles ? titles.split("\n") : [];
        if (tl.length === todo.length) todo.forEach((n, i) => (n.title_es = tl[i]));
        if (sum || tl.length) { renderAbout(); renderThesis(); }
      }
    });
  const h = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (P.sym !== sym) return;
  P.hist = h; renderHistory();
}

// ---------- Lecturas en lenguaje claro ----------
function oneLiner(r) {
  const parts = [];
  const lt = r.lynch ? `una ${LYNCH[r.lynch]}` : "una empresa";
  parts.push(`<b>${esc(r.ced || r.s)}</b> es ${lt} de ${esc(PROFILES[r.profile].l.toLowerCase())}`);
  const v = r.verdict;
  const good = Object.values(v).filter((x) => x.lv === "good").map((x) => x.q.replace(/[¿?]/g, "").toLowerCase());
  const bad = Object.values(v).filter((x) => x.lv === "bad").map((x) => x.q.replace(/[¿?]/g, "").toLowerCase());
  const ans = { "es buen negocio": "buen negocio", "crece": "crece rápido", "está barata": "está barata", "está sana": "tiene finanzas sanas" };
  const ansBad = { "es buen negocio": "rentabilidad floja", "crece": "crecimiento flojo", "está barata": "está cara", "está sana": "finanzas a vigilar" };
  let s = parts[0];
  if (good.length) s += `: ${good.map((g) => ans[g]).join(", ")}`;
  if (bad.length) s += `${good.length ? ", pero" : ":"} ${bad.map((g) => ansBad[g]).join(" y ")}`;
  s += ` frente a ${r.peerN} empresas comparables.`;
  if (r.cand) s += ` <b class="pos">Aparece como candidata.</b>`;
  return s;
}
function vdMetrics(r, g) {
  const keys = Object.entries(r.weights).filter(([k]) => METRICS[k].g === g).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (g === "Solidez" && !keys.length) keys.push("ndEbitda", "cr");
  return keys.slice(0, 3).map((k) => `<div class="kv" title="${esc(METRICS[k].q)}"><span>${METRICS[k].l}</span><span class="num"><b style="${mcol(r, k)};font-weight:600">${fmt(r[k], METRICS[k].f, METRICS[k].d)}</b> <span class="na">· sector ${fmt(r.med[k], METRICS[k].f, METRICS[k].d)}</span></span></div>`).join("");
}

// ---------- Render ----------
// Pares: los que elegiste vos o, por defecto, los más grandes de la misma industria (si son pocos, del sector)
function peersOf(r) {
  const mine = state.ov.get(r.s)?.metrics?.peers;
  if (Array.isArray(mine)) return { list: mine.map((s) => P.rows.find((x) => x.s === s)).filter(Boolean), custom: true };
  const okAR = (x) => r.c === "AR" || x.c !== "AR";
  let pool = P.rows.filter((x) => x.profile === r.profile && x.s !== r.s && ok(x.mcap) && okAR(x));
  if (pool.length < 4 && !PROFILES[r.profile].fixed) pool = P.rows.filter((x) => x.sec === r.sec && x.s !== r.s && ok(x.mcap) && okAR(x));
  return { list: pool.sort((a, b) => b.mcap - a.mcap).slice(0, 7), custom: false };
}
// Columnas de la comparativa: las métricas que más pesan en el perfil de la empresa
function peerCols(r) { return Object.entries(r.weights).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => k !== "runway").slice(0, 7); }
function spark(h, m) {
  const vals = [...h.series, h.cur]; const v = vals.filter(ok); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), W = 120, H = 28, n = vals.length;
  const pts = vals.map((x, i) => (ok(x) ? `${(i / (n - 1)) * W},${H - 3 - ((x - mn) / (mx - mn || 1)) * (H - 6)}` : null)).filter(Boolean);
  const ay = H - 3 - ((h.avg - mn) / (mx - mn || 1)) * (H - 6);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block;margin-top:6px"><line x1="0" x2="${W}" y1="${ay}" y2="${ay}" stroke="#64748b" stroke-dasharray="3 3" stroke-width="1"/><polyline points="${pts.join(" ")}" fill="none" stroke="#3b82f6" stroke-width="1.6"/><circle cx="${pts.at(-1).split(",")[0]}" cy="${pts.at(-1).split(",")[1]}" r="2.8" fill="#3b82f6"/></svg>`;
}

function render() {
  const r = P.r, ov = state.ov.get(r.s) || {}, th = ov.metrics?.thesis || {};
  const prof = PROFILES[r.profile];
  const markets = (r.mk || "").split(" ").map((m) => MARKETS[m]).filter(Boolean);
  const chg = ok(r.chg) ? `<span class="${r.chg >= 0 ? "pos" : "neg"}" data-live-chg="${esc(r.s)}" data-live-suf=" hoy">${r.chg >= 0 ? "+" : ""}${nf(2).format(r.chg)}% hoy</span>` : "";
  const { list: peers, custom } = peersOf(r);
  const cols = peerCols(r);
  const keyMetrics = Object.entries(r.weights).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const others = Object.keys(METRICS).filter((k) => !r.weights[k] && relevant(r, k) && (ok(r[k]) || r.hist[k]));
  const tot = Object.values(r.weights).reduce((s, x) => s + x, 0);
  const histN = r.fx?.years?.length;
  $("root").innerHTML = `
  <section class="card">
    <div class="hero">
      <div>
        <h1>${esc(r.ced || r.s)} ${r.ced && r.ced !== r.s ? `<span class="alt">${esc(r.s)} en origen</span>` : ""}</h1>
        <div class="name">${esc(r.n)}</div>
        <div class="chips">
          <span class="chip" title="${esc(SECTORS[r.sec])} · ${esc(r.ind || "")}">${esc(prof.l)}</span>
          <span class="chip">${esc(COUNTRIES[r.c] || r.c)}</span>
          ${r.lynch ? `<span class="chip lynch" title="${esc(LYNCH_INFO[r.lynch])}">${LYNCH[r.lynch]}${r.lynch !== r.lynchAuto ? " (tuyo)" : ""}</span>` : ""}
          ${r.cand ? `<span class="chip cand">Candidata</span>` : ""}
          ${(r.mk || "").includes("REF") ? `<span class="chip" style="color:#fde68a">Sin CEDEAR · solo como par de comparación</span>` : ""}
          ${markets.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
        </div>
        <div class="price"><span class="p num"><span data-live-px="${esc(r.s)}" data-live-ext>${fmt(r.px)}</span> <span class="na" style="font-size:14px">${esc(r.cur || "")}</span></span><span class="na" style="font-size:12px"><span class="livedot"></span>en vivo</span>${chg}<span class="na">Market cap ${fmtCap(r.mcap)}</span>${ok(r.tgt) ? `<span class="na">Target analistas ${fmt(r.tgt)} (${r.upside >= 0 ? "+" : ""}${nf(0).format(r.upside)}%)</span>` : ""}</div>
      </div>
      <div class="ring ${scoreCls(r.score)}" title="Score contra ${r.peerN} empresas de ${esc(r.peerLabel)}"><div class="v">${ok(r.score) ? r.score : "—"}</div><div class="l">${scoreLabel(r.score)}</div></div>
    </div>
    <div id="byma" class="byma"></div>
    <div class="oneliner">${oneLiner(r)}</div>
    <div class="actions" style="margin-top:14px">
      <button class="btn" id="bPdf">⤓ PDF de la tesis</button>
      <button class="btn" id="bCmp">${(loadLocal("scr_cmp", [])).includes(r.s) ? "✓ En comparar" : "+ Comparar"}</button>
      <a class="btn" href="#tesis">Tu tesis ↓</a>
    </div>
  </section>

  <section id="about" class="card about"><div class="skeleton">Cargando qué hace la empresa…</div></section>

  <h2>Resumen en 30 segundos <span class="sub">Contra ${esc(r.peerLabel)} y contra su propia historia</span></h2>
  <div class="verdicts">${Object.entries(r.verdict).map(([g, x]) => `
    <div class="vd ${x.lv || ""}">
      <div class="q"><span>${x.q}</span><span class="num" style="color:${COL[lvl(x.s)]}">${ok(x.s) ? x.s + "/100" : "—"}</span></div>
      <div class="a">${x.txt}</div>
      ${g === "Historia" ? histMini(r) : vdMetrics(r, g)}
    </div>`).join("")}
  </div>

  <div class="two" style="margin-top:12px">
    <div class="card"><b>A favor</b><div class="list" style="margin-top:6px">${r.why.slice(0, 6).map((w) => `<div><span class="pos">▲</span>${esc(w.t)}</div>`).join("") || `<div class="na">Ninguna métrica se destaca.</div>`}</div></div>
    <div class="card"><b>A vigilar</b><div class="list" style="margin-top:6px">${r.alerts.slice(0, 6).map((w) => `<div><span class="neg">▼</span>${esc(w.t)}</div>`).join("") || `<div class="na">Sin señales de alarma.</div>`}</div></div>
  </div>

  <h2>Métricas clave de ${esc(prof.l.toLowerCase())} <span class="sub">${esc(prof.why)}</span></h2>
  <div class="mgrid">${keyMetrics.map((k) => metricBox(r, k, METRICS[k], tot)).join("")}</div>
  ${prof.kpi.length || ok(r.backlog) ? `
  <div class="card" style="margin-top:12px">
    <b>KPIs del sector</b> <span class="na" style="font-size:12.5px">· datos que publica la empresa en sus reportes y no vienen en los balances. Cargalos a mano y se guardan con tu tesis.</span>
    <div class="kpis">
      ${ok(r.fx?.latest?.rpoUsd) ? `<div class="kp"><div class="l">Backlog contratado (RPO, SEC)</div><div class="v num">${fmtBig(r.fx.latest.rpoUsd)}</div><div class="h">Al ${esc(r.fx.latest.rpoEnd || "")} · ${fmt(r.backlog, "x", 1)} sus ventas anuales</div></div>` : ""}
      ${prof.kpi.map((x) => `<label class="kp"><span class="l">${esc(x.l)}</span><input type="text" data-kpi="${x.k}" value="${esc(r.kpi[x.k] ?? "")}" placeholder="—"><span class="h">${esc(x.hint)}</span></label>`).join("")}
    </div>
  </div>` : ""}

  <h2>Historia <span class="sub" id="histSrc">Cargando estados contables…</span></h2>
  <div class="charts" id="charts"></div>

  <h2>Contra sus pares <span class="sub">${custom ? "Elegidos por vos" : `Las más grandes de ${esc(prof.l)} operables desde Argentina`}</span></h2>
  <div class="tablewrap"><table>
    <thead><tr><th class="l">Empresa</th><th>Score</th><th>Mkt cap</th>${cols.map((k) => `<th title="${esc(METRICS[k].q)}">${esc(METRICS[k].l)}</th>`).join("")}<th></th></tr></thead>
    <tbody>${[r, ...peers].map((x) => `<tr class="${x === r ? "me" : "peer"}" data-s="${esc(x.s)}"><td class="l">${esc(x.ced || x.s)} <span class="na">${esc((x.n || "").slice(0, 22))}</span></td><td><span class="score ${scoreCls(x.score)}">${x.score ?? "—"}</span></td><td>${fmtCap(x.mcap)}</td>${cols.map((k) => `<td class="num" style="${mcol(x, k)}">${fmt(x[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}<td>${x === r ? "" : `<button class="x" data-rmpeer="${esc(x.s)}" title="Quitar de la comparación" aria-label="Quitar ${esc(x.ced || x.s)}">×</button>`}</td></tr>`).join("")}
      <tr class="med"><td class="l na">Mediana de ${esc(r.peerLabel)}</td><td></td><td></td>${cols.map((k) => `<td class="num na">${fmt(r.med[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}<td></td></tr>
    </tbody></table></div>
  <div class="actions" style="margin-top:10px">
    <input type="search" id="peerAdd" list="tickers" placeholder="Agregar comparable: ticker o nombre" style="width:280px">
    <button class="btn" id="peerAddBtn">+ Agregar</button>
    ${custom ? `<button class="btn" id="peerReset">Volver a los automáticos</button>` : ""}
  </div>

  ${others.length ? `<details class="fold"><summary><h2>Otras métricas <span class="sub">No pesan en el score de ${esc(prof.l.toLowerCase())}, pero sirven de referencia · tocá para ver</span></h2></summary>
  <div class="mgrid">${others.map((k) => metricBox(r, k, METRICS[k], tot)).join("")}
    ${[["nm", "Margen neto", "%"], ...(r.sec === "fin" ? [] : [["capexInt", "Capex / ventas", "%"]]), ["beta", "Beta (volatilidad vs mercado)", "n"], ["d52", "Distancia al máximo de 52 semanas", "%"]].filter(([k]) => !r.weights[k] && !others.includes(k) && ok(r[k])).map(([k, l, f]) => `
    <div class="m"><div class="l"><span>${l}</span></div><div class="v num">${fmt(r[k], f)}</div><div class="med">Mediana del sector: ${fmt(r.med[k], f)}</div></div>`).join("")}
  </div></details>` : ""}

  <details class="fold"><summary><h2>Cómo se calculó el score <span class="sub">${esc(prof.l)}${r.lynch ? " · " + LYNCH[r.lynch] : ""} · pesos, percentiles y ajustes · tocá para ver</span></h2></summary>
  <div class="card">
    <div class="na" style="font-size:13px;margin-bottom:10px">${esc(prof.why)}${r.lynch ? " " + esc(LYNCH_INFO[r.lynch]) : ""} ${ok(r.gscore.Historia) ? `Además, un ${nf(0).format(25 * (r.lynch === "stalwart" ? 1.3 : r.lynch === "cyclical" ? 1.4 : 1))}% del score compara contra su propia historia (${r.histKeys.map((k) => METRICS[k].l).join(", ")}).` : "No hay historia suficiente para comparar contra sí misma."}</div>
    <div class="tablewrap" style="border:none"><table class="how"><thead><tr><th class="l">Métrica</th><th class="l">Bloque</th><th>Peso</th><th>Valor</th><th>Mediana pares</th><th>Percentil vs pares</th><th>Prom. ${histN || ""} años</th><th>Vs su historia</th><th title="Destildá para que esta métrica no cuente en el score de esta empresa">Cuenta</th></tr></thead><tbody>
      ${Object.entries(r.weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => { const m = METRICS[k], h = r.hist[k]; return `<tr><td class="l" title="${esc(m.q)}">${m.l}</td><td class="l">${m.g}</td><td>${nf(0).format((w / tot) * 100)}%</td><td>${fmt(r[k], m.f, m.d)}</td><td>${fmt(r.med[k], m.f, m.d)}</td><td>${r.pct[k] != null ? `<span style="color:${COL[lvl(r.pct[k])]}">${r.pct[k]}</span>` : '<span class="na">sin dato</span>'}</td><td>${h ? fmt(h.avg, m.f, m.d) : '<span class="na">—</span>'}</td><td>${h ? `<span style="color:${COL[lvl(h.p)]}">${h.p}</span>` : '<span class="na">—</span>'}</td><td><input type="checkbox" checked data-off="${k}" aria-label="Contar ${esc(m.l)}"></td></tr>`; }).join("")}
      ${(r.offKeys || []).map((k) => { const m = METRICS[k]; return `<tr class="na"><td class="l"><s>${m.l}</s></td><td class="l">${m.g}</td><td>apagada</td><td>${fmt(r[k], m.f, m.d)}</td><td>${fmt(r.med[k], m.f, m.d)}</td><td>${r.pct[k] ?? "—"}</td><td>—</td><td>—</td><td><input type="checkbox" data-off="${k}" aria-label="Volver a contar ${esc(m.l)}"></td></tr>`; }).join("")}
    </tbody></table></div>
    ${(r.auto || []).length ? `<div style="margin-top:14px"><b style="font-size:13.5px">Ajustes automáticos para ${esc(r.ced || r.s)}</b><div class="list" style="margin-top:4px">${r.auto.map((x) => `<div><span style="color:#93c5fd">⚙</span>${esc(x.t)} <span class="na">(${x.k.map((k) => METRICS[k]?.l || k).join(", ")})</span></div>`).join("")}</div></div>` : ""}
    <div class="na" style="font-size:12px;margin-top:6px">Destildá una métrica para que no cuente en el score de ${esc(r.ced || r.s)} (por ejemplo, si el dato de Yahoo está distorsionado por un evento puntual). Para cambiar los pesos de toda la industria, usá "Cómo puntúa" en el Screener.</div>
    <div class="src">Pares: ${r.peerN} empresas de ${esc(r.peerLabel)} (si una métrica tiene menos de 5 datos en la industria, se usa el sector). Historia: estados anuales de Yahoo Finance${histN ? `, ${r.fx.years[0]}–${r.fx.years.at(-1)}` : ""}. Datos de mercado: Yahoo Finance${P.updated ? " · " + new Date(P.updated).toLocaleString("es-AR") : ""}.</div>
  </div></details>

  <h2 id="tesisAuto">Tesis: por qué podría ser una oportunidad <span class="sub">Armada automáticamente con métricas, contratos, management, analistas y noticias</span></h2>
  <div id="autoThesis" class="card"><div class="skeleton">Buscando contratos, management y noticias…</div></div>

  <h2 id="tesis">Tu tesis <span class="sub">${state.user ? "Se guarda en tu cuenta" : "Se guarda en este navegador · iniciá sesión en el Screener para sincronizar"}</span></h2>
  <div class="card">
    <div class="thesis">
      <label>Tipo Lynch<select id="tLynch"><option value="">Automático (${LYNCH[r.lynchAuto] || "sin datos"})</option>${Object.entries(LYNCH).map(([k, l]) => `<option value="${k}" ${ov.lynch_type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Industria para el score<select id="tProf"><option value="">Automática (${esc(PROFILES[profileOf(r)].l)})</option>${Object.entries(PROFILES).sort((a, b) => a[1].l.localeCompare(b[1].l)).map(([k, p]) => `<option value="${k}" ${ov.metrics?.profile === k ? "selected" : ""}>${esc(p.l)}</option>`).join("")}</select></label>
      <label>Precio justo pesimista<input type="number" step="any" id="tBear" value="${th.bear ?? ""}" placeholder="${esc(r.cur || "")}"></label>
      <label>Precio justo base<input type="number" step="any" id="tBase" value="${th.base ?? r.fair ?? ""}" placeholder="${ok(r.tgt) ? "Target analistas " + fmt(r.tgt) : esc(r.cur || "")}"></label>
      <label>Precio justo optimista<input type="number" step="any" id="tBull" value="${th.bull ?? ""}" placeholder="${esc(r.cur || "")}"></label>
      <div class="full fair" id="fairBox"></div>
      <label class="full">Tesis: por qué comprarla<textarea id="tNotes" placeholder="Catalizadores, ventaja competitiva, qué tiene que pasar…">${esc(r.notes)}</textarea></label>
      <div class="full tam">
        <b>Chequeo por TAM</b> <span class="na">· Valuación = TAM a 5 años × market share × margen neto × múltiplo ÷ (1 + retorno exigido)^5. Complementa el precio justo, no lo reemplaza.</span>
        <div class="tamg">
          <label>TAM a 5 años (US$ B)<input type="number" step="any" id="tTam" value="${th.tam ?? ""}" placeholder="Mercado capturable"></label>
          <label>Market share (%)<input type="number" step="any" id="tShare" value="${th.share ?? ""}"></label>
          <label>Margen neto (%)<input type="number" step="any" id="tMargin" value="${th.margin ?? (ok(r.nm) ? Math.round(r.nm) : "")}"></label>
          <label>Múltiplo P/E terminal<input type="number" step="any" id="tMult" value="${th.mult ?? ""}" placeholder="${ok(r.med.pe) ? "Mediana pares " + nf(0).format(r.med.pe) : ""}"></label>
          <label>Retorno exigido (%)<input type="number" step="any" id="tRate" value="${th.rate ?? 12}"></label>
        </div><div id="tamBox" class="na" style="margin-top:8px"></div>
      </div>
      <label class="full">Reglas de venta<textarea id="tSell" style="min-height:60px" placeholder="Ej.: vender si el P/E pasa de 40x, si las ventas dejan de crecer dos trimestres, o al llegar al precio optimista">${esc(th.sell || "")}</textarea></label>
    </div>
    <div class="actions" style="margin-top:12px"><button class="btn primary" id="tSave">Guardar tesis</button>${r.edited.size ? `<button class="btn" id="tReset">Restaurar métricas de Yahoo</button>` : ""}</div>
  </div>`;
  updateFair(); updateTam(); bindPage(); renderAbout(); renderThesis(); renderByma();
  if (P.hist) renderHistory();
}

function histMini(r) {
  if (!r.histKeys?.length) return `<div class="kv"><span>Sin historia suficiente</span><span></span></div>`;
  return r.histKeys.slice(0, 3).map((k) => { const h = r.hist[k], m = METRICS[k]; return `<div class="kv" title="${esc(m.q)}"><span>${m.l}</span><span class="num">${fmt(h.cur, m.f, m.d)} <span class="na">· prom. ${fmt(h.avg, m.f, m.d)}</span></span></div>`; }).join("");
}

// Color del valor: verde si la métrica es buena (contra sus pares y en términos absolutos), rojo si es mala
function mq(x, k) {
  const p = x.pct?.[k]; if (p == null) return null;
  const a = x.abs?.[k];
  return a != null ? p * 0.6 + a * 0.4 : p;
}
const mcol = (x, k) => { const q = mq(x, k); return q == null ? "" : q >= 60 ? "color:#4ade80" : q <= 40 ? "color:#f87171" : "color:#fbbf24"; };
function metricBox(r, k, m, tot) {
  const p = r.pct[k], w = r.weights[k], h = r.hist[k];
  const better = h && ok(h.diff) ? (m.dir > 0 ? h.diff > 0 : h.diff < 0) : null;
  return `<div class="m">
    <div class="l"><span>${m.l}</span><span class="w">${w ? `pesa ${nf(0).format((w / tot) * 100)}%` : ""}${p != null ? ` · P${p}` : ""}</span></div>
    <div class="v num ${r.edited.has(k) ? "edited" : ""}" data-edit="${k}" title="Clic para corregir" style="${mcol(r, k)}">${fmt(r[k], m.f, m.d)}</div>
    ${p != null ? `<div class="pb" title="Percentil contra ${esc(r.peerLabel)}"><div style="width:${Math.max(p, 3)}%;background:${COL[lvl(p)]}"></div></div>` : `<div class="pb"></div>`}
    <div class="med">Mediana pares: ${fmt(r.med[k], m.f, m.d)}${r.edited.has(k) ? ` · Yahoo: ${fmt(P.rawMap.get(r.s)?.[k], m.f, m.d)}` : ""}</div>
    ${h ? `<div class="med">Promedio últimos ${h.n} años: ${fmt(h.avg, m.f, m.d)} <span style="color:${better ? COL.good : COL.bad}">(${h.diff >= 0 ? "+" : ""}${nf(0).format(h.diff)}%)</span></div>${spark(h, m)}` : ""}
    <div class="q">${esc(m.q)}</div></div>`;
}

async function translateEs(text) {
  if (!text) return null;
  try {
    const parts = text.match(/[\s\S]{1,1500}(?:\.\s|\n|$)/g) || [text];
    let out = "";
    for (const c of parts) {
      const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(c)}`);
      if (!r.ok) return null;
      out += ((await r.json())?.[0] || []).map((x) => x[0]).join("");
    }
    return out;
  } catch { return null; }
}
// ---------- Presentación: qué hace ----------
const fmtDate = (t) => new Date(t).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const CTRY = { "United States": "EE.UU.", "United Kingdom": "Reino Unido", Netherlands: "Países Bajos", Germany: "Alemania", France: "Francia", Switzerland: "Suiza", Japan: "Japón", China: "China", "Hong Kong": "Hong Kong", Taiwan: "Taiwán", "South Korea": "Corea del Sur", Brazil: "Brasil", Argentina: "Argentina", Canada: "Canadá", Australia: "Australia", Ireland: "Irlanda", Israel: "Israel", Spain: "España", Italy: "Italia", Denmark: "Dinamarca", Sweden: "Suecia", Norway: "Noruega", Finland: "Finlandia", Mexico: "México", Chile: "Chile", Colombia: "Colombia", India: "India", Singapore: "Singapur", Luxembourg: "Luxemburgo", Uruguay: "Uruguay", "South Africa": "Sudáfrica", Belgium: "Bélgica" };
function renderAbout() {
  const el = $("about"); if (!el) return;
  const pr = P.prof, r = P.r;
  if (!pr) return;
  const p = pr.profile || {};
  if (pr.error || !p.summary) { el.innerHTML = `<b>Qué hace</b><div class="na" style="margin-top:6px">No hay descripción disponible para ${esc(r.ced || r.s)}.</div>`; return; }
  const L = r.fx?.latest || {}, fy = r.fx?.fy || {};
  const facts = [
    ok(L.revUsd) ? ["Ventas anuales", fmtBig(L.revUsd)] : null,
    ok(r.om) ? ["Margen operativo", fmt(r.om, "%")] : null,
    ok(r.revG) ? ["Crecimiento de ventas", fmt(r.revG, "%")] : null,
    p.employees ? ["Empleados", nf(0).format(p.employees)] : null,
    p.city || p.country ? ["Sede", [p.city, CTRY[p.country] || p.country].filter(Boolean).join(", ")] : null,
    p.ceo ? ["CEO", `${p.ceo.name}${p.ceo.age ? ` (${p.ceo.age} años)` : ""}`] : null,
  ].filter(Boolean);
  const long = p.summary.length > 700;
  el.innerHTML = `<div class="about-h"><b>Qué hace ${esc(r.n)}</b>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))} ↗</a>` : ""}</div>
    <p class="about-t ${long ? "clamp" : ""}" id="aboutT">${esc(p.summary)}</p>${long ? `<button class="linkbtn" id="aboutMore">Leer completo</button>` : ""}
    <div class="about-f">${facts.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
    <div class="src">${esc(p.industry || "")} · Descripción de Yahoo Finance traducida automáticamente.</div>`;
  if ($("aboutMore")) $("aboutMore").onclick = () => { $("aboutT").classList.toggle("clamp"); $("aboutMore").textContent = $("aboutT").classList.contains("clamp") ? "Leer completo" : "Ver menos"; };
}

// ---------- BYMA: precio en pesos y dólar implícito ----------
async function renderByma() {
  const r = P.r, el = $("byma"); if (!el) return;
  if (!r.ced) { el.innerHTML = ""; return; }
  const d = await fetchArs(); if (P.r !== r) return;
  const a = arsOf(d, r.ced);
  if (!a?.ars) { el.innerHTML = `<span class="na">Sin operaciones hoy en BYMA para ${esc(r.ced)}.</span>`; return; }
  const local = r.c === "AR", ratio = !local && r.cur === "USD" ? ratioOf(a.ars, a.ccl, r.px) : null;
  const dc = a.dev == null ? "na" : a.dev < -0.5 ? "pos" : a.dev > 0.5 ? "neg" : "na";
  el.innerHTML = `<span class="lab">${local ? "En BYMA" : "CEDEAR en BYMA"}</span> <b class="num">$ ${nf(a.ars < 100 ? 2 : 0).format(a.ars)}</b> ${ok(a.chg) ? `<span class="${a.chg >= 0 ? "pos" : "neg"}">${a.chg >= 0 ? "+" : ""}${nf(2).format(a.chg)}%</span>` : ""}
    ${a.usd ? `<span class="sep">·</span><span>US$ ${nf(2).format(a.usd)} <span class="na">(especie D, MEP)</span></span>` : ""}
    ${!local && a.ccl ? `<span class="sep">·</span><span>CCL implícito <b class="num">$ ${nf(2).format(a.ccl)}</b> <span class="${dc}">${a.dev >= 0 ? "+" : ""}${nf(2).format(a.dev)}% vs mediana · ${devTxt(a.dev)}</span></span>` : ""}
    ${ratio ? `<span class="sep">·</span><span class="na">Ratio ${ratio}:1</span>` : ""}
    <a href="/cedears.html" class="na" style="margin-left:8px;color:#93c5fd">Comparar →</a>`;
}

// ---------- Noticias clave ----------
const NEWS_CATS = [
  ["Management", /\b(names?|appoints?|hires?|taps?|promotes?)\b.{0,50}\b(CEO|CFO|chief|president|chair\w*)\b|\b(CEO|CFO|chief executive|chief financial officer|chairman|founder)\b.{0,50}\b(steps? down|resign\w*|retir\w*|depart\w*|exit\w*|to leave|successor|replac\w*|ousted|fired)|\bnew (CEO|CFO|chief executive)\b/i],
  ["Recompra", /\b(buyback|repurchase|buy back)\b/i],
  ["Adquisición", /\b(to acquire|acquires?|acquired|acquisition of|agrees? to buy|to buy .{0,30} for \$|merger|merge with|takeover bid)\b/i],
  ["Contrato", /\b(contract|agreement|deal with|signs|signed|inks|inked|wins|secures|secured|awarded|order for|order from|multi-?year|supply deal)\b/i],
  ["Alianza", /\b(partnership|partners with|collaborat\w*|alliance|joint venture|teams? up)\b/i],
  ["Dividendo", /\b(raises?|hikes?|boosts?|increases?|special|cuts?|suspends?)\b.{0,25}\bdividend/i],
  ["Guidance", /\b(raises?|lifts?|boosts?|cuts?|lowers?|slashes?|reaffirms?)\b.{0,30}\b(guidance|forecast|outlook)\b/i],
];
const NEWS_JUNK = /\?$|prediction|\bcould\b|\bmight\b|union|strike|workers|labor|advis[eo]r|investigat|lawsuit|sues?\b|backing|upgrade|downgrade|price target|rating|analyst|options? (trading|activity)|unusual|shares (rise|fall|drop|jump)|stock (rises|falls|drops|jumps)|should you|is it time|stocks? to (buy|watch)|top \d|best \d|\bwhy\b|here's|what to know|motley|price prediction|could (soar|be)|millionaire|vs\.? /i;
const TR = new Map();
function keyNews(nws, fil, r) {
  const out = [], seen = new Set();
  const STOP = /^(the|inc|corp|corporation|company|group|holdings?|ltd|plc|sa|nv|co)$/i;
  const nameTok = (r.n || "").replace(/[,.]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.test(w))[0] || "";
  const subj = new RegExp(`\\b(${[nameTok, r.s.split(".")[0], r.ced].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})('s|’s)?\\b`, "i");
  for (const n of nws) {
    if (!n.title || NEWS_JUNK.test(n.title)) continue;
    const m = n.title.match(subj);
    if (!m || m.index > 45) continue;
    const cat = NEWS_CATS.find(([, re]) => re.test(n.title));
    if (!cat || (cat[0] === "Management" && m.index > 5)) continue;
    const key = n.title.toLowerCase().replace(/[^a-z ]/g, "").split(" ").slice(0, 5).join(" ");
    if (seen.has(key) || out.some((o) => o.cat === cat[0] && Math.abs(o.t - n.t) < 3 * 864e5)) continue;
    seen.add(key);
    const es = TR.get(n.title) || (n.title_es && n.title_es !== n.title ? n.title_es : null);
    out.push({ cat: cat[0], t: n.t, title: es || n.title, en: es ? null : n.title, url: n.url, src: n.publisher });
  }
  out.sort((a, b) => NEWS_CATS.findIndex((c) => c[0] === a.cat) - NEWS_CATS.findIndex((c) => c[0] === b.cat) || b.t - a.t);
  const picked = []; for (const x of out) { if (picked.length >= 3) break; if (picked.filter((p) => p.cat === x.cat).length < 2) picked.push(x); }
  const SEC = { "1.01": "Contrato", "2.01": "Adquisición", "5.02": "Management" };
  for (const f of fil) {
    if (picked.length >= 3) break;
    const it = f.items.find((x) => SEC[x]); if (!it) continue;
    if (picked.some((p) => p.cat === SEC[it])) continue;
    picked.push({ cat: SEC[it], t: Date.parse(f.date), title: `${f.labels.find((l) => l) || "Hecho relevante"} (presentación 8-K a la SEC)`, url: f.url });
  }
  return picked.sort((a, b) => b.t - a.t);
}

// ---------- Qué dijo el management ----------
function talkPros(tk, pro, con, add) {
  const t = talkRead(tk);
  if (t.g?.[0] === "sube") add(pro, "El management subió su guidance en el último comunicado de resultados.", "Management");
  if (t.g?.[0] === "baja") add(con, "El management bajó su guidance en el último comunicado de resultados.", "Management");
  if (t.toneTxt === "Cauto") add(con, "El tono del management en el último comunicado fue cauto (menciona presiones, desafíos o incertidumbre).", "Management");
}
function talkHtml(tk, r) {
  if (!tk) return `<div class="talk"><h4>Qué dijo el management</h4><div class="na" style="font-size:13px">No encontré un comunicado de resultados con citas del management en la SEC en los últimos 6 meses. <a href="https://www.google.com/search?q=${encodeURIComponent((r.n || r.s) + " earnings call transcript")}" target="_blank" rel="noopener" style="color:#93c5fd">Buscar la transcripción de la última llamada ↗</a></div></div>`;
  const t = talkRead(tk);
  const toneCls = t.toneTxt === "Optimista" ? "pos" : t.toneTxt === "Cauto" ? "neg" : "";
  return `<div class="talk">
    <h4>Qué dijo el management <span class="na" style="font-weight:400">· comunicado de resultados del ${fmtDate(Date.parse(tk.date))} · <a href="${esc(tk.url)}" target="_blank" rel="noopener" style="color:#93c5fd">documento en la SEC ↗</a></span></h4>
    <div class="talk-read">
      ${t.toneTxt ? `<span class="pill ${toneCls}">Tono: ${t.toneTxt}</span>` : ""}
      ${t.g ? `<span class="pill ${t.g[1]}">${t.g[2]}</span>` : `<span class="pill">Sin guidance en el comunicado</span>`}
      ${t.themes.map((x) => `<span class="pill dim">${esc(x)}</span>`).join("")}
    </div>
    ${tk.quotes.map((q) => `<blockquote>“${esc(q.es || q.text)}”<cite>${esc([q.who, q.title].filter(Boolean).join(", ") || "Management")}</cite></blockquote>`).join("")}
    ${tk.outlook.length ? `<div style="margin-top:8px"><b style="font-size:13px">Qué espera para adelante</b><ul class="tl" style="margin-top:4px">${tk.outlook.map((o, i) => `<li>${esc(tk.outlook_es?.[i] || o)}</li>`).join("")}</ul></div>` : ""}
    <div class="na" style="font-size:12px;margin-top:8px">Citas textuales del comunicado oficial, no del reporte de ganancias. <a href="https://www.google.com/search?q=${encodeURIComponent((r.n || r.s) + " earnings call transcript")}" target="_blank" rel="noopener" style="color:#93c5fd">Transcripción completa de la llamada ↗</a></div>
  </div>`;
}

// ---------- Tesis automática: oportunidad y riesgos ----------
function renderThesis() {
  const el = $("autoThesis"); if (!el) return;
  const r = P.r, pr = P.prof;
  if (!pr) return;
  const o = pr.owners || {}, an = pr.analysts || {}, eh = pr.earnings?.history || [], fil = pr.filings || [], nws = pr.news || [];
  const prof = PROFILES[r.profile], g = r.gscore;
  const pro = [], con = [], deals = [], mgmt = [];
  const add = (arr, t, tag) => arr.push({ t, tag });

  // Métricas
  r.why.filter((w) => !/historia/i.test(w.t)).slice(0, 3).forEach((w) => add(pro, w.t, "Métricas"));
  r.why.filter((w) => /historia|piso del ciclo/i.test(w.t)).slice(0, 2).forEach((w) => add(pro, w.t, "Valuación"));
  if (ok(r.backlog) && r.backlog >= 1) add(pro, `Tiene contratos firmados por ${fmtBig(r.fx.latest.rpoUsd)} pendientes de facturar: ${fmt(r.backlog, "x", 1)} sus ventas anuales. Da visibilidad de ingresos para los próximos años.`, "Contratos");
  if (ok(r.epsNY) && r.epsNY > 15) add(pro, `El consenso espera que el EPS crezca ${fmt(r.epsNY, "%", 0)} el próximo año fiscal.`, "Crecimiento");
  if (ok(r.rule40) && r.rule40 >= 40 && ["software", "internet", "payments", "neocloud"].includes(r.profile)) add(pro, `Rule of 40 de ${fmt(r.rule40, "%", 0)}: crece rápido sin descuidar la caja.`, "Métricas");
  if (ok(r.omTrend) && r.omTrend > 3) add(pro, `Apalancamiento operativo: el margen operativo mejoró ${fmt(r.omTrend, "pp", 1)} en los últimos 3 ejercicios.`, "Métricas");
  // Noticias clave (máx. 3): contratos, acuerdos, adquisiciones, cambio de CEO, recompras, dividendos, guidance
  const kn = keyNews(nws, fil, r);
  const pend = kn.filter((k) => k.en && !TR.has(k.en));
  if (pend.length) { pend.forEach((k) => TR.set(k.en, null)); Promise.all(pend.map((k) => translateEs(k.en).then((t) => t && TR.set(k.en, t)))).then(() => { if (P.r === r) renderThesis(); }); }
  kn.forEach((k) => deals.push(`<a href="${esc(k.url)}" target="_blank" rel="noopener"><span class="tag">${esc(k.cat)}</span>${fmtDate(k.t)} · ${esc(k.title)}${k.src ? ` <span class="na">(${esc(k.src)})</span>` : ""} ↗</a>`));
  if (pr.talk) talkPros(pr.talk, pro, con, add);
  // Management y dueños
  const p = pr.profile || {};
  if (p.ceo) mgmt.push(`CEO: ${esc(p.ceo.name)}${p.ceo.age ? `, ${p.ceo.age} años` : ""}.`);
  if (ok(o.insiders)) { const ins = o.insiders * 100; mgmt.push(`Los directivos y fundadores tienen ${fmt(ins, "%", 1)} de las acciones${ins >= 10 ? ": están alineados con el accionista." : "."}`); if (ins >= 10) add(pro, `Management con piel en el juego: los insiders tienen ${fmt(ins, "%", 0)} de la empresa.`, "Management"); }
  if (ok(o.insiderNet6m) && (o.insiderBuys6m || o.insiderSells6m)) {
    const buy = o.insiderNet6m > 0, nb = o.insiderBuys6m || 0, ns = o.insiderSells6m || 0;
    mgmt.push(`Últimos 6 meses: ${nb} compras y ${ns} ventas de insiders${nb && ns ? ` (en cantidad de acciones, neto ${buy ? "comprador" : "vendedor"}; las "compras" suelen incluir ejercicio de opciones)` : ""}.`);
    if (buy && nb >= 2 && nb > ns) add(pro, `Los insiders compraron acciones en los últimos 6 meses (${o.insiderBuys6m} operaciones): señal de confianza.`, "Management");
  }
  const mchg = fil.filter((f) => f.items.includes("5.02"));
  if (mchg.length) mgmt.push(`Cambios en directorio o management en el último año: ${mchg.slice(0, 3).map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${fmtDate(f.date)} ↗</a>`).join(", ")}.`);
  // Analistas
  const ups = (an.grades || []).filter((x) => x.action === "up").length, downs = (an.grades || []).filter((x) => x.action === "down").length;
  if (ok(an.targetMean) && ok(r.px)) { const up = (an.targetMean / r.px - 1) * 100; if (up >= 15) add(pro, `Los ${an.n || ""} analistas que la cubren ven un precio objetivo promedio de ${fmt(an.targetMean)} (${fmt(up, "%", 0)} arriba del precio actual).`, "Analistas"); if (up < -5) add(con, `El precio ya supera el objetivo promedio de los analistas (${fmt(an.targetMean)}).`, "Analistas"); }
  if (ups >= 2 && ups > downs) add(pro, `${ups} mejoras de recomendación en los últimos 4 meses.`, "Analistas");
  if (downs >= 2 && downs > ups) add(con, `${downs} bajas de recomendación en los últimos 4 meses.`, "Analistas");
  // Riesgos
  r.alerts.filter((a) => !/historia|pico del ciclo/i.test(a.t)).slice(0, 4).forEach((a) => add(con, a.t, "Métricas"));
  r.alerts.filter((a) => /historia|pico del ciclo/i.test(a.t)).slice(0, 2).forEach((a) => add(con, a.t, "Valuación"));
  if (ok(o.shortFloat) && o.shortFloat > 0.08) add(con, `${fmt(o.shortFloat * 100, "%", 1)} de las acciones en circulación están vendidas en corto: hay inversores apostando a la baja (y potencial short squeeze).`, "Mercado");
  if (ok(o.insiderNet6m) && o.insiderNet6m < 0 && (o.insiderSells6m || 0) >= 5) add(con, `Los insiders vendieron en ${o.insiderSells6m} ocasiones en los últimos 6 meses.`, "Management");
  if (ok(r.beta) && r.beta > 1.6) add(con, `Muy volátil: beta de ${fmt(r.beta, "n", 2)} (se mueve ${fmt(r.beta, "n", 1)} veces lo que el mercado).`, "Mercado");
  if (ok(g["Valuación"]) && g["Valuación"] < 30) add(con, `Cara contra sus pares (valuación peor que el ${100 - g["Valuación"]}% de ${r.peerLabel}): poco margen de error.`, "Valuación");
  if (r.c === "CN" || r.c === "HK") add(con, "Riesgo China: regulación, tensiones comerciales con EE.UU. y estructura VIE de los ADRs.", "País");
  if (r.c === "AR") add(con, "Riesgo Argentina: macro, tipo de cambio y controles.", "País");
  if (r.c === "BR") add(con, "Riesgo Brasil: tasas altas, real volátil e intervención política en estatales.", "País");
  if (r.kpi?.conc && Number(r.kpi.conc) >= 30) add(con, `Concentración de clientes: el principal cliente representa ${r.kpi.conc}% de las ventas.`, "Clientes");
  if (pr.earnings?.next && pr.earnings.next - Date.now() < 21 * 864e5 && pr.earnings.next > Date.now()) add(con, `Presenta resultados el ${fmtDate(pr.earnings.next)}: espera volatilidad alrededor de esa fecha.`, "Calendario");
  const newDebt = fil.filter((f) => f.items.includes("2.03")).length, newShares = fil.filter((f) => f.items.includes("3.02")).length;
  if (newDebt >= 2) add(con, `Tomó deuda nueva relevante ${newDebt} veces en el último año (presentaciones 8-K a la SEC).`, "Financiamiento");
  if (newShares >= 1) add(con, `Emitió acciones fuera de oferta pública ${newShares === 1 ? "una vez" : newShares + " veces"} en el último año: posible dilución.`, "Financiamiento");
  if (r.profile === "neocloud") add(con, "Modelo intensivo en capital: necesita financiar compras masivas de GPUs y data centers con deuda o emisión de acciones, y depende de pocos clientes grandes.", "Modelo de negocio");
  // Veredicto
  const val = g["Valuación"], cal = g["Calidad"], cre = g["Crecimiento"];
  const verdict = !ok(r.score) ? "Sin datos suficientes para un veredicto."
    : r.score >= 70 && val >= 55 ? `<b class="pos">Oportunidad:</b> buena empresa contra sus pares y a precio razonable. Validá la tesis con los contratos y el management de abajo.`
    : r.score >= 70 ? `<b>Calidad alta pero no barata:</b> buena empresa contra sus pares; conviene esperar un mejor precio o confirmar que el crecimiento justifica el múltiplo.`
    : cre >= 70 && val < 45 ? `<b>Historia de crecimiento:</b> crece más que sus pares pero se paga caro. La tesis depende de que el crecimiento se sostenga.`
    : val >= 70 && cal < 45 ? `<b>Barata por algo:</b> cotiza barata pero la calidad del negocio está floja. Posible trampa de valor si no hay un catalizador.`
    : `<b>Sin ventaja clara:</b> no se destaca contra sus pares. Necesita un catalizador concreto (contratos, cambio de management, nuevo producto).`;
  const li = (arr) => arr.map((x) => `<li><span class="tag">${esc(x.tag)}</span>${esc(x.t)}</li>`).join("");
  el.innerHTML = `<div class="verdict">${verdict}</div>
    ${talkHtml(pr.talk, r)}
    <div class="two tz">
      <div><h4 class="pos">Por qué podría ser una oportunidad</h4><ul class="tl">${li(pro) || '<li class="na">No aparecen fortalezas claras en los datos.</li>'}</ul></div>
      <div><h4 class="neg">Riesgos</h4><ul class="tl">${li(con) || '<li class="na">No aparecen riesgos destacados en los datos.</li>'}</ul></div>
    </div>
    <div class="two tz">
      <div><h4>Noticias clave</h4><ul class="tl links">${deals.map((d) => `<li>${d}</li>`).join("") || '<li class="na">Sin contratos, acuerdos, cambios de management ni recompras en las noticias recientes.</li>'}</ul></div>
      <div><h4>Management y dueños</h4><ul class="tl">${mgmt.map((d) => `<li>${d}</li>`).join("") || '<li class="na">Sin datos de management.</li>'}</ul>

        ${ok(an.targetMean) ? `<h4 style="margin-top:12px">Analistas</h4><ul class="tl"><li>Recomendación: ${esc({ strong_buy: "compra fuerte", buy: "compra", hold: "mantener", sell: "venta", strong_sell: "venta fuerte", underperform: "por debajo del mercado", outperform: "por encima del mercado" }[an.recKey] || an.recKey || "—")} · ${an.n || "—"} analistas</li><li>Precio objetivo: ${fmt(an.targetLow)} a ${fmt(an.targetHigh)} (promedio ${fmt(an.targetMean)})</li>${pr.earnings?.next ? `<li>Próximos resultados: ${fmtDate(pr.earnings.next)}</li>` : ""}</ul>` : ""}</div>
    </div>
    <div class="src">Fuentes: score propio, comunicado de resultados y hechos relevantes presentados a la SEC (8-K / 6-K), Yahoo Finance (insiders, analistas, noticias). Citas traducidas automáticamente. El TAM no viene en ningún dato público: cargalo en "Tu tesis" para el chequeo de valuación. Es material de análisis, no una recomendación.</div>`;
  P.autoThesis = { verdict, pro, con, deals, mgmt, talk: pr.talk ? talkRead(pr.talk) : null };
}

// ---------- Chequeo por TAM ----------
function tamVals() {
  const n = (id) => { const v = $(id)?.value; return v === "" || v == null ? null : Number(v); };
  return { tam: n("tTam"), share: n("tShare"), margin: n("tMargin"), mult: n("tMult"), rate: n("tRate") };
}
function updateTam() {
  const r = P.r, t = tamVals(), box = $("tamBox"); if (!box) return;
  if (![t.tam, t.share, t.margin, t.mult].every(ok)) { box.textContent = "Completá TAM, share, margen y múltiplo para ver la valuación implícita."; return; }
  const value = (t.tam * 1e9 * (t.share / 100) * (t.margin / 100) * t.mult) / Math.pow(1 + (t.rate ?? 12) / 100, 5);
  const shares = ok(r.mcap) && ok(r.px) && r.cur === "USD" ? r.mcap / r.px : null;
  const per = shares ? value / shares : null;
  box.innerHTML = `Valor de la empresa hoy según el TAM: <b>${fmtBig(value)}</b> vs market cap ${fmtCap(r.mcap)} (${value >= r.mcap ? "+" : ""}${nf(0).format((value / r.mcap - 1) * 100)}%)${per ? ` · <b>${fmt(per)} por acción</b>` : ""}.`;
}

function thesisVals() {
  const n = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };
  return { bear: n("tBear"), base: n("tBase"), bull: n("tBull") };
}
function fairValue(t) {
  const pts = [[t.bear, 0.25], [t.base, 0.5], [t.bull, 0.25]].filter(([v]) => ok(v));
  if (!pts.length) return null;
  const w = pts.reduce((s, [, x]) => s + x, 0);
  return pts.reduce((s, [v, x]) => s + v * x, 0) / w;
}
function updateFair() {
  const r = P.r, t = thesisVals(), fv = fairValue(t), box = $("fairBox");
  if (!fv) { box.innerHTML = `<span class="na">Cargá al menos el precio justo base. El ponderado usa 25% pesimista, 50% base y 25% optimista.</span>`; return; }
  const up = (fv / r.px - 1) * 100, buy = fv * 0.8;
  box.innerHTML = `<div><div class="na" style="font-size:12px">Precio justo ponderado</div><div class="big num">${fmt(fv)} ${esc(r.cur || "")}</div></div>
    <div><div class="na" style="font-size:12px">Distancia al precio actual</div><div class="big num ${up >= 0 ? "pos" : "neg"}">${up >= 0 ? "+" : ""}${nf(1).format(up)}%</div></div>
    <div><div class="na" style="font-size:12px">Precio de compra con 20% de margen de seguridad</div><div class="big num">${fmt(buy)}</div></div>
    <div class="na" style="font-size:12.5px;align-self:center">${r.px <= buy ? "El precio actual ya está debajo del precio de compra." : `Le falta caer ${nf(1).format((1 - buy / r.px) * 100)}% para llegar al precio de compra.`}</div>`;
}

// ---------- Historia y gráficos ----------
function cagr(a, b, n) { return ok(a) && ok(b) && a > 0 && b > 0 && n > 0 ? (Math.pow(b / a, 1 / n) - 1) * 100 : null; }
function lastN(arr, n) { return arr.slice(Math.max(0, arr.length - n)); }
function chartDefs(h) {
  const y = h.years, s = h.series, cur = h.currency || "USD";
  const scale = (arr) => arr.map((v) => (ok(v) ? v / 1e9 : null));
  const unit = `${cur === "USD" ? "US$" : cur} miles de millones`;
  const mg = (num) => y.map((_, i) => (ok(num[i]) && s.revenue[i] > 0 ? (num[i] / s.revenue[i]) * 100 : null));
  const iv = (arr) => { const v = arr.map((x, i) => [i, x]).filter(([, x]) => ok(x)); return v.length >= 2 ? [v[0], v.at(-1)] : null; };
  const defs = [];
  // 1. Ventas y ganancia
  { const a = iv(s.revenue); const g = a ? cagr(a[0][1], a[1][1], a[1][0] - a[0][0]) : null; const neg = s.netIncome.filter((x) => ok(x) && x < 0).length;
    defs.push({ t: "Ventas y ganancia neta", read: `${ok(g) ? `Las ventas crecieron ${nf(1).format(g)}% anual entre ${y[a[0][0]]} y ${y[a[1][0]]}.` : ""}${neg ? ` Tuvo pérdidas en ${neg} de ${y.length} años.` : " Ganó plata todos los años."}`,
      type: "bar", labels: y, sets: [{ l: "Ventas", d: scale(s.revenue), c: 0 }, { l: "Ganancia neta", d: scale(s.netIncome), c: 1 }], unit }); }
  // 2. Márgenes
  { const gm = mg(s.grossProfit), om = mg(s.operatingIncome), nm = mg(s.netIncome);
    const o = om.filter(ok); const tr = o.length >= 3 ? o.at(-1) - o[0] : null;
    defs.push({ t: "Márgenes", read: ok(tr) ? `El margen operativo ${tr > 1 ? "mejoró" : tr < -1 ? "empeoró" : "se mantuvo"} ${Math.abs(tr) > 1 ? nf(1).format(Math.abs(tr)) + " puntos" : ""} en el período (hoy ${nf(1).format(o.at(-1))}%).` : "Sin datos suficientes de márgenes.",
      type: "line", labels: y, sets: [{ l: "Bruto", d: gm, c: 2 }, { l: "Operativo", d: om, c: 0 }, { l: "Neto", d: nm, c: 1 }], unit: "%" }); }
  // 3. Caja libre vs ganancia
  { const f3 = lastN(s.fcf, 3).filter(ok), n3 = lastN(s.netIncome, 3).filter(ok);
    const conv = f3.length === 3 && n3.length === 3 && n3.reduce((a, b) => a + b, 0) > 0 ? (f3.reduce((a, b) => a + b, 0) / n3.reduce((a, b) => a + b, 0)) * 100 : null;
    defs.push({ t: "Caja libre vs ganancia", read: ok(conv) ? `En los últimos 3 años convirtió el ${nf(0).format(conv)}% de su ganancia en caja libre${conv >= 90 ? ": ganancias de calidad." : conv < 60 ? ": ojo, la ganancia no se ve en la caja." : "."}` : "La caja libre es lo que queda después de invertir: lo que puede repartir o usar para crecer.",
      type: "bar", labels: y, sets: [{ l: "Free cash flow", d: scale(s.fcf), c: 2 }, { l: "Ganancia neta", d: scale(s.netIncome), c: 1 }], unit }); }
  // 4. Deuda vs caja
  { const d = s.debt.at(-1), c = s.cash.at(-1);
    defs.push({ t: "Deuda vs caja", read: ok(d) && ok(c) ? (c >= d ? `Tiene más caja que deuda (caja neta de ${fmtBig(c - d, cur)}).` : `Deuda neta de ${fmtBig(d - c, cur)}${ok(P.r.ndEbitda) ? `, ${nf(1).format(P.r.ndEbitda)} veces su EBITDA` : ""}.`) : "Sin datos de deuda.",
      type: "bar", labels: y, sets: [{ l: "Deuda", d: scale(s.debt), c: 3 }, { l: "Caja", d: scale(s.cash), c: 2 }], unit }); }
  // 5. Precio vs EPS
  if (P.hist?.price?.length) {
    const px = P.hist.price, eps = s.eps;
    const yearEnd = y.map((yy) => { const t = Date.UTC(Number(yy), 11, 31); let best = null; for (const p of px) { if (p.t <= t) best = p.c; else break; } return best; });
    const pe = y.map((_, i) => (ok(yearEnd[i]) && eps[i] > 0 ? yearEnd[i] / eps[i] : null));
    const peOk = pe.filter(ok);
    const avgPe = peOk.length ? peOk.reduce((a, b) => a + b, 0) / peOk.length : null;
    defs.push({ t: "P/E de cada año", read: ok(avgPe) && ok(P.r.pe) ? `Hoy cotiza a ${nf(1).format(P.r.pe)}x ganancias; el promedio de estos años fue ${nf(1).format(avgPe)}x, así que está ${P.r.pe < avgPe * 0.9 ? "más barata" : P.r.pe > avgPe * 1.1 ? "más cara" : "en línea con"} ${P.r.pe < avgPe * 0.9 || P.r.pe > avgPe * 1.1 ? "que su historia" : "su historia"}.` : "Precio al cierre de cada año dividido el EPS de ese año.",
      type: "line", labels: y, sets: [{ l: "P/E", d: pe, c: 0 }], unit: "x", avg: avgPe });
    const w = px.filter((_, i) => i % 2 === 0);
    const p5 = px.length > 260 ? (px.at(-1).c / px[px.length - 261].c - 1) * 100 : null;
    defs.push({ t: "Precio (10 años)", read: ok(p5) ? `En los últimos 5 años la acción ${p5 >= 0 ? "subió" : "bajó"} ${nf(0).format(Math.abs(p5))}%.` : "", type: "line", labels: w.map((p) => new Date(p.t).toISOString().slice(0, 7)), sets: [{ l: `Precio (${P.r.cur || ""})`, d: w.map((p) => p.c), c: 0 }], unit: P.r.cur || "", dense: true });
  }
  return defs;
}
const PAL = { dark: { c: ["#3b82f6", "#22c55e", "#a78bfa", "#ef4444"], grid: "#1e2a44", text: "#94a3b8" }, light: { c: ["#2563eb", "#16a34a", "#7c3aed", "#dc2626"], grid: "#e5e7eb", text: "#4b5563" } };
function chartConfig(d, theme) {
  const p = PAL[theme], fs = theme === "dark" ? 10.5 : 15;
  return {
    type: d.type,
    data: { labels: d.labels, datasets: d.sets.map((s) => ({ label: s.l, data: s.d, backgroundColor: p.c[s.c] + (d.type === "bar" ? "cc" : "33"), borderColor: p.c[s.c], borderWidth: 2, pointRadius: d.dense ? 0 : 2, tension: 0.25, fill: false, spanGaps: true, borderRadius: 4 })) },
    options: {
      responsive: theme === "dark", maintainAspectRatio: false, animation: theme === "dark", devicePixelRatio: theme === "dark" ? undefined : 1.5,
      plugins: { legend: { labels: { color: p.text, boxWidth: 10, font: { size: fs + 0.5 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ok(c.raw) ? nf(d.unit === "%" ? 1 : 2).format(c.raw) : "—"} ${d.unit === "%" ? "%" : d.unit === "x" ? "x" : ""}` } } },
      scales: { x: { ticks: { color: p.text, maxTicksLimit: d.dense ? 8 : 12, font: { size: fs } }, grid: { display: false } }, y: { ticks: { color: p.text, font: { size: fs } }, grid: { color: p.grid }, title: { display: !!d.unit && d.unit !== "x", text: d.unit, color: p.text, font: { size: fs } } } },
    },
  };
}
function renderHistory() {
  P.charts.forEach((c) => c.destroy()); P.charts = [];
  const h = P.hist?.history, el = $("charts"); if (!el) return;
  if (!h || !h.years?.length) { $("histSrc").textContent = ""; el.innerHTML = `<div class="card na">No hay estados contables disponibles para ${esc(P.r.ced || P.r.s)}.</div>`; return; }
  $("histSrc").textContent = `Fuente: ${h.source} · ${h.years[0]}–${h.years.at(-1)}${h.currency && h.currency !== "USD" ? " · montos en " + h.currency : ""}`;
  P.defs = chartDefs(h);
  el.innerHTML = P.defs.map((d, i) => `<div class="card ch"><h3>${d.t}</h3><div class="read">${esc(d.read || "")}</div><div class="box"><canvas id="c${i}"></canvas></div></div>`).join("");
  if (!window.Chart) return;
  P.defs.forEach((d, i) => P.charts.push(new Chart($("c" + i), chartConfig(d, "dark"))));
}
function chartImages() {
  if (!window.Chart || !P.defs) return [];
  return P.defs.map((d) => {
    const cv = document.createElement("canvas"); cv.width = 760; cv.height = 360;
    const wrap = document.createElement("div"); wrap.style.cssText = "position:fixed;left:-9999px;width:760px;height:360px"; wrap.appendChild(cv); document.body.appendChild(wrap);
    const c = new Chart(cv, chartConfig(d, "light")); const url = c.toBase64Image(); c.destroy(); wrap.remove();
    return { t: d.t, read: d.read, url };
  });
}

// ---------- PDF ----------
function pdf() {
  const r = P.r, ov = state.ov.get(r.s) || {}, th = ov.metrics?.thesis || {}, fv = fairValue(th);
  const cls = (s) => (!ok(s) ? "" : s >= 70 ? "g" : s >= 45 ? "m2" : "b");
  const imgs = chartImages();
  const peers = peersOf(r).list.slice(0, 7), cols = peerCols(r);
  $("printRoot").innerHTML = `<div class="rp">
    <h1>${esc(r.ced || r.s)} · ${esc(r.n)}</h1>
    <div class="sub">${esc(SECTORS[r.sec])} · ${esc(COUNTRIES[r.c] || r.c)} · ${LYNCH[r.lynch] || "sin tipo"} · ${today()}</div>
    <div class="kp">
      <div><div class="l">Score</div><div class="v ${cls(r.score)}">${r.score ?? "—"}/100</div></div>
      <div><div class="l">Precio</div><div class="v">${fmt(r.px)} ${esc(r.cur || "")}</div></div>
      <div><div class="l">Market cap</div><div class="v">${fmtCap(r.mcap)}</div></div>
      <div><div class="l">${fv ? "Precio justo (ponderado)" : "Target analistas"}</div><div class="v">${fv ? `${fmt(fv)} (${fv >= r.px ? "+" : ""}${nf(0).format((fv / r.px - 1) * 100)}%)` : fmt(r.tgt)}</div></div>
      ${GROUPS.filter((g) => r.gscore[g] != null).slice(0, 4).map((g) => `<div><div class="l">${g}</div><div class="v ${cls(r.gscore[g])}">${r.gscore[g]}</div></div>`).join("")}
    </div>
    <h2>En una frase</h2><div>${oneLiner(r).replace(/<b class="pos">/g, "<b>")}</div>
    ${P.prof?.profile?.summary ? `<h2>Qué hace</h2><div style="line-height:1.5">${esc(P.prof.profile.summary.slice(0, 1200))}${P.prof.profile.summary.length > 1200 ? "…" : ""}</div>` : ""}
    ${P.autoThesis ? `<h2>Tesis automática</h2><div>${P.autoThesis.verdict.replace(/<b class="pos">/g, "<b>")}</div>
      <div class="imgs" style="margin-top:6px"><div><b>Por qué podría ser una oportunidad</b><ul>${P.autoThesis.pro.map((x) => `<li>${esc(x.t)}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div><b>Riesgos</b><ul>${P.autoThesis.con.map((x) => `<li>${esc(x.t)}</li>`).join("") || "<li>—</li>"}</ul></div></div>
      ${P.autoThesis.talk ? `<b>Qué dijo el management (${fmtDate(Date.parse(P.autoThesis.talk.date))})</b><ul>${[P.autoThesis.talk.toneTxt ? "Tono: " + P.autoThesis.talk.toneTxt : "", P.autoThesis.talk.g ? P.autoThesis.talk.g[2] : ""].filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("")}${P.autoThesis.talk.quotes.map((q) => `<li>“${esc(q.es || q.text)}” — ${esc([q.who, q.title].filter(Boolean).join(", "))}</li>`).join("")}${P.autoThesis.talk.outlook.map((o, i) => `<li>${esc(P.autoThesis.talk.outlook_es?.[i] || o)}</li>`).join("")}</ul>` : ""}
      ${P.autoThesis.deals.length ? `<b>Noticias clave</b><ul>${P.autoThesis.deals.map((d) => `<li>${d.replace(/<[^>]+>/g, "").replace(" ↗", "")}</li>`).join("")}</ul>` : ""}
      ${P.autoThesis.mgmt.length ? `<b>Management y dueños</b><ul>${P.autoThesis.mgmt.map((d) => `<li>${d.replace(/<[^>]+>/g, "").replace(/ ↗/g, "")}</li>`).join("")}</ul>` : ""}` : ""}
    ${fv ? `<h2>Precio justo</h2><table><thead><tr><th class="l">Escenario</th><th>Precio</th><th>Distancia</th></tr></thead><tbody>${[["Pesimista", th.bear], ["Base", th.base], ["Optimista", th.bull], ["Ponderado (25/50/25)", fv], ["Compra con 20% de margen", fv * 0.8]].filter(([, v]) => ok(v)).map(([l, v]) => `<tr><td class="l">${l}</td><td>${fmt(v)}</td><td>${v >= r.px ? "+" : ""}${nf(1).format((v / r.px - 1) * 100)}%</td></tr>`).join("")}</tbody></table>` : ""}
    ${r.notes ? `<h2>Tesis</h2><div class="notes">${esc(r.notes)}</div>` : ""}
    ${th.sell ? `<h2>Reglas de venta</h2><div class="notes">${esc(th.sell)}</div>` : ""}
    <h2>A favor</h2><ul>${r.why.slice(0, 5).map((w) => `<li>${esc(w.t)}</li>`).join("") || "<li>Ninguna métrica se destaca contra su sector.</li>"}</ul>
    <h2>A vigilar</h2><ul>${r.alerts.slice(0, 5).map((w) => `<li>${esc(w.t)}</li>`).join("") || "<li>Sin señales de alarma.</li>"}</ul>
    ${imgs.length ? `<h2>Historia${P.hist?.history ? ` (${esc(P.hist.history.source)})` : ""}</h2><div class="imgs">${imgs.map((i) => `<div><b>${esc(i.t)}</b><p>${esc(i.read || "")}</p><img src="${i.url}" alt="${esc(i.t)}"></div>`).join("")}</div>` : ""}
    <h2>Contra sus pares</h2><table><thead><tr><th class="l">Empresa</th><th>Score</th><th>Mkt cap</th>${cols.map((k) => `<th>${esc(METRICS[k].l)}</th>`).join("")}</tr></thead><tbody>${[r, ...peers].map((x) => `<tr><td class="l">${x === r ? "<b>" : ""}${esc(x.ced || x.s)} ${esc((x.n || "").slice(0, 22))}${x === r ? "</b>" : ""}</td><td class="${cls(x.score)}">${x.score ?? "—"}</td><td>${fmtCap(x.mcap)}</td>${cols.map((k) => `<td>${fmt(x[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <h2>Métricas de ${esc(PROFILES[r.profile].l.toLowerCase())} contra ${esc(r.peerLabel)} y contra su historia</h2><table class="pb"><thead><tr><th class="l">Métrica</th><th>${esc(r.ced || r.s)}</th><th>Mediana pares</th><th>Percentil</th><th>Prom. propio</th><th>Vs historia</th><th>Peso</th></tr></thead><tbody>${Object.entries(r.weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => { const m = METRICS[k], h = r.hist[k], tot = Object.values(r.weights).reduce((s, x) => s + x, 0); return `<tr><td class="l">${m.l}</td><td>${fmt(r[k], m.f, m.d)}</td><td>${fmt(r.med[k], m.f, m.d)}</td><td>${r.pct[k] != null ? "P" + r.pct[k] : "—"}</td><td>${h ? fmt(h.avg, m.f, m.d) : "—"}</td><td>${h ? h.p : "—"}</td><td>${nf(0).format((w / tot) * 100)}%</td></tr>`; }).join("")}</tbody></table>
    ${Object.keys(r.kpi || {}).length ? `<h2>KPIs del sector</h2><table><tbody>${PROFILES[r.profile].kpi.filter((x) => r.kpi[x.k]).map((x) => `<tr><td class="l">${esc(x.l)}</td><td>${esc(r.kpi[x.k])}</td></tr>`).join("")}</tbody></table>` : ""}
    <div class="foot">Score: percentiles contra sus pares, ponderados como ${esc(PROFILES[r.profile].l.toLowerCase())}${r.lynch ? " y tipo " + LYNCH[r.lynch] : ""}. Fuentes: Yahoo Finance${P.hist?.history ? ", " + esc(P.hist.history.source) : ""}. ${esc(r.ced || r.s)} se opera en BYMA${r.ced && r.ced !== r.s ? " como CEDEAR" : ""}. Material de análisis propio, no constituye recomendación de inversión.</div>
  </div>`;
  const t = document.title; document.title = `${r.ced || r.s} tesis ${today().replaceAll("/", "-")}`;
  setTimeout(() => { window.print(); document.title = t; }, 80);
}

// ---------- Eventos ----------
function bindPage() {
  const r = P.r;
  $("bPdf").onclick = pdf;
  $("bCmp").onclick = () => { const c = new Set(loadLocal("scr_cmp", [])); c.has(r.s) ? c.delete(r.s) : c.add(r.s); saveLocal("scr_cmp", [...c]); $("bCmp").textContent = c.has(r.s) ? "✓ En comparar" : "+ Comparar"; toast(c.has(r.s) ? "Agregada a comparar en el Screener" : "Quitada de comparar"); };
  ["tBear", "tBase", "tBull"].forEach((id) => ($(id).oninput = updateFair));
  ["tTam", "tShare", "tMargin", "tMult", "tRate"].forEach((id) => ($(id).oninput = updateTam));
  $("tSave").onclick = async () => {
    const t = thesisVals(), fv = fairValue(t);
    const ok2 = await saveOverride(r.s, { fair_value: fv, lynch_type: $("tLynch").value || null, notes: $("tNotes").value || null, metrics: { thesis: { ...t, ...tamVals(), sell: $("tSell").value || null }, profile: $("tProf").value || null } });
    if (ok2) { toast("Tesis guardada"); rescore(); }
  };
  if ($("tReset")) $("tReset").onclick = async () => { const o = state.ov.get(r.s); await saveOverride(r.s, { metrics: Object.fromEntries(Object.keys(o?.metrics || {}).filter((k) => k !== "thesis").map((k) => [k, null])) }); rescore(); };
  const curPeers = () => peersOf(r).list.map((x) => x.s);
  const setPeers = async (list) => { await saveOverride(r.s, { metrics: { peers: list } }); rescore(); };
  document.querySelectorAll("[data-rmpeer]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); setPeers(curPeers().filter((s) => s !== b.dataset.rmpeer)); }));
  const addPeer = () => { const s = resolve($("peerAdd").value); if (!s) return toast("No está en el universo operable desde Argentina"); if (s === r.s) return; if (!P.rows.find((x) => x.s === s)) return toast("Sin datos de mercado para esa acción"); setPeers([...new Set([...curPeers(), s])]); };
  $("peerAddBtn").onclick = addPeer;
  $("peerAdd").onkeydown = (e) => { if (e.key === "Enter") addPeer(); };
  if ($("peerReset")) $("peerReset").onclick = () => setPeers(null);
  document.querySelectorAll("[data-off]").forEach((cb) => (cb.onchange = async () => {
    const off = new Set(state.ov.get(r.s)?.metrics?.off || []);
    cb.checked ? off.delete(cb.dataset.off) : off.add(cb.dataset.off);
    await saveOverride(r.s, { metrics: { off: off.size ? [...off] : null } }); rescore();
  }));
  document.querySelectorAll("[data-kpi]").forEach((inp) => (inp.onchange = async () => { const kpi = { ...(state.ov.get(r.s)?.metrics?.kpi || {}) }; if (inp.value.trim()) kpi[inp.dataset.kpi] = inp.value.trim(); else delete kpi[inp.dataset.kpi]; await saveOverride(r.s, { metrics: { kpi } }); toast("KPI guardado"); }));
  document.querySelectorAll("tr.peer").forEach((tr) => (tr.onclick = () => { history.pushState({}, "", "?s=" + encodeURIComponent(tr.dataset.s)); load(tr.dataset.s); window.scrollTo(0, 0); }));
  document.querySelectorAll("[data-edit]").forEach((el) => (el.onclick = () => {
    if (el.querySelector("input")) return;
    const k = el.dataset.edit;
    el.innerHTML = `<input type="number" step="any" value="${ok(r[k]) ? Math.round(r[k] * 100) / 100 : ""}" placeholder="vacío = Yahoo">`;
    const inp = el.querySelector("input"); inp.focus(); inp.select();
    const commit = async () => { await saveOverride(r.s, { metrics: { [k]: inp.value === "" ? null : Number(inp.value) } }); rescore(); };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") inp.blur(); if (ev.key === "Escape") { inp.onblur = null; render(); } });
    inp.onblur = commit;
  }));
}
function rescore() {
  const y = window.scrollY;
  P.rows = [...P.rawMap.values()].map((x) => derive(x, state.ov.get(x.s), state.fund.get(x.s)));
  scoreAll(P.rows, { userMult: userMult(), profW: userProfW() });
  P.r = P.rows.find((x) => x.s === P.sym); render(); window.scrollTo(0, y);
}

(async function init() {
  initSearch();
  await initSupabase();
  state.onAuth = () => P.r && rescore();
  await Promise.all([loadOverrides(), loadFund()]);
  const q = new URLSearchParams(location.search);
  const s = q.get("s") || q.get("symbol");
  if (s) load(resolve(s) || s.toUpperCase());
})();
startLive(15000);
