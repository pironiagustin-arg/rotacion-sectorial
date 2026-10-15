import { UNIVERSE } from "/lib/universe.js";
import { nf, ok } from "/js/score.js";
import { $, esc } from "/js/core.js";

const BY_SYM = new Map(UNIVERSE.map((u) => [u[0], u]));
const F = { d: null, only: true };
const big = (v) => (!ok(v) ? "—" : v >= 1e9 ? "US$ " + nf(1).format(v / 1e9) + " MM" : "US$ " + nf(0).format(v / 1e6) + " M");
const fp = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" });
const hasCed = (x) => x.s && BY_SYM.get(x.s)?.[5];
const label = (x) => (x.s ? BY_SYM.get(x.s)?.[5] || x.s : x.t || x.name?.slice(0, 14));
const chip = (x, extra = "") => {
  const ced = hasCed(x), l = esc(label(x));
  return ced ? `<a class="tk ced" href="/empresa.html?s=${encodeURIComponent(x.s)}" title="${esc(x.name)}">${l}${extra}</a>` : `<span class="tk off" title="${esc(x.name)}">${l}${extra}</span>`;
};
const keep = (x) => !F.only || hasCed(x);

function consensus() {
  const agg = new Map();
  for (const m of F.d.managers) {
    for (const [arr, w] of [[m.news, 2], [m.adds, 1], [m.trims, -1], [m.sold, -2]]) for (const x of arr) {
      const k = x.s || x.t || x.name; if (!k) continue;
      const g = agg.get(k) || { x, buy: [], sell: [], score: 0 };
      (w > 0 ? g.buy : g.sell).push(`${m.name}${w === 2 ? " (nueva)" : w === -2 ? " (vendió todo)" : ""}`); g.score += w; agg.set(k, g);
    }
  }
  const list = [...agg.values()].filter((g) => keep(g.x));
  const tbl = (arr, side) => arr.length ? `<table class="cons"><tbody>${arr.map((g) => `<tr><td class="l">${chip(g.x)}</td><td class="l na">${esc((BY_SYM.get(g.x.s)?.[1] || g.x.name || "").slice(0, 28))}</td><td class="l" style="font-size:12px">${esc(g[side].join(", "))}</td></tr>`).join("")}</tbody></table>` : `<div class="na">Sin coincidencias.</div>`;
  $("buys").innerHTML = tbl(list.filter((g) => g.buy.length >= 2).sort((a, b) => b.buy.length - a.buy.length || b.score - a.score).slice(0, 12), "buy");
  $("sells").innerHTML = tbl(list.filter((g) => g.sell.length >= 2).sort((a, b) => b.sell.length - a.sell.length || a.score - b.score).slice(0, 12), "sell");
}
function funds() {
  $("funds").innerHTML = F.d.managers.map((m) => {
    const top = m.top.filter(keep).slice(0, 10), mx = Math.max(...top.map((x) => x.pct || 0), 1);
    const mv = (arr, f) => arr.filter(keep).slice(0, 8).map((x) => chip(x, f(x))).join("") || '<span class="na" style="font-size:12px">—</span>';
    return `<div class="card"><h3>${esc(m.name)} <span class="na" style="font-weight:400;font-size:12px">${fp(m.period)} · ${big(m.total)}</span></h3><div class="who">${esc(m.who)} · ${m.n} posiciones</div>
      ${top.map((x) => `<div class="hold"><span>${chip(x)}</span><div class="b"><i style="width:${((x.pct || 0) / mx) * 100}%"></i></div><span class="num">${nf(1).format(x.pct || 0)}%</span><span class="num ${x.status === "new" ? "pos" : ok(x.chg) ? (x.chg > 5 ? "pos" : x.chg < -5 ? "neg" : "na") : "na"}">${x.status === "new" ? "nueva" : ok(x.chg) ? (x.chg >= 0 ? "+" : "") + nf(0).format(x.chg) + "%" : ""}</span></div>`).join("") || '<div class="na">Sin posiciones con CEDEAR.</div>'}
      <div class="moves"><div><h4>Nuevas</h4>${mv(m.news, () => "")}</div><div><h4>Aumentó</h4>${mv(m.adds, (x) => ` +${nf(0).format(x.chg)}%`)}</div><div><h4>Redujo</h4>${mv(m.trims, (x) => ` ${nf(0).format(x.chg)}%`)}</div><div><h4>Vendió todo</h4>${mv(m.sold, () => "")}</div></div></div>`;
  }).join("");
}
function render() { consensus(); funds(); }
$("onlyCed").onchange = (e) => { F.only = e.target.checked; render(); };
(async () => {
  $("dot").className = "dot load";
  F.d = await fetch("/data/funds.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!F.d?.managers?.length) { $("statusTxt").textContent = "Los datos de 13F todavía no se generaron (se actualizan los domingos)."; return; }
  render();
  $("dot").className = "dot on";
  $("statusTxt").textContent = `${F.d.managers.length} fondos · actualizado el ${new Date(F.d.generated).toLocaleDateString("es-AR")} desde la SEC`;
})();
