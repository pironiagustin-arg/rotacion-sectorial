// Dashboard: pocas palabras, un dato protagonista por tarjeta.
import { UNIVERSE } from "/lib/universe.js";
import { ok, derive, scoreAll, fmt, nf } from "/js/score.js";
import { $, esc, loadLocal, saveLocal, state, META, initSupabase, loadSnapshots, loadOverrides, loadFund, userMult, userProfW } from "/js/core.js";
import { startLive } from "/js/live.js";
import { renderEarnings, EARN_CSS, logo } from "/js/earnings.js";
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
  D.market = ov.market; renderCross();
}

// ---------- Activos: tabla de rendimiento con mapa de calor ----------
const XA_COLS = [["d1", "1D"], ["w1", "1S"], ["m1", "1M"], ["m3", "3M"], ["ytd", "YTD"], ["y1", "1A"]];
D.xaSort = loadLocal("dash_xa_sort", "ytd");
const GROUPS = { "SPY": "Acciones", QQQ: "Acciones", DIA: "Acciones", IWM: "Acciones", EEM: "Acciones", EWZ: "Acciones", ARGT: "Acciones", "^VIX": "Volatilidad", "^TNX": "Tasas", TLT: "Bonos", HYG: "Bonos", "DX-Y.NYB": "Monedas", "GC=F": "Materias primas", "SI=F": "Materias primas", "HG=F": "Materias primas", "CL=F": "Materias primas", "BTC-USD": "Cripto", "ETH-USD": "Cripto" };
function heat(v, k, inv) {
  if (!ok(v)) return "";
  if (inv) v = -v; // VIX: que suba es malo para el mercado
  const sc = { d1: 3, w1: 6, m1: 10, m3: 18, ytd: 30, y1: 40 }[k] || 10, a = Math.min(1, Math.abs(v) / sc) * 0.55;
  return `background:${v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`}`;
}
const pt = (v) => (ok(v) ? (v >= 0 ? "+" : "") + nf(1).format(v) + "%" : "—"); // % en texto plano (para title)
D.xaR = loadLocal("dash_xa_r", "m1");
function renderCross() {
  const el = $("cross"); if (!el || !D.market) return;
  const k = D.xaR;
  $("xaR").innerHTML = XA_COLS.map(([c, l]) => `<button data-xr="${c}" class="${c === k ? "on" : ""}">${l}</button>`).join("");
  $("xaR").querySelectorAll("[data-xr]").forEach((b) => (b.onclick = () => { D.xaR = b.dataset.xr; saveLocal("dash_xa_r", D.xaR); renderCross(); }));
  const rows = [...D.market].sort((a, b) => (b[k] ?? -1e9) - (a[k] ?? -1e9));
  const tk = (m) => m.symbol.replace(/^\^/, "").replace("DX-Y.NYB", "DXY").replace("=F", "").replace("-USD", "");
  el.className = "xg";
  el.innerHTML = rows.map((m) => `<div style="${heat(m[k], k, m.symbol === "^VIX")}" title="${esc(m.name)} · ${GROUPS[m.symbol] || ""}\n1D ${pt(m.d1)} · 1S ${pt(m.w1)} · 1M ${pt(m.m1)} · 3M ${pt(m.m3)} · YTD ${pt(m.ytd)} · 1A ${pt(m.y1)}"><b>${esc(tk(m))}</b><span>${esc(m.name)}</span><em>${ok(m[k]) ? (m[k] >= 0 ? "+" : "") + nf(1).format(m[k]) + "%" : "—"}</em></div>`).join("");
}

// ---------- Ayudas "?" ----------
const HELP = {
  regime: "<b>Para qué sirve:</b> un puntaje de 0 a 100 que resume si el contexto acompaña a tomar riesgo, y cuánto exponerte. Suma 4 bloques: índices (40 pts: tendencia del S&P, caída desde máximos, igual ponderado y small caps), amplitud del universo (25: % de tus ~300 acciones sobre su media de 200 ruedas y nuevos máximos vs mínimos), sentimiento (15: nivel y curva del VIX) y crédito/macro (20: high yield, cíclico vs defensivo, dólar y tasas). <b>Cómo usarlo:</b> en Risk-on podés ser más agresivo con compras y tamaños; en Neutral, selectivo; en Risk-off, priorizar caja, defensivas y entrar de a partes. No es para timing diario: cambia lento y sirve como filtro de fondo. Pasá el mouse por cada señal para ver el detalle.",
  cross: "<b>Para qué sirve:</b> ver de un vistazo hacia dónde va la plata entre clases de activos (acciones, bonos, dólar, materias primas, cripto). <b>Cómo leerlo:</b> si suben oro, bonos y dólar mientras caen acciones y cripto, el mercado se está protegiendo (risk-off). Si el petróleo sube fuerte junto con las tasas, presiona la inflación. En el VIX los colores van al revés: que suba es malo. Elegí el período arriba; pasá el mouse para ver todos los plazos.",
  tech: "<b>Para qué sirve:</b> encontrar las acciones técnicamente más fuertes del universo (o de tu watchlist y cartera). <b>Cómo se arma (0-100):</b> Tendencia 20 (precio sobre sus medias de 50/150/200, medias ordenadas y la de 200 subiendo), Fuerza 25 (rendimiento de 3 a 12 meses contra el S&P), Contracción 35 (volatilidad y rango de los últimos días achicándose: la acción se comprime antes de un movimiento) y Setup 20 (cerca del máximo de 52 semanas y lejos del mínimo). RS es el percentil de fuerza relativa contra todo el universo (99 = la más fuerte). Más de 70 = líder técnica; combinalo con Oportunidades del Screener para que también tenga fundamentos.",
  rsi: "<b>Para qué sirve:</b> ver las acciones más estiradas en cada dirección. El RSI de 14 días mide la velocidad de las subas y bajas: <b>más de 70 = sobrecomprada</b> (subió muy rápido, riesgo de pausa o corrección; no conviene perseguirla), <b>menos de 30 = sobrevendida</b> (cayó muy rápido, posible rebote). Ojo: en tendencias fuertes puede quedar en extremos mucho tiempo; usalo para elegir el momento de entrada, no como señal sola.",
  secs: "<b>Para qué sirve:</b> ver qué sectores y nichos lideran el mercado. El número es el RS rating (1-99): percentil de su rendimiento de 3 a 12 meses contra todas las acciones y ETF. Elegí un sector arriba para ver sus subsectores (ETF temáticos) y las acciones del universo más fuertes de ese sector, con su distancia a la EMA200 y SMA50, RSI y RS rating. La idea: comprar las líderes de los sectores líderes.",
  week: "<b>Para qué sirve:</b> ver de un vistazo qué puede mover el mercado cada día: datos macro de EE.UU. (en naranja los de alto impacto, como inflación, empleo y la Fed) y los resultados de las empresas de más de US$ 15 mil millones. <b>Cómo leerlo:</b> en los datos, EST es lo que espera el mercado y ANT el dato anterior; cuando sale, el DATO se pinta de rojo si presiona a subir tasas y de verde si alivia. En resultados, ☀ PRE reporta antes de la apertura y ☾ POST después del cierre; una vez publicado ves el EPS real contra el estimado (verde = superó). Tus acciones (watchlist y cartera) aparecen primero, con borde azul.",
  map: "<b>Para qué sirve:</b> ver qué países suben o bajan, usando el ETF de acciones de cada uno (en dólares). <b>Cómo usarlo:</b> detectar rotación hacia regiones (ej. emergentes vs desarrollados), países castigados que pueden ser oportunidad, o contagios (si cae toda Asia a la vez). Ojo: el rendimiento en dólares mezcla la bolsa local con la moneda. Pasá el mouse por un país para ver el ETF y todos los plazos.",
};
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".hq"); if (!b) return;
  const h = $("h_" + b.dataset.help); if (!h) return;
  if (!h.innerHTML) h.innerHTML = HELP[b.dataset.help] || "";
  h.classList.toggle("on"); b.classList.toggle("on");
});

// ---------- Mapa de mercados por país ----------
D.mapR = loadLocal("dash_map_r", "m1");
async function loadMap() {
  const [w, c] = await Promise.all([fetch("/data/world.json").then((r) => r.json()), fetch("/api/overview?view=countries").then((r) => r.json())]);
  D.world = w; D.countries = c.rows || []; renderMap();
}
function renderMap() {
  if (!D.world || !D.countries) return;
  const k = D.mapR, by = new Map(D.countries.map((r) => [r.id, r]));
  $("mapR").innerHTML = XA_COLS.map(([c, l]) => `<button data-mr="${c}" class="${c === k ? "on" : ""}">${l}</button>`).join("");
  $("mapR").querySelectorAll("[data-mr]").forEach((b) => (b.onclick = () => { D.mapR = b.dataset.mr; saveLocal("dash_map_r", D.mapR); renderMap(); }));
  const sc = { d1: 3, w1: 6, m1: 12, m3: 20, ytd: 30, y1: 40 }[k] || 12;
  const col = (v) => { if (!ok(v)) return "#1e293b"; const a = Math.min(1, Math.abs(v) / sc); const mix = (c1, c2) => c1.map((x, i) => Math.round(x + (c2[i] - x) * a)); const [r, g, b] = v >= 0 ? mix([51, 65, 85], [21, 128, 61]) : mix([51, 65, 85], [185, 28, 28]); return `rgb(${r},${g},${b})`; };
  const paths = Object.entries(D.world.c).map(([id, f]) => { const r = by.get(id); return `<path class="${r ? "d" : ""}" d="${f.d}" fill="${r ? col(r[k]) : "#162033"}" ${r ? `data-id="${id}"` : ""}/>`; }).join("");
  const rows = D.countries.filter((r) => ok(r[k])).sort((a, b) => b[k] - a[k]);
  const line = (r) => `<div class="mp-r"><span>${esc(r.name)} <small class="dim">${esc(r.etf)}</small></span><b class="${r[k] >= 0 ? "pos" : "neg"}">${pc(r[k])}</b></div>`;
  const regs = ["América", "Europa", "Asia", "Medio Oriente", "África"].map((g) => { const v = rows.filter((r) => r.reg === g).map((r) => r[k]); return v.length ? [g, v.reduce((a, b) => a + b, 0) / v.length] : null; }).filter(Boolean);
  const up = rows.filter((r) => r[k] > 0).length;
  $("map").className = "";
  $("map").innerHTML = `<div class="mp"><div><svg viewBox="0 0 ${D.world.w} ${D.world.h}">${paths}</svg>
      <div class="mp-leg"><span>${pc(-sc)}</span><i></i><span>${pc(sc)}</span><span style="margin-left:10px">${up} de ${rows.length} países en positivo</span></div></div>
    <div class="mp-side"><h5>Mejores</h5>${rows.slice(0, 5).map(line).join("")}<h5 style="margin-top:12px">Peores</h5>${rows.slice(-5).reverse().map(line).join("")}
      <div class="mp-reg">${regs.map(([g, v]) => `<div>${g}<b class="${v >= 0 ? "pos" : "neg"}">${pc(v)}</b></div>`).join("")}</div></div></div>`;
  let tip = document.querySelector(".mp-tip"); if (!tip) { tip = document.createElement("div"); tip.className = "mp-tip"; document.body.appendChild(tip); }
  $("map").querySelectorAll("path.d").forEach((p) => {
    p.onmousemove = (e) => { const r = by.get(p.dataset.id); tip.innerHTML = `<b>${esc(r.name)}</b> · ${esc(r.etf)}<br>1D ${pc(r.d1)} · 1S ${pc(r.w1)} · 1M ${pc(r.m1)}<br>3M ${pc(r.m3)} · YTD ${pc(r.ytd)} · 1A ${pc(r.y1)}`; tip.style.display = "block"; tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 14 + "px"; };
    p.onmouseleave = () => (tip.style.display = "none");
  });
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
    ["🌐", "Amplitud del universo", [[a200 != null ? lin(a200, 30, 70, 15) : null, 15], [nh != null ? lin(nh - nl, -15, 15, 5) : null, 5], [part("breadth", 5), 5]]],
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
  $("regime").innerHTML = `<div class="lbl"><span>Régimen de mercado <button class="hq" data-help="regime">?</button></span><span class="dim2">${B ? `${B.n} acciones · ` : ""}${sg.length} señales</span></div><div class="hlp" id="h_regime"></div>
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
  const keep = $("breadth")?.innerHTML;
  $("sentiment").innerHTML = `<div class="lbl">Sentimiento</div>
    <div class="gauge">${ok(fg.score) ? gauge(fg.score) : ""}</div>
    <div style="text-align:center;margin-top:-6px"><div class="big" style="font-size:28px">${ok(fg.score) ? Math.round(fg.score) : "—"}</div><div class="cap">${esc(lbl[fg.rating] || "")} <span class="dim">· hace 1 semana ${ok(fg.previousWeek) ? Math.round(fg.previousWeek) : "—"}</span></div></div>
    <div class="kpis2" style="margin-top:12px"><div><div class="v">${ok(fg.putCall) ? nf(2).format(fg.putCall) : "—"}</div><div class="l" title="Ratio de opciones put/call (promedio 5 días). Más de 1 = mucha cobertura/miedo; menos de 0,7 = complacencia">Put/Call</div></div><div id="breadth">${keep && !/—/.test(keep) ? keep : '<div class="v">—</div><div class="l">suben hoy</div>'}</div></div>
    ${fg.parts?.length ? `<div class="fgp">${fg.parts.filter((p) => ok(p.score)).map((p) => `<div title="${esc(lbl[p.rating] || "")}"><span>${esc(p.l)}</span><i><u style="width:${p.score}%;background:${p.score < 25 ? "#b91c1c" : p.score < 45 ? "#ef4444" : p.score < 55 ? "#eab308" : p.score < 75 ? "#22c55e" : "#15803d"}"></u></i></div>`).join("")}</div>` : ""}`;
  if (D.breadth) $("breadth").innerHTML = D.breadth;
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
  if (wc.length) { D.breadth = `<div class="v">${nf(0).format((up / wc.length) * 100)}%</div><div class="l">del universo sube hoy</div>`; if ($("breadth")) $("breadth").innerHTML = D.breadth; }
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
  $("dolar").className = "";
  $("dolar").innerHTML = `<div class="nums"><div><div class="v">${m(d.medCcl)}</div><div class="l">CCL CEDEARs</div></div><div><div class="v">${m(dl.bolsa?.venta)}</div><div class="l">MEP</div></div><div><div class="v">${m(dl.oficial?.venta)}</div><div class="l">Oficial${ok(dl.oficial?.venta) && ok(d.medCcl) ? ` · brecha ${nf(0).format((d.medCcl / dl.oficial.venta - 1) * 100)}%` : ""}</div></div><div><div class="v">${m(dl.blue?.venta)}</div><div class="l">Blue</div></div></div>
    <div class="pick"><span class="t">Más baratos para comprar hoy</span>${liq.slice(0, 3).map(chip).join("")}</div>
    <div class="pick" style="margin-top:8px"><span class="t">Más caros</span>${liq.slice(-3).reverse().map(chip).join("")}</div>`;
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
  const fmtV = (v, e) => (v == null ? "—" : `${nf(Math.abs(v) < 10 && v % 1 ? (String(v).split(".")[1]?.length > 1 ? 2 : 1) : 0).format(v)}${e.unit === "%" ? "%" : e.scale || ""}`);
  const today = new Date().toISOString().slice(0, 10);
  const d0 = new Date(W.days[0].date + "T12:00:00"), d4 = new Date(W.days[4].date + "T12:00:00");
  $("weekL").innerHTML = `Eventos de la semana <span class="dim2">${d0.getDate()} ${MES[d0.getMonth()]} – ${d4.getDate()} ${MES[d4.getMonth()]}</span> <button class="hq" data-help="week">?</button>`;
  $("week").className = "wk";
  $("week").innerHTML = W.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00"), open = D.wkOpen.has(d.date);
    // macro: los de alto impacto siempre; del resto, los 3 primeros
    const hi = d.macro.filter((e) => e.high), lo = d.macro.filter((e) => !e.high && (e.forecast != null || e.actual != null) && !/auction|mba |mortgage|redbook|api crude|eia /i.test(e.title)), shownM = open ? d.macro : [...hi, ...lo.slice(0, Math.max(1, 4 - hi.length))];
    const mac = shownM.map((e) => {
      const h = hawkDir(e.title), hot = e.actual != null && e.forecast != null && h !== 0 && fmtV(e.actual, e) !== fmtV(e.forecast, e) ? ((e.actual > e.forecast) === (h > 0) ? "hot" : "cool") : "";
      const hh = new Date(e.t).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      return `<div class="wk-m ${e.high ? "hi" : ""}"><div class="t"><span>${esc(esName(e.title))}${e.high ? '<i class="al">ALTO</i>' : ""}</span><small>${hh}</small></div>
        <div class="v">${e.actual != null ? `<span class="${hot}">DATO <b>${fmtV(e.actual, e)}</b></span>` : ""}<span>EST <b>${fmtV(e.forecast, e)}</b></span><span>ANT <b>${fmtV(e.previous, e)}</b></span></div></div>`;
    }).join("");
    const earn = (open ? d.earnings : d.earnings.slice(0, 12)).sort((a, b) => mine.has(b.s) - mine.has(a.s) || b.cap - a.cap).map((e) => {
      const rep = e.eps != null, beat = rep && e.est != null ? (e.eps >= e.est ? "pos" : "neg") : "";
      return `<div class="wk-e ${mine.has(e.s) ? "mine" : ""}" data-sym="${esc(e.s)}" title="${esc(e.n)} · cap. US$ ${nf(0).format(e.cap / 1e9)} MM${rep && e.surp != null ? ` · sorpresa ${e.surp > 0 ? "+" : ""}${nf(1).format(e.surp)}%` : ""}">${logo(e.s, e.s, 22)}
        <div style="min-width:0"><span class="tk">${esc(e.s)}</span><span class="es">${rep ? `EPS <b class="${beat}">${nf(2).format(e.eps)}</b> vs ${e.est != null ? nf(2).format(e.est) : "—"}` : `EPS est <b>${e.est != null ? nf(2).format(e.est) : "—"}</b>`}</span></div>
        ${e.when ? `<span class="wk-p ${e.when}">${e.when === "pre" ? "☀ PRE" : "☾ POST"}</span>` : ""}</div>`;
    }).join("");
    const more = d.macro.length > shownM.length || d.earnings.length > 12;
    return `<div class="wk-d ${d.date === today ? "today" : ""}"><div class="wk-h">${DIAS[dt.getDay()]} ${dt.getDate()}<span>${d.macro.length + d.earnings.length} eventos</span></div><div class="wk-b">
      ${mac ? `<div class="wk-s">Economía EE.UU.</div>${mac}` : ""}
      ${earn ? `<div class="wk-s">Resultados · ${d.earnings.length}${d.nEarn > d.earnings.length ? ` <span style="text-transform:none;letter-spacing:0">(de ${d.nEarn}, las de +US$ 15 MM)</span>` : ""}</div>${earn}` : ""}
      ${!mac && !earn ? '<div class="dim" style="font-size:12px;padding:8px">Sin eventos relevantes.</div>' : ""}
      ${more || open ? `<button class="wk-more" data-wkday="${d.date}">${open ? "Ver menos" : "Ver todo"}</button>` : ""}</div></div>`;
  }).join("");
  $("week").querySelectorAll("[data-wkday]").forEach((b) => (b.onclick = () => { const k = b.dataset.wkday; D.wkOpen.has(k) ? D.wkOpen.delete(k) : D.wkOpen.add(k); renderWeek(); }));
  $("week").querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => { if (META.get(x.dataset.sym)) location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym); }));
}

