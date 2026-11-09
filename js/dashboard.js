// Dashboard: pocas palabras, un dato protagonista por tarjeta.
import { UNIVERSE } from "/lib/universe.js";
import { ok, derive, scoreAll, fmt, nf } from "/js/score.js";
import { $, esc, loadLocal, saveLocal, state, META, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { startLive } from "/js/live.js";
import { EARN_CSS, logo } from "/js/earnings.js";
import { fetchArs } from "/js/ars.js";
import { watchSymbols, getPortfolio } from "/js/lists.js";
{ const st = document.createElement("style"); st.textContent = EARN_CSS; document.head.appendChild(st); }

const D = { range: loadLocal("dash_range", "3m"), mcap: new Map() };
const pc = (v, d = 1) => (ok(v) ? `<span class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(d).format(v)}%</span>` : '<span class="dim">—</span>');
const liveChg = (s, v, d = 1) => `<span data-live-chg="${esc(s)}" data-live-dec="${d}" class="${v >= 0 ? "pos" : "neg"}">${ok(v) ? (v >= 0 ? "+" : "") + nf(d).format(v) + "%" : "—"}</span>`;
const scPill = (s) => `<span class="sc ${!ok(s) ? "" : s >= 65 ? "g" : s >= 45 ? "m" : "b"}">${s ?? "—"}</span>`;
const go = (s) => { location.href = "/empresa.html?s=" + encodeURIComponent(s); };

function spark(vals, up, W = 120, H = 36) {
  const v = vals.filter(ok); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v);
  const pts = vals.map((x, i) => (ok(x) ? `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 2 - ((x - mn) / (mx - mn || 1)) * (H - 4)).toFixed(1)}` : null)).filter(Boolean).join(" ");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "#22c55e" : "#ef4444"}" stroke-width="1.8"/></svg>`;
}

// ---------- Cinta de cotizaciones ----------
async function loadTape() {
  const r = await fetch("/api/overview"); if (!r.ok) throw new Error("overview");
  const ov = await r.json();
  const crypto = (s) => /-USD$/.test(s);
  const fp = (m) => (m.symbol === "^TNX" ? nf(2).format(m.price) + "%" : crypto(m.symbol) ? "US$ " + nf(0).format(m.price) : nf(2).format(m.price));
  const attr = (m) => `data-live-px="${esc(m.symbol)}"${m.symbol === "^TNX" ? ' data-live-suf="%"' : crypto(m.symbol) ? ' data-live-pre="US$ " data-live-dec="0"' : ""}`;
  const row = ov.market.map((m) => `<span class="tk-i"><span class="n">${esc(m.name)}</span><b ${attr(m)}>${fp(m)}</b><span class="c ${m.d1 >= 0 ? "pos" : "neg"}" data-live-chg="${esc(m.symbol)}">${ok(m.d1) ? (m.d1 >= 0 ? "+" : "") + nf(2).format(m.d1) + "%" : "—"}</span></span>`).join("");
  $("tapeIn").innerHTML = row + row;
}

