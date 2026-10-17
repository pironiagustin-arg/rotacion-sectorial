// Seguimiento en vivo de las alertas "Por explotar": cómo reaccionaron el sector y sus 3 líderes contra el S&P 500.
// Separado en alertas abiertas (menos de 60 ruedas) y cerradas, con un resumen honesto arriba.
const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pc = (v, d = 1) => (v == null ? '<span class="rl-dim">—</span>' : `<span class="${v >= 0 ? "rl-up" : "rl-dn"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>`);
const fd = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
const QN = { leading: "Leading", improving: "Improving", weakening: "Weakening", lagging: "Lagging" };
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const last = (a) => (a ? [...a].reverse().find((x) => x != null) ?? null : null);
const HOLD = 60;

function spark(a, b) {
  const all = [...(a || []), ...(b || [])].filter((x) => x != null); if (all.length < 2) return "";
  const mn = Math.min(0, ...all), mx = Math.max(0, ...all), W = 120, H = 32, n = HOLD + 1;
  const X = (i) => (i / (n - 1)) * W, Y = (v) => H - 2 - ((v - mn) / (mx - mn || 1)) * (H - 4);
  const line = (arr, c, dash) => arr ? `<polyline points="${arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(" ")}" fill="none" stroke="${c}" stroke-width="1.6" ${dash ? 'stroke-dasharray="3 2"' : ""}/>` : "";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="0" y="0" width="${W}" height="${H}" fill="none"/><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#334155" stroke-dasharray="2 2"/>${line(a, "#60a5fa")}${line(b, "#4ade80", true)}</svg>`;
}

