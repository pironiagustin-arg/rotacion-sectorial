import { UNIVERSE, SECTORS, MARKETS, COUNTRIES, BATCH_COUNT } from "/lib/universe.js";

// ================== Configuración del score ==================
// dir: +1 más alto es mejor, -1 más bajo es mejor. w: peso por defecto (editable en "Pesos del score").
const METRICS = [
  { k: "peg", l: "PEG", g: "Valuación", dir: -1, w: 15, f: "x" },
  { k: "fpe", l: "P/E forward", g: "Valuación", dir: -1, w: 10, f: "x" },
  { k: "fcfY", l: "FCF yield", g: "Valuación", dir: 1, w: 10, f: "%" },
  { k: "roic", l: "ROIC (aprox.)", g: "Calidad", dir: 1, w: 12, f: "%" },
  { k: "roe", l: "ROE", g: "Calidad", dir: 1, w: 8, f: "%" },
  { k: "om", l: "Margen operativo", g: "Calidad", dir: 1, w: 8, f: "%" },
  { k: "de", l: "Deuda / patrimonio", g: "Calidad", dir: -1, w: 7, f: "x" },
  { k: "epsG", l: "Crec. EPS esperado", g: "Crecimiento", dir: 1, w: 15, f: "%" },
  { k: "revG", l: "Crec. ventas YoY", g: "Crecimiento", dir: 1, w: 15, f: "%" },
];
// Métricas extra que se muestran y se pueden corregir, pero no puntúan
const EXTRA = [
  { k: "pe", l: "P/E (LTM)", f: "x" }, { k: "gm", l: "Margen bruto", f: "%" }, { k: "nm", l: "Margen neto", f: "%" },
  { k: "eps", l: "EPS (LTM)", f: "n" }, { k: "feps", l: "EPS forward", f: "n" }, { k: "upside", l: "Upside a target", f: "%" },
  { k: "d52", l: "Distancia a máx. 52s", f: "%" }, { k: "beta", l: "Beta", f: "n" },
];
const EDITABLE = new Set(["fpe", "pe", "fcfY", "roic", "roe", "om", "gm", "nm", "de", "epsG", "revG", "eps", "feps"]);
const LYNCH = { slow: "Slow Grower", stalwart: "Stalwart", fast: "Fast Grower", cyclical: "Cíclica", turnaround: "Turnaround", asset: "Asset Play" };
const GROUPS = ["Valuación", "Calidad", "Crecimiento"];

// ================== Estado ==================
const META = new Map(UNIVERSE.map((r) => [r[0], r]));
const S = {
  raw: new Map(), ov: new Map(), rows: [], weights: loadLocal("scr_weights", null) || Object.fromEntries(METRICS.map((m) => [m.k, m.w])),
  f: { q: "", markets: new Set(), sectors: new Set(), country: "", lynch: "", cap: 0, cand: false, mine: false, peer: "sector" },
  sort: { k: "score", dir: -1 }, limit: 60, view: "table", cmp: new Set(loadLocal("scr_cmp", [])),
  source: "", updated: null, sb: null, user: null, loading: false,
};

