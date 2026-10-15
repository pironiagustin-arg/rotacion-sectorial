import { UNIVERSE } from "/lib/universe.js";
import "/js/live.js";
import { nf, ok } from "/js/score.js";
import { $, esc, state, initSupabase, loadOverrides } from "/js/core.js";
import { fetchArs, devTxt } from "/js/ars.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";

const byCed = new Map(UNIVERSE.filter((u) => u[5]).map((u) => [u[5], u]));
const C = { d: null, f: "uni", sort: "v", dir: -1, q: "", liq: true, mine: new Set() };
const pct = (v, d = 1) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="na">—</span>');
const money = (v, d = 0) => (ok(v) ? "$ " + nf(d).format(v) : "—");
const big = (v) => (!ok(v) ? "—" : v >= 1e9 ? "$ " + nf(1).format(v / 1e9) + " MM" : v >= 1e6 ? "$ " + nf(0).format(v / 1e6) + " M" : "$ " + nf(0).format(v));

function kpis() {
  const d = C.d, dl = d.dolar || {};
  const card = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="s">${s || ""}</div></div>`;
  const all = Object.entries(d.implied).filter(([, x]) => x.volArs > 3e8).map(([k, x]) => ({ k, dev: (x.ccl / d.medCcl - 1) * 100 }));
  const cheap = [...all].sort((a, b) => a.dev - b.dev).slice(0, 3).map((x) => x.k).join(", ");
  $("kpis").innerHTML = card("CCL implícito (mediana CEDEARs)", money(d.medCcl, 2), "Promedio del mercado con volumen") +
    card("Dólar MEP", money(dl.bolsa?.venta, 2), "dolarapi.com") + card("Contado con liqui", money(dl.contadoconliqui?.venta, 2), "dolarapi.com") +
    card("Oficial", money(dl.oficial?.venta, 2), ok(dl.oficial?.venta) && ok(d.medCcl) ? `Brecha con CCL ${nf(1).format((d.medCcl / dl.oficial.venta - 1) * 100)}%` : "") +
    card("Más baratos ahora", esc(cheap) || "—", "CEDEARs líquidos con CCL más bajo");
}
function rows() {
  const d = C.d, out = [];
  for (const [ced, x] of Object.entries(d.cedears)) {
    if (x.local) continue;
    const u = byCed.get(ced);
    if (C.f === "uni" && !u) continue;
    if (C.f === "wl" && !(u && C.mine.has(u[0])) && !C.mine.has(ced)) continue;
    const vol = (x.ars || 0) * (x.v || 0);
    if (C.liq && vol < 5e7) continue;
    const imp = d.implied[ced]?.ccl ?? null;
    const dev = imp && d.medCcl ? (imp / d.medCcl - 1) * 100 : null;
    const name = u ? u[1] : "";
    if (C.q && !(ced + " " + name + " " + (u?.[0] || "")).toLowerCase().includes(C.q)) continue;
    out.push({ ced, sym: u?.[0], name, ars: x.ars, chg: x.chg, usd: x.usd, ccl: imp, dev, vol });
  }
  const k = C.sort;
  return out.sort((a, b) => ((a[k] ?? (C.dir > 0 ? Infinity : -Infinity)) > (b[k] ?? (C.dir > 0 ? Infinity : -Infinity)) ? 1 : -1) * C.dir);
}
function render() {
  if (!C.d) return;
  kpis();
  const list = rows();
  const th = (k, l, cls = "") => `<th class="${cls}" data-k="${k}" style="cursor:pointer">${l}${C.sort === k ? (C.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  $("view").innerHTML = list.length ? `<div class="tablewrap"><table><thead><tr>${th("ced", "CEDEAR", "l")}${th("name", "Empresa", "l")}${th("ars", "Precio $")}${th("chg", "Hoy")}${th("usd", "Precio US$ (MEP)")}${th("ccl", "CCL implícito")}${th("dev", "vs mediana")}${th("vol", "Volumen hoy")}</tr></thead><tbody>
    ${list.slice(0, 400).map((r) => `<tr><td class="l"><b>${r.sym ? `<a href="/empresa.html?s=${encodeURIComponent(r.sym)}">${esc(r.ced)}</a>` : esc(r.ced)}</b></td><td class="l na">${esc(r.name.slice(0, 34))}</td>
      <td class="num">${money(r.ars, r.ars < 100 ? 2 : 0)}</td><td class="num">${pct(r.chg)}</td><td class="num">${ok(r.usd) ? "US$ " + nf(2).format(r.usd) : "—"}</td>
      <td class="num">${money(r.ccl, 2)}</td>
      <td class="num">${ok(r.dev) ? `<span class="devbar" style="width:${Math.min(60, Math.abs(r.dev) * 12)}px;background:${r.dev < 0 ? "#22c55e" : "#ef4444"}"></span><span class="${r.dev < -0.5 ? "pos" : r.dev > 0.5 ? "neg" : "na"}">${r.dev >= 0 ? "+" : ""}${nf(2).format(r.dev)}% · ${devTxt(r.dev)}</span>` : '<span class="na">—</span>'}</td>
      <td class="num">${big(r.vol)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No hay CEDEARs con ese filtro.</div>`;
}
async function load() {
  $("dot").className = "dot load";
  const d = await fetchArs(0);
  if (!d) { $("statusTxt").textContent = "BYMA no respondió. Probá de nuevo en un rato."; $("dot").className = "dot"; return; }
  C.d = d; render();
  $("dot").className = "dot on";
  $("statusTxt").innerHTML = `<span class="livedot"></span>BYMA vía data912 · ${new Date(d.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · se actualiza cada 30 s`;
}
$("q").oninput = (e) => { C.q = e.target.value.trim().toLowerCase(); render(); };
$("liq").onchange = (e) => { C.liq = e.target.checked; render(); };
$("tabs").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; C.f = b.dataset.f; document.querySelectorAll("#tabs .tab").forEach((x) => x.classList.toggle("on", x === b)); render(); };
$("view").onclick = (e) => { const t = e.target.closest("th[data-k]"); if (!t) return; const k = t.dataset.k; C.dir = C.sort === k ? -C.dir : (k === "dev" ? 1 : -1); C.sort = k; render(); };
$("btnReload").onclick = load;
(async () => {
  load();
  await initSupabase(); await loadOverrides();
  C.mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  setInterval(() => { if (!document.hidden) load(); }, 30000);
})();