function bigChart(s) {
  const series = [["Sector " + s.sym, s.etf, "#60a5fa", 2.4, ""], ["Promedio 3 líderes", s.lead, "#4ade80", 2.4, "5 3"], ...Object.entries(s.lpaths || {}).map(([k, p], i) => [k, p, ["#f59e0b", "#a78bfa", "#f472b6"][i % 3], 1.2, ""])].filter(([, a]) => a?.some((x) => x != null));
  const all = series.flatMap(([, a]) => a).filter((x) => x != null); if (all.length < 2) return '<div class="rl-dim">Todavía no hay recorrido.</div>';
  const mn = Math.min(0, ...all), mx = Math.max(0, ...all), W = 720, H = 220, L = 44, B = 22, n = HOLD + 1;
  const X = (i) => L + (i / (n - 1)) * (W - L - 10), Y = (v) => 8 + (1 - (v - mn) / (mx - mn || 1)) * (H - B - 8);
  const ticks = [mn, (mn + mx) / 2, mx, 0].filter((v, i, a) => a.indexOf(v) === i);
  return `<div class="rl-big"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Evolución de ${esc(s.sym)} contra el S&P 500">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? "#64748b" : "#1e2a44"}" ${v === 0 ? 'stroke-dasharray="4 3"' : ""}/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="#64748b">${v >= 0 ? "+" : ""}${nf(0).format(v)}%</text>`).join("")}
    ${[0, 20, 40, 60].map((d) => `<text x="${X(d)}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#64748b">${d === 0 ? "alerta" : "+" + d + " r."}</text>`).join("")}
    ${series.map(([, a, c, w, dash]) => `<polyline points="${a.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`).join("")}
  </svg><div class="rl-leg">${series.map(([k, a, c, w, dash]) => `<span><i style="background:${c};${dash ? "opacity:.8" : ""}"></i>${esc(k)} ${pc(last(a))}</span>`).join("")}</div>
  <div class="rl-dim" style="font-size:11.5px">Rendimiento contra el S&P 500 desde el cierre del ${fd(s.date)}. ${s.ema === false ? "Esta alerta se dio con el precio debajo de la EMA 20 o 200 (hoy no contaría como alerta)." : ""}</div></div>`;
}
function row(s) {
  const now = last(s.etf), lead = last(s.lead), open = s.days < HOLD;
  const best = s.etf ? Math.max(...s.etf.filter((x) => x != null)) : null, worst = s.etf ? Math.min(...s.etf.filter((x) => x != null)) : null;
  const ref = lead ?? now;
  const st = s.days === 0 ? ["Recién", "rl-new"] : open ? (ref >= 0 ? ["Va ganando", "rl-win"] : ["Va perdiendo", "rl-lose"]) : (ref >= 0 ? ["Ganó", "rl-win"] : ["Perdió", "rl-lose"]);
  return `<tr class="rl-row" data-k="${esc(s.sym + s.date)}" title="Tocá para ver la evolución">
    <td class="l"><div class="rl-sym"><span class="rl-car">▸</span><b>${esc(s.sym)}</b><span>${esc(s.name || "")}</span></div><div class="rl-dt">${fd(s.date)}${s.sym.startsWith("XL") ? "" : ' · <span title="Industria con señal muy clara">industria</span>'}${s.ema === false ? ' · <span style="color:#fca5a5" title="Se dio con el precio debajo de la EMA 20 o 200">bajo EMA</span>' : ""}</div></td>
    <td><div class="rl-prog"><i style="width:${Math.min(100, (s.days / HOLD) * 100)}%"></i></div><div class="rl-dt">${s.days} de ${HOLD} ruedas</div></td>
    <td>${pc(now)}<div class="rl-dt">máx ${pc(best, 0)} · mín ${pc(worst, 0)}</div></td>
    <td>${s.leaders.length ? `${pc(lead)}<div class="rl-dt">${s.leaders.map((l) => `<a href="/empresa.html?s=${encodeURIComponent(l)}">${esc(l)}</a> ${pc(s.each?.[l], 0)}`).join(" · ")}</div>` : '<span class="rl-dim">sin acciones en el universo</span>'}</td>
    <td>${spark(s.etf, s.lead)}</td>
    <td class="l"><span class="rl-st ${st[1]}">${st[0]}</span>${s.now?.quadrant ? `<div class="rl-dt">hoy en ${QN[s.now.quadrant]}</div>` : ""}</td></tr>
    <tr class="rl-det" data-d="${esc(s.sym + s.date)}" hidden><td colspan="6">${bigChart(s)}</td></tr>`;
}
const table = (list) => `<div class="rl-wrap"><table class="rl"><thead><tr><th class="l">Alerta</th><th>Avance</th><th>Sector vs S&P 500</th><th>3 líderes vs S&P 500</th><th>Recorrido</th><th class="l">Estado</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>`;

export async function renderRrgLive(el, { compact = false } = {}) {
  const d = await fetch("/data/rrg_live.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!d?.signals?.length) { el.innerHTML = `<div class="rl-dim" style="font-size:13px">Todavía no hay alertas registradas.</div>`; return; }
  const S = d.signals, open = S.filter((s) => s.days < HOLD), closed = S.filter((s) => s.days >= HOLD);
  const ref = (s) => last(s.lead) ?? last(s.etf);
  const wonC = closed.filter((s) => last(s.etf) > 0).length, wonCL = closed.filter((s) => (last(s.lead) ?? -1) > 0).length, nCL = closed.filter((s) => s.lead).length;
  const openUp = open.filter((s) => s.days > 0 && ref(s) >= 0).length, openN = open.filter((s) => s.days > 0).length;
  const card = (t, v, sub) => `<div><div class="rl-k">${t}</div><div class="rl-v">${v}</div><div class="rl-s">${sub}</div></div>`;
  const summary = `<div class="rl-sum">
    ${card("Alertas abiertas", `${open.length}`, openN ? `${openUp} de ${openN} van ganándole al S&P 500` : "recién emitidas")}
    ${card("Abiertas: sector hoy", pc(avg(open.filter((s) => s.days > 0).map((s) => last(s.etf)))), `líderes ${pc(avg(open.filter((s) => s.days > 0).map((s) => last(s.lead))))} · promedio vs S&P 500`)}
    ${closed.length ? card(`Cerradas (${closed.length}): sector a 60 ruedas`, pc(avg(closed.map((s) => last(s.etf)))), `${wonC} de ${closed.length} le ganaron al S&P 500`) : ""}
    ${closed.length ? card("Cerradas: 3 líderes a 60 ruedas", pc(avg(closed.map((s) => last(s.lead)))), nCL ? `${wonCL} de ${nCL} le ganaron al S&P 500` : "") : ""}
  </div>`;
  const foot = `<div class="rl-foot">Contra el S&P 500, desde el cierre del día de la alerta. Línea azul: sector; verde punteada: promedio de sus 3 líderes a 6 meses. Se considera cerrada a las ${HOLD} ruedas (3 meses). Solo alertas de sectores XL y de industrias con señal muy clara. Se actualiza cada día hábil después del cierre${d.updated ? ` (última: ${new Date(d.updated).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.</div>`;
  const bind = () => el.querySelectorAll("tr.rl-row").forEach((tr) => (tr.onclick = (e) => { if (e.target.closest("a")) return; const d = el.querySelector(`tr[data-d="${CSS.escape(tr.dataset.k)}"]`); d.hidden = !d.hidden; tr.classList.toggle("open", !d.hidden); }));
  if (compact) { el.innerHTML = summary + (open.length ? table(open) : `<div class="rl-dim" style="font-size:13px">No hay alertas abiertas.</div>`) + foot; bind(); return; }
  el.innerHTML = summary + `<h4 class="rl-h">Abiertas</h4>` + (open.length ? table(open) : `<div class="rl-dim">No hay alertas abiertas.</div>`) + (closed.length ? `<h4 class="rl-h">Cerradas (60 ruedas cumplidas)</h4>` + table(closed) : "") + foot;
  bind();
}
export const RL_CSS = `
.rl-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px}
.rl-sum>div{background:#16213a;border:1px solid #1e2a44;border-radius:10px;padding:10px 12px;font-family:Inter,sans-serif}
.rl-k{font-size:11.5px;color:#94a3b8}.rl-v{font-size:20px;font-weight:600;margin-top:2px;color:#e2e8f0}.rl-s{font-size:11.5px;color:#64748b;margin-top:2px}
.rl-up{color:#4ade80}.rl-dn{color:#f87171}.rl-dim{color:#64748b}
.rl-h{font-size:13px;font-weight:600;color:#cbd5e1;margin:14px 0 6px;font-family:Inter,sans-serif}
.rl-wrap{overflow-x:auto;border:1px solid #1e2a44;border-radius:12px}
table.rl{width:100%;border-collapse:collapse;font-size:13px;font-family:Inter,sans-serif;color:#e2e8f0}
table.rl th{font-weight:500;color:#94a3b8;font-size:11.5px;padding:9px 10px;text-align:right;border-bottom:1px solid #1e2a44;white-space:nowrap}
table.rl td{padding:9px 10px;text-align:right;border-bottom:1px solid #16213a;vertical-align:middle;font-variant-numeric:tabular-nums}
table.rl tr:last-child td{border-bottom:none}
table.rl .l{text-align:left}
.rl-sym{display:flex;gap:6px;align-items:baseline}.rl-sym span{color:#94a3b8;font-size:12px}
.rl-dt{font-size:11.5px;color:#64748b;margin-top:2px;white-space:nowrap}
.rl a{color:#cbd5e1;text-decoration:none;font-weight:600}.rl a:hover{color:#93c5fd}
.rl-prog{width:90px;height:5px;background:#1e2a44;border-radius:3px;overflow:hidden;margin-left:auto}.rl-prog i{display:block;height:100%;background:#3b82f6}
.rl-st{font-size:11.5px;border-radius:99px;padding:2px 9px;font-weight:600;white-space:nowrap}
.rl-win{background:#14532d;color:#86efac}.rl-lose{background:#7f1d1d;color:#fca5a5}.rl-new{background:#172554;color:#93c5fd}
tr.rl-row{cursor:pointer}tr.rl-row:hover td{background:#16213a}.rl-car{color:#64748b;display:inline-block;transition:transform .15s}tr.rl-row.open .rl-car{transform:rotate(90deg)}
tr.rl-det td{background:#0f1830;text-align:left}.rl-big{padding:6px 4px}.rl-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:#cbd5e1;margin:4px 0}.rl-leg i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.rl-foot{font-size:11.5px;color:#64748b;margin-top:8px;line-height:1.5}`;