// ---------- Ranking técnico, RSI extremos y sectores/subsectores (data/tech.json, se recalcula cada día hábil) ----------
D.trMode = loadLocal("dash_tr_mode", "all");
async function loadTech() {
  D.tech = await fetch("/data/tech.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!D.tech) { ["tech", "rsi", "secs"].forEach((id) => ($(id).innerHTML = '<div class="dim">Se genera con la próxima actualización diaria.</div>')); return; }
  renderTech(); renderRsi(); renderSecs();
}
const scCol = (r) => (r >= 0.75 ? "#22c55e" : r >= 0.45 ? "#f59e0b" : "#ef4444");
const tkOf = (r) => esc(r.ced || r.s);
const goSym = (el) => el.querySelectorAll("[data-sym]").forEach((x) => (x.onclick = () => (location.href = "/empresa.html?s=" + encodeURIComponent(x.dataset.sym))));
function renderTech() {
  const mine = new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)]);
  $("techR").innerHTML = [["all", "Universo"], ["mine", "Mis acciones"]].map(([k, l]) => `<button data-trm="${k}" class="${k === D.trMode ? "on" : ""}">${l}</button>`).join("");
  $("techR").querySelectorAll("[data-trm]").forEach((b) => (b.onclick = () => { D.trMode = b.dataset.trm; saveLocal("dash_tr_mode", D.trMode); renderTech(); }));
  const rows = D.tech.rows.filter((r) => D.trMode === "all" || mine.has(r.s)).sort((a, b) => b.score - a.score).slice(0, 10);
  const cell = (v, m) => `<td><span class="tr-b"><i><u style="width:${(v / m) * 100}%;background:${scCol(v / m)}"></u></i><span style="color:${scCol(v / m)}">${nf(0).format(v)}</span></span></td>`;
  $("tech").className = "";
  $("tech").innerHTML = rows.length ? `<table class="tr-t"><thead><tr><th>#</th><th class="l">Acción</th><th>Score</th><th title="Precio sobre medias de 50/150/200, medias ordenadas y subiendo">Tend.</th><th title="Rendimiento ponderado 3-12 meses contra el S&P 500">Fuerza</th><th title="Volatilidad y rango achicándose (compresión antes de un movimiento)">Contr.</th><th title="Cerca del máximo de 52 semanas y lejos del mínimo">Setup</th><th title="RS rating: percentil de fuerza relativa contra todo el universo (1-99)">RS</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-sym="${esc(r.s)}"><td class="dim">${i + 1}</td><td class="l"><span class="tr-tk">${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span></td><td class="tr-sc" style="color:${scCol(r.score / 100)}">${r.score}</td>${cell(r.trend, 20)}${cell(r.rs, 25)}${cell(r.contr, 35)}${cell(r.setup, 20)}<td style="color:${scCol(r.rsr / 99)};font-weight:700">${r.rsr}</td></tr>`).join("")}</tbody></table>`
    : '<div class="dim">Ninguna de tus acciones tiene datos técnicos (solo se calculan las que cotizan en EE.UU.).</div>';
  goSym($("tech"));
}
function renderRsi() {
  const r = D.tech.rows.filter((x) => ok(x.rsi));
  const list = (arr, cls) => arr.map((x, i) => `<div class="rsi-r" data-sym="${esc(x.s)}"><span class="n">${i + 1}</span>${logo(x.s, x.ced || x.s, 20)}<b>${tkOf(x)}</b><span class="dim" style="font-size:11.5px">${esc((x.n || "").slice(0, 18))}</span><span class="v ${cls}">${nf(1).format(x.rsi)}</span></div>`).join("");
  $("rsi").className = "";
  $("rsi").innerHTML = `<div class="rsi-l"><h5><span class="dot3" style="background:#ef4444"></span>Sobrecompradas (RSI más alto)</h5>${list([...r].sort((a, b) => b.rsi - a.rsi).slice(0, 5), "ob")}</div>
    <div class="rsi-l"><h5><span class="dot3" style="background:#22c55e"></span>Sobrevendidas (RSI más bajo)</h5>${list([...r].sort((a, b) => a.rsi - b.rsi).slice(0, 5), "os")}</div>`;
  goSym($("rsi"));
}
D.secSel = null;
function renderSecs() {
  const S = D.tech.sectors; if (!S?.length) return;
  const sel = S.find((x) => x.etf === D.secSel) || S[0];
  const c = (v) => (v >= 70 ? "#4ade80" : v >= 40 ? "#fbbf24" : "#f87171");
  const dotE = (v) => `<span class="dot3" style="background:${v >= 0 ? "#22c55e" : "#ef4444"}"></span>`;
  const dotR = (v) => `<span class="dot3" style="background:${v >= 70 ? "#ef4444" : v <= 30 ? "#22c55e" : "#f59e0b"}"></span>`;
  const stocks = D.tech.rows.filter((r) => r.sec === sel.sec).sort((a, b) => b.rsr - a.rsr).slice(0, 9);
  $("secs").className = "";
  $("secs").innerHTML = `<div class="sx-tabs">${S.map((x) => `<button data-sx="${x.etf}" class="${x === sel ? "on" : ""}" title="${esc(SEC_NAME[x.sec] || "")}">${x.etf}<b style="color:${c(x.rsr)}">${x.rsr}</b></button>`).join("")}</div>
    <div class="sx-subs"><span style="border:none;padding-left:0">${esc(SEC_NAME[sel.sec] || sel.etf)} · subsectores:</span>${sel.subs.sort((a, b) => b.rsr - a.rsr).map((u) => `<span title="${esc(u.etf)} · RSI ${nf(1).format(u.rsi)} · ${pt(u.e200)} vs EMA200">${esc(u.l)} <b style="color:${c(u.rsr)}">${u.etf} ${u.rsr}</b></span>`).join("") || '<span>—</span>'}</div>
    <div class="sx-g">${stocks.map((r) => `<div class="sx-c" data-sym="${esc(r.s)}"><div class="h"><span>${logo(r.s, r.ced || r.s, 20)}${tkOf(r)}</span><span class="${r.d1 >= 0 ? "pos" : "neg"}" style="font-size:12px">${r.d1 >= 0 ? "▲" : "▼"}${nf(1).format(Math.abs(r.d1))}%</span></div><div class="nm">${esc(r.n)}</div>
      <div class="kv"><span>vs EMA200</span><b>${dotE(r.e200)}${pt(r.e200)}</b></div><div class="kv"><span>vs SMA50</span><b>${dotE(r.s50)}${pt(r.s50)}</b></div><div class="kv"><span>RSI 14</span><b>${dotR(r.rsi)}${nf(1).format(r.rsi)}</b></div><div class="kv"><span>RS rating</span><b style="color:${c(r.rsr)}">${r.rsr}</b></div></div>`).join("") || '<div class="dim">Sin acciones del universo en este sector.</div>'}</div>`;
  $("secs").querySelectorAll("[data-sx]").forEach((b) => (b.onclick = () => { D.secSel = b.dataset.sx; renderSecs(); }));
  goSym($("secs"));
}
const SEC_NAME = { tech: "Tecnología", fin: "Financiero", health: "Salud", discr: "Consumo discrecional", staples: "Consumo básico", energy: "Energía", ind: "Industrial", mat: "Materiales", util: "Servicios públicos", re: "Bienes raíces", comm: "Comunicaciones" };

async function loadAll() {
  $("dot").className = "dot load"; $("statusTxt").textContent = "Cargando…";
  const res = await Promise.allSettled([
    loadTape(), loadMarket(), loadRegime(), loadMap(), loadWeek(), loadTech(), loadSectors(), loadMacro(), loadCrypto(), loadDolar(),
    loadUniverse().then(() => {
      const syms = [...new Set([...watchSymbols(), ...getPortfolio().positions.map((p) => p.s)])].filter((s) => META.get(s)?.[3] !== "AR");
      const all = UNIVERSE.filter((r) => r[3] !== "AR" && !r[4].includes("REF")).map((r) => r[0]);
      $("earn").className = ""; renderEarnings($("earn"), syms, (s) => META.get(s)?.[5] || s, all, (s) => D.mcap.get(s));
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
