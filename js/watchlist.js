import { UNIVERSE, SYMBOLS, BATCH_SIZE, COUNTRIES } from "/lib/universe.js";
import { METRICS, PROFILES, LYNCH, LYNCH_INFO, ok, derive, scoreAll, median, fmt, fmtCap, nf, scoreCls } from "/js/score.js";
import { $, esc, toast, loadLocal, saveLocal, state, initSupabase, loadSnapshots, loadOverrides, saveOverride, userMult, userProfW, loadFund, withMeta, META } from "/js/core.js";

const KEY = "watchlists_v2", COLS_KEY = "watchlist_cols_v3";
const DEFAULT_COLS = ["fpe", "peg", "evEbitda", "revG", "roic", "divY"];
const W = { raw: new Map(), rows: [], updated: null, lists: null, active: null, cols: loadLocal(COLS_KEY, DEFAULT_COLS) };
const today = () => new Date().toLocaleDateString("es-AR");

// ---------- Listas (navegador o cuenta) ----------
function loadLists() {
  const fromAcc = state.ov.get("__watchlists")?.metrics?.lists;
  let st = fromAcc ? { lists: fromAcc, active: Object.keys(fromAcc)[0] } : loadLocal(KEY, null);
  if (!st) { const old = loadLocal("watchlist", []); st = { lists: { Principal: Array.isArray(old) ? old : [] }, active: "Principal" }; }
  // Normaliza a símbolos del universo (acepta tickers de BYMA)
  for (const [n, arr] of Object.entries(st.lists)) st.lists[n] = [...new Set(arr.map((x) => resolve(x) || String(x).toUpperCase()))];
  W.lists = st.lists; W.active = st.active && st.lists[st.active] ? st.active : Object.keys(st.lists)[0] || "Principal";
  if (!W.lists[W.active]) W.lists[W.active] = [];
}
async function persist() {
  saveLocal(KEY, { lists: W.lists, active: W.active });
  if (state.user) await saveOverride("__watchlists", { metrics: { lists: W.lists } });
}
function resolve(q) {
  q = (q || "").trim().toUpperCase(); if (!q) return null;
  const m = q.match(/^([A-Z0-9.\-]+)\s+·/); if (m) q = m[1];
  const byY = UNIVERSE.find((u) => u[0] === q), byC = UNIVERSE.find((u) => (u[5] || "").toUpperCase() === q);
  if (byY) return byY[0]; if (byC) return byC[0];
  const byN = UNIVERSE.find((u) => u[1].toUpperCase().includes(q));
  return byN ? byN[0] : null;
}

