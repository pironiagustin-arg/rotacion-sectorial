// Seguimiento en vivo de las alertas "Por explotar": cómo reaccionaron el sector y sus 3 líderes contra el S&P 500
const nf = (d) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pc = (v, d = 1) => (v == null ? '<span style="color:#64748b">—</span>' : `<span style="color:${v >= 0 ? "#4ade80" : "#f87171"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>`);
const fd = (s) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
const QN = { leading: "Leading", improving: "Improving", weakening: "Weakening", lagging: "Lagging" };
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

function spark(a, b) {
  const all = [...(a || []), ...(b || [])].filter((x) => x != null); if (all.length < 2) return "";
  const mn = Math.min(0, ...all), mx = Math.max(0, ...all), W = 110, H = 30, n = Math.max(a?.length || 0, b?.length || 0, 2);
  const X = (i) => (i / (Math.max(n - 1, 1))) * W, Y = (v) => H - 2 - ((v - mn) / (mx - mn || 1)) * (H - 4);
  const line = (arr, c, dash) => arr ? `<polyline points="${arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(" ")}" fill="none" stroke="${c}" stroke-width="1.5" ${dash ? 'stroke-dasharray="3 2"' : ""}/>` : "";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#334155" stroke-dasharray="2 2"/>${line(a, "#60a5fa")}${line(b, "#4ade80", true)}</svg>`;
}

export async function renderRrgLive(el, { compact = false } = {}) {
  const d = await fetch("/data/rrg_live.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!d?.signals?.length) { el.innerHTML = `<div style="color:#94a3b8;font-size:13px">Todavía no hay alertas registradas.</div>`; return; }
  const S = d.signals;
  const closed = S.filter((s) => s.days >= 20);
  const at = (arr, k) => arr.map((s) => s.etf?.[k]).filter((x) => x != null);
  const atL = (arr, k) => arr.map((s) => s.lead?.[k]).filter((x) => x != null);
  const hit = (v) => (v.length ? Math.round((v.filter((x) => x > 0).length / v.length) * 100) : null);
  const H = [1, 5, 10, 20, 60];
  const sum = H.map((k) => ({ k, s: avg(at(S, k)), sh: hit(at(S, k)), n: at(S, k).length, l: avg(atL(S, k)), lh: hit(atL(S, k)) }));
  const rows = (compact ? S.slice(0, 6) : S);
  el.innerHTML = `
    <div class="rl-sum">${sum.map((x) => `<div><div class="rl-k">${x.k === 1 ? "Al día siguiente" : `A ${x.k} ruedas`} <span>(${x.n})</span></div><div class="rl-v">${pc(x.s)}</div><div class="rl-s">sector vs SPY · ${x.sh ?? "—"}% suben</div><div class="rl-v2">${pc(x.l)} <span>líderes · ${x.lh ?? "—"}%</span></div></div>`).join("")}</div>
    <div class="rl-wrap"><table class="rl"><thead><tr><th class="l">Alerta</th><th class="l">Sector</th><th>Ruedas</th>${H.map((k) => `<th>D+${k}</th>`).join("")}<th class="l">Líderes a 6 meses (vs SPY hoy)</th><th>Recorrido</th><th class="l">Hoy</th></tr></thead><tbody>
    ${rows.map((s) => `<tr><td class="l">${fd(s.date)}${s.source === "live" ? ' <span class="rl-new">en vivo</span>' : ""}</td><td class="l"><b>${esc(s.sym)}</b> <span class="rl-n">${esc(s.name || "")}</span></td><td>${s.days}</td>
      ${H.map((k) => `<td>${s.etf?.[k] != null ? pc(s.etf[k]) : '<span style="color:#475569">·</span>'}</td>`).join("")}
      <td class="l">${s.leaders.length ? s.leaders.map((l) => `<a href="/empresa.html?s=${encodeURIComponent(l)}">${esc(l)}</a> ${pc(s.each?.[l], 0)}`).join(" · ") : '<span class="rl-n">sin acciones del sector en el universo</span>'}</td>
      <td>${spark(s.etf, s.lead)}</td><td class="l">${s.now?.quadrant ? `<span class="rl-q rl-${s.now.quadrant}">${QN[s.now.quadrant]}</span>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="rl-foot">Rendimiento contra el S&P 500 desde el cierre del día de la alerta. Azul = sector (ETF); verde punteado = promedio de sus 3 líderes a 6 meses. Se actualiza todos los días hábiles después del cierre${d.updated ? ` · última actualización ${new Date(d.updated).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. Las alertas previas al ${fd(S.filter((s) => s.source === "live").at(-1)?.date || new Date().toISOString().slice(0, 10))} se reconstruyeron con la misma fórmula.</div>`;
}
export const RL_CSS = `
.rl-sum{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}
.rl-sum>div{background:#16213a;border:1px solid #1e2a44;border-radius:10px;padding:9px 11px;font-family:Inter,sans-serif}
.rl-k{font-size:11.5px;color:#94a3b8}.rl-k span{color:#64748b}.rl-v{font-size:19px;font-weight:600;margin-top:2px}.rl-s{font-size:11px;color:#64748b}.rl-v2{font-size:13px;margin-top:4px}.rl-v2 span{font-size:11px;color:#64748b}
.rl-wrap{overflow-x:auto;border:1px solid #1e2a44;border-radius:12px}
table.rl{width:100%;border-collapse:collapse;font-size:12.5px;font-family:Inter,sans-serif;color:#e2e8f0}
table.rl th{font-weight:500;color:#94a3b8;font-size:11.5px;padding:8px;text-align:right;border-bottom:1px solid #1e2a44;white-space:nowrap}
table.rl td{padding:7px 8px;text-align:right;border-bottom:1px solid #16213a;white-space:nowrap;font-variant-numeric:tabular-nums}
table.rl .l{text-align:left}.rl-n{color:#64748b}.rl a{color:#e2e8f0;text-decoration:none;font-weight:600}.rl a:hover{color:#93c5fd}
.rl-new{font-size:10.5px;background:#14532d;color:#86efac;border-radius:99px;padding:1px 6px}
.rl-q{font-size:11px;border-radius:99px;padding:2px 8px}.rl-leading{background:#14532d;color:#86efac}.rl-improving{background:#172554;color:#93c5fd}.rl-weakening{background:#713f12;color:#fde68a}.rl-lagging{background:#7f1d1d;color:#fca5a5}
.rl-foot{font-size:11.5px;color:#64748b;margin-top:8px;line-height:1.5}
@media (max-width:800px){.rl-sum{grid-template-columns:repeat(2,1fr)}}`;
