import { UNIVERSE, SECTORS, MARKETS, COUNTRIES } from "/lib/universe.js";
import { METRICS, GROUPS, PROFILES, LYNCH, LYNCH_INFO, ok, derive, scoreAll, median, fmt, fmtCap, nf, scoreCls } from "/js/score.js";
import { startLive } from "/js/live.js";
import { $, esc, toast, loadLocal, saveLocal, state, initSupabase, authClick, loadSnapshots, loadLive, loadOverrides, saveOverride, userMult, userProfW, loadFund } from "/js/core.js";

const S = {
  raw: new Map(), rows: [], updated: null, source: "", loading: false,
  f: { q: "", markets: new Set(), sectors: new Set(), country: "", lynch: "", prof: "", cap: 0, cand: false, mine: false, peer: "sector" },
  sort: { k: "score", dir: -1 }, limit: 60, view: "table", cmp: new Set(loadLocal("scr_cmp", [])),
};
const today = () => new Date().toLocaleDateString("es-AR");
const go = (sym) => { location.href = "/empresa.html?s=" + encodeURIComponent(sym); };

function rebuild() {
  S.rows = [...S.raw.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(S.rows, { peer: S.f.peer, userMult: userMult(), profW: userProfW() });
}

// ================== Filtros ==================
function filtered() {
  const f = S.f, q = f.q.trim().toLowerCase();
  return S.rows.filter((r) => {
    if ((r.mk || "").includes("REF")) return false;
    if (q && !r.s.toLowerCase().includes(q) && !(r.ced || "").toLowerCase().includes(q) && !(r.n || "").toLowerCase().includes(q)) return false;
    if (f.markets.size && ![...f.markets].some((m) => (r.mk || "").split(" ").includes(m))) return false;
    if (f.sectors.size && !f.sectors.has(r.sec)) return false;
    if (f.country && r.c !== f.country) return false;
    if (f.lynch && r.lynch !== f.lynch) return false;
    if (f.prof && r.profile !== f.prof) return false;
    if (f.cap && !(r.mcap >= f.cap)) return false;
    if (f.cand && !r.cand) return false;
    if (f.mine && !r.hasThesis) return false;
    return true;
  });
}
function sorted(rows) {
  const { k, dir } = S.sort;
  const Q = S.f.q.trim().toUpperCase();
  // Búsqueda: primero el ticker exacto, después los que empiezan igual, después el resto
  const rank = (r) => { if (!Q) return 0; const c = (r.ced || "").toUpperCase(); if (c === Q || r.s === Q) return 0; if (c.startsWith(Q) || r.s.startsWith(Q)) return 1; return 2; };
  const arLast = S.f.country !== "AR";
  return rows.slice().sort((a, b) => {
    if (arLast && (a.c === "AR") !== (b.c === "AR")) return a.c === "AR" ? 1 : -1;
    const rk = rank(a) - rank(b); if (rk) return rk;
    const x = k === "ret" ? retOf(a) : a[k], y = k === "ret" ? retOf(b) : b[k];
    if (typeof x === "string" || typeof y === "string") return dir * String(x ?? "").localeCompare(String(y ?? ""));
    if (!ok(x) && !ok(y)) return 0; if (!ok(x)) return 1; if (!ok(y)) return -1;
    return dir * (x - y);
  });
}
const retOf = (r) => (r.sec === "fin" ? r.roe : r.roic);

// ================== Render ==================
function counts(rows, fn) { const c = {}; for (const r of rows) for (const k of fn(r)) c[k] = (c[k] || 0) + 1; return c; }
function renderFilters() {
  const mc = counts(UNIVERSE.map((u) => ({ mk: u[4] })), (r) => (r.mk || "").split(" "));
  $("fMarkets").innerHTML = `<button class="chip ${S.f.markets.size ? "" : "on"}" data-m="">Todos</button>` +
    Object.entries(MARKETS).filter(([k]) => mc[k]).map(([k, l]) => `<button class="chip ${S.f.markets.has(k) ? "on" : ""}" data-m="${k}">${l}<span class="c">${mc[k]}</span></button>`).join("");
  $("fSectors").innerHTML = `<button class="chip ${S.f.sectors.size ? "" : "on"}" data-s="">Todos</button>` +
    Object.entries(SECTORS).map(([k, l]) => `<button class="chip ${S.f.sectors.has(k) ? "on" : ""}" data-s="${k}">${l}</button>`).join("");
  const cs = [...new Set(UNIVERSE.map((u) => u[3]))].sort((a, b) => (a === "AR") - (b === "AR") || (COUNTRIES[a] || a).localeCompare(COUNTRIES[b] || b));
  const used = new Set(S.rows.map((r) => r.profile));
  $("fProf").innerHTML = `<option value="">Todas las industrias</option>` + Object.entries(PROFILES).filter(([k]) => used.has(k)).sort((a, b) => a[1].l.localeCompare(b[1].l)).map(([k, p]) => `<option value="${k}" ${S.f.prof === k ? "selected" : ""}>${esc(p.l)}</option>`).join("");
  $("fCountry").innerHTML = `<option value="">Todos los países</option>` + cs.map((c) => `<option value="${c}" ${S.f.country === c ? "selected" : ""}>${COUNTRIES[c] || c}</option>`).join("");
}

function renderKpis(rows) {
  const k = [
    ["Acciones en el filtro", nf(0).format(rows.length), `de ${nf(0).format(S.rows.length || UNIVERSE.length)} operables desde Argentina`],
    ["Candidatas", nf(0).format(rows.filter((r) => r.cand).length), "Score ≥ 70, valuación favorable y PEG en rango"],
    ["Score mediano", ok(median(rows.map((r) => r.score))) ? Math.round(median(rows.map((r) => r.score))) : "—", "0 a 100, contra su sector"],
    ["P/E forward mediano", fmt(median(rows.filter((r) => r.fpe > 0).map((r) => r.fpe)), "x"), "Solo empresas con ganancias"],
    ["PEG mediano", fmt(median(rows.map((r) => r.peg)), "x", 2), "P/E forward ÷ crecimiento EPS"],
  ];
  $("kpis").innerHTML = k.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="s">${s}</div></div>`).join("");
}

const COLS = [
  { k: "cmp", l: "", cls: "l", nosort: true }, { k: "s", l: "Acción", cls: "l" }, { k: "profile", l: "Industria", cls: "l" }, { k: "lynch", l: "Tipo", cls: "l" },
  { k: "px", l: "Precio" }, { k: "chg", l: "Día" }, { k: "mcap", l: "Mkt cap" },
  { k: "fpe", l: "P/E fwd", t: METRICS.fpe.q }, { k: "peg", l: "PEG", t: METRICS.peg.q }, { k: "evEbitda", l: "EV/EBITDA", t: METRICS.evEbitda.q },
  { k: "ret", l: "ROIC/ROE", t: "ROIC; en bancos y aseguradoras, ROE" }, { k: "epsG", l: "Crec. EPS", t: METRICS.epsG.q }, { k: "revG", l: "Crec. ventas", t: METRICS.revG.q },
  { k: "fcfY", l: "FCF yld", t: METRICS.fcfY.q }, { k: "divY", l: "Div.", t: METRICS.divY.q }, { k: "fairUp", l: "Tu P. justo", t: "Distancia a tu precio justo" }, { k: "score", l: "Score" },
];
const cell = (r, k, f, d) => `<span class="num ${r.edited?.has(k) ? "edited" : ""}">${fmt(r[k], f, d)}</span>`;
function rowHtml(r) {
  const chg = ok(r.chg) ? `<span class="num ${r.chg >= 0 ? "pos" : "neg"}" data-live-chg="${esc(r.s)}" data-live-dec="1">${r.chg >= 0 ? "+" : ""}${nf(1).format(r.chg)}%</span>` : `<span class="na">—</span>`;
  const ret = r.sec === "fin" ? `<span class="num" title="ROE">${fmt(r.roe, "%")}</span>` : cell(r, "roic", "%");
  return `<tr class="row" data-s="${esc(r.s)}">
    <td class="l"><input type="checkbox" class="cmpchk" data-s="${esc(r.s)}" ${S.cmp.has(r.s) ? "checked" : ""} title="Agregar a comparar" aria-label="Comparar ${esc(r.s)}"></td>
    <td class="l"><span class="tk">${esc(r.ced || r.s)}</span>${r.ced && r.ced !== r.s ? ` <span class="na" style="font-size:11px">${esc(r.s)}</span>` : ""} ${r.cand ? '<span class="badge cand">Candidata</span>' : ""} ${r.hasThesis ? '<span class="badge mine">Tesis</span>' : ""}<span class="nm">${esc(r.n)} · ${esc(COUNTRIES[r.c] || r.c)}</span></td>
    <td class="l sec" title="${esc(SECTORS[r.sec] || "")} · ${esc(r.ind || "")}">${esc(PROFILES[r.profile].l)}</td>
    <td class="l">${r.lynch ? `<span class="badge" title="${esc(LYNCH_INFO[r.lynch])}">${LYNCH[r.lynch]}</span>` : '<span class="na">—</span>'}</td>
    <td class="num"><span data-live-px="${esc(r.s)}">${fmt(r.px)}</span> <span class="na" style="font-size:11px">${esc(r.cur || "")}</span></td>
    <td>${chg}</td><td class="num">${fmtCap(r.mcap)}</td>
    <td>${cell(r, "fpe", "x")}</td><td>${cell(r, "peg", "x", 2)}</td><td>${cell(r, "evEbitda", "x")}</td><td>${ret}</td>
    <td>${cell(r, "epsG", "%")}</td><td>${cell(r, "revG", "%")}</td><td>${cell(r, "fcfY", "%")}</td><td>${cell(r, "divY", "%")}</td>
    <td>${ok(r.fairUp) ? `<span class="num ${r.fairUp >= 0 ? "pos" : "neg"}">${r.fairUp >= 0 ? "+" : ""}${nf(0).format(r.fairUp)}%</span>` : '<span class="na">—</span>'}</td>
    <td><span class="score ${scoreCls(r.score)}">${ok(r.score) ? r.score : "—"}</span></td></tr>`;
}
function renderTable(rows) {
  if (!rows.length) return `<div class="tablewrap"><div class="empty">${S.rows.length ? "Ninguna acción cumple estos filtros." : "Cargando datos…"}</div></div>`;
  const list = sorted(rows);
  const head = COLS.map((c) => `<th class="${c.cls || ""} ${S.sort.k === c.k ? "sorted" : ""}" data-k="${c.nosort ? "" : c.k}" ${c.t ? `title="${esc(c.t)}"` : ""}>${c.l}${S.sort.k === c.k ? (S.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("");
  const more = list.length > S.limit ? `<div class="more"><button class="btn" id="btnMore">Mostrar ${Math.min(60, list.length - S.limit)} más · quedan ${list.length - S.limit}</button></div>` : "";
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${list.slice(0, S.limit).map(rowHtml).join("")}</tbody></table>${more}</div>
    <div class="na" style="font-size:12px;margin-top:8px">Ticker grande = el que se opera en BYMA. Tocá una fila para ver la ficha completa.</div>`;
}

function groupSummary(rows) {
  const sc = rows.filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  return {
    n: rows.length, cand: rows.filter((r) => r.cand), peg: median(rows.map((r) => r.peg)), fpe: median(rows.filter((r) => r.fpe > 0).map((r) => r.fpe)),
    evEbitda: median(rows.map((r) => r.evEbitda)), roic: median(rows.map(retOf)), om: median(rows.map((r) => r.om)), revG: median(rows.map((r) => r.revG)),
    epsG: median(rows.map((r) => r.epsG)), divY: median(rows.map((r) => r.divY)), score: median(rows.map((r) => r.score)), top: sc.slice(0, 5),
    mcap: rows.reduce((s, r) => s + (r.mcap || 0), 0),
  };
}
function renderGroups(rows, by) {
  const g = new Map();
  for (const r of rows) { const k = by === "sector" ? r.sec : r.c; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  if (!g.size) return `<div class="empty">Sin datos para estos filtros.</div>`;
  const items = [...g.entries()].map(([k, rs]) => ({ k, s: groupSummary(rs) })).sort((a, b) => (by === "country" && (a.k === "AR") !== (b.k === "AR") ? (a.k === "AR" ? 1 : -1) : b.s.mcap - a.s.mcap));
  return `<div class="grid-cards">${items.map(({ k, s }) => `
    <div class="card">
      <h3><span>${esc(by === "sector" ? SECTORS[k] : COUNTRIES[k] || k)}</span><button class="btn sm" data-pdf="${by}" data-key="${esc(k)}">⤓ PDF</button></h3>
      <div class="sub">${s.n} acciones · ${fmtCap(s.mcap)} · ${s.cand.length} candidatas</div>
      <div class="mini">
        <div><div class="l">Score</div><div class="v num">${ok(s.score) ? Math.round(s.score) : "—"}</div></div>
        <div><div class="l">P/E fwd</div><div class="v num">${fmt(s.fpe, "x")}</div></div>
        <div><div class="l">EV/EBITDA</div><div class="v num">${fmt(s.evEbitda, "x")}</div></div>
        <div><div class="l">ROIC/ROE</div><div class="v num">${fmt(s.roic, "%")}</div></div>
        <div><div class="l">Crec. vtas</div><div class="v num">${fmt(s.revG, "%")}</div></div>
        <div><div class="l">Dividendo</div><div class="v num">${fmt(s.divY, "%")}</div></div>
      </div>
      <div class="toplist">${s.top.map((r) => `<div class="it" data-open="${esc(r.s)}"><span><b>${esc(r.ced || r.s)}</b> <span class="na">${esc((r.n || "").slice(0, 26))}</span> ${r.cand ? '<span class="badge cand">Candidata</span>' : ""}</span><span class="score ${scoreCls(r.score)}">${r.score}</span></div>`).join("")}</div>
      <div style="margin-top:10px"><button class="btn sm" data-filter="${by}" data-key="${esc(k)}">Ver todas →</button></div>
    </div>`).join("")}</div>`;
}

function cmpRows() { return [...S.cmp].map((s) => S.rows.find((r) => r.s === s)).filter(Boolean); }
const CMP_LINES = () => [
  { k: "score", l: "Score", d: 0, dir: 1 }, { k: "lynch", l: "Tipo Lynch", txt: true }, { k: "mcap", l: "Market cap", cap: true },
  ...Object.entries(METRICS).map(([k, m]) => ({ k, l: m.l, f: m.f, d: m.d, dir: m.dir })),
  { k: "upside", l: "Upside a target analistas", f: "%", dir: 1 }, { k: "fairUp", l: "Upside a tu precio justo", f: "%", dir: 1 },
];
function renderCompare() {
  const rs = cmpRows();
  if (rs.length < 2) return `<div class="empty">Marcá al menos 2 acciones con la casilla de la tabla para compararlas lado a lado.</div>`;
  const body = CMP_LINES().map((ln) => {
    const valid = rs.map((r) => r[ln.k]).filter(ok).filter((v) => !(METRICS[ln.k]?.pos && v <= 0));
    const best = ln.dir ? (ln.dir > 0 ? Math.max(...valid) : Math.min(...valid)) : null;
    return `<tr><td class="l" ${METRICS[ln.k] ? `title="${esc(METRICS[ln.k].q)}"` : ""}>${ln.l}</td>${rs.map((r) => {
      const v = r[ln.k];
      const txt = ln.txt ? (LYNCH[v] || "—") : ln.cap ? fmtCap(v) : fmt(v, ln.f, ln.d);
      return `<td class="num ${valid.length > 1 && ok(v) && v === best ? "best" : ""}">${txt}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px"><button class="btn sm" data-pdf="compare">⤓ PDF de la comparativa</button></div>
    <div class="tablewrap"><table class="cmp"><thead><tr><th class="l">Métrica</th>${rs.map((r) => `<th><span data-open="${esc(r.s)}" style="cursor:pointer">${esc(r.ced || r.s)}</span> <span class="x" data-uncmp="${esc(r.s)}" style="font-size:14px">×</span><div class="na" style="font-weight:400">${esc((r.n || "").slice(0, 22))}</div></th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="na" style="font-size:12px;margin-top:8px">En verde, el mejor valor de cada fila. Pasá el mouse sobre una métrica para ver qué significa.</div>`;
}

function render() {
  const rows = filtered();
  renderKpis(rows);
  $("cmpCount").textContent = S.cmp.size;
  const v = $("view");
  if (S.view === "table") v.innerHTML = renderTable(rows);
  else if (S.view === "sector") v.innerHTML = renderGroups(rows, "sector");
  else if (S.view === "country") v.innerHTML = renderGroups(rows, "country");
  else v.innerHTML = renderCompare();
  $("cmpbar").classList.toggle("show", S.cmp.size > 0 && S.view !== "compare");
  $("cmpTxt").textContent = `${S.cmp.size} para comparar: ${cmpRows().slice(0, 5).map((r) => r.ced || r.s).join(", ")}${S.cmp.size > 5 ? "…" : ""}`;
}
function refreshAll() { rebuild(); renderFilters(); render(); }

// ================== PDF ==================
function pdfFoot() { return `<div class="foot">Fuente: Yahoo Finance · datos al ${S.updated ? new Date(S.updated).toLocaleDateString("es-AR") : today()} · Universo: acciones operables desde Argentina (CEDEARs y acciones locales en BYMA). Score = 60% percentil contra su industria + 40% nota absoluta, ponderados según el tipo de negocio y el tipo Lynch. Material de análisis propio, no constituye recomendación de inversión.</div>`; }
const cls = (s) => (!ok(s) ? "" : s >= 70 ? "g" : s >= 45 ? "m2" : "b");
function pdfTable(rows, n = 40) {
  return `<table><thead><tr><th class="l">Acción (BYMA)</th><th class="l">Sector</th><th class="l">Tipo</th><th>Mkt cap</th><th>P/E fwd</th><th>PEG</th><th>EV/EBITDA</th><th>ROIC/ROE</th><th>Crec. EPS</th><th>Crec. ventas</th><th>Div.</th><th>Score</th></tr></thead><tbody>${
    rows.slice(0, n).map((r) => `<tr><td class="l"><b>${esc(r.ced || r.s)}</b> ${esc((r.n || "").slice(0, 26))}${r.cand ? " ★" : ""}</td><td class="l">${esc(SECTORS[r.sec])}</td><td class="l">${LYNCH[r.lynch] || "—"}</td><td>${fmtCap(r.mcap)}</td><td>${fmt(r.fpe, "x")}</td><td>${fmt(r.peg, "x", 2)}</td><td>${fmt(r.evEbitda, "x")}</td><td>${fmt(retOf(r), "%")}</td><td>${fmt(r.epsG, "%")}</td><td>${fmt(r.revG, "%")}</td><td>${fmt(r.divY, "%")}</td><td class="sc ${cls(r.score)}">${r.score ?? "—"}</td></tr>`).join("")}</tbody></table>${rows.length > n ? `<div class="sub">Se muestran ${n} de ${rows.length}, ordenadas por score.</div>` : ""}`;
}
function pdfGroup(title, rows, subBy) {
  const s = groupSummary(rows);
  const bySc = rows.filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  let breakdown = "";
  if (subBy) {
    const g = new Map(); for (const r of rows) { const k = subBy === "sector" ? r.sec : r.c; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    breakdown = `<h2>Desglose por ${subBy === "sector" ? "sector" : "país"}</h2><table><thead><tr><th class="l">${subBy === "sector" ? "Sector" : "País"}</th><th>Acciones</th><th>Mkt cap</th><th>P/E fwd med.</th><th>EV/EBITDA med.</th><th>ROIC/ROE med.</th><th>Crec. ventas</th><th>Score med.</th><th class="l">Mejor score</th></tr></thead><tbody>${
      [...g.entries()].map(([k, rs]) => ({ k, s: groupSummary(rs) })).sort((a, b) => b.s.mcap - a.s.mcap).map(({ k, s: x }) => `<tr><td class="l">${esc(subBy === "sector" ? SECTORS[k] : COUNTRIES[k] || k)}</td><td>${x.n}</td><td>${fmtCap(x.mcap)}</td><td>${fmt(x.fpe, "x")}</td><td>${fmt(x.evEbitda, "x")}</td><td>${fmt(x.roic, "%")}</td><td>${fmt(x.revG, "%")}</td><td>${ok(x.score) ? Math.round(x.score) : "—"}</td><td class="l">${x.top[0] ? esc(x.top[0].ced || x.top[0].s) + " (" + x.top[0].score + ")" : "—"}</td></tr>`).join("")}</tbody></table>`;
  }
  const cand = s.cand.length ? `<h2>Oportunidades detectadas</h2><ul>${s.cand.slice(0, 15).map((r) => `<li class="pb"><b>${esc(r.ced || r.s)}</b> (${esc(r.n)}, ${LYNCH[r.lynch] || "sin tipo"}) — ${esc(r.candReason)}. ${r.why.slice(0, 3).map((w) => esc(w.t)).join("; ")}${r.alerts.length ? `. <span class="b">Ojo: ${esc(r.alerts[0].t)}</span>` : ""}</li>`).join("")}</ul>` : "";
  return `<div class="rp"><h1>${esc(title)}</h1><div class="sub">Screener · ${today()} · ${S.f.peer === "sector-country" ? "score contra su sector en su país" : "score contra su sector global"}</div>
    <div class="kp"><div><div class="l">Acciones</div><div class="v">${s.n}</div></div><div><div class="l">Candidatas</div><div class="v">${s.cand.length}</div></div><div><div class="l">P/E fwd mediano</div><div class="v">${fmt(s.fpe, "x")}</div></div><div><div class="l">EV/EBITDA mediano</div><div class="v">${fmt(s.evEbitda, "x")}</div></div><div><div class="l">ROIC/ROE mediano</div><div class="v">${fmt(s.roic, "%")}</div></div><div><div class="l">Crec. ventas</div><div class="v">${fmt(s.revG, "%")}</div></div><div><div class="l">Dividendo mediano</div><div class="v">${fmt(s.divY, "%")}</div></div><div><div class="l">Mkt cap total</div><div class="v">${fmtCap(s.mcap)}</div></div></div>
    ${breakdown}${cand}<h2>Ranking por score</h2>${pdfTable(bySc)}${pdfFoot()}</div>`;
}
function pdfCompare() {
  const rs = cmpRows();
  return `<div class="rp"><h1>Comparativa: ${rs.map((r) => esc(r.ced || r.s)).join(" vs. ")}</h1><div class="sub">Screener · ${today()}</div><table><thead><tr><th class="l">Métrica</th>${rs.map((r) => `<th>${esc(r.ced || r.s)}</th>`).join("")}</tr></thead><tbody>${
    CMP_LINES().map((ln) => `<tr><td class="l">${ln.l}</td>${rs.map((r) => `<td>${ln.txt ? LYNCH[r[ln.k]] || "—" : ln.cap ? fmtCap(r[ln.k]) : fmt(r[ln.k], ln.f, ln.d)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <h2>Lectura rápida</h2><ul>${rs.map((r) => `<li><b>${esc(r.ced || r.s)}</b>: ${r.why.slice(0, 2).map((w) => esc(w.t)).join("; ") || "sin fortalezas destacadas"}${r.alerts.length ? `. <span class="b">Ojo: ${esc(r.alerts[0].t)}</span>` : ""}</li>`).join("")}</ul>${pdfFoot()}</div>`;
}
function printHtml(html, name) {
  $("printRoot").innerHTML = html;
  const t = document.title; document.title = name;
  setTimeout(() => { window.print(); document.title = t; }, 50);
}
function pdfView() {
  const rows = filtered().filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  const parts = [...S.f.markets].map((m) => MARKETS[m]).concat([...S.f.sectors].map((s) => SECTORS[s]), S.f.country ? [COUNTRIES[S.f.country]] : []);
  printHtml(pdfGroup(parts.length ? parts.join(" · ") : "Universo operable desde Argentina", rows, S.f.sectors.size === 1 ? "country" : "sector"), "Screener " + today().replaceAll("/", "-"));
}

// ================== Cómo puntúa ==================
function openHow() {
  const m = $("modal"), mult = userMult();
  m.innerHTML = `<div class="dh"><h2 style="font-size:17px;margin:0">Cómo se calcula el score</h2><button class="x" id="wClose" aria-label="Cerrar">×</button></div>
    <p class="na" style="font-size:13px;line-height:1.6">Cada métrica se puntúa de 0 a 100 combinando dos cosas: 60% su percentil contra las empresas de su misma industria y 40% una nota absoluta de salud (por ejemplo, un ROIC de 22% o más es excelente en cualquier industria). Así un gran negocio no queda mal solo por compararse con otros grandes negocios. Escala: 75+ excelente, 65-74 bueno, 45-64 neutral, menos de 45 débil. Qué métricas cuentan y cuánto pesan depende de <b>qué tipo de negocio es</b> y de su <b>tipo Lynch</b>.</p>
    <p class="na" style="font-size:13px;line-height:1.6">Además, el 25% del score compara cada métrica con el promedio de los últimos ejercicios de la propia empresa (bloque <b>Historia</b>). En Stalwarts y cíclicas pesa más.</p>
    <div class="wgroup">Editar los pesos de una industria</div>
    <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap"><select id="pwSel">${Object.entries(PROFILES).sort((a, b) => a[1].l.localeCompare(b[1].l)).map(([k, p]) => `<option value="${k}">${esc(p.l)}${userProfW()[k] ? " (editado)" : ""}</option>`).join("")}</select><span class="na" style="font-size:12px">Mové los pesos, sumá o sacá métricas y guardá. Se aplica a todas las empresas de esa industria.</span></div>
    <div id="pwBox"></div>
    <div class="wgroup">Las ${Object.keys(PROFILES).length} industrias y qué miden</div>
    ${Object.values(PROFILES).map((f) => `<div class="how"><b>${f.l}</b> · ${f.why}<div class="na">${Object.entries(f.w).sort((a, b) => b[1] - a[1]).map(([k]) => METRICS[k].l).join(" · ")}</div></div>`).join("")}
    <div class="wgroup">Por tipo Lynch</div>
    ${Object.entries(LYNCH).map(([k, l]) => `<div class="how"><b>${l}</b> · ${LYNCH_INFO[k]}</div>`).join("")}
    <div class="wgroup">Tu ajuste (multiplica el peso de cada bloque)</div>
    ${GROUPS.map((g) => `<div class="wrow"><span>${g}</span><input type="range" min="0" max="2" step="0.1" value="${mult[g] ?? 1}" data-g="${g}"><span class="num" id="wv_${g}">${nf(1).format(mult[g] ?? 1)}x</span></div>`).join("")}
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" id="wSave">Aplicar</button><button class="btn" id="wReset">Volver a 1x</button></div>`;
  m.classList.add("show"); $("overlay").classList.add("show");
  drawPW();
}
// Editor de pesos por industria
function drawPW() {
  const k = $("pwSel").value, cur = userProfW()[k] || PROFILES[k].w;
  const tot = Object.values(cur).reduce((a, b) => a + b, 0) || 1;
  const missing = Object.keys(METRICS).filter((m) => !(m in cur));
  $("pwBox").innerHTML = `${Object.entries(cur).sort((a, b) => b[1] - a[1]).map(([m, w]) => `<div class="wrow"><span title="${esc(METRICS[m].q)}">${esc(METRICS[m].l)}</span><input type="range" min="0" max="30" step="1" value="${w}" data-pw="${m}"><span class="num" id="pwv_${m}">${nf(0).format((w / tot) * 100)}%</span></div>`).join("")}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><select id="pwAdd"><option value="">+ Sumar métrica…</option>${missing.map((m) => `<option value="${m}">${esc(METRICS[m].l)}</option>`).join("")}</select>
    <button class="btn sm primary" id="pwSave">Guardar pesos de ${esc(PROFILES[k].l)}</button>${userProfW()[k] ? `<button class="btn sm" id="pwReset">Volver a los originales</button>` : ""}</div>`;
}
async function savePW(k, w) {
  const all = { ...userProfW() };
  if (w) all[k] = w; else delete all[k];
  saveLocal("scr_profw", all);
  if (state.user) await saveOverride("__settings", { metrics: { profW: all } });
}
function closeModal() { $("modal").classList.remove("show"); $("overlay").classList.remove("show"); }

// ================== Eventos ==================
function bind() {
  $("q").addEventListener("input", (e) => { S.f.q = e.target.value; S.limit = 60; render(); });
  $("fCountry").addEventListener("change", (e) => { S.f.country = e.target.value; render(); });
  $("fLynch").addEventListener("change", (e) => { S.f.lynch = e.target.value; render(); });
  $("fProf").addEventListener("change", (e) => { S.f.prof = e.target.value; render(); });
  $("fCap").addEventListener("change", (e) => { S.f.cap = Number(e.target.value); render(); });
  $("fPeer").addEventListener("change", (e) => { S.f.peer = e.target.value; refreshAll(); });
  $("fCand").addEventListener("change", (e) => { S.f.cand = e.target.checked; render(); });
  $("fMine").addEventListener("change", (e) => { S.f.mine = e.target.checked; render(); });
  const toggleSet = (set, v) => { if (!v) set.clear(); else if (set.has(v)) set.delete(v); else set.add(v); };
  $("fMarkets").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; toggleSet(S.f.markets, b.dataset.m); S.limit = 60; renderFilters(); render(); });
  $("fSectors").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; toggleSet(S.f.sectors, b.dataset.s); S.limit = 60; renderFilters(); render(); });
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (!b) return; S.view = b.dataset.v; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b)); render(); });
  $("view").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("cmpchk")) { e.stopPropagation(); const s = t.dataset.s; t.checked ? S.cmp.add(s) : S.cmp.delete(s); saveLocal("scr_cmp", [...S.cmp]); render(); return; }
    const th = t.closest("th[data-k]"); if (th && th.dataset.k) { const k = th.dataset.k; S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : (["s", "sec", "lynch", "profile"].includes(k) ? 1 : -1) }; render(); return; }
    if (t.id === "btnMore") { S.limit += 60; render(); return; }
    const un = t.closest("[data-uncmp]"); if (un) { S.cmp.delete(un.dataset.uncmp); saveLocal("scr_cmp", [...S.cmp]); render(); return; }
    const pdf = t.closest("[data-pdf]");
    if (pdf) {
      const by = pdf.dataset.pdf, k = pdf.dataset.key;
      if (by === "compare") return printHtml(pdfCompare(), "Comparativa " + cmpRows().map((r) => r.ced || r.s).join("-"));
      const rows = filtered().filter((r) => (by === "sector" ? r.sec === k : r.c === k)).filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
      const title = by === "sector" ? `Sector ${SECTORS[k]}` : `País: ${COUNTRIES[k] || k}`;
      return printHtml(pdfGroup(title, rows, by === "sector" ? "country" : "sector"), title + " " + today().replaceAll("/", "-"));
    }
    const fl = t.closest("[data-filter]");
    if (fl) { if (fl.dataset.filter === "sector") S.f.sectors = new Set([fl.dataset.key]); else S.f.country = fl.dataset.key; S.view = "table"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.v === "table")); renderFilters(); render(); return; }
    const op = t.closest("[data-open]"); if (op) return go(op.dataset.open);
    const tr = t.closest("tr.row"); if (tr) go(tr.dataset.s);
  });
  $("cmpGo").addEventListener("click", () => { S.view = "compare"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.v === "compare")); render(); });
  $("cmpClear").addEventListener("click", () => { S.cmp.clear(); saveLocal("scr_cmp", []); render(); });
  $("overlay").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  $("btnWeights").addEventListener("click", openHow);
  $("modal").addEventListener("change", (e) => {
    if (e.target.id === "pwSel") return drawPW();
    if (e.target.id === "pwAdd" && e.target.value) { const k = $("pwSel").value, w = { ...(userProfW()[k] || PROFILES[k].w), [e.target.value]: 8 }; const tmp = { ...userProfW(), [k]: w }; saveLocal("scr_profw", tmp); drawPW(); }
  });
  $("modal").addEventListener("input", (e) => {
    if (e.target.dataset.pw) { const box = [...document.querySelectorAll("[data-pw]")]; const tot = box.reduce((a, i) => a + Number(i.value), 0) || 1; box.forEach((i) => ($("pwv_" + i.dataset.pw).textContent = nf(0).format((Number(i.value) / tot) * 100) + "%")); return; } const g = e.target.dataset.g; if (g) $("wv_" + g).textContent = nf(1).format(Number(e.target.value)) + "x"; });
  $("modal").addEventListener("click", async (e) => {
    if (e.target.id === "wClose") return closeModal();
    if (e.target.id === "wReset") { document.querySelectorAll("[data-g]").forEach((i) => { i.value = 1; $("wv_" + i.dataset.g).textContent = "1,0x"; }); return; }
    if (e.target.id === "pwSave") { const k = $("pwSel").value, w = {}; document.querySelectorAll("[data-pw]").forEach((i) => { if (Number(i.value) > 0) w[i.dataset.pw] = Number(i.value); }); await savePW(k, w); refreshAll(); drawPW(); return toast(`Pesos de ${PROFILES[k].l} guardados`); }
    if (e.target.id === "pwReset") { const k = $("pwSel").value; await savePW(k, null); refreshAll(); drawPW(); return toast("Pesos originales restaurados"); }
    if (e.target.id === "wSave") {
      const mult = {}; document.querySelectorAll("[data-g]").forEach((i) => (mult[i.dataset.g] = Number(i.value)));
      saveLocal("scr_mult", mult);
      if (state.user) await saveOverride("__settings", { metrics: { mult } });
      closeModal(); refreshAll(); toast("Ajuste aplicado");
    }
  });
  $("btnRefresh").addEventListener("click", live);
  $("btnPdfView").addEventListener("click", pdfView);
  $("btnAuth").addEventListener("click", authClick);
}