// ---------- Datos ----------
async function ensureRows(syms) {
  const missing = syms.filter((s) => META.has(s) && !W.raw.has(s));
  const batches = [...new Set(missing.map((s) => Math.floor(SYMBOLS.indexOf(s) / BATCH_SIZE)))];
  for (const b of batches) {
    const j = await fetch(`/api/screener?batch=${b}`).then((r) => r.json()).catch(() => null);
    for (const row of j?.rows || []) if (row.ok) { const x = withMeta(row); if (x) W.raw.set(row.s, x); }
  }
}
function rebuild() {
  W.rows = [...W.raw.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(W.rows, { userMult: userMult(), profW: userProfW() });
}

// ---------- Render ----------
function renderLists() {
  $("lists").innerHTML = Object.keys(W.lists).map((n) => `<button class="chip ${n === W.active ? "on" : ""}" data-list="${esc(n)}">${esc(n)} <span class="c">${W.lists[n].length}</span>${Object.keys(W.lists).length > 1 ? `<span class="x" data-del="${esc(n)}" title="Borrar lista">×</span>` : ""}</button>`).join("") +
    `<button class="chip" id="newList">+ Nueva lista</button>`;
}
function current() { return W.lists[W.active].map((s) => W.rows.find((r) => r.s === s) || { s, out: true }); }
function render() {
  renderLists();
  const rows = current(), inU = rows.filter((r) => !r.out);
  $("kpis").innerHTML = [
    ["Acciones", nf(0).format(rows.length), `${rows.length - inU.length ? rows.length - inU.length + " fuera del universo operable" : "todas operables desde Argentina"}`],
    ["Score promedio", ok(median(inU.map((r) => r.score))) ? Math.round(median(inU.map((r) => r.score))) : "—", "mediana de la lista"],
    ["Candidatas", nf(0).format(inU.filter((r) => r.cand).length), "score alto y valuación favorable"],
    ["Con tu tesis", nf(0).format(inU.filter((r) => r.hasThesis).length), "precio justo o notas cargadas"],
  ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="s">${s}</div></div>`).join("");
  if (!rows.length) { $("view").innerHTML = `<div class="tablewrap"><div class="empty">Lista vacía: agregá un CEDEAR arriba.</div></div>`; return; }
  const cols = W.cols.filter((k) => METRICS[k]);
  $("view").innerHTML = `<div class="tablewrap"><table><thead><tr><th class="l">Acción</th><th class="l">Industria</th><th class="l">Tipo</th><th>Precio</th><th>Día</th><th>Mkt cap</th>${cols.map((k) => `<th title="${esc(METRICS[k].q)}">${esc(METRICS[k].l)}</th>`).join("")}<th title="Distancia a tu precio justo">Tu P. justo</th><th>Score</th><th></th></tr></thead><tbody>
    ${rows.map((r) => r.out ? `<tr class="out"><td class="l"><b>${esc(r.s)}</b><span class="nm">No es un CEDEAR ni cotiza en BYMA</span></td><td colspan="${7 + cols.length}"></td><td><button class="rm" data-rm="${esc(r.s)}" aria-label="Quitar">×</button></td></tr>` : `
      <tr class="row" data-s="${esc(r.s)}">
        <td class="l"><span class="tk">${esc(r.ced || r.s)}</span> ${r.cand ? '<span class="badge cand">Candidata</span>' : ""}<span class="nm">${esc(r.n)} · ${esc(COUNTRIES[r.c] || r.c)}</span></td>
        <td class="l sec">${esc(PROFILES[r.profile].l)}</td>
        <td class="l">${r.lynch ? `<span class="badge" title="${esc(LYNCH_INFO[r.lynch])}">${LYNCH[r.lynch]}</span>` : "—"}</td>
        <td class="num">${fmt(r.px)} <span class="na" style="font-size:11px">${esc(r.cur || "")}</span></td>
        <td>${ok(r.chg) ? `<span class="num ${r.chg >= 0 ? "pos" : "neg"}">${r.chg >= 0 ? "+" : ""}${nf(1).format(r.chg)}%</span>` : "—"}</td>
        <td class="num">${fmtCap(r.mcap)}</td>
        ${cols.map((k) => { const h = r.hist?.[k]; return `<td class="num" ${h ? `title="Promedio últimos ${h.n} años: ${fmt(h.avg, METRICS[k].f, METRICS[k].d)}"` : ""}>${fmt(r[k], METRICS[k].f, METRICS[k].d)}</td>`; }).join("")}
        <td>${ok(r.fairUp) ? `<span class="num ${r.fairUp >= 0 ? "pos" : "neg"}">${r.fairUp >= 0 ? "+" : ""}${nf(0).format(r.fairUp)}%</span>` : '<span class="na">—</span>'}</td>
        <td><span class="score ${scoreCls(r.score)}">${ok(r.score) ? r.score : "—"}</span></td>
        <td><button class="rm" data-rm="${esc(r.s)}" aria-label="Quitar ${esc(r.ced || r.s)}">×</button></td>
      </tr>`).join("")}
  </tbody></table></div><div class="na" style="font-size:12px;margin-top:8px">Tocá una fila para abrir la ficha. Pasá el mouse sobre un valor para ver su promedio histórico.</div>`;
}

function openCols() {
  const m = $("modal");
  m.innerHTML = `<div class="dh"><h2 style="font-size:17px;margin:0">Columnas de la watchlist</h2><button class="x" id="cClose" aria-label="Cerrar">×</button></div>
    <div class="colpick">${Object.entries(METRICS).map(([k, x]) => `<label title="${esc(x.q)}"><input type="checkbox" value="${k}" ${W.cols.includes(k) ? "checked" : ""}>${esc(x.l)}</label>`).join("")}</div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" id="cSave">Aplicar</button><button class="btn" id="cReset">Por defecto</button></div>`;
  m.classList.add("show"); $("overlay").classList.add("show");
}
function closeModal() { $("modal").classList.remove("show"); $("overlay").classList.remove("show"); }

function pdf() {
  const rows = current().filter((r) => !r.out), cols = W.cols.filter((k) => METRICS[k]);
  $("printRoot").innerHTML = `<div class="rp"><h1>Watchlist: ${esc(W.active)}</h1><div class="sub">${today()} · ${rows.length} acciones operables desde Argentina</div>
    <table><thead><tr><th class="l">Acción (BYMA)</th><th class="l">Industria</th><th class="l">Tipo</th><th>Precio</th><th>Mkt cap</th>${cols.map((k) => `<th>${esc(METRICS[k].l)}</th>`).join("")}<th>Tu P. justo</th><th>Score</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="l"><b>${esc(r.ced || r.s)}</b> ${esc((r.n || "").slice(0, 24))}${r.cand ? " ★" : ""}</td><td class="l">${esc(PROFILES[r.profile].l)}</td><td class="l">${LYNCH[r.lynch] || "—"}</td><td>${fmt(r.px)} ${esc(r.cur || "")}</td><td>${fmtCap(r.mcap)}</td>${cols.map((k) => `<td>${fmt(r[k], METRICS[k].f, METRICS[k].d)}</td>`).join("")}<td>${ok(r.fairUp) ? nf(0).format(r.fairUp) + "%" : "—"}</td><td class="sc">${r.score ?? "—"}</td></tr>`).join("")}</tbody></table>
    <h2>Lectura rápida</h2><ul>${rows.map((r) => `<li><b>${esc(r.ced || r.s)}</b>: ${r.why.slice(0, 2).map((w) => esc(w.t)).join("; ") || "sin fortalezas destacadas"}${r.alerts.length ? `. <span class="b">Ojo: ${esc(r.alerts[0].t)}</span>` : ""}</li>`).join("")}</ul>
    <div class="foot">Fuente: Yahoo Finance. Score contra pares de la misma industria y contra su propia historia. Material de análisis propio, no constituye recomendación de inversión.</div></div>`;
  const t = document.title; document.title = `Watchlist ${W.active} ${today().replaceAll("/", "-")}`;
  setTimeout(() => { window.print(); document.title = t; }, 60);
}

function bind() {
  $("tickers").innerHTML = [...UNIVERSE].sort((a, b) => (a[3] === "AR") - (b[3] === "AR")).map((u) => `<option value="${esc(u[5] || u[0])} · ${esc(u[1])}">`).join("");
  const add = async () => {
    const s = resolve($("add").value);
    if (!s) return toast("No es un CEDEAR ni una acción de BYMA");
    if (W.lists[W.active].includes(s)) return toast("Ya está en la lista");
    W.lists[W.active].push(s); $("add").value = ""; await persist();
    await ensureRows([s]); rebuild(); render(); toast(`${META.get(s)?.[5] || s} agregada`);
  };
  $("addBtn").onclick = add; $("add").onkeydown = (e) => { if (e.key === "Enter") add(); };
  $("lists").onclick = async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { e.stopPropagation(); if (!confirm(`¿Borrar la lista "${del.dataset.del}"?`)) return; delete W.lists[del.dataset.del]; W.active = Object.keys(W.lists)[0]; await persist(); return render(); }
    const b = e.target.closest("[data-list]"); if (b) { W.active = b.dataset.list; await persist(); return render(); }
    if (e.target.id === "newList") { const n = prompt("Nombre de la nueva lista:"); if (!n || W.lists[n]) return; W.lists[n] = []; W.active = n; await persist(); render(); }
  };
  $("view").onclick = async (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) { e.stopPropagation(); W.lists[W.active] = W.lists[W.active].filter((s) => s !== rm.dataset.rm); await persist(); return render(); }
    const tr = e.target.closest("tr.row"); if (tr) location.href = "/empresa.html?s=" + encodeURIComponent(tr.dataset.s);
  };
  $("btnCols").onclick = openCols; $("btnPdf").onclick = pdf;
  $("overlay").onclick = closeModal;
  $("modal").onclick = (e) => {
    if (e.target.id === "cClose") return closeModal();
    if (e.target.id === "cReset") { W.cols = DEFAULT_COLS.slice(); saveLocal(COLS_KEY, W.cols); closeModal(); return render(); }
    if (e.target.id === "cSave") { W.cols = [...document.querySelectorAll(".colpick input:checked")].map((i) => i.value); saveLocal(COLS_KEY, W.cols); closeModal(); render(); }
  };
}

(async function init() {
  bind();
  await initSupabase();
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  W.raw = snap.rows; W.updated = snap.updated;
  loadLists();
  if (state.user && !state.ov.get("__watchlists")) await persist();
  const all = Object.values(W.lists).flat();
  await ensureRows(all);
  rebuild(); render();
  $("dot").className = "dot on";
  $("statusTxt").textContent = `${W.updated ? "Datos del " + new Date(W.updated).toLocaleString("es-AR") : "Datos en vivo"} · ${state.user ? "listas sincronizadas con tu cuenta" : "listas guardadas en este navegador"}`;
})();