// ================== Utilidades ==================
function loadLocal(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function saveLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const ok = (v) => v != null && isFinite(v);
function fmt(v, f, d) {
  if (!ok(v)) return "—";
  if (Math.abs(v) < 0.5 * 10 ** -(d ?? (f === "%" || f === "x" ? 1 : 2))) v = 0;
  if (f === "%") return nf(d ?? 1).format(v) + "%";
  if (f === "x") return nf(d ?? 1).format(v) + "x";
  if (f === "$") return nf(d ?? 2).format(v);
  return nf(d ?? 2).format(v);
}
function fmtCap(v) {
  if (!ok(v)) return "—";
  if (v >= 1e12) return "US$ " + nf(2).format(v / 1e12) + " T";
  if (v >= 1e9) return "US$ " + nf(1).format(v / 1e9) + " B";
  return "US$ " + nf(0).format(v / 1e6) + " M";
}
const median = (a) => { const b = a.filter(ok).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const scoreCls = (s) => (!ok(s) ? "s-na" : s >= 70 ? "s-good" : s >= 45 ? "s-mid" : "s-bad");
const pctColor = (p) => (p >= 70 ? "var(--good)" : p >= 40 ? "var(--mid)" : "var(--bad)");
const today = () => new Date().toLocaleDateString("es-AR");
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }

// ================== Derivación y score ==================
function derive(raw, ov) {
  const m = { ...(ov?.metrics || {}) };
  const r = { ...raw };
  // crecimiento esperado: largo plazo > próximo año > EPS fwd vs LTM > último trimestre
  r.epsG = raw.epsLT ?? raw.epsNY ?? (raw.feps > 0 && raw.eps > 0 ? (raw.feps / raw.eps - 1) * 100 : null) ?? raw.epsQ;
  r.d52 = ok(raw.px) && raw.hi52 ? (raw.px / raw.hi52 - 1) * 100 : null;
  r.edited = new Set();
  for (const [k, v] of Object.entries(m)) if (v !== "" && v != null && isFinite(Number(v))) { r[k] = Number(v); r.edited.add(k); }
  r.peg = ok(r.fpe) && r.fpe > 0 && ok(r.epsG) && r.epsG > 0 ? r.fpe / r.epsG : null;
  r.lynchAuto = !ok(r.epsG) ? null : r.epsG < 6 ? "slow" : r.epsG < 18 ? "stalwart" : "fast";
  r.lynch = ov?.lynch_type || r.lynchAuto;
  r.fair = ok(Number(ov?.fair_value)) && ov?.fair_value !== "" && ov?.fair_value != null ? Number(ov.fair_value) : null;
  r.fairUp = r.fair && r.px ? (r.fair / r.px - 1) * 100 : null;
  r.notes = ov?.notes || "";
  r.hasThesis = !!(r.fair || r.notes || ov?.lynch_type);
  return r;
}

function rebuild() {
  S.rows = [];
  for (const [s, raw] of S.raw) S.rows.push(derive(raw, S.ov.get(s)));
  // percentiles por grupo de pares
  const key = (r) => (S.f.peer === "sector-country" ? r.sec + "|" + r.c : r.sec);
  const groups = new Map();
  for (const r of S.rows) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const bySector = new Map();
  for (const r of S.rows) { if (!bySector.has(r.sec)) bySector.set(r.sec, []); bySector.get(r.sec).push(r); }
  const pct = {};
  for (const m of METRICS) pct[m.k] = new Map();
  for (const r of S.rows) {
    let peers = groups.get(key(r));
    r.peerLabel = S.f.peer === "sector-country" ? `${SECTORS[r.sec]} · ${COUNTRIES[r.c] || r.c}` : SECTORS[r.sec];
    if (peers.length < 5) { peers = bySector.get(r.sec); r.peerLabel = SECTORS[r.sec]; }
    r.peerN = peers.length;
    r.pct = {}; r.med = {};
    for (const m of METRICS) {
      let v = r[m.k];
      // P/E o PEG sin sentido (pérdidas o crecimiento negativo) = peor percentil
      if ((m.k === "fpe" && ok(r.fpe) && r.fpe <= 0) || (m.k === "peg" && r.peg == null && ok(r.fpe) && (r.fpe <= 0 || (ok(r.epsG) && r.epsG <= 0)))) { r.pct[m.k] = 0; continue; }
      if (!ok(v)) continue;
      const vals = peers.map((p) => (m.k === "fpe" && p.fpe <= 0 ? null : p[m.k])).filter(ok);
      if (vals.length < 3) continue;
      let below = 0, eq = 0;
      for (const x of vals) { if (x < v) below++; else if (x === v) eq++; }
      let p = ((below + eq / 2) / vals.length) * 100;
      if (m.dir < 0) p = 100 - p;
      r.pct[m.k] = Math.round(p);
    }
    for (const m of [...METRICS, ...EXTRA]) r.med[m.k] = median(peers.map((p) => (m.k === "fpe" && p.fpe <= 0 ? null : p[m.k])));
    // score total y por bloque
    let sw = 0, ss = 0, tot = 0; const gs = {};
    for (const m of METRICS) {
      const w = Number(S.weights[m.k] ?? m.w); tot += w;
      gs[m.g] = gs[m.g] || { s: 0, w: 0 };
      if (r.pct[m.k] == null || !w) continue;
      sw += w; ss += w * r.pct[m.k]; gs[m.g].s += w * r.pct[m.k]; gs[m.g].w += w;
    }
    r.score = tot && sw / tot >= 0.5 ? Math.round(ss / sw) : null;
    r.gscore = Object.fromEntries(GROUPS.map((g) => [g, gs[g]?.w ? Math.round(gs[g].s / gs[g].w) : null]));
    // candidata
    const pegMax = r.lynch === "fast" ? 1.5 : 1;
    r.why = []; r.alerts = [];
    for (const m of METRICS) {
      const p = r.pct[m.k];
      if (p == null || !ok(r[m.k])) continue;
      if (p >= 80) r.why.push({ m, p, t: `${m.l} ${fmt(r[m.k], m.f)} · top ${Math.max(1, 100 - p)}% de ${r.peerLabel}` });
      if (p <= 20) r.alerts.push({ m, p, t: `${m.l} ${fmt(r[m.k], m.f)} · entre el ${Math.max(1, p)}% más débil del grupo` });
    }
    if (ok(r.fcf) && r.fcf < 0) r.alerts.push({ t: "Free cash flow negativo" });
    if (ok(r.revG) && r.revG < 0) r.alerts.push({ t: `Ventas cayendo ${fmt(r.revG, "%")} interanual` });
    if (ok(r.de) && r.de > 2 && r.sec !== "fin" && r.sec !== "re") r.alerts.push({ t: `Deuda alta: ${fmt(r.de, "x")} el patrimonio` });
    r.why.sort((a, b) => b.m.w * b.p - a.m.w * a.p);
    const pegOk = ok(r.peg) && r.peg < pegMax;
    r.cand = (r.score >= 70 && pegOk) || (ok(r.fairUp) && r.fairUp >= 15);
    r.candReason = r.score >= 70 && pegOk
      ? `Score ${r.score} con PEG ${fmt(r.peg, "x", 2)} < ${pegMax} (${LYNCH[r.lynch] || "sin tipo"})`
      : r.cand ? `Tu precio justo deja ${fmt(r.fairUp, "%", 0)} de margen` : "";
  }
}

// ================== Filtros ==================
function filtered() {
  const f = S.f, q = f.q.trim().toLowerCase();
  return S.rows.filter((r) => {
    if (q && !r.s.toLowerCase().includes(q) && !(r.n || "").toLowerCase().includes(q)) return false;
    if (f.markets.size && ![...f.markets].some((m) => (r.mk || "").split(" ").includes(m))) return false;
    if (f.sectors.size && !f.sectors.has(r.sec)) return false;
    if (f.country && r.c !== f.country) return false;
    if (f.lynch && r.lynch !== f.lynch) return false;
    if (f.cap && !(r.mcap >= f.cap)) return false;
    if (f.cand && !r.cand) return false;
    if (f.mine && !r.hasThesis) return false;
    return true;
  });
}
function sorted(rows) {
  const { k, dir } = S.sort;
  return rows.slice().sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === "string" || typeof y === "string") return dir * String(x ?? "").localeCompare(String(y ?? ""));
    if (!ok(x) && !ok(y)) return 0; if (!ok(x)) return 1; if (!ok(y)) return -1;
    return dir * (x - y);
  });
}

// ================== Render ==================
function counts(rows, fn) { const c = {}; for (const r of rows) for (const k of fn(r)) c[k] = (c[k] || 0) + 1; return c; }
function renderFilters() {
  const mc = counts(S.rows.length ? S.rows : UNIVERSE.map((u) => ({ mk: u[4] })), (r) => (r.mk || "").split(" "));
  $("fMarkets").innerHTML = `<button class="chip ${S.f.markets.size ? "" : "on"}" data-m="">Todos</button>` +
    Object.entries(MARKETS).map(([k, l]) => `<button class="chip ${S.f.markets.has(k) ? "on" : ""}" data-m="${k}">${l}<span class="c">${mc[k] || 0}</span></button>`).join("");
  $("fSectors").innerHTML = `<button class="chip ${S.f.sectors.size ? "" : "on"}" data-s="">Todos</button>` +
    Object.entries(SECTORS).map(([k, l]) => `<button class="chip ${S.f.sectors.has(k) ? "on" : ""}" data-s="${k}">${l}</button>`).join("");
  const cs = [...new Set(UNIVERSE.map((u) => u[3]))].sort((a, b) => (COUNTRIES[a] || a).localeCompare(COUNTRIES[b] || b));
  $("fCountry").innerHTML = `<option value="">Todos los países</option>` + cs.map((c) => `<option value="${c}" ${S.f.country === c ? "selected" : ""}>${COUNTRIES[c] || c}</option>`).join("");
}

