import { UNIVERSE, SECTORS, COUNTRIES, MARKETS, SYMBOLS, BATCH_SIZE } from "/lib/universe.js";
import { METRICS, GROUPS, PROFILES, LYNCH, LYNCH_INFO, ok, derive, scoreAll, fmt, fmtCap, fmtBig, nf, scoreCls, profileOf, relevant } from "/js/score.js";
import { $, esc, toast, loadLocal, saveLocal, state, initSupabase, loadSnapshots, loadOverrides, saveOverride, userMult, withMeta, META, loadFund } from "/js/core.js";

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
  $("tickers").innerHTML = UNIVERSE.map((u) => `<option value="${esc(u[5] || u[0])} · ${esc(u[1])}">`).join("");
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
  scoreAll(P.rows, { userMult: userMult() });
}

async function load(sym) {
  P.sym = sym; P.hist = null;
  const meta = META.get(sym);
  $("root").innerHTML = `<div class="skeleton">Cargando ${esc(meta?.[5] || sym)}…</div>`;
  document.title = `${meta?.[5] || sym} · Ficha`;
  await loadRows(sym);
  P.r = P.rows.find((x) => x.s === sym);
  if (!P.r) { $("root").innerHTML = `<div class="empty">No encontré datos de ${esc(sym)}. Puede que Yahoo no tenga cotización hoy.</div>`; return; }
  render();
  const h = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (P.sym !== sym) return;
  P.hist = h; renderHistory();
}

// ---------- Lecturas en lenguaje claro ----------
function oneLiner(r) {
  const parts = [];
  const lt = r.lynch ? `una ${LYNCH[r.lynch]}` : "una empresa";
  parts.push(`<b>${esc(r.ced || r.s)}</b> es ${lt} del sector ${esc(SECTORS[r.sec].toLowerCase())}`);
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
  return keys.slice(0, 3).map((k) => `<div class="kv" title="${esc(METRICS[k].q)}"><span>${METRICS[k].l}</span><span class="num">${fmt(r[k], METRICS[k].f, METRICS[k].d)} <span class="na">· sector ${fmt(r.med[k], METRICS[k].f, METRICS[k].d)}</span></span></div>`).join("");
}

