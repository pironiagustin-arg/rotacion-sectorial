import { nf, ok } from "/js/score.js";
import { $, esc } from "/js/core.js";

const pct = (v, d = 1) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="na">—</span>');
const fd = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const B = { bt: null, sel: 0 };

function verdict(P) {
  const full = P.filter((p) => !p.partial);
  if (!full.length) return "";
  const wins = full.filter((p) => p.top10.ret > p.spy).length;
  const exc = full.map((p) => p.top10.ret - p.spy), avgExc = exc.reduce((a, b) => a + b, 0) / exc.length;
  const q1q5 = full.filter((p) => p.quint[0].med > p.quint[4].med).length;
  const good = wins >= Math.ceil(full.length * 0.66) && avgExc > 3;
  return `<div class="verdict"><b class="${good ? "pos" : ""}">${good ? "El score suma valor, con matices:" : "Resultado mixto:"}</b> las 10 mejores del score le ganaron al SPY en <b>${wins} de ${full.length}</b> años completos, por ${pct(avgExc)} promedio por año.
    El mejor quintil superó al peor (en mediana) en ${q1q5} de ${full.length} años. ${q1q5 < full.length ? "Que los quintiles no ordenen siempre bien indica que el score acierta más con los extremos (las mejores) que con el ranking completo: usalo para encontrar candidatas, no como ranking fino." : "El ranking ordena bien de punta a punta."}</div>`;
}
function quint() {
  const p = B.bt.periods[B.sel];
  $("ptabs").innerHTML = B.bt.periods.map((x, i) => `<button class="tab ${i === B.sel ? "on" : ""}" data-i="${i}">${x.from.slice(0, 4)}-${x.to.slice(2, 4)}${x.partial ? " (en curso)" : ""}</button>`).join("");
  const vals = [...p.quint.map((q) => q.med), p.spy].filter(ok), mx = Math.max(...vals, 1), mn = Math.min(...vals, 0), span = mx - mn || 1;
  const h = (v) => Math.max(2, (Math.abs(v) / span) * 120);
  $("quint").innerHTML = `<div class="qbars">${p.quint.map((q, i) => `<div class="col"><b class="${q.med >= p.spy ? "pos" : "neg"}">${q.med >= 0 ? "+" : ""}${nf(1).format(q.med)}%</b><i style="height:${h(q.med)}px;background:${q.med >= 0 ? "#22c55e" : "#ef4444"};opacity:${1 - i * 0.12}"></i><span>Q${i + 1}${i === 0 ? " · mejor score" : i === 4 ? " · peor score" : ""}<br>score ~${q.score} · ${q.beat}/${q.n} le ganan al SPY</span></div>`).join("")}<div class="col"><b>${p.spy >= 0 ? "+" : ""}${nf(1).format(p.spy)}%</b><i style="height:${h(p.spy)}px;background:#64748b"></i><span>SPY<br>referencia</span></div></div>
    <div class="na" style="font-size:12.5px;margin-top:10px">Rendimiento mediano de cada grupo de ${fd(p.from)} a ${fd(p.to)}. SPY en el mismo período: ${pct(p.spy)} · promedio de las ${p.n} empresas: ${pct(p.all)} (mediana ${pct(p.allMed)}).</div>`;
}
function periods() {
  $("periods").innerHTML = B.bt.periods.map((p) => `<div class="card"><h3>${fd(p.from)} → ${fd(p.to)}${p.partial ? ' <span class="na" style="font-weight:400">· en curso</span>' : ""}</h3>
    <div class="sub2">${p.n} empresas con balances de ese momento</div>
    <div class="kv" style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span class="na">Top 10 del score</span><b>${pct(p.top10.ret)} <span class="na" style="font-weight:400">(mediana ${pct(p.top10.med)})</span></b></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span class="na">SPY</span><b>${pct(p.spy)}</b></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span class="na">Candidatas (${p.cands.n})</span><b>${pct(p.cands.ret)}</b></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span class="na">Le ganaron al SPY</span><b>${p.top10.beat} de 10</b></div>
    <div class="chips2">${p.top10.picks.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}" title="Score ${x.score} con balance ${x.fy}">${esc(x.ced || x.s)} <span class="${x.ret >= 0 ? "pos" : "neg"}">${x.ret >= 0 ? "+" : ""}${nf(0).format(x.ret)}%</span></a>`).join("")}</div></div>`).join("");
}
async function live() {
  const pk = await fetch("/data/picks.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const days = Object.entries(pk?.days || {}).sort((a, b) => b[0].localeCompare(a[0]));
  if (!days.length) { $("live").innerHTML = `<div class="na">Todavía no hay días registrados.</div>`; return; }
  const syms = [...new Set(days.flatMap(([, d]) => d.picks.map((p) => p.s))), "SPY"];
  const q = {};
  for (let i = 0; i < syms.length; i += 150) { const r = await fetch("/api/overview?s=" + encodeURIComponent(syms.slice(i, i + 150).join(","))).then((r) => (r.ok ? r.json() : null)).catch(() => null); Object.assign(q, r?.q || {}); }
  const spyNow = q.SPY?.px;
  const rows = days.map(([day, d]) => {
    const c = d.picks.filter((p) => p.cand && ok(p.px) && q[p.s]?.px);
    const rets = c.map((p) => (q[p.s].px / p.px - 1) * 100);
    const avg = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null, spy = d.spy && spyNow ? (spyNow / d.spy - 1) * 100 : null;
    return { day, n: c.length, avg, spy, beat: rets.filter((r) => r > (spy ?? 0)).length, best: c.map((p, i) => ({ p, r: rets[i] })).sort((a, b) => b.r - a.r).slice(0, 4) };
  });
  $("live").innerHTML = `<div class="tablewrap"><table><thead><tr><th class="l">Día</th><th>Candidatas</th><th>Rinden desde ese día</th><th>SPY</th><th>Diferencia</th><th>Le ganan al SPY</th><th class="l">Mejores</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="l">${fd(r.day)}</td><td class="num">${r.n}</td><td class="num">${pct(r.avg, 2)}</td><td class="num">${pct(r.spy, 2)}</td><td class="num">${ok(r.avg) && ok(r.spy) ? pct(r.avg - r.spy, 2) : "—"}</td><td class="num">${r.n ? `${r.beat}/${r.n}` : "—"}</td><td class="l">${r.best.map((x) => `${esc(x.p.ced || x.p.s)} ${pct(x.r, 1)}`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>
    <div class="na" style="font-size:12px;margin-top:8px">Precios en moneda de origen. En unas semanas este cuadro va a ser la mejor evidencia de si el score sirve.</div>`;
}
$("ptabs").onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; B.sel = Number(b.dataset.i); quint(); };
(async () => {
  $("dot").className = "dot load";
  B.bt = await fetch("/data/backtest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!B.bt?.periods?.length) { $("statusTxt").textContent = "El backtest todavía no se generó (corre los domingos)."; return; }
  B.sel = B.bt.periods.findLastIndex((p) => !p.partial); if (B.sel < 0) B.sel = 0;
  $("verdict").innerHTML = verdict(B.bt.periods); quint(); periods();
  $("dot").className = "dot on";
  $("statusTxt").textContent = `Recalculado el ${new Date(B.bt.generated).toLocaleDateString("es-AR")} · se actualiza todos los domingos`;
  $("caveat").innerHTML = `<b>Cómo leerlo:</b> el score histórico usa solo los balances anuales (P/E, márgenes, ROIC, deuda, crecimiento pasado, etc.) que ya estaban publicados en cada fecha; no incluye estimaciones de analistas ni precio objetivo, que no tienen historia gratuita. Se usan las empresas del universo actual (las que quebraron o salieron de BYMA no están, lo que mejora un poco los resultados) y el rendimiento es en moneda de origen, con dividendos. Rendimientos pasados no garantizan los futuros.`;
  live();
})();

// ---------- Señales RRG ----------
async function rrgView() {
  const el = $("vRrg");
  const d = await fetch("/data/rrg_backtest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!d) { el.innerHTML = `<div class="empty">El backtest de señales todavía no se generó.</div>`; return; }
  const a = d.all, best = d.rules[0], v0 = d.variants.find((v) => v.id === "actual");
  const pp = (v, dd = 1) => pct(v, dd);
  el.innerHTML = `<div class="top"><div><h1>¿Funcionan las señales del RRG?</h1><div class="status"><span class="dot on"></span><span>${fd(d.from)} a ${fd(d.to)} · 11 sectores SPDR y 16 ETFs de industria · recalculado ${new Date(d.generated).toLocaleDateString("es-AR")}</span></div></div></div>
    <div class="verdict"><b>Conclusión:</b> la señal <b>"Por explotar" sola no le gana al S&P 500</b>: el sector cruza a Leading en el ${Math.round((a.crossed / a.n) * 100)}% de los casos (en ~${a.daysToCross} ruedas), pero después rinde ${pp(a.rel[60])} contra el SPY a 60 ruedas, con ${a.hit[60]}% de aciertos. El RRG diario se da vuelta rápido (dura ~${a.daysHeld} ruedas en Leading).
      Lo que sí funcionó: <b>${esc(best.label.toLowerCase())}</b> cuando el sector da la señal: ${pp(best.sig.f60)} contra el propio sector en 60 ruedas, ${best.sig.hit60}% de aciertos (en fechas sin señal la misma regla da ${pp(best.ctl.f60)} y ${best.ctl.hit60}%).</div>
    <div class="big3">
      <div><div class="v">${a.n}</div><div class="l">Señales "Por explotar" desde ${d.from.slice(0, 4)}</div></div>
      <div><div class="v">${Math.round((a.crossed / a.n) * 100)}%</div><div class="l">Llegaron a Leading ("explotó") · mediana ${a.daysToCross} ruedas</div></div>
      <div><div class="v">${pp(d.crossed.rel[60])}</div><div class="l">Sector vs SPY a 60 ruedas cuando sí explotó</div></div>
      <div><div class="v">${pp(d.notCrossed.rel[60])}</div><div class="l">Sector vs SPY cuando no llegó a explotar</div></div>
    </div>
    <div class="card"><h3>Estrategia sugerida</h3><div class="sub2" style="font-size:13.5px;color:var(--text)">
      1. Cuando un sector o industria aparece como <b>Por explotar</b> en el RRG, no compres el ETF: mirá sus acciones.<br>
      2. Elegí las <b>3 con más fuerza relativa contra el sector en los últimos 6 meses</b> (el RRG ya te las muestra en cada señal).<br>
      3. Mantené unas <b>60 ruedas (3 meses)</b>. En el backtest: ${pp(best.sig.f60)} contra el sector, ${pp((best.sig.f60 ?? 0) + (a.rel[60] ?? 0))} contra el SPY, ${best.sig.hit60}% de las veces le ganaron al sector.<br>
      4. Sumá el filtro del score: evitá las de score débil y las que el management dio un guidance a la baja.</div></div>
    <div class="card" style="margin-top:12px"><h3>¿Qué acciones del sector rinden más después de la señal?</h3><div class="sub2">Rendimiento promedio de las 3 elegidas por cada regla, contra el ETF del sector. "Sin señal" = la misma regla en cualquier fecha (control).</div>
      <div class="tablewrap"><table class="rt"><thead><tr><th class="l">Regla</th><th>40 ruedas</th><th>60 ruedas</th><th>Aciertos 60r</th><th>Sin señal 60r</th><th>Aciertos sin señal</th></tr></thead><tbody>
      ${d.rules.map((r, i) => `<tr${i === 0 ? ' style="background:var(--panel2)"' : ""}><td class="l">${i === 0 ? "★ " : ""}${esc(r.label)}</td><td class="num">${pp(r.sig.f40)}</td><td class="num">${pp(r.sig.f60)}</td><td class="num">${r.sig.hit60}%</td><td class="num">${pp(r.ctl.f60)}</td><td class="num">${r.ctl.hit60}%</td></tr>`).join("")}
      </tbody></table></div><div class="na" style="font-size:12px;margin-top:6px">Promedio de todas las acciones del sector tras la señal: ${pp(d.allMembers.f60)} a 60 ruedas (mediana ${pp(d.allMembers.med40)} a 40): elegir bien adentro del sector importa más que la señal.</div></div>
    <div class="card" style="margin-top:12px"><h3>Variantes de la señal que probé</h3><div class="sub2">Rendimiento del ETF del sector contra el SPY después de cada tipo de señal.</div>
      <div class="tablewrap"><table class="rt"><thead><tr><th class="l">Señal</th><th>Casos</th><th>20 ruedas</th><th>40 ruedas</th><th>60 ruedas</th><th>Aciertos 40r</th></tr></thead><tbody>
      ${d.variants.map((v) => `<tr><td class="l">${esc(v.label)}</td><td class="num">${v.n}</td><td class="num">${pp(v.rel[20])}</td><td class="num">${pp(v.rel[40])}</td><td class="num">${pp(v.rel[60])}</td><td class="num">${v.hit[40] ?? "—"}%</td></tr>`).join("")}
      <tr><td class="l">Rotación por momentum: los 3 sectores con más fuerza a 3 meses, cambio mensual</td><td class="num">${d.momentum.m3.n}</td><td class="num">${pp(d.momentum.m3.rel21)} <span class="na">(1 mes)</span></td><td colspan="2" class="num na">${pp(d.momentum.m3.annual)} por año</td><td class="num">${d.momentum.m3.hit}%</td></tr>
      </tbody></table></div></div>
    <div class="card" style="margin-top:12px"><h3>Últimas señales y qué pasó</h3><div class="tablewrap"><table class="rt"><thead><tr><th class="l">Fecha</th><th class="l">Sector</th><th>¿Explotó?</th><th>Sector vs SPY 60r</th><th class="l">3 líderes a 6 meses → resultado 60r vs sector</th></tr></thead><tbody>
      ${d.events.slice(0, 25).map((e) => `<tr><td class="l">${fd(e.date)}</td><td class="l"><b>${esc(e.sym)}</b> <span class="na">${esc(e.name)}</span></td><td class="num">${e.cross != null ? `Sí, en ${e.cross} r.` : '<span class="neg">No</span>'}</td><td class="num">${pp(e.rel[60])}</td><td class="l">${(e.top || []).map((t) => `${esc(t.s)} ${pp(t.f60, 0)}`).join(" · ") || "—"}</td></tr>`).join("")}
      </tbody></table></div></div>
    <div class="caveat">Simulación día a día con la misma fórmula que usa la app (sin mirar el futuro). Rendimientos sin costos ni impuestos, en dólares. Las acciones son las del universo actual (sesgo de supervivencia a favor). Rendimientos pasados no garantizan los futuros.</div>`;
}
$("btTabs").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; document.querySelectorAll("#btTabs .tab").forEach((x) => x.classList.toggle("on", x === b)); $("vScore").style.display = b.dataset.v === "score" ? "" : "none"; $("vRrg").style.display = b.dataset.v === "rrg" ? "" : "none"; if (b.dataset.v === "rrg" && !$("vRrg").innerHTML) rrgView(); };
if (location.hash === "#rrg") $("btTabs").querySelector('[data-v="rrg"]').click();