function renderKpis(rows) {
  const cand = rows.filter((r) => r.cand).length;
  const k = [
    ["Acciones en el filtro", nf(0).format(rows.length), `de ${nf(0).format(S.rows.length || UNIVERSE.length)} en el universo`],
    ["Candidatas", nf(0).format(cand), "Score ≥ 70 y PEG en rango, o tu tesis"],
    ["PEG mediano", fmt(median(rows.map((r) => r.peg)), "x", 2), "P/E forward ÷ crecimiento EPS"],
    ["P/E forward mediano", fmt(median(rows.filter((r) => r.fpe > 0).map((r) => r.fpe)), "x"), ""],
    ["ROIC mediano", fmt(median(rows.map((r) => r.roic)), "%"), "Aproximado con EBIT × (1 − 21%)"],
  ];
  $("kpis").innerHTML = k.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="s">${s}</div></div>`).join("");
}

const COLS = [
  { k: "cmp", l: "", cls: "l", nosort: true },
  { k: "s", l: "Acción", cls: "l" },
  { k: "sec", l: "Sector", cls: "l" },
  { k: "lynch", l: "Tipo", cls: "l" },
  { k: "px", l: "Precio" }, { k: "chg", l: "Día" }, { k: "mcap", l: "Mkt cap" },
  { k: "fpe", l: "P/E fwd" }, { k: "peg", l: "PEG" }, { k: "roic", l: "ROIC" }, { k: "om", l: "Mg. op." },
  { k: "epsG", l: "Crec. EPS" }, { k: "revG", l: "Crec. ventas" }, { k: "fcfY", l: "FCF yld" },
  { k: "fairUp", l: "Tu P. justo" }, { k: "score", l: "Score" },
];
const cell = (r, k, f, d) => `<span class="num ${r.edited?.has(k) ? "edited" : ""}">${fmt(r[k], f, d)}</span>`;
function rowHtml(r) {
  const chg = ok(r.chg) ? `<span class="num ${r.chg >= 0 ? "pos" : "neg"}">${r.chg >= 0 ? "+" : ""}${nf(1).format(r.chg)}%</span>` : `<span class="na">—</span>`;
  return `<tr class="row" data-s="${esc(r.s)}">
    <td class="l"><input type="checkbox" class="cmpchk" data-s="${esc(r.s)}" ${S.cmp.has(r.s) ? "checked" : ""} title="Agregar a comparar"></td>
    <td class="l"><span class="tk">${esc(r.s)}</span> ${r.cand ? '<span class="badge cand">Candidata</span>' : ""} ${r.hasThesis ? '<span class="badge mine">Tesis</span>' : ""}<span class="nm">${esc(r.n)} · ${esc(COUNTRIES[r.c] || r.c)}</span></td>
    <td class="l sec" title="${esc(SECTORS[r.sec] || "")}">${esc(SECTORS[r.sec] || "")}</td>
    <td class="l">${r.lynch ? `<span class="badge">${LYNCH[r.lynch]}</span>` : '<span class="na">—</span>'}</td>
    <td class="num">${fmt(r.px, "$")} <span class="na" style="font-size:11px">${esc(r.cur || "")}</span></td>
    <td>${chg}</td><td class="num">${fmtCap(r.mcap)}</td>
    <td>${cell(r, "fpe", "x")}</td><td>${cell(r, "peg", "x", 2)}</td><td>${cell(r, "roic", "%")}</td><td>${cell(r, "om", "%")}</td>
    <td>${cell(r, "epsG", "%")}</td><td>${cell(r, "revG", "%")}</td><td>${cell(r, "fcfY", "%")}</td>
    <td>${ok(r.fairUp) ? `<span class="num ${r.fairUp >= 0 ? "pos" : "neg"}">${r.fairUp >= 0 ? "+" : ""}${nf(0).format(r.fairUp)}%</span>` : '<span class="na">—</span>'}</td>
    <td><span class="score ${scoreCls(r.score)}">${ok(r.score) ? r.score : "—"}</span></td></tr>`;
}

function renderTable(rows) {
  if (!rows.length) return `<div class="tablewrap"><div class="empty">${S.rows.length ? "Ninguna acción cumple estos filtros." : "Cargando datos…"}</div></div>`;
  const list = sorted(rows);
  const head = COLS.map((c) => `<th class="${c.cls || ""} ${S.sort.k === c.k ? "sorted" : ""}" data-k="${c.nosort ? "" : c.k}">${c.l}${S.sort.k === c.k ? (S.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("");
  const more = list.length > S.limit ? `<div class="more"><button class="btn" id="btnMore">Mostrar ${Math.min(60, list.length - S.limit)} más · quedan ${list.length - S.limit}</button></div>` : "";
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${list.slice(0, S.limit).map(rowHtml).join("")}</tbody></table>${more}</div>`;
}

function groupSummary(rows) {
  const sc = rows.filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  return {
    n: rows.length, cand: rows.filter((r) => r.cand),
    peg: median(rows.map((r) => r.peg)), fpe: median(rows.filter((r) => r.fpe > 0).map((r) => r.fpe)),
    roic: median(rows.map((r) => r.roic)), om: median(rows.map((r) => r.om)), revG: median(rows.map((r) => r.revG)),
    epsG: median(rows.map((r) => r.epsG)), score: median(rows.map((r) => r.score)), top: sc.slice(0, 5),
    mcap: rows.reduce((s, r) => s + (r.mcap || 0), 0),
  };
}
function renderGroups(rows, by) {
  const g = new Map();
  for (const r of rows) { const k = by === "sector" ? r.sec : r.c; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  if (!g.size) return `<div class="empty">Sin datos para estos filtros.</div>`;
  const items = [...g.entries()].map(([k, rs]) => ({ k, rs, s: groupSummary(rs) })).sort((a, b) => b.s.mcap - a.s.mcap);
  return `<div class="grid-cards">${items.map(({ k, s }) => `
    <div class="card">
      <h3><span>${esc(by === "sector" ? SECTORS[k] : COUNTRIES[k] || k)}</span><button class="btn sm" data-pdf="${by}" data-key="${esc(k)}">⤓ PDF</button></h3>
      <div class="sub">${s.n} acciones · ${fmtCap(s.mcap)} · ${s.cand.length} candidatas</div>
      <div class="mini">
        <div><div class="l">Score</div><div class="v num">${ok(s.score) ? Math.round(s.score) : "—"}</div></div>
        <div><div class="l">PEG</div><div class="v num">${fmt(s.peg, "x", 2)}</div></div>
        <div><div class="l">P/E fwd</div><div class="v num">${fmt(s.fpe, "x")}</div></div>
        <div><div class="l">ROIC</div><div class="v num">${fmt(s.roic, "%")}</div></div>
        <div><div class="l">Mg. op.</div><div class="v num">${fmt(s.om, "%")}</div></div>
        <div><div class="l">Crec. vtas</div><div class="v num">${fmt(s.revG, "%")}</div></div>
      </div>
      <div class="toplist">${s.top.map((r) => `<div class="it" data-open="${esc(r.s)}"><span><b>${esc(r.s)}</b> <span class="na">${esc((r.n || "").slice(0, 26))}</span> ${r.cand ? '<span class="badge cand">Candidata</span>' : ""}</span><span class="score ${scoreCls(r.score)}">${r.score}</span></div>`).join("")}</div>
      <div style="margin-top:10px"><button class="btn sm" data-filter="${by}" data-key="${esc(k)}">Ver todas →</button></div>
    </div>`).join("")}</div>`;
}

function cmpRows() { return [...S.cmp].map((s) => S.rows.find((r) => r.s === s)).filter(Boolean); }
function renderCompare() {
  const rs = cmpRows();
  if (rs.length < 2) return `<div class="empty">Marcá al menos 2 acciones con la casilla de la tabla para compararlas lado a lado.</div>`;
  const lines = [{ k: "score", l: "Score", f: "n", d: 0, dir: 1 }, { k: "mcap", l: "Market cap", cap: true, dir: 0 }, { k: "lynch", l: "Tipo Lynch", txt: true },
    ...METRICS.map((m) => ({ k: m.k, l: m.l, f: m.f, d: m.k === "peg" ? 2 : 1, dir: m.dir })),
    { k: "gm", l: "Margen bruto", f: "%", dir: 1 }, { k: "upside", l: "Upside a target", f: "%", dir: 1 }, { k: "fairUp", l: "Upside a tu precio justo", f: "%", dir: 1 }];
  const body = lines.map((ln) => {
    const vals = rs.map((r) => r[ln.k]);
    const valid = vals.filter(ok).filter((v) => !(ln.k === "fpe" && v <= 0));
    const best = ln.dir ? (ln.dir > 0 ? Math.max(...valid) : Math.min(...valid)) : null;
    return `<tr><td class="l">${ln.l}</td>${rs.map((r) => {
      const v = r[ln.k];
      const txt = ln.txt ? (LYNCH[v] || "—") : ln.cap ? fmtCap(v) : fmt(v, ln.f, ln.d);
      return `<td class="num ${valid.length > 1 && ok(v) && v === best ? "best" : ""}">${txt}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px"><button class="btn sm" data-pdf="compare">⤓ PDF de la comparativa</button></div>
    <div class="tablewrap"><table class="cmp"><thead><tr><th class="l">Métrica</th>${rs.map((r) => `<th><span data-open="${esc(r.s)}" style="cursor:pointer">${esc(r.s)}</span> <span class="x" data-uncmp="${esc(r.s)}" style="font-size:14px">×</span><div class="na" style="font-weight:400">${esc((r.n || "").slice(0, 22))}</div></th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="na" style="font-size:12px;margin-top:8px">En verde, el mejor valor de cada fila.</div>`;
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
  $("cmpTxt").textContent = `${S.cmp.size} para comparar: ${[...S.cmp].slice(0, 5).join(", ")}${S.cmp.size > 5 ? "…" : ""}`;
}
function refreshAll() { rebuild(); renderFilters(); render(); if ($("drawer").classList.contains("show")) openDrawer($("drawer").dataset.s); }

// ================== Ficha (drawer) ==================
function metricBox(r, m) {
  const p = r.pct?.[m.k], med = r.med?.[m.k];
  const d = m.k === "peg" ? 2 : undefined;
  return `<div class="m">
    <div class="l"><span>${m.l}</span>${p != null ? `<span>P${p}</span>` : ""}</div>
    <div class="v num ${r.edited.has(m.k) ? "edited" : ""}" ${EDITABLE.has(m.k) ? `data-edit="${m.k}" title="Clic para corregir"` : ""}>${fmt(r[m.k], m.f, d)}</div>
    ${p != null ? `<div class="pb"><div style="width:${p}%;background:${pctColor(p)}"></div></div>` : ""}
    <div class="med">Mediana del grupo: ${fmt(med, m.f, d)}${r.edited.has(m.k) ? ` · Yahoo: ${fmt(S.raw.get(r.s)?.[m.k], m.f, d)}` : ""}</div></div>`;
}
function openDrawer(sym) {
  const r = S.rows.find((x) => x.s === sym);
  if (!r) return;
  const d = $("drawer"); d.dataset.s = sym;
  const bars = GROUPS.map((g) => { const v = r.gscore[g]; return `<div class="bar"><span>${g}</span><div class="t"><div style="width:${v ?? 0}%;background:${pctColor(v ?? 0)}"></div></div><span class="num">${v ?? "—"}</span></div>`; }).join("");
  const why = r.why.slice(0, 5).map((w) => `<div><span class="pos">▲</span>${esc(w.t)}</div>`).join("") || `<div class="na">Ninguna métrica en el 20% superior de su grupo.</div>`;
  const al = r.alerts.slice(0, 5).map((w) => `<div><span class="neg">▼</span>${esc(w.t)}</div>`).join("") || `<div class="na">Sin señales de alarma en estas métricas.</div>`;
  d.innerHTML = `
    <div class="dh"><div><h2>${esc(r.s)} <span class="na" style="font-weight:400;font-size:15px">${esc(r.n)}</span></h2>
      <div class="meta">${esc(SECTORS[r.sec])} · ${esc(COUNTRIES[r.c] || r.c)} · ${(r.mk || "").split(" ").map((m) => MARKETS[m]).filter(Boolean).join(", ")}</div>
      <div class="meta num">${fmt(r.px, "$")} ${esc(r.cur || "")} ${ok(r.chg) ? `<span class="${r.chg >= 0 ? "pos" : "neg"}">${r.chg >= 0 ? "+" : ""}${nf(2).format(r.chg)}%</span>` : ""} · ${fmtCap(r.mcap)}</div></div>
      <button class="x" id="dClose" aria-label="Cerrar">×</button></div>
    <div class="hero"><div class="bigscore ${scoreCls(r.score)}">${ok(r.score) ? r.score : "—"}</div>
      <div><div class="bars">${bars}</div><div class="na" style="font-size:11.5px;margin-top:8px">Comparada contra ${r.peerN} empresas de ${esc(r.peerLabel)}</div></div></div>
    ${r.cand ? `<div class="badge cand" style="font-size:12.5px;padding:6px 12px">Candidata · ${esc(r.candReason)}</div>` : ""}
    <div class="sec-title">Fundamentos</div><div class="reasons">${why}</div>
    <div class="sec-title">Alertas</div><div class="reasons">${al}</div>
    <div class="sec-title">Métricas que puntúan <span style="text-transform:none;letter-spacing:0">· clic en un valor para corregirlo</span></div>
    <div class="mgrid">${METRICS.map((m) => metricBox(r, m)).join("")}</div>
    <div class="sec-title">Otras métricas</div>
    <div class="mgrid">${EXTRA.map((m) => metricBox(r, m)).join("")}</div>
    <div class="sec-title">Tu tesis</div>
    <div class="mine-box">
      <label>Tipo Lynch<select id="dLynch"><option value="">Automático (${LYNCH[r.lynchAuto] || "sin datos"})</option>${Object.entries(LYNCH).map(([k, l]) => `<option value="${k}" ${S.ov.get(sym)?.lynch_type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Precio justo (${esc(r.cur || "")})<input type="number" step="any" id="dFair" value="${r.fair ?? ""}" placeholder="${ok(r.tgt) ? "Target analistas: " + fmt(r.tgt, "$") : ""}"></label>
      <textarea id="dNotes" placeholder="Tesis, catalizadores, riesgos, reglas de venta…">${esc(r.notes)}</textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn primary" id="dSave">Guardar</button>
      <button class="btn" id="dPdf">⤓ PDF de la empresa</button>
      <button class="btn" id="dCmp">${S.cmp.has(sym) ? "Quitar de comparar" : "+ Comparar"}</button>
      <a class="btn" href="/fundamentals.html?symbol=${encodeURIComponent(sym)}" style="text-decoration:none">Fundamental completo →</a>
      ${r.edited.size ? `<button class="btn" id="dReset">Restaurar datos de Yahoo</button>` : ""}
    </div>
    <div class="na" style="font-size:11.5px;margin-top:14px">Datos: Yahoo Finance${r.t ? " · " + new Date(r.t).toLocaleString("es-AR") : ""}. ${S.user ? "Tus ediciones se guardan en Supabase." : "Tus ediciones se guardan en este navegador."}</div>`;
  d.classList.add("show"); $("overlay").classList.add("show");
}
function closeDrawer() { $("drawer").classList.remove("show"); if (!$("modal").classList.contains("show")) $("overlay").classList.remove("show"); }

// ================== Ediciones (Supabase o local) ==================
async function saveOverride(sym, patch) {
  const cur = { symbol: sym, fair_value: null, lynch_type: null, notes: null, metrics: {}, ...(S.ov.get(sym) || {}) };
  const next = { ...cur, ...patch, metrics: { ...cur.metrics, ...(patch.metrics || {}) } };
  for (const [k, v] of Object.entries(next.metrics)) if (v === null || v === "") delete next.metrics[k];
  S.ov.set(sym, next);
  if (S.sb && S.user) {
    const { error } = await S.sb.from("overrides").upsert({ symbol: sym, fair_value: next.fair_value, lynch_type: next.lynch_type, notes: next.notes, metrics: next.metrics, updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
    if (error) { toast("No se pudo guardar en Supabase: " + error.message); return; }
  } else saveLocal("scr_overrides", Object.fromEntries(S.ov));
  if (sym === "__settings") return;
  refreshAll();
}
async function loadOverrides() {
  S.ov = new Map(Object.entries(loadLocal("scr_overrides", {})));
  if (S.sb && S.user) {
    const { data, error } = await S.sb.from("overrides").select("symbol,fair_value,lynch_type,notes,metrics");
    if (!error) {
      S.ov = new Map(data.map((d) => [d.symbol, d]));
      const w = S.ov.get("__settings")?.metrics?.weights;
      if (w) { S.weights = { ...S.weights, ...w }; saveLocal("scr_weights", S.weights); }
      // primera vez con sesión: subir lo que había en modo local
      const local = loadLocal("scr_overrides", {});
      const pending = Object.entries(local).filter(([s]) => !S.ov.has(s));
      for (const [s, o] of pending) await saveOverride(s, o);
      if (pending.length) { saveLocal("scr_overrides", {}); toast(`Subí ${pending.length} ediciones locales a Supabase`); }
    }
  }
}

// ================== Datos ==================
function setStatus(txt, state) { $("statusTxt").textContent = txt; $("dot").className = "dot " + (state || ""); }
async function loadFromSupabase() {
  if (!S.sb) return false;
  const { data, error } = await S.sb.from("snapshots").select("symbol,data,updated_at").range(0, 4999);
  if (error || !data?.length) return false;
  let newest = 0;
  for (const d of data) if (META.has(d.symbol)) { S.raw.set(d.symbol, withMeta(d.data)); newest = Math.max(newest, Date.parse(d.updated_at)); }
  S.source = "Supabase"; S.updated = newest;
  return true;
}
function withMeta(row) { const m = META.get(row.s); return m ? { ...row, sec: m[2], c: m[3], mk: m[4] } : row; }
async function loadLive() {
  if (S.loading) return; S.loading = true;
  let done = 0, fails = 0;
  setStatus(`Bajando datos en vivo… 0/${BATCH_COUNT} lotes`, "load");
  const queue = [...Array(BATCH_COUNT).keys()];
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      try {
        const r = await fetch(`/api/screener?batch=${i}`);
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        for (const row of j.rows) if (row.ok) S.raw.set(row.s, withMeta(row));
      } catch { fails++; }
      done++;
      $("prog").style.width = (done / BATCH_COUNT) * 100 + "%";
      setStatus(`Bajando datos en vivo… ${done}/${BATCH_COUNT} lotes`, "load");
      if (done % 3 === 0 || done === BATCH_COUNT) refreshAll();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  S.loading = false; S.source = "Yahoo en vivo"; S.updated = Date.now();
  setTimeout(() => ($("prog").style.width = "0"), 600);
  statusLine(fails);
  refreshAll();
}
function statusLine(fails = 0) {
  const ago = S.updated ? Math.round((Date.now() - S.updated) / 3600000) : null;
  setStatus(`${nf(0).format(S.raw.size)} acciones · fuente: ${S.source}${ago != null ? ` · ${ago < 1 ? "hace minutos" : `hace ${ago} h`}` : ""}${fails ? ` · ${fails} lotes fallaron, probá Actualizar` : ""} · ${S.user ? "sesión: " + S.user.email : "ediciones en modo local"}`, "on");
}

// ================== PDF ==================
function pdfFoot() { return `<div class="foot">Fuente: Yahoo Finance · datos al ${S.updated ? new Date(S.updated).toLocaleDateString("es-AR") : today()} · Score = percentiles ponderados contra el grupo de pares (valuación, calidad, crecimiento). ROIC aproximado. Material de análisis propio, no constituye recomendación de inversión.</div>`; }
const cls = (s) => (!ok(s) ? "" : s >= 70 ? "g" : s >= 45 ? "m2" : "b");
function pdfTable(rows, n = 40) {
  return `<table><thead><tr><th class="l">Acción</th><th class="l">Sector</th><th class="l">Tipo</th><th>Mkt cap</th><th>P/E fwd</th><th>PEG</th><th>ROIC</th><th>Mg. op.</th><th>Crec. EPS</th><th>Crec. ventas</th><th>Score</th></tr></thead><tbody>${
    rows.slice(0, n).map((r) => `<tr><td class="l"><b>${esc(r.s)}</b> ${esc((r.n || "").slice(0, 28))}${r.cand ? " ★" : ""}</td><td class="l">${esc(SECTORS[r.sec])}</td><td class="l">${LYNCH[r.lynch] || "—"}</td><td>${fmtCap(r.mcap)}</td><td>${fmt(r.fpe, "x")}</td><td>${fmt(r.peg, "x", 2)}</td><td>${fmt(r.roic, "%")}</td><td>${fmt(r.om, "%")}</td><td>${fmt(r.epsG, "%")}</td><td>${fmt(r.revG, "%")}</td><td class="sc ${cls(r.score)}">${r.score ?? "—"}</td></tr>`).join("")}</tbody></table>${rows.length > n ? `<div class="sub">Se muestran ${n} de ${rows.length}, ordenadas por score.</div>` : ""}`;
}
function pdfKp(s) {
  return `<div class="kp"><div><div class="l">Acciones</div><div class="v">${s.n}</div></div><div><div class="l">Candidatas</div><div class="v">${s.cand.length}</div></div><div><div class="l">PEG mediano</div><div class="v">${fmt(s.peg, "x", 2)}</div></div><div><div class="l">P/E fwd mediano</div><div class="v">${fmt(s.fpe, "x")}</div></div><div><div class="l">ROIC mediano</div><div class="v">${fmt(s.roic, "%")}</div></div><div><div class="l">Mg. operativo</div><div class="v">${fmt(s.om, "%")}</div></div><div><div class="l">Crec. ventas</div><div class="v">${fmt(s.revG, "%")}</div></div><div><div class="l">Mkt cap total</div><div class="v">${fmtCap(s.mcap)}</div></div></div>`;
}
function pdfGroup(title, rows, subBy) {
  const s = groupSummary(rows);
  const bySc = rows.filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  let breakdown = "";
  if (subBy) {
    const g = new Map(); for (const r of rows) { const k = subBy === "sector" ? r.sec : r.c; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    breakdown = `<h2>Desglose por ${subBy === "sector" ? "sector" : "país"}</h2><table><thead><tr><th class="l">${subBy === "sector" ? "Sector" : "País"}</th><th>Acciones</th><th>Mkt cap</th><th>PEG med.</th><th>P/E fwd med.</th><th>ROIC med.</th><th>Crec. ventas</th><th>Score med.</th><th class="l">Mejor score</th></tr></thead><tbody>${
      [...g.entries()].map(([k, rs]) => ({ k, s: groupSummary(rs) })).sort((a, b) => b.s.mcap - a.s.mcap).map(({ k, s: x }) => `<tr><td class="l">${esc(subBy === "sector" ? SECTORS[k] : COUNTRIES[k] || k)}</td><td>${x.n}</td><td>${fmtCap(x.mcap)}</td><td>${fmt(x.peg, "x", 2)}</td><td>${fmt(x.fpe, "x")}</td><td>${fmt(x.roic, "%")}</td><td>${fmt(x.revG, "%")}</td><td>${ok(x.score) ? Math.round(x.score) : "—"}</td><td class="l">${x.top[0] ? esc(x.top[0].s) + " (" + x.top[0].score + ")" : "—"}</td></tr>`).join("")}</tbody></table>`;
  }
  const cand = s.cand.length ? `<h2>Oportunidades detectadas</h2><ul>${s.cand.slice(0, 15).map((r) => `<li class="pb"><b>${esc(r.s)}</b> (${esc(r.n)}) — ${esc(r.candReason)}. ${r.why.slice(0, 3).map((w) => esc(w.t)).join("; ")}${r.alerts.length ? `. <span class="b">Ojo: ${esc(r.alerts[0].t)}</span>` : ""}</li>`).join("")}</ul>` : "";
  return `<div class="rp"><h1>${esc(title)}</h1><div class="sub">Screener global · ${today()} · ${S.f.peer === "sector-country" ? "score contra su sector en su país" : "score contra su sector global"}</div>${pdfKp(s)}${breakdown}${cand}<h2>Ranking por score</h2>${pdfTable(bySc)}${pdfFoot()}</div>`;
}
function pdfCompany(r) {
  const met = [...METRICS, ...EXTRA].map((m) => `<tr><td class="l">${m.l}${r.edited.has(m.k) ? " (editado)" : ""}</td><td>${fmt(r[m.k], m.f, m.k === "peg" ? 2 : undefined)}</td><td>${fmt(r.med[m.k], m.f, m.k === "peg" ? 2 : undefined)}</td><td>${r.pct[m.k] != null ? "P" + r.pct[m.k] : "—"}</td></tr>`).join("");
  return `<div class="rp"><h1>${esc(r.s)} · ${esc(r.n)}</h1><div class="sub">${esc(SECTORS[r.sec])} · ${esc(COUNTRIES[r.c] || r.c)} · ${today()}</div>
    <div class="kp"><div><div class="l">Score</div><div class="v ${cls(r.score)}">${r.score ?? "—"}</div></div><div><div class="l">Precio</div><div class="v">${fmt(r.px, "$")} ${esc(r.cur || "")}</div></div><div><div class="l">Market cap</div><div class="v">${fmtCap(r.mcap)}</div></div><div><div class="l">Tipo Lynch</div><div class="v">${LYNCH[r.lynch] || "—"}</div></div>
    ${GROUPS.map((g) => `<div><div class="l">${g}</div><div class="v ${cls(r.gscore[g])}">${r.gscore[g] ?? "—"}</div></div>`).join("")}<div><div class="l">${r.fair ? "Tu precio justo" : "Target analistas"}</div><div class="v">${r.fair ? fmt(r.fair, "$") + " (" + (r.fairUp >= 0 ? "+" : "") + nf(0).format(r.fairUp) + "%)" : fmt(r.tgt, "$")}</div></div></div>
    ${r.cand ? `<h2>Por qué es candidata</h2><div>${esc(r.candReason)}</div>` : ""}
    <h2>Fundamentos</h2><ul>${r.why.slice(0, 6).map((w) => `<li>${esc(w.t)}</li>`).join("") || "<li>Ninguna métrica en el 20% superior de su grupo.</li>"}</ul>
    <h2>Alertas</h2><ul>${r.alerts.slice(0, 6).map((w) => `<li>${esc(w.t)}</li>`).join("") || "<li>Sin señales de alarma en estas métricas.</li>"}</ul>
    ${r.notes ? `<h2>Tesis</h2><div class="notes">${esc(r.notes)}</div>` : ""}
    <h2>Métricas vs. ${esc(r.peerLabel)} (${r.peerN} empresas)</h2><table><thead><tr><th class="l">Métrica</th><th>${esc(r.s)}</th><th>Mediana del grupo</th><th>Percentil</th></tr></thead><tbody>${met}</tbody></table>
    ${pdfFoot()}</div>`;
}
function pdfCompare() {
  const rs = cmpRows();
  const lines = [["Score", (r) => r.score ?? "—"], ["Tipo Lynch", (r) => LYNCH[r.lynch] || "—"], ["Market cap", (r) => fmtCap(r.mcap)], ...METRICS.map((m) => [m.l, (r) => fmt(r[m.k], m.f, m.k === "peg" ? 2 : undefined)]), ["Upside a target", (r) => fmt(r.upside, "%")], ["Upside a tu precio justo", (r) => fmt(r.fairUp, "%")]];
  return `<div class="rp"><h1>Comparativa: ${rs.map((r) => esc(r.s)).join(" vs. ")}</h1><div class="sub">Screener global · ${today()}</div><table><thead><tr><th class="l">Métrica</th>${rs.map((r) => `<th>${esc(r.s)}</th>`).join("")}</tr></thead><tbody>${lines.map(([l, fn]) => `<tr><td class="l">${l}</td>${rs.map((r) => `<td>${fn(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <h2>Lectura rápida</h2><ul>${rs.map((r) => `<li><b>${esc(r.s)}</b>: ${r.why.slice(0, 2).map((w) => esc(w.t)).join("; ") || "sin fortalezas destacadas"}${r.alerts.length ? `. <span class="b">Ojo: ${esc(r.alerts[0].t)}</span>` : ""}</li>`).join("")}</ul>${pdfFoot()}</div>`;
}
function printHtml(html, name) {
  $("printRoot").innerHTML = html;
  const t = document.title; document.title = name;
  setTimeout(() => { window.print(); document.title = t; }, 50);
}
function pdfView() {
  const rows = filtered().filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
  const parts = [...S.f.markets].map((m) => MARKETS[m]).concat([...S.f.sectors].map((s) => SECTORS[s]), S.f.country ? [COUNTRIES[S.f.country]] : []);
  printHtml(pdfGroup(parts.length ? parts.join(" · ") : "Universo completo", rows, S.f.sectors.size === 1 ? "country" : "sector"), "Screener " + today().replaceAll("/", "-"));
}

// ================== Pesos ==================
function openWeights() {
  const m = $("modal");
  m.innerHTML = `<div class="dh"><h2 style="font-size:17px;margin:0">Pesos del score</h2><button class="x" id="wClose">×</button></div>
    <div class="na" style="font-size:12.5px;margin:6px 0 4px">Cada métrica se convierte en percentil (0-100) dentro de su grupo de pares y se pondera con estos pesos. Con 0 la métrica no cuenta.</div>
    ${GROUPS.map((g) => `<div class="wgroup">${g}</div>${METRICS.filter((x) => x.g === g).map((x) => `<div class="wrow"><span>${x.l}</span><input type="range" min="0" max="30" step="1" value="${S.weights[x.k]}" data-w="${x.k}"><span class="num" id="wv_${x.k}">${S.weights[x.k]}</span></div>`).join("")}`).join("")}
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" id="wSave">Aplicar</button><button class="btn" id="wReset">Volver a los default</button></div>`;
  m.classList.add("show"); $("overlay").classList.add("show");
}
function closeModal() { $("modal").classList.remove("show"); if (!$("drawer").classList.contains("show")) $("overlay").classList.remove("show"); }

// ================== Sesión ==================
async function initSupabase() {
  const c = window.APP_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseAnonKey) { $("btnAuth").style.display = "none"; return; }
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    S.sb = createClient(c.supabaseUrl, c.supabaseAnonKey);
    const { data } = await S.sb.auth.getSession();
    S.user = data?.session?.user || null;
    S.sb.auth.onAuthStateChange(async (_e, sess) => {
      const u = sess?.user || null;
      if ((u?.id || null) !== (S.user?.id || null)) { S.user = u; await loadOverrides(); refreshAll(); statusLine(); authBtn(); }
    });
    authBtn();
  } catch { S.sb = null; $("btnAuth").style.display = "none"; }
}
function authBtn() { $("btnAuth").textContent = S.user ? "Cerrar sesión" : "Iniciar sesión"; }
async function authClick() {
  if (!S.sb) return;
  if (S.user) { await S.sb.auth.signOut(); return; }
  const email = prompt("Tu email. Te llega un link para entrar sin contraseña:");
  if (!email) return;
  const { error } = await S.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/screener.html" } });
  toast(error ? "Error: " + error.message : "Revisá tu mail y abrí el link");
}

// ================== Eventos ==================
function bind() {
  $("q").addEventListener("input", (e) => { S.f.q = e.target.value; S.limit = 60; render(); });
  $("fCountry").addEventListener("change", (e) => { S.f.country = e.target.value; render(); });
  $("fLynch").addEventListener("change", (e) => { S.f.lynch = e.target.value; render(); });
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
    const th = t.closest("th[data-k]"); if (th && th.dataset.k) { const k = th.dataset.k; S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : (["s", "sec", "lynch"].includes(k) ? 1 : -1) }; render(); return; }
    if (t.id === "btnMore") { S.limit += 60; render(); return; }
    const un = t.closest("[data-uncmp]"); if (un) { S.cmp.delete(un.dataset.uncmp); saveLocal("scr_cmp", [...S.cmp]); render(); return; }
    const pdf = t.closest("[data-pdf]");
    if (pdf) {
      const by = pdf.dataset.pdf, k = pdf.dataset.key;
      if (by === "compare") return printHtml(pdfCompare(), "Comparativa " + [...S.cmp].join("-"));
      const rows = filtered().filter((r) => (by === "sector" ? r.sec === k : r.c === k)).filter((r) => ok(r.score)).sort((a, b) => b.score - a.score);
      const title = by === "sector" ? `Sector ${SECTORS[k]}` : `País: ${COUNTRIES[k] || k}`;
      return printHtml(pdfGroup(title, rows, by === "sector" ? "country" : "sector"), title + " " + today().replaceAll("/", "-"));
    }
    const fl = t.closest("[data-filter]");
    if (fl) { if (fl.dataset.filter === "sector") S.f.sectors = new Set([fl.dataset.key]); else { S.f.country = fl.dataset.key; } S.view = "table"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.v === "table")); renderFilters(); render(); return; }
    const op = t.closest("[data-open]"); if (op) return openDrawer(op.dataset.open);
    const tr = t.closest("tr.row"); if (tr) openDrawer(tr.dataset.s);
  });
  $("cmpGo").addEventListener("click", () => { S.view = "compare"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.v === "compare")); render(); });
  $("cmpClear").addEventListener("click", () => { S.cmp.clear(); saveLocal("scr_cmp", []); render(); });
  $("overlay").addEventListener("click", () => { closeDrawer(); closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });
  $("drawer").addEventListener("click", async (e) => {
    const sym = $("drawer").dataset.s, t = e.target;
    if (t.id === "dClose") return closeDrawer();
    if (t.id === "dSave") {
      const fair = $("dFair").value;
      await saveOverride(sym, { fair_value: fair === "" ? null : Number(fair), lynch_type: $("dLynch").value || null, notes: $("dNotes").value || null });
      return toast("Tesis guardada");
    }
    if (t.id === "dPdf") { const r = S.rows.find((x) => x.s === sym); return printHtml(pdfCompany(r), `${sym} ${today().replaceAll("/", "-")}`); }
    if (t.id === "dCmp") { S.cmp.has(sym) ? S.cmp.delete(sym) : S.cmp.add(sym); saveLocal("scr_cmp", [...S.cmp]); render(); return openDrawer(sym); }
    if (t.id === "dReset") { const o = S.ov.get(sym); return saveOverride(sym, { metrics: Object.fromEntries(Object.keys(o?.metrics || {}).map((k) => [k, null])) }); }
    const ed = t.closest("[data-edit]");
    if (ed && !ed.querySelector("input")) {
      const k = ed.dataset.edit, r = S.rows.find((x) => x.s === sym);
      ed.innerHTML = `<input type="number" step="any" value="${ok(r[k]) ? Math.round(r[k] * 100) / 100 : ""}" placeholder="vacío = Yahoo">`;
      const inp = ed.querySelector("input"); inp.focus(); inp.select();
      const commit = () => saveOverride(sym, { metrics: { [k]: inp.value === "" ? null : Number(inp.value) } });
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") commit(); if (ev.key === "Escape") openDrawer(sym); });
      inp.addEventListener("blur", commit);
    }
  });
  $("btnWeights").addEventListener("click", openWeights);
  $("modal").addEventListener("input", (e) => { const k = e.target.dataset.w; if (k) $("wv_" + k).textContent = e.target.value; });
  $("modal").addEventListener("click", async (e) => {
    if (e.target.id === "wClose") return closeModal();
    if (e.target.id === "wReset") { document.querySelectorAll("[data-w]").forEach((i) => { const m = METRICS.find((x) => x.k === i.dataset.w); i.value = m.w; $("wv_" + m.k).textContent = m.w; }); return; }
    if (e.target.id === "wSave") {
      document.querySelectorAll("[data-w]").forEach((i) => (S.weights[i.dataset.w] = Number(i.value)));
      saveLocal("scr_weights", S.weights);
      if (S.user) await saveOverride("__settings", { metrics: { weights: S.weights } });
      closeModal(); refreshAll(); toast("Pesos aplicados");
    }
  });
  $("btnRefresh").addEventListener("click", loadLive);
  $("btnPdfView").addEventListener("click", pdfView);
  $("btnAuth").addEventListener("click", authClick);
}

// ================== Arranque ==================
(async function init() {
  bind(); renderFilters(); render();
  await initSupabase();
  await loadOverrides();
  const fromDb = await loadFromSupabase();
  if (fromDb) { refreshAll(); statusLine(); }
  // si la base tiene más de 24 h (o no existe), refresca en vivo
  if (!fromDb || Date.now() - S.updated > 24 * 3600000) await loadLive();
})();