// ---------- Render ----------
// Pares: los que elegiste vos o, por defecto, los más grandes de la misma industria (si son pocos, del sector)
function peersOf(r) {
  const mine = state.ov.get(r.s)?.metrics?.peers;
  if (Array.isArray(mine)) return { list: mine.map((s) => P.rows.find((x) => x.s === s)).filter(Boolean), custom: true };
  let pool = P.rows.filter((x) => x.profile === r.profile && x.s !== r.s && ok(x.mcap));
  if (pool.length < 4) pool = P.rows.filter((x) => x.sec === r.sec && x.s !== r.s && ok(x.mcap));
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
  const chg = ok(r.chg) ? `<span class="${r.chg >= 0 ? "pos" : "neg"}">${r.chg >= 0 ? "+" : ""}${nf(2).format(r.chg)}% hoy</span>` : "";
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
          ${markets.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}
        </div>
        <div class="price"><span class="p num">${fmt(r.px)} <span class="na" style="font-size:14px">${esc(r.cur || "")}</span></span>${chg}<span class="na">Market cap ${fmtCap(r.mcap)}</span>${ok(r.tgt) ? `<span class="na">Target analistas ${fmt(r.tgt)} (${r.upside >= 0 ? "+" : ""}${nf(0).format(r.upside)}%)</span>` : ""}</div>
      </div>
      <div class="ring ${scoreCls(r.score)}" title="Score contra ${r.peerN} empresas de ${esc(r.peerLabel)}"><div class="v">${ok(r.score) ? r.score : "—"}</div><div class="l">Score / 100</div></div>
    </div>
    <div class="oneliner">${oneLiner(r)}</div>
    <div class="actions" style="margin-top:14px">
      <button class="btn" id="bPdf">⤓ PDF de la tesis</button>
      <button class="btn" id="bCmp">${(loadLocal("scr_cmp", [])).includes(r.s) ? "✓ En comparar" : "+ Comparar"}</button>
      <a class="btn" href="#tesis">Tu tesis ↓</a>
    </div>
  </section>

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
    <tbody>${[r, ...peers].map((x) => `<tr class="${x === r ? "me" : "peer"}" data-s="${esc(x.s)}"><td class="l">${esc(x.ced || x.s)} <span class="na">${esc((x.n || "").slice(0, 22))}</span></td><td><span class="score ${scoreCls(x.score)}">${x.score ?? "—"}</span></td><td>${fmtCap(x.mcap)}</td>${cols.map((k) => `<td class="num">${fmt(x[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}<td>${x === r ? "" : `<button class="x" data-rmpeer="${esc(x.s)}" title="Quitar de la comparación" aria-label="Quitar ${esc(x.ced || x.s)}">×</button>`}</td></tr>`).join("")}
      <tr class="med"><td class="l na">Mediana de ${esc(r.peerLabel)}</td><td></td><td></td>${cols.map((k) => `<td class="num na">${fmt(r.med[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}<td></td></tr>
    </tbody></table></div>
  <div class="actions" style="margin-top:10px">
    <input type="search" id="peerAdd" list="tickers" placeholder="Agregar comparable: ticker o nombre" style="width:280px">
    <button class="btn" id="peerAddBtn">+ Agregar</button>
    ${custom ? `<button class="btn" id="peerReset">Volver a los automáticos</button>` : ""}
  </div>

  ${others.length ? `<h2>Otras métricas <span class="sub">No pesan en el score de ${esc(prof.l.toLowerCase())}, pero sirven de referencia</span></h2>
  <div class="mgrid">${others.map((k) => metricBox(r, k, METRICS[k], tot)).join("")}
    ${[["pe", "P/E (últimos 12 meses)", "x"], ["nm", "Margen neto", "%"], ...(r.sec === "fin" ? [] : [["capexInt", "Capex / ventas", "%"]]), ["beta", "Beta (volatilidad vs mercado)", "n"], ["d52", "Distancia al máximo de 52 semanas", "%"]].filter(([k]) => !r.weights[k] && ok(r[k])).map(([k, l, f]) => `
    <div class="m"><div class="l"><span>${l}</span></div><div class="v num">${fmt(r[k], f)}</div><div class="med">Mediana del sector: ${fmt(r.med[k], f)}</div></div>`).join("")}
  </div>` : ""}

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
      <label class="full">Reglas de venta<textarea id="tSell" style="min-height:60px" placeholder="Ej.: vender si el P/E pasa de 40x, si las ventas dejan de crecer dos trimestres, o al llegar al precio optimista">${esc(th.sell || "")}</textarea></label>
    </div>
    <div class="actions" style="margin-top:12px"><button class="btn primary" id="tSave">Guardar tesis</button>${r.edited.size ? `<button class="btn" id="tReset">Restaurar métricas de Yahoo</button>` : ""}</div>
  </div>

  <h2>Cómo se calculó el score <span class="sub">${esc(prof.l)}${r.lynch ? " · " + LYNCH[r.lynch] : ""}</span></h2>
  <div class="card">
    <div class="na" style="font-size:13px;margin-bottom:10px">${esc(prof.why)}${r.lynch ? " " + esc(LYNCH_INFO[r.lynch]) : ""} ${ok(r.gscore.Historia) ? `Además, un ${nf(0).format(25 * (r.lynch === "stalwart" ? 1.3 : r.lynch === "cyclical" ? 1.4 : 1))}% del score compara contra su propia historia (${r.histKeys.map((k) => METRICS[k].l).join(", ")}).` : "No hay historia suficiente para comparar contra sí misma."}</div>
    <div class="tablewrap" style="border:none"><table class="how"><thead><tr><th class="l">Métrica</th><th class="l">Bloque</th><th>Peso</th><th>Valor</th><th>Mediana pares</th><th>Percentil vs pares</th><th>Prom. ${histN || ""} años</th><th>Vs su historia</th></tr></thead><tbody>
      ${Object.entries(r.weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => { const m = METRICS[k], h = r.hist[k]; return `<tr><td class="l" title="${esc(m.q)}">${m.l}</td><td class="l">${m.g}</td><td>${nf(0).format((w / tot) * 100)}%</td><td>${fmt(r[k], m.f, m.d)}</td><td>${fmt(r.med[k], m.f, m.d)}</td><td>${r.pct[k] != null ? `<span style="color:${COL[lvl(r.pct[k])]}">${r.pct[k]}</span>` : '<span class="na">sin dato</span>'}</td><td>${h ? fmt(h.avg, m.f, m.d) : '<span class="na">—</span>'}</td><td>${h ? `<span style="color:${COL[lvl(h.p)]}">${h.p}</span>` : '<span class="na">—</span>'}</td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="src">Pares: ${r.peerN} empresas de ${esc(r.peerLabel)} (si una métrica tiene menos de 5 datos en la industria, se usa el sector). Historia: estados anuales de Yahoo Finance${histN ? `, ${r.fx.years[0]}–${r.fx.years.at(-1)}` : ""}. Datos de mercado: Yahoo Finance${P.updated ? " · " + new Date(P.updated).toLocaleString("es-AR") : ""}.</div>
  </div>`;
  updateFair(); bindPage();
  if (P.hist) renderHistory();
}

function histMini(r) {
  if (!r.histKeys?.length) return `<div class="kv"><span>Sin historia suficiente</span><span></span></div>`;
  return r.histKeys.slice(0, 3).map((k) => { const h = r.hist[k], m = METRICS[k]; return `<div class="kv" title="${esc(m.q)}"><span>${m.l}</span><span class="num">${fmt(h.cur, m.f, m.d)} <span class="na">· prom. ${fmt(h.avg, m.f, m.d)}</span></span></div>`; }).join("");
}

function metricBox(r, k, m, tot) {
  const p = r.pct[k], w = r.weights[k], h = r.hist[k];
  const better = h && ok(h.diff) ? (m.dir > 0 ? h.diff > 0 : h.diff < 0) : null;
  return `<div class="m">
    <div class="l"><span>${m.l}</span><span class="w">${w ? `pesa ${nf(0).format((w / tot) * 100)}%` : ""}${p != null ? ` · P${p}` : ""}</span></div>
    <div class="v num ${r.edited.has(k) ? "edited" : ""}" data-edit="${k}" title="Clic para corregir">${fmt(r[k], m.f, m.d)}</div>
    ${p != null ? `<div class="pb" title="Percentil contra ${esc(r.peerLabel)}"><div style="width:${Math.max(p, 3)}%;background:${COL[lvl(p)]}"></div></div>` : `<div class="pb"></div>`}
    <div class="med">Mediana pares: ${fmt(r.med[k], m.f, m.d)}${r.edited.has(k) ? ` · Yahoo: ${fmt(P.rawMap.get(r.s)?.[k], m.f, m.d)}` : ""}</div>
    ${h ? `<div class="med">Promedio últimos ${h.n} años: ${fmt(h.avg, m.f, m.d)} <span style="color:${better ? COL.good : COL.bad}">(${h.diff >= 0 ? "+" : ""}${nf(0).format(h.diff)}%)</span></div>${spark(h, m)}` : ""}
    <div class="q">${esc(m.q)}</div></div>`;
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
  $("tSave").onclick = async () => {
    const t = thesisVals(), fv = fairValue(t);
    const ok2 = await saveOverride(r.s, { fair_value: fv, lynch_type: $("tLynch").value || null, notes: $("tNotes").value || null, metrics: { thesis: { ...t, sell: $("tSell").value || null }, profile: $("tProf").value || null } });
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
  scoreAll(P.rows, { userMult: userMult() });
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
