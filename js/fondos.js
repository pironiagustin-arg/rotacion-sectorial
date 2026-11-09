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

// Resumen entre los 10 fondos: compras y ventas en consenso, más repetidas y posiciones nuevas
const SHORT = { "Berkshire Hathaway": "Buffett", "Pershing Square": "Ackman", "Duquesne Family Office": "Druckenmiller", "Appaloosa": "Tepper", "Altimeter Capital": "Gerstner", "Baillie Gifford": "Baillie Gifford", "Citadel Advisors": "Griffin", "ARK Invest": "ARK", "Baupost": "Klarman", "Coatue": "Coatue" };
const sh = (f) => SHORT[f] || f;
const pill = (cls, txt, title = "") => `<span class="fp ${cls}" title="${esc(title)}">${esc(txt)}</span>`;
function consensus() {
  const S = F.d.summary, N = F.d.managers.length;
  if (!S) { $("buys").innerHTML = $("sells").innerHTML = '<div class="na">Se genera en la próxima actualización.</div>'; return; }
  const row = (g, who, right) => `<tr><td class="l">${chip(g)}</td><td class="l na" style="font-size:12px">${esc((BY_SYM.get(g.s)?.[1] || g.name || "").slice(0, 26))}</td><td class="l">${who}</td><td class="num">${right}</td></tr>`;
  const tbl = (list, f) => { const l = list.filter(keep).slice(0, 12); return l.length ? `<table class="cons"><tbody>${l.map(f).join("")}</tbody></table>` : '<div class="na">Sin coincidencias.</div>'; };
  $("buys").innerHTML = tbl(S.buys, (g) => row(g, [...g.news.map((x) => pill("new", sh(x.f), `Nueva: ${nf(1).format(x.pct || 0)}% de la cartera`)), ...g.adds.map((x) => pill("add", `${sh(x.f)} +${nf(0).format(x.chg || 0)}%`, `Aumentó ${nf(0).format(x.chg || 0)}% · ${nf(1).format(x.pct || 0)}% de la cartera`))].join(""), `<b class="pos">${g.news.length + g.adds.length}</b>`));
  $("sells").innerHTML = tbl(S.sells, (g) => row(g, [...g.sold.map((x) => pill("sold", sh(x.f), "Vendió todo")), ...g.trims.map((x) => pill("trim", `${sh(x.f)} ${nf(0).format(x.chg || 0)}%`, `Redujo · queda ${nf(1).format(x.pct || 0)}% de la cartera`))].join(""), `<b class="neg">${g.sold.length + g.trims.length}</b>`));
  $("common").innerHTML = tbl(S.common, (g) => row(g, g.hold.sort((a, b) => (b.pct || 0) - (a.pct || 0)).map((x) => pill(x.st === "new" || x.st === "add" ? "add" : x.st === "trim" ? "trim" : "hold", `${sh(x.f)} ${nf(1).format(x.pct || 0)}%`, x.st === "new" ? "Posición nueva" : x.st === "add" ? `Aumentó ${nf(0).format(x.chg || 0)}%` : x.st === "trim" ? `Redujo ${nf(0).format(x.chg || 0)}%` : "Mantuvo")).join(""), `<b>${g.hold.length}</b><span class="na">/${N}</span>`));
  $("news").innerHTML = tbl(S.news, (g) => row(g, g.news.map((x) => pill("new", `${sh(x.f)} ${nf(1).format(x.pct || 0)}%`, "Peso en su cartera")).join(""), `<b class="pos">${g.news.length}</b>`));
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