function setStatus(txt, st) { $("statusTxt").textContent = txt; $("dot").className = "dot " + (st || ""); }
function statusLine(fails = 0) {
  const ago = S.updated ? Math.round((Date.now() - S.updated) / 3600000) : null;
  setStatus(`${nf(0).format(S.raw.size)} acciones operables desde Argentina · ${S.source}${ago != null ? ` · ${ago < 1 ? "hace minutos" : `hace ${ago} h`}` : ""}${fails ? ` · ${fails} lotes fallaron` : ""} · ${state.user ? "sesión: " + state.user.email : "ediciones en este navegador"}`, "on");
}
async function live() {
  if (S.loading) return; S.loading = true;
  setStatus("Bajando datos en vivo…", "load");
  const fails = await loadLive(S.raw, (d, n) => { $("prog").style.width = (d / n) * 100 + "%"; setStatus(`Bajando datos en vivo… ${d}/${n} lotes`, "load"); if (d % 4 === 0) refreshAll(); });
  S.loading = false; S.source = "Yahoo en vivo"; S.updated = Date.now();
  setTimeout(() => ($("prog").style.width = "0"), 600);
  refreshAll(); statusLine(fails);
}

(async function init() {
  bind(); renderFilters(); render();
  await initSupabase();
  $("btnAuth").style.display = state.sb ? "" : "none";
  $("btnAuth").textContent = state.user ? "Cerrar sesión" : "Iniciar sesión";
  state.onAuth = () => { $("btnAuth").textContent = state.user ? "Cerrar sesión" : "Iniciar sesión"; refreshAll(); statusLine(); };
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  if (snap.rows.size) { S.raw = snap.rows; S.updated = snap.updated; S.source = "base diaria"; refreshAll(); statusLine(); }
  // Si faltan acciones del universo nuevo o la base tiene más de 24 h, completa en vivo
  if (!snap.rows.size || Date.now() - S.updated > 24 * 3600000 || snap.rows.size < UNIVERSE.length * 0.9) await live();
})();
startLive(15000);