// ---------- Régimen de mercado y VIX ----------
const dLbl = (s) => { const [, m, d] = s.split("-"); return `${+d} ${MES[+m - 1]}`; };
const dec = (x) => String(x).replace(/(\d)\.(\d)/g, "$1,$2");
async function loadRegime() {
  const r = await fetch("/api/overview?view=regime"); if (!r.ok) throw new Error("regime");
  const R = await r.json(), sg = R.signals || [];
  const on = sg.filter((x) => x.state > 0).length, off = sg.filter((x) => x.state < 0).length;
  const name = { on: "Risk-on", off: "Risk-off", neutral: "Neutral" }[R.regime];
  const sub = { on: "Las señales favorecen tomar riesgo", off: "Las señales piden cautela", neutral: "Señales mezcladas: selectividad" }[R.regime];
  const pos = Math.max(0, Math.min(100, (R.score + 100) / 2));
  // Puntaje 0-100 por bloques (+1 = puntaje completo, 0 = mitad, -1 = nada) + amplitud real del universo
  const B = await fetch("/data/breadth.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const st = Object.fromEntries(sg.map((x) => [x.k, x.state]));
  const part = (k, w) => (st[k] == null ? null : ((st[k] + 1) / 2) * w);
  const lin = (v, a, b2, w) => Math.max(0, Math.min(1, (v - a) / (b2 - a))) * w;
  const a200 = B?.above200?.at(-1), nh = B?.nh?.at(-1), nl = B?.nl?.at(-1);
  const groups = [
    ["📈", "Índices (S&P, Nasdaq, small caps)", [[part("trend", 15), 15], [part("dd", 10), 10], [part("ew", 7.5), 7.5], [part("small", 7.5), 7.5]]],
    ["🌐", "Amplitud (cuántas acciones acompañan)", [[a200 != null ? lin(a200, 30, 70, 15) : null, 15], [nh != null ? lin(nh - nl, -15, 15, 5) : null, 5], [part("breadth", 5), 5]]],
    ["🧠", "Sentimiento (VIX)", [[part("vix", 8), 8], [part("term", 7), 7]]],
    ["🏦", "Crédito y macro", [[part("credit", 8), 8], [part("cyc", 4), 4], [part("dxy", 4), 4], [part("rates", 4), 4]]],
  ].map(([ic, l, xs]) => { const v = xs.filter(([p]) => p != null); return [ic, l, v.reduce((a, [p]) => a + p, 0), v.reduce((a, [, w]) => a + w, 0)]; });
  const got = groups.reduce((a, g) => a + g[2], 0), max = groups.reduce((a, g) => a + g[3], 0), score = max ? Math.round((got / max) * 100) : 50;
  const expo = score >= 70 ? ["75–100%", "cartera completa, sumar en retrocesos", "#22c55e"] : score >= 50 ? ["50–75%", "exposición normal, selectividad", "#84cc16"] : score >= 35 ? ["25–50%", "posiciones chicas, stops cortos", "#f59e0b"] : ["0–25%", "priorizar caja y defensivas", "#ef4444"];
  const ang = (v) => Math.PI * (1 - v / 100), arc = (v) => { const x = 70 + 56 * Math.cos(ang(v)), y = 70 - 56 * Math.sin(ang(v)); return `M14,70 A56,56 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`; };
  let chartB = "";
  if (B?.above200?.length > 5) {
    const v = B.above200.slice(-60), d = B.dates.slice(-60), W2 = 520, H2 = 90, lo2 = Math.max(0, Math.min(...v) - 5), hi2 = Math.min(100, Math.max(...v) + 5);
    const X2 = (i) => (i / (v.length - 1)) * W2, Y2 = (y) => H2 - ((y - lo2) / (hi2 - lo2)) * H2, pth = v.map((y, i) => `${i ? "L" : "M"}${X2(i).toFixed(1)},${Y2(y).toFixed(1)}`).join("");
    const g50 = 50 > lo2 && 50 < hi2 ? `<line x1="0" x2="${W2}" y1="${Y2(50)}" y2="${Y2(50)}" stroke="#64748b" stroke-dasharray="4 4"/><text x="${W2 - 2}" y="${Y2(50) - 3}" fill="#64748b" font-size="9" text-anchor="end">50%</text>` : "";
    chartB = `<div class="rg-bh"><span>% del universo sobre su media de 200 ruedas · últimos 3 meses</span><b>${nf(1).format(a200)}%</b></div>
      <svg viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" style="width:100%;height:${H2}px;display:block">${g50}<path d="${pth}L${W2},${H2}L0,${H2}Z" fill="#22c55e" opacity=".1"/><path d="${pth}" fill="none" stroke="#4ade80" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
      <div class="rg-bx"><span>${dLbl(d[0])}</span><span>${dLbl(d[Math.floor(d.length / 2)])}</span><span>${dLbl(d.at(-1))}</span></div>`;
  }
  const gc = (r) => (r >= 0.66 ? "#4ade80" : r >= 0.4 ? "#fbbf24" : "#f87171");
  $("regime").innerHTML = `<div class="lbl"><span>Régimen de mercado</span><span class="dim2">${B ? `${B.n} acciones · ` : ""}${sg.length} señales</span></div>
    <div class="rg-top2">
      <svg viewBox="0 0 140 84" class="rg-g"><path d="M14,70 A56,56 0 0 1 126,70" fill="none" stroke="var(--panel2)" stroke-width="11" stroke-linecap="round"/><path d="${arc(score)}" fill="none" stroke="${expo[2]}" stroke-width="11" stroke-linecap="round"/><text x="70" y="62" text-anchor="middle" font-size="30" font-weight="800" fill="${expo[2]}">${score}</text><text x="70" y="79" text-anchor="middle" font-size="8.5" fill="#64748b">de 100 · ${name}</text></svg>
      <div class="rg-expo" style="border-color:${expo[2]}55;background:${expo[2]}12"><div class="t">Exposición sugerida</div><div class="v" style="color:${expo[2]}">${expo[0]}</div><div class="s">${expo[1]}</div></div>
    </div>
    <div class="rg-grp">${groups.map(([ic, l, g, m]) => `<div><span>${ic} ${l}</span><i><u style="width:${m ? (g / m) * 100 : 0}%;background:${gc(m ? g / m : 0)}"></u></i><b style="color:${gc(m ? g / m : 0)}">${nf(0).format(g)}/${m} pts</b></div>`).join("")}</div>
    ${nh != null ? `<div class="rg-nh">🆕 Nuevos máximos / mínimos de 52 semanas (último cierre): <b class="pos">${nh}</b> / <b class="neg">${nl}</b></div>` : ""}
    ${chartB}
    <div class="rg-chips">${sg.map((x) => `<span class="rg-chip" title="${esc(x.name)}: ${esc(dec(x.value))} (${esc(dec(x.detail))})\n${esc(x.why)}"><i style="background:${x.state > 0 ? "#22c55e" : x.state < 0 ? "#ef4444" : "#eab308"}"></i>${esc(x.name.replace(/ \(.*\)/, ""))} <b>${esc(dec(x.value))}</b></span>`).join("")}</div>`;
  // VIX
  const v = R.vix; if (!v) return;
  const lv = v.v < 16 ? ["Calma", "#22c55e"] : v.v <= 20 ? ["Normal", "#94a3b8"] : v.v <= 25 ? ["Nervioso", "#eab308"] : v.v <= 35 ? ["Miedo", "#f97316"] : ["Pánico", "#ef4444"];
  const ts = v.v3m ? v.v / v.v3m : null, back = ts > 1;
  const W = 320, H = 90, mn = Math.min(...v.spark) * 0.95, mx = Math.max(...v.spark) * 1.03;
  const Y = (y) => H - ((y - mn) / (mx - mn)) * H, X = (i) => (i / (v.spark.length - 1)) * W;
  const band = (y, c) => (y > mn && y < mx ? `<line x1="0" x2="${W}" y1="${Y(y)}" y2="${Y(y)}" stroke="${c}" stroke-dasharray="4 4" opacity=".6"/><text x="${W - 2}" y="${Y(y) - 3}" fill="${c}" font-size="9" text-anchor="end">${y}</text>` : "");
  const path = v.spark.map((y, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join("");
  let note;
  if (v.v > 25 && back) note = "<b>Pánico con curva invertida.</b> Históricamente los picos de VIX con backwardation marcan zonas de compra escalonada cuando la curva vuelve a contango.";
  else if (v.v > 25) note = "<b>Miedo alto.</b> Zona donde suele convenir empezar a comprar de a partes, sin apalancarse.";
  else if (back) note = "<b>Curva invertida:</b> el mercado paga más por protección inmediata que a 3 meses. Señal de estrés de corto plazo.";
  else if (v.v < 14) note = "<b>Complacencia.</b> Volatilidad muy baja: la protección (puts) está barata.";
  else note = "Volatilidad dentro de lo normal y curva en contango.";
  $("vixT").innerHTML = `<div class="lbl"><span>VIX · volatilidad</span><span class="dim2">percentil ${v.pct} del año</span></div>
    <div class="vx-h"><div><div class="big" style="color:${lv[1]}">${nf(2).format(v.v)}</div><div class="cap">${pc(v.chg1d)} hoy · prom. 1A ${nf(1).format(v.avg)}</div></div><span class="vx-st" style="background:${lv[1]}22;color:${lv[1]}">${lv[0]}</span></div>
    <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="margin-top:10px;display:block">${band(20, "#eab308")}${band(30, "#ef4444")}<path d="${path}L${W},${H}L0,${H}Z" fill="${lv[1]}" opacity=".12"/><path d="${path}" fill="none" stroke="${lv[1]}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
    <div class="vx-ts"><div><b>${v.v9 != null ? nf(1).format(v.v9) : "—"}</b><span>VIX 9 días</span></div><div><b>${nf(1).format(v.v)}</b><span>VIX 30 días</span></div><div><b>${v.v3m != null ? nf(1).format(v.v3m) : "—"}</b><span>VIX 3 meses</span></div></div>
    <div class="vx-note">${ts ? `Estructura: <b class="${back ? "neg" : "pos"}">${back ? "backwardation" : "contango"}</b> (${nf(2).format(ts)}). ` : ""}${note}</div>`;
}

// Oculta tarjetas vacías y reacomoda la fila para que no queden huecos
function relayout() {
  const hide = (id) => { const el = $(id); if (el) el.style.display = "none"; };
  const span = (id, n) => { const el = $(id); if (el) el.className = el.className.replace(/\bs\d+\b/, "s" + n); };
  if (D.wlEmpty) { hide("wlT"); span("candT", 6); span("cryT", 6); }
  if (D.pfEmpty) { hide("pfT"); span("dolT", 12); }
}

// ---------- Sentimiento y tasas ----------
function gauge(v) {
  const cx = 90, cy = 86, R = 70, P = (p) => { const a = Math.PI * (1 - p / 100); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const seg = (f, t, c) => { const [x1, y1] = P(f), [x2, y2] = P(t); return `<path d="M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}" stroke="${c}" stroke-width="12" fill="none"/>`; };
  const [x, y] = P(Math.max(0, Math.min(100, v)));
  return `<svg width="180" height="100" viewBox="0 0 180 100" role="img" aria-label="Índice de miedo y codicia: ${Math.round(v)}">${seg(0, 25, "#b91c1c")}${seg(25, 45, "#ef4444")}${seg(45, 55, "#eab308")}${seg(55, 75, "#22c55e")}${seg(75, 100, "#15803d")}
    <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="#e2e8f0"/></svg>`;
}
// Curva (10a-2a, 10a-3m) e inflación esperada (breakeven 10a) de FRED, con su historia de 2 años
function fredBlock(F) {
  if (!F || !["T10Y2Y", "T10Y3M", "T10YIE"].some((k) => F[k]?.last != null)) return "";
  const sp = (h, c) => { const W = 120, H = 26, mn = Math.min(0, ...h), mx = Math.max(0, ...h), Y = (v) => H - ((v - mn) / (mx - mn || 1)) * H; return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#475569" stroke-dasharray="2 3"/><path d="${h.map((v, i) => `${i ? "L" : "M"}${((i / (h.length - 1)) * W).toFixed(1)},${Y(v).toFixed(1)}`).join("")}" fill="none" stroke="${c}" stroke-width="1.5"/></svg>`; };
  const row = (k, l, tip, inv) => { const x = F[k]; if (x?.last == null || !x.hist?.length) return ""; const v = x.last, c = inv ? (v < 0 ? "#ef4444" : "#22c55e") : "#93c5fd"; return `<div class="fr" title="${esc(tip)}"><span>${l}</span>${sp(x.hist, c)}<b style="color:${c}">${inv ? (v >= 0 ? "+" : "") + nf(0).format(v * 100) + " pb" : nf(2).format(v) + "%"}</b></div>`; };
  return `<div class="frb">${row("T10Y2Y", "10a − 2a", "Pendiente de la curva. Negativa (invertida) históricamente anticipó recesiones; el riesgo suele aparecer cuando vuelve a positiva.", true)}${row("T10Y3M", "10a − 3m", "La versión que más usa la Fed de Nueva York para estimar probabilidad de recesión.", true)}${row("T10YIE", "Inflación esperada 10a", "Breakeven: la inflación anual promedio que descuenta el mercado de bonos para los próximos 10 años (bonos nominales vs indexados). Si sube, la Fed tiene menos margen para bajar tasas.", false)}</div>`;
}
async function loadMarket() {
  const r = await fetch("/api/market"); if (!r.ok) throw new Error("market");
  const m = await r.json(), fg = m.fearGreed || {}, vix = m.vix || {};
  const lbl = { "extreme fear": "Miedo extremo", fear: "Miedo", neutral: "Neutral", greed: "Codicia", "extreme greed": "Codicia extrema" };
  const fc = (v) => (v < 25 ? "#b91c1c" : v < 45 ? "#ef4444" : v < 55 ? "#eab308" : v < 75 ? "#22c55e" : "#15803d");
  // Lectura contraria: miedo = oportunidad, codicia = riesgo de corrección
  const read = !ok(fg.score) ? "" : fg.score < 25 ? "<b>Pánico.</b> Históricamente es buena zona para comprar de a partes." : fg.score < 45 ? "<b>Pesimismo.</b> Suele ser mejor momento para comprar que para vender." : fg.score < 55 ? "<b>Neutral.</b> Sin exceso de miedo ni de euforia." : fg.score < 75 ? "<b>Optimismo.</b> Bien para tendencia, pero no perseguir subas." : "<b>Euforia.</b> Riesgo de corrección: mejor no sumar agresivo.";
  const tag = (v) => [v < 25 ? "Miedo extremo" : v < 45 ? "Miedo" : v < 55 ? "Neutral" : v < 75 ? "Codicia" : "Codicia extrema", fc(v)];
  const TIP = { "Momentum S&P 500": "S&P 500 vs su media de 125 ruedas. Muy por encima = codicia.", "Máximos vs mínimos": "Acciones del NYSE en máximos de 52 semanas vs en mínimos.", "Amplitud (volumen)": "Volumen de las acciones que suben vs las que bajan. Amplitud = cuántas acciones acompañan el movimiento del índice.", "Put/Call": "Opciones de cobertura (puts) vs apuestas alcistas (calls). Muchos puts = miedo.", "Volatilidad (VIX)": "VIX vs su promedio de 50 ruedas. VIX alto = miedo.", "Demanda de bonos basura": "Diferencia de tasa entre bonos basura y bonos seguros. Diferencia chica = apetito de riesgo.", "Refugio (bonos vs acciones)": "Rendimiento de bonos del Tesoro vs acciones en 20 ruedas. Bonos ganando = búsqueda de refugio." };
  const row = (l, v, t, c, tip) => `<div class="sn-row" title="${esc(tip)}"><span class="l">${esc(l)}</span><span class="t" style="background:${c}22;color:${c}">${t}</span></div>`;
  $("sentiment").innerHTML = `<div class="lbl">Sentimiento</div>
    <div class="gauge">${ok(fg.score) ? gauge(fg.score) : ""}</div>
    <div style="text-align:center;margin-top:-6px"><div class="big" style="font-size:28px;color:${ok(fg.score) ? fc(fg.score) : ""}">${ok(fg.score) ? Math.round(fg.score) : "—"}</div><div class="cap">${esc(lbl[fg.rating] || "")} <span class="dim">· hace 1 semana ${ok(fg.previousWeek) ? Math.round(fg.previousWeek) : "—"}</span></div></div>
    <div class="sn-read">${read}</div>
    <div style="margin-top:8px">${(fg.parts || []).filter((p) => ok(p.score)).map((p) => { const [t, c] = tag(p.score); return row(p.l === "Put/Call" && ok(fg.putCall) ? `Put/Call ${nf(2).format(fg.putCall)}` : p.l, p.score, t, c, TIP[p.l] || ""); }).join("")}
    <div class="sn-row" id="breadth" title="Amplitud del día: % de las acciones de tu universo que suben hoy. Más de 60% = suba con muchas acciones acompañando (sana); menos de 40% = la mayoría baja."></div></div>`;
  if (D.breadth) $("breadth").innerHTML = D.breadth; else $("breadth").style.display = "none";
  const t = (m.treasuries || []).filter((x) => ok(x.yield));
  const mx = Math.max(...t.map((x) => x.yield)), mn = Math.min(...t.map((x) => x.yield)) - 0.6;
  const y2 = t.find((x) => x.key === "2y")?.yield, y10 = t.find((x) => x.key === "10y")?.yield;
  const sp = ok(y2) && ok(y10) ? (y10 - y2) * 100 : null;
  $("curve").innerHTML = `<div class="lbl">Tasas EE.UU.</div>
    <div class="curve">${t.map((x) => `<div><b>${nf(2).format(x.yield)}</b><i style="height:${12 + ((x.yield - mn) / (mx - mn || 1)) * 70}%"></i><span>${esc(x.label.replace(" años", "a").replace(" meses", "m"))}</span></div>`).join("")}</div>
    ${fredBlock(m.fred)}
    ${m.fred?.T10Y2Y?.last == null && ok(sp) ? `<span class="chip">10a − 2a: <b class="${sp >= 0 ? "pos" : "neg"}">${sp >= 0 ? "+" : ""}${nf(0).format(sp)} pb</b> · ${sp < 0 ? "invertida" : sp < 50 ? "casi plana" : "normal"}</span>` : ""}`;
}

// ---------- Sectores: barras ordenadas contra el S&P 500 ----------
const RANGES = [["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["1y", "1A"]];
async function loadSectors() {
  $("ranges").innerHTML = RANGES.map(([k, l]) => `<button data-r="${k}" class="${k === D.range ? "on" : ""}">${l}</button>`).join("");
  const r = await fetch(`/api/sectors?range=${D.range}`); if (!r.ok) throw new Error("sectors");
  const j = await r.json();
  const rows = j.series.filter((s) => !s.is_benchmark).map((s) => ({ s: s.symbol, n: s.name, v: s.rel_spread_pct.filter(ok).at(-1) })).filter((x) => ok(x.v)).sort((a, b) => b.v - a.v);
  const M = Math.max(...rows.map((x) => Math.abs(x.v)), 1);
  $("sectors").className = "";
  $("sectors").innerHTML = `<div class="bars">${rows.map((x) => { const w = (Math.abs(x.v) / M) * 50; return `<div class="br"><span class="n"><b>${esc(x.s)}</b><span class="dim">${esc(x.n)}</span></span><div class="t"><i style="${x.v >= 0 ? `left:50%;width:${w}%;background:#22c55e` : `right:50%;width:${w}%;background:#ef4444`}"></i></div><span class="v ${x.v >= 0 ? "pos" : "neg"}">${x.v >= 0 ? "+" : ""}${nf(1).format(x.v)}%</span></div>`; }).join("")}</div>`;
}

// ---------- Universo: candidatas, watchlist y amplitud ----------
const item = (r, right) => `<div class="li" data-s="${esc(r.s)}">${logo(r.s, r.ced || r.s, 28)}<div style="min-width:0"><div class="tk">${esc(r.ced || r.s)}</div><div class="nm">${esc(r.n || "")}</div></div>${right}</div>`;
async function loadUniverse() {
  await initSupabase();
  const [, snap] = await Promise.all([loadOverrides(), loadSnapshots(), loadFund()]);
  const rows = [...snap.rows.values()].map((r) => derive(r, state.ov.get(r.s), state.fund.get(r.s)));
  scoreAll(rows, { userMult: userMult(), profW: userProfW() });
  D.mcap = new Map(rows.map((r) => [r.s, r.mcap]));

  const ext = rows.filter((r) => r.c !== "AR" && !(r.mk || "").includes("REF"));
  const cands = ext.filter((r) => r.cand && r.profile !== "crypto").sort((a, b) => b.score - a.score).slice(0, 6);
  $("cands").className = "";
  $("cands").innerHTML = cands.length ? cands.map((r) => item(r, `<span class="px">${liveChg(r.s, r.chg)}</span>${scPill(r.score)}`)).join("") : `<div class="dim">Hoy no hay candidatas.</div>`;
  // Watchlist
  let wl = loadLocal("watchlists_v2", null);
  const acc = state.ov.get("__watchlists")?.metrics?.lists;
  if (acc) wl = { lists: acc, active: Object.keys(acc)[0] };
  const name = wl?.active && wl.lists?.[wl.active] ? wl.active : Object.keys(wl?.lists || {})[0];
  const wrows = (name ? wl.lists[name] : []).map((s) => rows.find((r) => r.s === s || r.ced === s)).filter(Boolean).slice(0, 6);
  $("wlName").textContent = name ? `Watchlist · ${name}` : "Watchlist";
  $("wl").className = "";
  D.wlEmpty = !wrows.length; relayout();
  $("wl").innerHTML = wrows.length ? wrows.map((r) => item(r, `<span class="px"><span data-live-px="${esc(r.s)}">${fmt(r.px)}</span><div>${liveChg(r.s, r.chg)}</div></span>${scPill(r.score)}`)).join("") : `<div class="dim">Agregá acciones desde el Screener o la Watchlist.</div>`;
  document.querySelectorAll(".li[data-s]").forEach((el) => (el.onclick = () => go(el.dataset.s)));
  // Amplitud (dentro de la tarjeta de sentimiento)
  const wc = ext.filter((r) => ok(r.chg)), up = wc.filter((r) => r.chg > 0).length;
  if (wc.length) { const q = (up / wc.length) * 100, c = q >= 60 ? "#22c55e" : q <= 40 ? "#ef4444" : "#94a3b8"; D.breadth = `<span class="l">Suben hoy (amplitud) ${nf(0).format(q)}%</span><span class="t" style="background:${c}22;color:${c}">${q >= 60 ? "Suba amplia" : q <= 40 ? "Mayoría baja" : "Mixto"}</span>`; const el = $("breadth"); if (el) { el.innerHTML = D.breadth; el.style.display = ""; } }
}

// ---------- Fed y agenda macro ----------
const ES = [[/^Core PCE Price Index YoY/i, "PCE núcleo"], [/^Core PCE Price Index MoM/i, "PCE núcleo m/m"], [/^PCE Price Index YoY/i, "PCE"], [/^PCE Price Index MoM/i, "PCE m/m"],
  [/^Core Inflation Rate YoY/i, "CPI núcleo"], [/^Core Inflation Rate MoM/i, "CPI núcleo m/m"], [/^Inflation Rate YoY/i, "Inflación (CPI)"], [/^Inflation Rate MoM/i, "CPI m/m"],
  [/^Non Farm Payrolls/i, "Empleo (NFP)"], [/^Unemployment Rate/i, "Desempleo"], [/^Fed Interest Rate Decision/i, "Decisión de la Fed"], [/^GDP Growth Rate/i, "PBI"],
  [/^Retail Sales MoM/i, "Ventas minoristas"], [/^PPI MoM/i, "Precios mayoristas"], [/^ISM Manufacturing PMI/i, "ISM manufactura"], [/^ISM Services PMI/i, "ISM servicios"]];
const esName = (t) => (ES.find(([re]) => re.test(t))?.[1]) || t;
const hawkDir = (t) => (/unemployment|jobless/i.test(t) ? -1 : /inflation|pce|ppi|payroll|retail|gdp|ism|jolts/i.test(t) ? 1 : 0);
const KEY = /^(inflation rate yoy|core inflation rate yoy|core pce price index|pce price index yoy|non farm payrolls|unemployment rate|fed interest rate decision|gdp growth rate|retail sales mom|ppi mom|ism)/i;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
async function loadMacro() {
  const r = await fetch("/api/overview?view=macro"); if (!r.ok) throw new Error("macro");
  const M = await r.json(), F = M.fed || {}, mt = F.meetings || [], now = Date.now();
  const val = (v, e) => (v == null ? "—" : `${nf(Math.abs(v) < 10 && v % 1 ? (String(v).split(".")[1]?.length > 1 ? 2 : 1) : 0).format(v)}${e.unit === "%" ? "%" : e.scale ? e.scale : ""}`);
  const ev = M.events.filter((e) => KEY.test(e.title)).sort((a, b) => a.t - b.t);
  const next = ev.filter((e) => e.t >= now - 3600e3).slice(0, 4), past = ev.filter((e) => e.t < now && e.actual != null).slice(-3).reverse();
  const dt = (t) => { const d = new Date(t); return `<div class="dt"><b>${d.getDate()}</b><span>${MES[d.getMonth()]}</span></div>`; };
  const surprise = (e) => { if (e.forecast == null || e.actual == null || e.actual === e.forecast || val(e.actual, e) === val(e.forecast, e)) return ["#64748b", "en línea con lo esperado"]; const h = hawkDir(e.title), hawk = h === 0 ? null : (e.actual > e.forecast ? h > 0 : h < 0); return [hawk == null ? "#64748b" : hawk ? "#ef4444" : "#22c55e", `${e.actual > e.forecast ? "arriba" : "abajo"} de lo esperado${hawk == null ? "" : hawk ? ": presiona a subir tasas" : ": alivio para tasas"}`]; };
  $("econ").className = "";
  const vsBox = (e) => {
    const [c] = e.actual != null ? surprise(e) : ["", ""];
    const cls = e.actual == null ? "pend" : c === "#ef4444" ? "hot" : c === "#22c55e" ? "cool" : "flat";
    const est = e.forecast != null ? val(e.forecast, e) : "—";
    return `<div class="vs"><div><b>${est}</b><small>${e.forecast != null ? "esperado" : "sin est."}</small></div><i>vs</i><div class="${cls}"><b>${e.actual != null ? val(e.actual, e) : "—"}</b><small>${e.actual != null ? "dato" : "pendiente"}</small></div></div>`;
  };
  $("econ").innerHTML = `${next.map((e) => `<div class="ev" title="Previo: ${val(e.previous, e)}">${dt(e.t)}<div class="nm">${esc(esName(e.title))}<small>${esc(e.period)}</small><small style="display:block;margin:2px 0 0">previo ${val(e.previous, e)}</small></div>${vsBox(e)}</div>`).join("") || '<div class="dim">Sin datos clave en las próximas semanas.</div>'}
    <div class="sub-l">Últimos datos <span style="text-transform:none;letter-spacing:0">· rojo = presiona a subir tasas, verde = alivio</span></div>
    ${past.map((e) => { const [, t] = surprise(e); return `<div class="ev" title="${t}">${dt(e.t)}<div class="nm">${esc(esName(e.title))}<small>${esc(e.period)}</small><small style="display:block;margin:2px 0 0">${t}</small></div>${vsBox(e)}</div>`; }).join("")}`;
  // Fed
  const n0 = mt[0];
  if (!n0) { $("fed").innerHTML = `<div class="lbl">Fed</div><div class="dim">Sin datos de futuros.</div>`; return; }
  const d0 = new Date(n0.date + "T12:00:00");
  const main = n0.pHold >= Math.max(n0.pHike, n0.pCut) ? ["mantenga", n0.pHold, "#e2e8f0"] : n0.pHike > n0.pCut ? ["suba", n0.pHike, "#f87171"] : ["baje", n0.pCut, "#4ade80"];
  const lastC = mt.at(-1), steps = Math.round((lastC.cumulative || 0) / 25);
  const lo = Math.min(F.effr, ...mt.map((m) => m.implied)) - 0.15, hi = Math.max(F.effr, ...mt.map((m) => m.implied));
  const nextKey = M.events.filter((e) => e.t > now && /^(inflation rate yoy|core pce price index|non farm payrolls)/i.test(e.title)).sort((a, b) => a.t - b.t)[0];
  const ly = new Date(lastC.date + "T12:00:00");
  $("fed").innerHTML = `<div class="lbl"><span>Fed · ${d0.getDate()} ${MES[d0.getMonth()]}</span><span style="text-transform:none;letter-spacing:0;font-weight:500">tasa ${F.target ? nf(2).format(F.target[0]) + "–" + nf(2).format(F.target[1]) + "%" : "—"}</span></div>
    <div class="big" style="color:#60a5fa">${main[1]}%</div><div class="cap">de que <b>${main[0]}</b> la tasa · <span class="dim">FedWatch (futuros de fed funds)</span></div>
    <div class="fw">${[["Baja", n0.pCut], ["Mantiene", n0.pHold], ["Sube", n0.pHike]].map(([l, v]) => `<div><div class="bar"><i class="${v === main[1] ? "top" : ""}" style="height:${Math.max(3, v)}%"></i></div><b>${v}%</b><span>${l}</span></div>`).join("")}</div>
    <div class="path" title="Cambio acumulado de tasa que descuenta el mercado, en puntos básicos">${mt.map((m) => { const d = new Date(m.date + "T12:00:00"); return `<div title="${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}: tasa implícita ${nf(2).format(m.implied)}%"><b style="color:#93c5fd">${m.cumulative >= 0 ? "+" : ""}${nf(0).format(m.cumulative)}</b><i style="height:${8 + ((m.implied - lo) / (hi - lo || 1)) * 72}%;background:rgba(59,130,246,.35);border-top:2px solid #60a5fa"></i><span>${MES[d.getMonth()]}</span></div>`; }).join("")}</div>
    <div class="take">${Math.abs(steps) >= 1 ? `Descuenta <b>${Math.abs(steps)} ${steps > 0 ? "subas" : "bajas"}</b> hasta ${MES[ly.getMonth()]} '${String(ly.getFullYear()).slice(2)}.` : "No descuenta cambios de tasa."}${nextKey ? ` Próximo dato clave: <b>${esc(esName(nextKey.title))}</b> el ${new Date(nextKey.t).getDate()}/${new Date(nextKey.t).getMonth() + 1}.` : ""}</div>`;
}

// ---------- Cripto ----------
async function loadCrypto() {
  const [q, ch, fg] = await Promise.all([
    fetch("/api/overview?s=BTC-USD,ETH-USD,SOL-USD").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/overview?view=chart&sym=BTC-USD&range=1y&interval=1d").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("https://api.alternative.me/fng/?limit=1").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const Q = q?.q || {}, b = Q["BTC-USD"]; if (!b) throw new Error("cripto");
  const pts = (ch?.pts || []).map((p) => p[1]);
  const back = (n) => (pts.length > n ? (pts.at(-1) / pts[pts.length - 1 - n] - 1) * 100 : null);
  const f = fg?.data?.[0] ? Number(fg.data[0].value) : null;
  const flbl = (v) => (v < 25 ? "miedo extremo" : v < 45 ? "miedo" : v <= 55 ? "neutral" : v < 75 ? "codicia" : "codicia extrema");
  const row = (sym, nm) => { const x = Q[sym]; return x ? `<div class="li" style="cursor:default;grid-template-columns:28px 1fr auto 56px">${logo(sym.replace("-", ""), nm, 26)}<div class="tk">${nm}</div><span class="px"><span data-live-px="${sym}" data-live-pre="US$ " data-live-dec="${x.px > 1000 ? 0 : 2}">US$ ${nf(x.px > 1000 ? 0 : 2).format(x.px)}</span></span><span class="px">${liveChg(sym, x.chg)}</span></div>` : ""; };
  $("crypto").className = "";
  $("crypto").innerHTML = `<div class="btc"><div><div class="cap" style="margin:0 0 6px">Bitcoin</div><div class="big" style="font-size:28px" data-live-px="BTC-USD" data-live-pre="US$ " data-live-dec="0">US$ ${nf(0).format(b.px)}</div>
      <div class="rets"><span>24h <b>${pc(b.chg)}</b></span><span>7d <b>${pc(back(7))}</b></span><span>1a <b>${pc(back(pts.length - 1), 0)}</b></span></div></div>${spark(pts.slice(-90), back(90) >= 0)}</div>
    <div style="margin-top:10px">${row("ETH-USD", "ETH")}${row("SOL-USD", "SOL")}</div>
    ${f != null ? `<div class="fgl"><span>Miedo/codicia</span><div class="meter"><i style="left:calc(${f}% - 1px)"></i></div><b>${f}</b><span>${flbl(f)}</span></div>` : ""}`;
}

// ---------- Dólar ----------
async function loadDolar() {
  const d = await fetchArs(0); if (!d) throw new Error("ars");
  const dl = d.dolar || {}, m = (v) => (ok(v) ? "$" + nf(0).format(v) : "—");
  const byCed = new Map(UNIVERSE.filter((u) => u[5]).map((u) => [u[5], u]));
  const liq = Object.entries(d.implied).filter(([k, x]) => x.volArs > 3e8 && byCed.has(k)).map(([k, x]) => ({ k, s: byCed.get(k)[0], dev: (x.ccl / d.medCcl - 1) * 100 })).filter((x) => Math.abs(x.dev) <= 8).sort((a, b) => a.dev - b.dev);
  const chip = (x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.k, 22)}${esc(x.k)} <small class="${x.dev < 0 ? "pos" : "neg"}">${x.dev >= 0 ? "+" : ""}${nf(1).format(x.dev)}%</small></a>`;
  const of = dl.oficial?.venta, gap = (v) => (ok(v) && ok(of) ? (v / of - 1) * 100 : null);
  const box = (v, l, sub) => `<div><div class="v">${m(v)}</div><div class="l">${l}</div><div class="s">${sub}</div></div>`;
  const gs = (v) => { const g = gap(v); return g == null ? "&nbsp;" : `${g >= 0 ? "+" : ""}${nf(0).format(g)}% vs oficial`; };
  const mep = dl.bolsa?.venta, cc = d.medCcl, vsMep = ok(mep) && ok(cc) ? (cc / mep - 1) * 100 : null;
  $("dolar").className = "";
  $("dolar").innerHTML = `<div class="dl-g">${box(of, "Oficial", "referencia")}${box(mep, "MEP", gs(mep))}${box(cc, "CCL CEDEARs", gs(cc))}${box(dl.blue?.venta, "Blue", gs(dl.blue?.venta))}</div>
    <div class="dl-note">Al comprar CEDEARs pagás el dólar a <b>${m(cc)}</b> (CCL implícito promedio)${vsMep != null ? `, <b class="${vsMep > 0 ? "neg" : "pos"}">${Math.abs(vsMep) < 0.5 ? "casi igual que" : `${nf(1).format(Math.abs(vsMep))}% ${vsMep > 0 ? "más caro" : "más barato"} que`}</b> el MEP` : ""}.</div>
    ${liq.length > 5 ? `<div class="pick" style="margin-top:10px"><span class="t">CEDEARs con dólar implícito más barato hoy (te conviene comprar por ahí)</span>${liq.slice(0, 4).map(chip).join("")}</div>` : ""}`;
}

// ---------- Cartera ----------
async function loadPf() {
  const pf = getPortfolio();
  if (!pf.positions.length) { D.pfEmpty = true; relayout(); $("pf").className = ""; $("pf").innerHTML = `<div class="dim">Cargá tus compras en <a href="/cartera.html" style="color:#93c5fd">Cartera</a> para ver tu resultado en dólares y contra el S&amp;P 500.</div>`; return; }
  const [d, q] = await Promise.all([fetchArs(), fetch("/api/overview?s=SPY").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  const spy = q?.q?.SPY?.px;
  let vU = 0, vA = 0, cU = 0, sV = 0, day = 0; const per = new Map();
  for (const p of pf.positions) {
    const x = d?.cedears?.[p.ced]; if (!x?.ars) continue;
    const ccl = META.get(p.s)?.[3] === "AR" ? d.medCcl : d.implied?.[p.ced]?.ccl || d.medCcl;
    const a = p.qty * x.ars, u = a / ccl;
    vA += a; vU += u; cU += p.costUsd || 0; if (p.spy0 && spy) sV += (p.costUsd * spy) / p.spy0;
    if (ok(x.chg)) day += a - a / (1 + x.chg / 100);
    if (!per.has(p.ced)) per.set(p.ced, { ced: p.ced, s: p.s, chg: x.chg });
  }
  const g = vU - cU, vs = sV ? (vU / sV - 1) * 100 : null;
  const movers = [...per.values()].filter((x) => ok(x.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
  $("pf").className = "";
  $("pf").innerHTML = `<div class="nums"><div><div class="v">US$ ${nf(0).format(vU)}</div><div class="l">$ ${nf(0).format(vA)}</div></div>
    <div><div class="v">${pc(vA ? (day / (vA - day)) * 100 : null, 2)}</div><div class="l">hoy</div></div>
    <div><div class="v ${g >= 0 ? "pos" : "neg"}">${g >= 0 ? "+" : "−"}US$ ${nf(0).format(Math.abs(g))}</div><div class="l">ganancia ${pc(cU ? (g / cU) * 100 : null)}</div></div>
    <div><div class="v">${pc(vs)}</div><div class="l">vs S&amp;P 500</div></div></div>
    ${movers.length ? `<div class="pick"><span class="t">Lo que más se mueve hoy</span>${movers.map((x) => `<a href="/empresa.html?s=${encodeURIComponent(x.s)}">${logo(x.s, x.ced, 22)}${esc(x.ced)} <small class="${x.chg >= 0 ? "pos" : "neg"}">${x.chg >= 0 ? "+" : ""}${nf(1).format(x.chg)}%</small></a>`).join("")}</div>` : ""}`;
}

// ---------- Eventos de la semana: macro de EE.UU. + resultados de empresas grandes ----------
D.wk = 0; D.wkOpen = new Set();
const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
async function loadWeek() {
  $("weekR").innerHTML = [[-1, "Anterior"], [0, "Esta semana"], [1, "Próxima"]].map(([w, l]) => `<button data-wk="${w}" class="${w === D.wk ? "on" : ""}">${l}</button>`).join("");
  $("weekR").querySelectorAll("[data-wk]").forEach((b) => (b.onclick = () => { D.wk = +b.dataset.wk; $("week").innerHTML = '<div class="dim">Cargando…</div>'; loadWeek(); }));
  const r = await fetch("/api/overview?view=week&w=" + D.wk); if (!r.ok) throw new Error("week");
  D.week = await r.json(); renderWeek();
}
function renderWeek() {
  const W = D.week, mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  const today = new Date().toISOString().slice(0, 10);
  const d0 = new Date(W.days[0].date + "T12:00:00"), d4 = new Date(W.days[4].date + "T12:00:00");
  $("weekL").innerHTML = `Resultados de la semana <span class="dim2">${d0.getDate()} ${MES[d0.getMonth()]} – ${d4.getDate()} ${MES[d4.getMonth()]} · ★ tus acciones primero</span>`;
  $("week").className = "wk";
  $("week").innerHTML = W.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00"), open = D.wkOpen.has(d.date);
    const all = [...d.earnings].sort((a, b) => mine.has(b.s) - mine.has(a.s) || b.cap - a.cap);
    const earn = (open ? all : all.slice(0, 12)).map((e) => {
      const rep = e.eps != null, beat = rep && e.est != null ? (e.eps >= e.est ? "pos" : "neg") : "";
      return `<div class="wk-e ${mine.has(e.s) ? "mine" : ""}" data-sym="${esc(e.s)}" title="${esc(e.n)} · cap. US$ ${nf(0).format(e.cap / 1e9)} MM${rep && e.surp != null ? ` · sorpresa ${e.surp > 0 ? "+" : ""}${nf(1).format(e.surp)}%` : ""}">${logo(e.s, e.s, 22)}
        <div style="min-width:0"><span class="tk">${mine.has(e.s) ? "★ " : ""}${esc(e.s)}</span><span class="es">${rep ? `EPS <b class="${beat}">${nf(2).format(e.eps)}</b> vs ${e.est != null ? nf(2).format(e.est) : "—"}` : `EPS est <b>${e.est != null ? nf(2).format(e.est) : "—"}</b>`}</span></div>
        ${e.when ? `<span class="wk-p ${e.when}">${e.when === "pre" ? "☀ PRE" : "☾ POST"}</span>` : ""}</div>`;
    }).join("");
    return `<div class="wk-d ${d.date === today ? "today" : ""}"><div class="wk-h">${DIAS[dt.getDay()]} ${dt.getDate()}<span>${d.earnings.length} empresas</span></div><div class="wk-b">
      ${earn || '<div class="dim" style="font-size:12px;padding:8px">Sin resultados de empresas grandes.</div>'}
      ${all.length > 12 ? `<button class="wk-more" data-wkday="${d.date}">${open ? "Ver menos" : `Ver las ${all.length}`}</button>` : ""}</div></div>`;
  }).join("");
  $("week").querySelectorAll("[data-wkday]").forEach((b) => (b.onclick = () => { const k = b.dataset.wkday; D.wkOpen.has(k) ? D.wkOpen.delete(k) : D.wkOpen.add(k); renderWeek(); }));
  $("week").querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => { if (META.get(x.dataset.sym)) location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym); }));
}

async function loadAll() {
  $("dot").className = "dot load"; $("statusTxt").textContent = "Cargando…";
  const res = await Promise.allSettled([
    loadTape(), loadMarket(), loadRegime(), loadWeek(), loadSectors(), loadMacro(), loadCrypto(), loadDolar(),
    loadUniverse().then(() => {
      return loadPf();
    }),
  ]);
  const fails = res.filter((r) => r.status === "rejected"); fails.forEach((f) => console.warn(f.reason));
  $("dot").className = "dot on";
  $("statusTxt").innerHTML = `En vivo · ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}${fails.length ? ` · ${fails.length} sin datos` : ""}`;
}

$("btnReload").onclick = loadAll;
$("ranges").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; D.range = b.dataset.r; saveLocal("dash_range", D.range); loadSectors().catch(() => {}); };
loadAll();
startLive(15000);

// ---------- Ayudas "?" ----------
import { mountHelp } from "/js/help.js";
mountHelp({
  fed: "<b>Probabilidades de la Fed</b> según los futuros de tasas (como FedWatch). Muestra qué descuenta el mercado para la próxima reunión: bajar, mantener o subir.<br><span class='g'>Más probabilidad de baja</span> = viento a favor para acciones (sobre todo crecimiento y small caps). <span class='r'>Suba o menos bajas de las esperadas</span> = presión sobre valuaciones.",
  econ: "<b>Datos macro clave de EE.UU.</b> con lo que espera el mercado vs el dato real.<br><span class='r'>Rojo</span>: el dato presiona a subir tasas (inflación o empleo más fuertes de lo esperado) → negativo para acciones a corto plazo.<br><span class='g'>Verde</span>: alivio para tasas.<br>Gris: en línea, el mercado no debería reaccionar mucho.",
  sentiment: "<b>Índice de miedo y codicia (CNN)</b>, de 0 a 100, armado con 7 componentes.<br>Se lee <b>al revés</b> (contrarian): <span class='g'>miedo (menos de 45) suele ser buen momento para comprar</span>; <span class='r'>codicia extrema (más de 75) avisa riesgo de corrección</span>.<br>Cada fila muestra en qué zona está cada componente. <b>Amplitud</b> = cuántas acciones acompañan la suba o baja del índice: si el S&P sube pero pocas acciones suben, la suba es frágil.",
  regime: "<b>Puntaje de 0 a 100</b> que resume si el mercado está para tomar riesgo.<br>Suma 4 bloques: índices en tendencia (40), amplitud (25), sentimiento/VIX (15) y crédito/macro (20).<br><b>Amplitud</b> = % de acciones del universo arriba de su media de 200 ruedas. <span class='g'>Más de 60%</span> = suba sana con muchas acciones; <span class='r'>menos de 40%</span> = mercado débil aunque el índice aguante.<br><span class='g'>70+</span>: exposición alta · <span class='y'>35–70</span>: selectivo · <span class='r'>menos de 35</span>: priorizar caja.",
  vix: "<b>VIX</b> = volatilidad esperada del S&P 500 a 30 días.<br><span class='g'>Menos de 16</span>: calma · 16–20 normal · <span class='y'>20–25</span> nervioso · <span class='r'>más de 25</span> miedo.<br>Picos de VIX suelen coincidir con pisos del mercado. <b>Contango</b> (VIX 3 meses más alto que el de 30 días) es lo normal; <b>backwardation</b> (al revés) indica estrés inmediato.",
  sectors: "<b>Rendimiento de cada sector menos el del S&P 500</b> en el período elegido.<br><span class='g'>Barras verdes</span>: sectores que lideran (donde está entrando el dinero). <span class='r'>Rojas</span>: rezagados.<br>Si lideran tecnología, consumo discrecional y financieras = mercado ofensivo. Si lideran utilities, salud y consumo básico = mercado defensivo.",
  curve: "<b>Tasas del Tesoro</b> de 3 meses a 30 años.<br><b>10a − 2a</b>: <span class='g'>positiva</span> es lo normal; <span class='r'>negativa (invertida)</span> históricamente anticipó recesiones, y el riesgo aparece cuando vuelve a positiva.<br><b>Inflación esperada 10a</b>: si sube, la Fed tiene menos margen para bajar tasas.<br>Tasa de 10 años subiendo fuerte = presión sobre acciones de crecimiento.",
  cands: "<b>Mejores puntajes del screener</b> (fundamentos + momentum). Número alto = mejor combinación.<br><span class='g'>65+</span> buena · <span class='y'>45–65</span> media · <span class='r'>menos de 45</span> floja. Es un punto de partida, no una recomendación: revisar ficha y técnico.",
  wl: "<b>Tu watchlist</b> con el cambio del día y su puntaje. Tocá una para ver la ficha.",
  crypto: "<b>Bitcoin y principales cripto</b> con la variación del día y la línea de los últimos días. Bitcoin suele anticipar el apetito de riesgo: si cae fuerte mientras las acciones suben, ojo.",
  dolar: "<b>Tipos de cambio en Argentina.</b> La brecha es cuánto más caro está cada dólar que el oficial.<br><b>CCL CEDEARs</b>: el dólar implícito que pagás al comprar CEDEARs (precio en pesos ÷ precio en dólares × ratio). <span class='g'>Si está más barato que el MEP</span>, comprar CEDEARs es una forma barata de dolarizarse.<br>Los CEDEARs de la lista tienen el dólar implícito más bajo hoy: convienen más que el resto para entrar.",
  pf: "<b>Tu cartera</b> en dólares: valor, resultado del día, ganancia total y comparación contra haber puesto lo mismo en el S&P 500.<br><span class='g'>vs S&P positivo</span> = le estás ganando al índice.",
  week: "<b>Empresas grandes (más de US$ 15 MM) que presentan balance cada día.</b> Las ★ son tuyas (cartera o watchlist).<br>☀ PRE = antes de la apertura · ☾ POST = después del cierre.<br>Una vez publicado: EPS <span class='g'>verde</span> = superó lo esperado, <span class='r'>rojo</span> = no llegó. Los datos macro están en la Agenda de arriba.",
});
