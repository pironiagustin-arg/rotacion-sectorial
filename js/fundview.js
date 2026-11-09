// Bloque Fundamentals estilo Koyfin dentro de la ficha de empresa: cabecera, crecimiento y valoración,
// precio, múltiplos históricos diarios (Valoración) y estados trimestrales/anuales (Negocio).
// Datos: /api/fundamentals?symbol=X&detail=1 (SEC + Yahoo).
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (+v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dLabel = (s) => { const [y, m] = s.split('-'); return `${MES[+m - 1]} ${y.slice(2)}`; };
const dLong = (s) => { const [y, m, d] = s.split('-'); return `${+d} ${MES[+m - 1]} ${y}`; };

const F = {
  x: (v) => nf(v, 1) + 'x',
  x2: (v) => nf(v, 2) + 'x',
  pct: (v) => nf(v, 1) + '%',
  usd: (v) => '$' + nf(v, 2),
  px: (v) => '$' + nf(v, Math.abs(v) >= 10 ? 0 : 2),
  big: (v) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); return a >= 1e12 ? nf(v / 1e12, 2) + ' T' : a >= 1e9 ? nf(v / 1e9, a >= 1e10 ? 0 : 1) + ' B' : nf(v / 1e6, a >= 1e7 ? 0 : 1) + ' M'; },
  sh: (v) => nf(v / 1e6, Math.abs(v) < 1e9 ? 2 : 0) + ' M',
  ratio: (v) => nf(v, Math.abs(v) < 10 ? 2 : 1) + 'x',
};

const HELP = {
  price: 'Precio de cierre diario.',
  epsprice: 'Variación % del BPA de los últimos 12 meses y del precio desde el inicio del rango elegido. Si el precio corre más que las ganancias, el PER sube (se encarece); si corre menos, se abarata.',
  dd: 'Drawdown: cuánto está el precio por debajo de su máximo previo.',
  per: 'PER = capitalización / beneficio neto de los últimos 12 meses.',
  peg: 'Curva: PEG histórico = PER ÷ crecimiento anual compuesto real del BPA de los 3 años previos (en %). Arriba: PEG proyectado = PER actual ÷ crecimiento esperado del BPA (consenso de analistas). Debajo de 1 = barata para lo que crece.',
  ps: 'Precio / ventas = capitalización / ingresos de los últimos 12 meses.',
  pfcf: 'Capitalización / flujo de caja libre (operativo − capex) de 12 meses.',
  pocf: 'Capitalización / flujo de caja operativo de 12 meses.',
  pop: 'Capitalización / resultado operativo (EBIT operativo) de 12 meses.',
  evebitda: 'Valor empresa (cap. + deuda − caja) / EBITDA de 12 meses.',
  evebit: 'Valor empresa / EBIT de 12 meses.',
  rev: 'Ingresos del período.', eps: 'Ganancia por acción diluida.', fcf: 'Flujo operativo − inversiones en capital (capex).',
  marg: 'Márgenes sobre ventas: bruto, operativo, neto y de flujo de caja libre.', ni: 'Beneficio neto.', ebitda: 'Resultado antes de intereses, impuestos, depreciaciones y amortizaciones.',
  ocf: 'Caja generada por la operación.', debt: 'Deuda total vs caja + inversiones de corto plazo.', shares: 'Acciones en circulación: si baja, la empresa recompra; si sube, diluye.',
  rent: 'ROE = beneficio 12m / patrimonio · ROA = beneficio 12m / activos · ROIC = EBIT×(1−impuesto) / capital invertido.',
  sbc: 'Pagos a empleados en acciones (costo real que diluye al accionista).', liq: 'Liquidez corriente = activo corriente / pasivo corriente · Deuda / patrimonio.',
};


// ── Guía al tocar "?": qué es, cuándo es bueno o malo, y qué le está pasando a esta acción ──
const GUIDE = {
  price: { good: "Sube = el mercado paga más por la empresa.", bad: "Baja sostenida sin que caigan las ganancias = puede abaratarse.", dir: 0 },
  epsprice: { good: "Ganancias subiendo más que el precio = la acción se abarata con fundamentos (potencial atraso).", bad: "Precio subiendo mucho más que las ganancias = la suba es por expectativa; más riesgo si las ganancias no acompañan.", trap: "Con ganancias de pico de ciclo, que el precio quede atrás puede ser el mercado anticipando la caída.", dir: 0 },
  per: { good: "Más bajo = más barata por cada dólar de ganancia.", bad: "Más alto = el mercado ya paga mucho crecimiento futuro.", trap: "Ojo: un PER bajo en una cíclica en el pico (ej. memorias, petroleras) suele ser una trampa: las ganancias están infladas y van a caer.", dir: -1 },
  peg: { good: "Menor a 1 = barata para lo que crece. 1–2 = razonable.", bad: "Mayor a 2 = pagás caro el crecimiento.", trap: "Solo sirve con crecimiento estable; en cíclicas o con un año extraordinario da números engañosos.", dir: -1 },
  ps: { good: "Más bajo = más barata por cada dólar de ventas.", bad: "Más alto = exige márgenes altos o mucho crecimiento.", trap: "Compará solo contra su propia historia o el mismo sector: un software y un supermercado tienen P/V muy distintos.", dir: -1 },
  pfcf: { good: "Más bajo = más caja libre por cada dólar invertido.", bad: "Más alto = poca caja libre para lo que vale.", trap: "Sube si la empresa está invirtiendo fuerte (capex alto): no siempre es malo.", dir: -1 },
  pocf: { good: "Más bajo = más barata contra la caja que genera el negocio.", bad: "Más alto = cara contra su caja operativa.", dir: -1 },
  pop: { good: "Más bajo = más barata contra su ganancia operativa.", bad: "Más alto = cara contra lo que gana el negocio en sí.", dir: -1 },
  evebitda: { good: "Más bajo = más barata incluyendo su deuda.", bad: "Más alto = cara; tiene en cuenta deuda y caja, mejor para comparar empresas apalancadas.", trap: "No aplica a bancos ni aseguradoras.", dir: -1 },
  evebit: { good: "Más bajo = más barata incluyendo deuda y amortizaciones.", bad: "Más alto = cara.", dir: -1 },
  rev: { good: "Sube = el negocio crece.", bad: "Baja = pierde ventas o el ciclo se da vuelta.", dir: 1 },
  eps: { good: "Sube = cada acción gana más.", bad: "Baja = cae la ganancia por acción.", trap: "Si el BPA crece más que el beneficio neto, es porque recompra acciones.", dir: 1 },
  fcf: { good: "Sube = más caja libre para dividendos, recompras o bajar deuda.", bad: "Baja o negativo = gasta más de lo que genera.", trap: "Puede bajar por inversiones fuertes que van a dar fruto después.", dir: 1 },
  marg: { good: "Márgenes que suben = poder de precios o eficiencia.", bad: "Márgenes que caen = más competencia o costos.", dir: 1 },
  ni: { good: "Sube = gana más.", bad: "Baja = gana menos.", dir: 1 },
  ebitda: { good: "Sube = el negocio operativo genera más.", bad: "Baja = se debilita la operación.", dir: 1 },
  ocf: { good: "Sube = entra más caja por la operación.", bad: "Baja = cobra peor o vende menos.", dir: 1 },
  debt: { good: "Más caja que deuda (caja neta) = colchón ante crisis.", bad: "Deuda creciendo más rápido que la caja = más riesgo.", trap: "En bancos y financieras la deuda es parte del negocio (es su fondeo).", dir: 0 },
  shares: { good: "Bajan = recompra acciones: cada acción queda dueña de una parte mayor de la empresa (positivo).", bad: "Suben = emite acciones (dilución): tu parte se achica.", dir: -1 },
  rent: { good: "ROE/ROIC altos y estables = negocio con ventaja competitiva. ROIC > 15% es muy bueno.", bad: "Bajando = rinde menos el capital.", trap: "ROE muy alto con ROIC normal suele ser por deuda o por recompras que achican el patrimonio.", dir: 1 },
  sbc: { good: "Bajo contra ventas (< 5%) = poca dilución.", bad: "Alto (> 10% de ventas) = paga sueldos con acciones y diluye; es un costo real aunque no salga de caja.", dir: -1 },
  liq: { good: "Liquidez corriente > 1,5 = paga cómodo lo de corto plazo. Deuda/patrimonio < 1 = poco apalancada.", bad: "Liquidez < 1 o deuda/patrimonio > 2 = más riesgo financiero.", trap: "En bancos, tarjetas (como AXP) y aseguradoras estos ratios no se leen así: su deuda es su materia prima y no clasifican activos corrientes.", dir: 0 },
};
const isFin = () => /financial/i.test(D?.head?.sector || "");
const pct = (a, b) => (a != null && b != null && b !== 0 ? (a / Math.abs(b) - 1) * 100 : null);
const sgnp = (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + nf(v, d) + "%");
function firstLast(rows, k) { const v = rows.filter((r) => r[k] != null && isFinite(r[k])); return v.length >= 2 ? [v[0], v.at(-1), v.length] : null; }
function readBiz(k) {
  const rows = (PERIOD === "q" ? D.quarters : D.years).slice(-(PERIOD === "q" ? NQ : NY)), per = PERIOD === "q" ? "trimestres" : "años";
  const g = GUIDE[k], b = BIZ.find((x) => x.id === k), fl = (key) => firstLast(rows, key);
  const out = [];
  if (k === "shares") {
    const f = fl("shares"); if (!f) return "";
    const ch = pct(f[1].shares, f[0].shares);
    out.push(ch < -0.5 ? `Bajó ${nf(-ch, 1)}% en ${f[2]} ${per}: está <b class="pos">recomprando acciones</b>, cada acción queda dueña de más ganancia.` : ch > 0.5 ? `Subió ${nf(ch, 1)}% en ${f[2]} ${per}: <b class="neg">dilución</b>, tu parte de la empresa se achica.` : "Casi sin cambios: no recompra ni diluye de forma relevante.");
    const fe = fl("eps"), fn = fl("ni");
    if (fe && fn && ch < -0.5) out.push(`Por eso el BPA (${sgnp(pct(fe[1].eps, fe[0].eps))}) crece más que el beneficio neto (${sgnp(pct(fn[1].ni, fn[0].ni))}).`);
  } else if (k === "sbc") {
    const l = [...rows].reverse().find((r) => r.sbc != null && r.rev);
    if (!l) return "";
    const sr = (l.sbc / l.rev) * 100, sf = l.fcf > 0 ? (l.sbc / l.fcf) * 100 : null;
    out.push(`En ${l.label} equivale al <b class="${sr > 10 ? "neg" : sr > 5 ? "mid" : "pos"}">${nf(sr, 1)}% de las ventas</b>${sf != null ? ` y al ${nf(sf, 0)}% del flujo de caja libre` : ""}: ${sr > 10 ? "alto, diluye bastante" : sr > 5 ? "moderado" : "bajo, poca dilución"}.`);
    const fs = fl("shares"); if (fs) { const ch = pct(fs[1].shares, fs[0].shares); out.push(ch < 0 ? `Igual las acciones bajaron ${nf(-ch, 1)}%: las recompras compensan esa dilución.` : `Y las acciones subieron ${nf(ch, 1)}%: la dilución no se compensa con recompras.`); }
  } else if (k === "liq") {
    const l = [...rows].reverse().find((r) => r.cur != null || r.de != null); if (!l) return isFin() ? "No se publica para esta empresa: es financiera." : "";
    if (l.cur != null) out.push(`Liquidez corriente <b class="${l.cur >= 1.5 ? "pos" : l.cur >= 1 ? "mid" : "neg"}">${nf(l.cur, 2)}</b>: ${l.cur >= 1.5 ? "paga cómodo sus deudas de corto plazo" : l.cur >= 1 ? "alcanza justo para lo de corto plazo" : "tiene más deudas de corto plazo que activos líquidos"}.`);
    if (l.de != null) out.push(`Deuda/patrimonio <b class="${l.de < 1 ? "pos" : l.de <= 2 ? "mid" : "neg"}">${nf(l.de, 2)}</b>: ${l.de < 0.5 ? "casi sin deuda" : l.de < 1 ? "deuda moderada" : l.de <= 2 ? "apalancada" : "muy apalancada"}.`);
    if (isFin()) out.push("Como es una financiera, tomalo con pinzas: su deuda es su fondeo.");
  } else if (k === "debt") {
    const l = [...rows].reverse().find((r) => r.debt != null || r.cash != null); if (!l) return "";
    const net = (l.cash ?? 0) - (l.debt ?? 0);
    out.push(isFin() ? "Financiera: la deuda es su fondeo, no se lee como riesgo directo." : net >= 0 ? `Tiene <b class="pos">caja neta de ${F.big(net)}</b> (más caja que deuda).` : `Tiene <b class="${-net > (l.cash || 0) ? "neg" : "mid"}">deuda neta de ${F.big(-net)}</b>.`);
    const fd = fl("debt"); if (fd) { const ch = pct(fd[1].debt, fd[0].debt); if (Math.abs(ch) > 15) out.push(`La deuda ${ch > 0 ? "subió" : "bajó"} ${nf(Math.abs(ch), 0)}% en ${fd[2]} ${per}.`); }
  } else if (k === "rent") {
    const l = [...rows].reverse().find((r) => r.roe != null || r.roic != null); if (!l) return "";
    if (l.roic != null) out.push(`ROIC ${nf(l.roic, 1)}%: <b class="${l.roic >= 15 ? "pos" : l.roic >= 8 ? "mid" : "neg"}">${l.roic >= 15 ? "excelente uso del capital" : l.roic >= 8 ? "aceptable" : "rinde poco el capital"}</b>.`);
    if (l.roe != null && l.roic != null && l.roe > l.roic * 1.8) out.push(`El ROE (${nf(l.roe, 0)}%) muy por encima del ROIC indica deuda o recompras que achican el patrimonio.`);
    const f = fl("roe"); if (f) { const d = f[1].roe - f[0].roe; if (Math.abs(d) > 3) out.push(`El ROE ${d > 0 ? "mejoró" : "empeoró"} ${nf(Math.abs(d), 0)} puntos en ${f[2]} ${per}.`); }
  } else if (k === "marg") {
    for (const [key, nm] of [["mGross", "bruto"], ["mOp", "operativo"], ["mFcf", "de FCF"]]) { const f = fl(key); if (f) { const d = f[1][key] - f[0][key]; out.push(`Margen ${nm}: ${nf(f[0][key], 1)}% → ${nf(f[1][key], 1)}% (<span class="${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : ""}${nf(d, 1)} pp</span>).`); } }
  } else {
    const key = b?.series[0].k, f = key && fl(key); if (!f) return "";
    const ch = pct(f[1][key], f[0][key]), good = (ch ?? 0) * (g.dir || 1) >= 0;
    out.push(`En ${f[2]} ${per} pasó de ${b.fmt(f[0][key])} a ${b.fmt(f[1][key])} (<b class="${good ? "pos" : "neg"}">${sgnp(ch)}</b>): ${good ? "positivo" : "negativo"}.`);
    if (k === "eps") { const fn = fl("ni"); if (fn) { const cn = pct(fn[1].ni, fn[0].ni); if (ch - cn > 3) out.push(`Crece más que el beneficio neto (${sgnp(cn)}) gracias a las recompras.`); } }
    if (k === "fcf") { const fo = fl("ocf"); if (fo && ch < 0 && pct(fo[1].ocf, fo[0].ocf) > 0) out.push("El flujo operativo sí creció: la caída viene de más inversión (capex), no de un peor negocio."); }
  }
  return out.join(" ");
}
function readVal(k) {
  const j0 = cutoff(D.prices.d, VRANGE), arr = (k === "price" ? D.prices.c : D.mult[k] || []).slice(j0).filter((x) => x != null && isFinite(x));
  if (arr.length < 5) return "";
  const now = arr.at(-1), avg = arr.reduce((a, b) => a + b, 0) / arr.length, lo = Math.min(...arr), hi = Math.max(...arr);
  if (k === "epsprice") { const e = epsVsPrice(j0); return e.gap == null ? "" : `En ${VRANGE} el BPA ${e.eL >= 0 ? "subió" : "bajó"} ${nf(Math.abs(e.eL), 0)}% y el precio ${e.pL >= 0 ? "subió" : "bajó"} ${nf(Math.abs(e.pL), 0)}%: ${Math.abs(e.gap) < 5 ? "el precio acompaña a las ganancias" : e.gap > 0 ? `<b class="neg">el precio se adelantó ${nf(e.gap, 0)} puntos</b>, por eso el PER subió` : `<b class="pos">el precio quedó ${nf(-e.gap, 0)} puntos atrás de las ganancias</b>, por eso el PER bajó`}.`; }
  if (k === "price") return `En ${VRANGE} ${now >= arr[0] ? "subió" : "bajó"} ${nf(Math.abs(pct(now, arr[0])), 1)}%; está ${nf(Math.abs(pct(now, hi)), 1)}% debajo del máximo del período.`;
  const d = pct(now, avg), pos = hi > lo ? ((now - lo) / (hi - lo)) * 100 : 50, fx = VAL[k][1];
  const out = [`Hoy ${fx(now)} contra un promedio de ${fx(avg)} en ${VRANGE}: <b class="${d < -5 ? "pos" : d > 5 ? "neg" : "mid"}">${Math.abs(d) < 5 ? "en su promedio" : d < 0 ? `${nf(-d, 0)}% más barata que su promedio` : `${nf(d, 0)}% más cara que su promedio`}</b>${pos < 15 ? ", cerca del piso del período" : pos > 85 ? ", cerca del techo del período" : ""}.`];
  if (k === "per" && d < -15) { const q = D.quarters.slice(-5).filter((r) => r.ni != null); if (q.length >= 5 && pct(q.at(-1).ni, q[0].ni) > 40) out.push(`Pero el beneficio creció ${nf(pct(q.at(-1).ni, q[0].ni), 0)}% en un año: parte del abaratamiento viene de ganancias muy altas; confirmá que sean sostenibles.`); }
  if (k === "peg" && D.head.pegFwd != null) out.push(`Con el crecimiento esperado por analistas da ${nf(D.head.pegFwd, 2)}: ${D.head.pegFwd < 1 ? "barata para lo que se espera que crezca" : D.head.pegFwd <= 2 ? "razonable" : "cara para lo que se espera que crezca"}.`);
  return out.join(" ");
}
function openGuide(btn) {
  ROOT.querySelectorAll(".kf-pop").forEach((x) => x.remove());
  const k = btn.dataset.q, g = GUIDE[k] || {}, card = btn.closest(".kf-ch");
  const read = VIEW === "val" ? readVal(k) : readBiz(k);
  const dirTxt = g.dir === 1 ? "Mejor si <b>sube</b>." : g.dir === -1 ? "Mejor si es <b>más bajo</b>." : "Depende del contexto.";
  const pop = document.createElement("div"); pop.className = "kf-pop";
  pop.innerHTML = `<button class="kf-px" aria-label="Cerrar">×</button><div class="kf-pq">Qué es</div><div>${esc(HELP[k] || "")}</div>
    <div class="kf-pq">Cómo leerlo · ${dirTxt}</div><div><span class="pos">▲</span> ${esc(g.good || "")}</div><div><span class="neg">▼</span> ${esc(g.bad || "")}</div>${g.trap ? `<div class="kf-pt">⚠ ${esc(g.trap)}</div>` : ""}
    ${read ? `<div class="kf-pq">Qué pasa en ${esc(D.symbol)}</div><div>${read}</div>` : ""}`;
  card.appendChild(pop);
  pop.querySelector(".kf-px").onclick = (e) => { e.stopPropagation(); pop.remove(); };
}
document.addEventListener("click", (e) => {
  const q = e.target.closest?.(".kf-q");
  if (q && ROOT?.contains(q)) { e.stopPropagation(); const open = q.closest(".kf-ch").querySelector(".kf-pop"); open ? open.remove() : openGuide(q); return; }
  if (!e.target.closest?.(".kf-pop")) ROOT?.querySelectorAll(".kf-pop").forEach((x) => x.remove());
});

const CACHE = new Map();
let D = null, SYM = null, ROOT = null, VIEW = "val", PRANGE = "2A", VRANGE = "2A", SHOW_AVG = true, PERIOD = "q", NQ = 8, NY = 10;
const CH = [];

const cutoff = (dates, r) => {
  if (r === "5A") return 0;
  const last = new Date(dates.at(-1));
  const from = r === "YTD" ? new Date(Date.UTC(last.getUTCFullYear(), 0, 1)) : new Date(+last - { "1S": 7, "1M": 30, "6M": 182, "1A": 365, "2A": 730, "3A": 1095 }[r] * 864e5);
  const iso = from.toISOString().slice(0, 10);
  const i = dates.findIndex((d) => d >= iso); return i < 0 ? 0 : i;
};

// Monta (o vuelve a montar tras un re-render de la ficha) el bloque en `el`
export async function mountFundView(el, sym) {
  if (!el) return;
  ROOT = el; SYM = sym;
  if (CACHE.has(sym)) { D = CACHE.get(sym); return render(); }
  el.innerHTML = `<div class="kf-card kf-load">Cargando fundamentals de ${esc(sym)}…</div>`;
  try {
    const r = await fetch("/api/fundamentals?detail=1&symbol=" + encodeURIComponent(sym));
    const j = await r.json(); if (!r.ok || !j.mult) throw new Error(j.error || "HTTP " + r.status);
    CACHE.set(sym, j);
    if (SYM !== sym || !ROOT.isConnected) return;
    D = j; render();
  } catch (e) { if (SYM === sym && ROOT.isConnected) ROOT.innerHTML = `<div class="kf-card kf-load">No se pudieron traer los fundamentals: ${esc(e.message)}</div>`; }
}
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => D && ROOT?.isConnected && drawAll(), 150); });

function seg(opts, cur, attr) { return `<div class="kf-seg">${opts.map(([k, l]) => `<button data-${attr}="${k}" class="${String(k) === String(cur) ? "on" : ""}">${l}</button>`).join("")}</div>`; }

function render() {
  const h = D.head, el = ROOT;
  const dom = (() => { try { return new URL(h.website).hostname.replace(/^www\./, ""); } catch { return null; } })();
  const asOf = new Date(D.asOf); const asTxt = `Datos al ${asOf.getDate()} ${MES[asOf.getMonth()]}`;
  const t = D.table, iCur = t.cols.indexOf("Últ. 12M"), nEst = t.cols.length - iCur - 1;
  const cell = (row, v, i) => {
    if (v == null) return `<td class="kf-n na ${i === iCur + 1 ? "sep" : ""}">—</td>`;
    const txt = row.pct ? (v > 0 ? "+" : "") + nf(v, 0) + "%" : nf(v, 1);
    return `<td class="kf-n ${row.pct ? (v >= 0 ? "pos" : "neg") : ""} ${i === iCur && !row.pct ? "b" : ""} ${i === iCur + 1 ? "sep" : ""}">${txt}</td>`;
  };
  const ini = esc(D.symbol.slice(0, 2));
  el.innerHTML = `
    <div class="kf-top">
      <div class="kf-left">
        <div class="kf-card kf-head">
          <div class="kf-id">
            <div class="kf-logo">${dom ? `<img src="https://www.google.com/s2/favicons?domain=${esc(dom)}&sz=128" alt="" onerror="this.outerHTML='<span>${ini}</span>'">` : `<span>${ini}</span>`}</div>
            <div><div class="kf-name">${esc(h.name)}</div><div class="kf-mut">${esc(D.symbol)} · ${esc(h.sector || "")}</div></div>
          </div>
          <div class="kf-stats">
            <div><b>${F.big(h.mcap)} $</b><span>Capitalización</span></div>
            <div><b>${h.fpe != null ? nf(h.fpe, 1) + "x" : "—"}</b><span title="${h.fpeSrc === "ntm" ? "Precio ÷ BPA estimado de los próximos 12 meses (mezcla del año fiscal en curso y el siguiente, consenso Yahoo)" : "Forward P/E de Yahoo (año fiscal siguiente)"}">Fwd P/E (NTM)</span></div>
            <div><b>${nf(h.price, 2)} US$</b><span>Precio ${h.chg != null ? `<i class="${h.chg >= 0 ? "up" : "dn"}">${h.chg >= 0 ? "▲ +" : "▼ "}${nf(h.chg, 2)}%</i>` : ""}</span></div>
            <small>${h.divY > 0 ? `Dividendo ${nf(h.divY, 2)}%${h.payout != null ? ` · payout ${nf(h.payout, 0)}%` : ""} · ` : h.divY === 0 || h.divY == null ? "Sin dividendo · " : ""}${asTxt}</small>
          </div>
        </div>
        <div class="kf-card">
          <h4 class="kf-h">Crecimiento y valoración</h4>
          <div class="kf-tw"><table class="kf-tbl"><thead><tr><th class="l"></th>${t.cols.map((c, i) => `<th class="${i === iCur + 1 ? "sep" : ""}">${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr><td class="l">${esc(r.k)}</td>${r.v.map((v, i) => cell(r, v, i)).join("")}</tr>`).join("")}</tbody></table></div>
          <div class="kf-note">10A/5A/3A: crecimiento anual compuesto · PER y P/V: mediana del período${nEst ? " · e = estimación de analistas (AF = año fiscal)" : ""} · ${esc(D.source)}</div>
        </div>
      ${techCard()}
      </div>
      <div class="kf-card kf-price">
        <div class="kf-row" id="kfPR"></div>
        <div class="fc" data-c="top"></div>
        <div class="kf-ddl" id="kfDDl"></div>
        <div class="fc" data-c="dd"></div>
      </div>
    </div>
    <div class="kf-switch">${seg([["neg", "Negocio"], ["val", "Valoración"]], VIEW, "view")}</div>
    <div class="kf-card kf-ctrl" id="kfCtrl"></div>
    <div class="kf-grid" id="kfGrid"></div>
    <div id="kfDiff"></div>`;
  el.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { VIEW = b.dataset.view; render(); }));
  renderBody();
}

// Score técnico (0-100): tendencia 20 + fuerza relativa vs S&P 25 + contracción de volatilidad 35 + setup 20
function techCard() {
  const T = D.tech; if (!T) return "";
  const col = (r) => (r >= 0.75 ? "#22c55e" : r >= 0.45 ? "#f59e0b" : "#ef4444");
  const sc = T.score, C = 2 * Math.PI * 34, c0 = col(sc / 100);
  const bar = (l, v, m, tip) => `<div class="kt-r" title="${esc(tip)}"><span>${l}</span><i><u style="width:${(v / m) * 100}%;background:${col(v / m)}"></u></i><b>${nf(v, v % 1 ? 1 : 0)}/${m}</b></div>`;
  return `<div class="kf-card kt"><h4 class="kf-h">Score técnico <button class="kf-q2" title="Puntaje de 0 a 100 al estilo Minervini. Tendencia (20): precio sobre sus medias de 50/150/200 y medias ordenadas y subiendo. Fuerza RS (25): rendimiento ponderado de 3, 6, 9 y 12 meses contra el S&P 500. Contracción (35): volatilidad y rango de los últimos días contra los últimos 3 meses; si se achican, la acción se está comprimiendo antes de un movimiento. Setup (20): cerca de su máximo de 52 semanas y lejos del mínimo. Más de 70 = acción técnicamente fuerte; menos de 40 = débil.">?</button></h4>
    <div class="kt-in"><svg viewBox="0 0 84 84" class="kt-g"><circle cx="42" cy="42" r="34" fill="none" stroke="var(--panel2)" stroke-width="7"/><circle cx="42" cy="42" r="34" fill="none" stroke="${c0}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * sc) / 100} ${C}" transform="rotate(-90 42 42)"/><text x="42" y="49" text-anchor="middle" font-size="22" font-weight="800" fill="${c0}">${sc}</text></svg>
      <div class="kt-bars">${bar("Tendencia", T.trend, 20, T.checks.map(([ok2, l]) => (ok2 ? "✓ " : "✗ ") + l).join("\n"))}${bar("Fuerza RS", T.rs, 25, `Rendimiento ponderado ${T.rsDiff >= 0 ? "+" : ""}${nf(T.rsDiff, 1)} pts vs S&P 500`)}${bar("Contracción", T.contr, 35, `Volatilidad 10 días / 60 días: ${nf(T.volR, 2)} · rango 15 días / 60 días: ${nf(T.rngR, 2)} (menos de 1 = se comprime)`)}${bar("Setup", T.setup, 20, `${nf(T.fromHi, 1)}% del máximo de 52 semanas · +${nf(T.fromLo, 0)}% del mínimo`)}</div></div>
    <div class="kt-rg"><div class="kt-rl"><span>Posición en el rango de 52 semanas</span><b>${T.pos}%</b></div><div class="kt-bar"><i style="left:${T.pos}%"></i></div><div class="kt-rl dim"><span>$${nf(T.lo, 2)} mín.</span><span>$${nf(T.hi, 2)} máx.</span></div></div></div>`;
}

function renderBody() {
  const ctrl = $("#kfCtrl", ROOT), grid = $("#kfGrid", ROOT);
  const avgTog = `<label class="kf-tog"><input type="checkbox" id="kfAvg" ${SHOW_AVG ? "checked" : ""}><i></i>Promedio del período</label>`;
  if (VIEW === "val") {
    ctrl.innerHTML = seg(["YTD", "1M", "6M", "1A", "2A", "3A", "5A"].map((k) => [k, k]), VRANGE, "vr") + avgTog;
    const cards = [["price", "Precio de la acción"], ["epsprice", "BPA vs precio"], ["per", "PER"], ["peg", "PEG"], ["ps", "Precio / ventas"], ["pfcf", "Precio / flujo de caja libre"], ["pocf", "Precio / flujo de caja operativo"], ["pop", "Precio / resultado operativo"], ["evebitda", "VE / EBITDA"], ["evebit", "VE / EBIT"]]
      .filter(([k]) => k === "price" || (k === "epsprice" ? D.mult.per.some((v) => v != null) : (D.mult[k] || []).some((v) => v != null)));
    grid.innerHTML = cards.map(([k, l]) => card(k, l)).join("") + (cards.length < 10 ? `<div class="kf-card kf-miss">Sin datos para ${10 - cards.length} múltiplo(s): no aplican a este tipo de empresa (ej. bancos) o no hay estados contables.</div>` : "");
    ctrl.querySelectorAll("[data-vr]").forEach((b) => (b.onclick = () => { VRANGE = b.dataset.vr; renderBody(); }));
  } else {
    const all = PERIOD === "q" ? D.quarters : D.years, n = PERIOD === "q" ? NQ : NY;
    const opts = PERIOD === "q" ? [[8, "8T"], [12, "12T"], [20, "5 años"], [40, "10 años"]] : [[5, "5 años"], [10, "10 años"], [99, "Todo"]];
    ctrl.innerHTML = seg([["q", "Trimestral"], ["y", "Anual"]], PERIOD, "per") + seg(opts.filter(([k]) => k <= Math.max(all.length, opts[0][0])), n, "n") + avgTog
      + `<span class="kf-mut">${Math.min(n, all.length)} de ${all.length} ${PERIOD === "q" ? "trimestres" : "ejercicios"} disponibles</span>`;
    const rows = all.slice(-n);
    grid.innerHTML = BIZ.filter((b) => b.series.some((s) => rows.some((r) => r[s.k] != null))).map((b) => card(b.id, b.title, b.series.length > 1 ? b.series : b.id === "rev" ? [{ c: "#3b82f6", n: "Ingresos" }, { c: "#fbbf24", n: PERIOD === "q" ? "Crec. vs mismo trim. año anterior" : "Crec. anual" }] : null)).join("");
    ctrl.querySelectorAll("[data-per]").forEach((b) => (b.onclick = () => { PERIOD = b.dataset.per; renderBody(); }));
    ctrl.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { if (PERIOD === "q") NQ = +b.dataset.n; else NY = +b.dataset.n; renderBody(); }));
  }
  $("#kfAvg", ROOT).onchange = (e) => { SHOW_AVG = e.target.checked; drawAll(); };
  drawAll();
}

const pegNote = () => { const h = D.head; return h.pegFwd != null ? `<div class="kf-peg">Proyectado hoy: <b>${nf(h.pegFwd, 2)}</b> <span>= PER ${nf(h.perNow, 1)} ÷ crec. esperado ${nf(h.gProj, 1)}%</span></div>` : ""; };
const card = (k, title, legend) => `<div class="kf-card kf-ch"><button class="kf-q" data-q="${k}" aria-label="Cómo leer ${esc(title)}">?</button><h5>${esc(title)}${k === "peg" ? ' <span class="kf-mut">(histórico, crec. real 3 años)</span>' : ""}</h5>${k === "peg" ? pegNote() : ""}${k === "epsprice" ? '<div class="kf-leg"><span><i style="background:#22c55e"></i>BPA 12 meses</span><span><i style="background:#3b82f6"></i>Precio</span></div><div class="kf-peg" id="kfEPl"></div>' : ""}
  ${legend ? `<div class="kf-leg">${legend.map((s) => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join("")}</div>` : ""}<div class="fc" data-c="${k}"></div></div>`;

const BIZ = [
  { id: 'rev', title: 'Ingresos', kind: 'bar', fmt: F.big, series: [{ k: 'rev', n: 'Ingresos', c: '#3b82f6' }] },
  { id: 'eps', title: 'BPA (ganancia por acción)', kind: 'bar', fmt: F.usd, series: [{ k: 'eps', n: 'BPA', c: '#22c55e' }] },
  { id: 'fcf', title: 'Flujo de caja libre', kind: 'bar', fmt: F.big, series: [{ k: 'fcf', n: 'FCF', c: '#14b8a6' }] },
  { id: 'marg', title: 'Márgenes', kind: 'lines', fmt: F.pct, series: [{ k: 'mGross', n: 'Bruto', c: '#3b82f6' }, { k: 'mOp', n: 'Operativo', c: '#f59e0b' }, { k: 'mNet', n: 'Neto', c: '#22c55e' }, { k: 'mFcf', n: 'FCF', c: '#a78bfa' }] },
  { id: 'ni', title: 'Beneficio neto', kind: 'bar', fmt: F.big, series: [{ k: 'ni', n: 'Beneficio neto', c: '#a78bfa' }] },
  { id: 'ebitda', title: 'EBITDA', kind: 'bar', fmt: F.big, series: [{ k: 'ebitda', n: 'EBITDA', c: '#d97706' }] },
  { id: 'ocf', title: 'Flujo de caja operativo', kind: 'bar', fmt: F.big, series: [{ k: 'ocf', n: 'Flujo operativo', c: '#38bdf8' }] },
  { id: 'debt', title: 'Deuda y efectivo', kind: 'bar', fmt: F.big, series: [{ k: 'debt', n: 'Deuda', c: '#ef4444' }, { k: 'cash', n: 'Efectivo', c: '#22c55e' }] },
  { id: 'shares', title: 'Acciones en circulación', kind: 'lines', area: true, fmt: F.sh, series: [{ k: 'shares', n: 'Acciones', c: '#94a3b8' }] },
  { id: 'rent', title: 'Rentabilidad (ROE · ROA · ROIC)', kind: 'lines', fmt: F.pct, series: [{ k: 'roe', n: 'ROE', c: '#22c55e' }, { k: 'roa', n: 'ROA', c: '#3b82f6' }, { k: 'roic', n: 'ROIC', c: '#f59e0b' }] },
  { id: 'sbc', title: 'Remuneración en acciones', kind: 'bar', fmt: F.big, series: [{ k: 'sbc', n: 'Remuneración en acciones', c: '#ec4899' }] },
  { id: 'liq', title: 'Liquidez corriente y deuda / patrimonio', kind: 'lines', fmt: F.ratio, series: [{ k: 'cur', n: 'Liquidez corriente', c: '#eab308' }, { k: 'de', n: 'Deuda / patrimonio', c: '#ef4444' }] },
];
// Fila "hoy vs promedio": cuánto se aleja cada múltiplo de su promedio en la temporalidad elegida
const DIFF = [["per", "PER"], ["peg", "PEG"], ["ps", "P / ventas"], ["pfcf", "P / FCF"], ["pocf", "P / flujo operativo"], ["pop", "P / resultado op."], ["evebitda", "VE / EBITDA"], ["evebit", "VE / EBIT"]];
function diffRow(j0) {
  const tiles = DIFF.map(([k, l]) => {
    const fx = VAL[k]?.[1] || F.x;
    const v = (D.mult[k] || []).slice(j0).filter((x) => x != null && isFinite(x));
    if (v.length < 5) return "";
    const now = v.at(-1), avg = v.reduce((a, b) => a + b, 0) / v.length, lo = Math.min(...v), hi = Math.max(...v);
    const d = (now / avg - 1) * 100, pos = (x) => (hi > lo ? ((x - lo) / (hi - lo)) * 100 : 50);
    const cls = Math.abs(d) < 5 ? "eq" : d < 0 ? "cheap" : "exp";
    return `<div class="kf-dt ${cls}">
      <div class="kf-dl">${esc(l)}</div>
      <div class="kf-dd">${d > 0 ? "+" : ""}${nf(d, 1)}%</div>
      <div class="kf-ds">${cls === "eq" ? "En su promedio" : d < 0 ? "Debajo del promedio" : "Encima del promedio"}</div>
      <div class="kf-dv"><span>Hoy <b>${fx(now)}</b></span><span>Prom. <b>${fx(avg)}</b></span></div>
      ${k === "peg" && D.head.pegFwd != null ? `<div class="kf-dv"><span>Proyectado <b>${nf(D.head.pegFwd, 2)}</b></span><span>crec. esp. <b>${nf(D.head.gProj, 0)}%</b></span></div>` : ""}
      <div class="kf-rg" title="Rango del período: ${fx(lo)} a ${fx(hi)}"><i class="a" style="left:${pos(avg)}%"></i><i class="n" style="left:${pos(now)}%"></i></div>
      <div class="kf-rl"><span>${fx(lo)}</span><span>${fx(hi)}</span></div>
    </div>`;
  }).join("");
  return tiles ? `<div class="kf-card kf-diff"><h5>Hoy vs promedio del período <span class="kf-mut">(${VRANGE} · verde = más barata que su promedio, rojo = más cara)</span></h5><div class="kf-drow">${tiles}</div></div>` : "";
}

const VAL = { price: ['#3b82f6', F.px], per: ['#f59e0b', F.x], peg: ['#facc15', F.x2], ps: ['#a78bfa', F.x], pfcf: ['#14b8a6', F.x], pocf: ['#38bdf8', F.x], pop: ['#f59e0b', F.x], evebitda: ['#f472b6', F.x], evebit: ['#f87171', F.x] };


function drawAll() {
  CH.length = 0;
  const q = (s) => ROOT.querySelector(s);
  const P = D.prices, i0 = cutoff(P.d, PRANGE), c = P.c.slice(i0), ret = c.length > 1 ? (c.at(-1) / c[0] - 1) * 100 : null;
  q("#kfPR").innerHTML = `<span class="kf-ret ${ret >= 0 ? "up" : "dn"}">${PRANGE} ${ret == null ? "" : (ret >= 0 ? "+" : "") + nf(ret, 1) + "%"}</span>` + seg(["1S", "1M", "6M", "YTD", "1A", "2A", "5A"].map((k) => [k, k]), PRANGE, "pr");
  q("#kfPR").querySelectorAll("[data-pr]").forEach((b) => (b.onclick = () => { PRANGE = b.dataset.pr; drawAll(); }));
  draw(q('.fc[data-c="top"]'), { kind: "line", x: P.d.slice(i0), y: c, color: ret >= 0 ? "#22c55e" : "#ef4444", fmt: F.px, h: 200, avg: false });
  // drawdown: distancia al máximo previo (calculado con toda la historia cargada)
  let mx = -Infinity; const ddAll = P.c.map((v) => { if (v == null) return null; mx = Math.max(mx, v); return (v / mx - 1) * 100; });
  const dd = ddAll.slice(i0), ddMin = Math.min(...dd.filter((v) => v != null));
  q("#kfDDl").innerHTML = `Drawdown <span class="kf-mut">hoy <b class="${dd.at(-1) < -10 ? "neg" : dd.at(-1) < -3 ? "mid" : "pos"}">${nf(dd.at(-1), 1)}%</b> · peor del período <b class="neg">${nf(ddMin, 1)}%</b></span>`;
  draw(q('.fc[data-c="dd"]'), { kind: "line", x: P.d.slice(i0), y: dd, color: "#ef4444", fmt: (v) => nf(v, 0) + "%", h: 90, avg: false, maxY: 0 });
  if (VIEW === "val") {
    const j0 = cutoff(P.d, VRANGE), x = P.d.slice(j0);
    for (const k of Object.keys(VAL)) {
      const box = q(`.fc[data-c="${k}"]`); if (!box) continue;
      draw(box, { kind: "line", x, y: (k === "price" ? P.c : D.mult[k] || []).slice(j0), color: VAL[k][0], fmt: VAL[k][1], avg: SHOW_AVG, avgFmt: VAL[k][1] });
    }
    const eb = q('.fc[data-c="epsprice"]');
    if (eb) { const ep = epsVsPrice(j0); draw(eb, { kind: "line", x, series: [{ v: ep.eps, c: "#22c55e", n: "BPA 12m" }, { v: ep.px, c: "#3b82f6", n: "Precio" }], fmt: (v) => (v > 0 ? "+" : "") + nf(v, 0) + "%", avg: false });
      q("#kfEPl").innerHTML = ep.txt; }
    q("#kfDiff").innerHTML = diffRow(j0);
  } else {
    if (q("#kfDiff")) q("#kfDiff").innerHTML = "";
    const rows = (PERIOD === "q" ? D.quarters : D.years).slice(-(PERIOD === "q" ? NQ : NY));
    for (const b of BIZ) {
      const box = q(`.fc[data-c="${b.id}"]`); if (!box) continue;
      draw(box, { kind: b.kind, area: b.area, x: rows.map((r) => r.label), series: b.series.map((s) => ({ ...s, v: rows.map((r) => r[s.k]) })), fmt: b.fmt, avg: SHOW_AVG, growth: b.id === "rev" ? revGrowth(rows) : null });
    }
  }
}

// Crecimiento de ingresos: trimestral contra el mismo trimestre del año anterior; anual contra el año previo
function revGrowth(rows) {
  const all = PERIOD === "q" ? D.quarters : D.years;
  return rows.map((r) => {
    const prev = PERIOD === "q" ? all.find((x) => Math.abs(x.t - (r.t - 365 * 864e5)) < 25 * 864e5) : all[all.indexOf(r) - 1];
    return prev?.rev > 0 && r.rev != null ? (r.rev / prev.rev - 1) * 100 : null;
  });
}
// BPA de 12 meses (precio ÷ PER) contra precio, ambos como % de cambio desde el inicio del rango
function epsVsPrice(j0) {
  const c = D.prices.c.slice(j0), per = D.mult.per.slice(j0);
  const eps = c.map((v, i) => (v != null && per[i] > 0 ? v / per[i] : null));
  const e0 = eps.find((v) => v != null), p0 = c.find((v) => v != null);
  const E = eps.map((v) => (v != null && e0 ? (v / e0 - 1) * 100 : null)), Px = c.map((v) => (v != null && p0 ? (v / p0 - 1) * 100 : null));
  const eL = [...E].reverse().find((v) => v != null), pL = Px.at(-1), gap = pL != null && eL != null ? pL - eL : null;
  const txt = gap == null ? "" : `<span class="kf-mut">BPA <b class="${eL >= 0 ? "pos" : "neg"}">${sgnp(eL)}</b> · precio <b class="${pL >= 0 ? "pos" : "neg"}">${sgnp(pL)}</b> · ${Math.abs(gap) < 5 ? "van parejos" : gap > 0 ? `el precio corre <b class="neg">${nf(gap, 0)} pts</b> adelante` : `el precio quedó <b class="pos">${nf(-gap, 0)} pts</b> atrás`}</span>`;
  return { eps: E, px: Px, eL, pL, gap, txt };
}

// ───────────────────────── Motor de gráficos SVG ─────────────────────────
function niceTicks(lo, hi, n = 6) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
const smooth = (pts) => pts.map((p, i) => {
  if (!i) return `M${p[0]},${p[1]}`;
  const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p;
  const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6], c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
  return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
}).join('');

function draw(box, sp) {
  const id = CH.length;
  const W = Math.max(240, box.clientWidth), H = sp.h || 150, L = 8, R = 50, T = 10, B = 22;
  const series = sp.kind === 'line' && !sp.series ? [{ v: sp.y, c: sp.color, n: '' }] : sp.series.filter((s) => s.v.some((v) => v != null));
  const all = series.flatMap((s) => s.v).filter((v) => v != null && isFinite(v));
  if (!all.length) { box.innerHTML = '<div class="kf-mut kf-nod">Sin datos en este rango</div>'; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (sp.kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  else { const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; if (sp.kind === 'lines' && !sp.area && lo < 0 && Math.min(...all) >= 0) lo = 0; }
  if (sp.maxY != null) hi = Math.min(hi, sp.maxY);
  const ticks = niceTicks(lo, hi, H > 200 ? 8 : H < 110 ? 4 : 7).filter((t) => sp.maxY == null || t <= sp.maxY + 1e-9); lo = ticks[0]; hi = Math.max(ticks.at(-1), sp.maxY ?? -Infinity);
  const n = sp.x.length, pw = W - L - R, ph = H - T - B;
  const cat = sp.kind !== 'line';
  const X = (i) => L + (cat ? ((i + 0.5) / n) * pw : (n > 1 ? (i / (n - 1)) * pw : pw / 2));
  const Y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * ph;
  let g = '';
  g += ticks.map((v) => `<line x1="${L}" x2="${W - R + 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="${W - R + 8}" y="${(Y(v) + 3.5).toFixed(1)}" class="ax">${v === 0 ? '0' : sp.fmt(v)}</text>`).join('');
  // eje x
  if (cat) { const every = Math.max(1, Math.ceil(n / Math.max(1, pw / 48))); g += sp.x.map((l, i) => ((n - 1 - i) % every ? '' : `<text x="${X(i).toFixed(1)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(l)}</text>`)).join(''); }
  else { const idx = n > 2 ? [0, Math.round((n - 1) / 2), n - 1] : [0, n - 1]; g += idx.map((i, j) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" class="ax" text-anchor="${j === 0 ? 'start' : j === idx.length - 1 ? 'end' : 'middle'}">${dLabel(sp.x[i])}</text>`).join(''); }

  if (sp.kind === 'bar') {
    const bw = Math.min(46, (pw / n) * 0.62), sw = bw / series.length;
    series.forEach((s, k) => s.v.forEach((v, i) => {
      if (v == null) return; const x = X(i) - bw / 2 + k * sw, y0 = Y(0), y1 = Y(v);
      g += `<rect x="${(x + 1).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(sw - 2).toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="3" fill="${s.c}" opacity=".9"/>`;
    }));
  } else {
    series.forEach((s, k) => {
      const segs = []; let cur = [];
      s.v.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([+X(i).toFixed(1), +Y(v).toFixed(1)]); });
      if (cur.length) segs.push(cur);
      const gid = `g${id}_${k}`;
      const fill = (sp.kind === 'line' && series.length === 1) || sp.area;
      if (fill) g += `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.c}" stop-opacity=".38"/><stop offset="1" stop-color="${s.c}" stop-opacity="0"/></linearGradient></defs>`;
      for (const pts of segs) {
        const d = sp.kind === 'line' ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') : smooth(pts);
        if (fill) g += `<path d="${d}L${pts.at(-1)[0]},${T + ph}L${pts[0][0]},${T + ph}Z" fill="url(#${gid})"/>`;
        g += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${sp.kind === 'line' ? 1.5 : 2}" stroke-linejoin="round"/>`;
        if (sp.kind === 'lines') g += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.c}" stroke="var(--panel)" stroke-width="1.5"/>`).join('');
      }
    });
  }
  // línea de crecimiento sobre las barras (escala propia, sin eje)
  if (sp.growth && sp.growth.some((v) => v != null)) {
    const gv = sp.growth.filter((v) => v != null), glo = Math.min(0, ...gv), ghi = Math.max(0, ...gv), gr = ghi - glo || 1;
    const GY = (v) => T + 14 + (1 - (v - glo) / gr) * (ph * 0.42);
    const pts = sp.growth.map((v, i) => (v == null ? null : [X(i), GY(v), v])).filter(Boolean);
    if (pts.length > 1) g += `<path d="${smooth(pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]))}" fill="none" stroke="#fbbf24" stroke-width="1.6" stroke-dasharray="1 0"/>`;
    g += pts.map(([x, y, v]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${v >= 0 ? '#fbbf24' : '#f87171'}" stroke="var(--panel)" stroke-width="1.5"/>`).join('');
  }
  // promedio del período (de la primera serie)
  if (sp.avg) {
    const v0 = series[0].v.filter((v) => v != null && isFinite(v));
    if (v0.length) {
      const m = v0.reduce((a, b) => a + b, 0) / v0.length, y = Y(m).toFixed(1), ly = +y < T + 18 ? +y + 17 : +y, txt = 'Prom. ' + (sp.avgFmt || sp.fmt)(m);
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="avg"/><rect x="${L + 4}" y="${(ly - 17).toFixed(1)}" width="${txt.length * 6 + 10}" height="14" rx="3" class="avgbg"/><text x="${L + 9}" y="${(ly - 6.5).toFixed(1)}" class="avgt">${esc(txt)}</text>`;
    }
  }
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}<line class="hx" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="kf-tip"></div>`;
  CH.push({ sp, series, X, n, L, pw, cat });
  const svg = box.querySelector('svg'), hx = svg.querySelector('.hx'), tip = box.querySelector('.kf-tip');
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(cat ? ((mx - L) / pw) * n - 0.5 : ((mx - L) / pw) * (n - 1))));
    hx.setAttribute('x1', X(i)); hx.setAttribute('x2', X(i)); hx.style.display = '';
    const lab = cat ? sp.x[i] : dLong(sp.x[i]);
    tip.innerHTML = `<b>${esc(lab)}</b>` + series.map((s) => `<div>${s.n ? `<i style="background:${s.c}"></i>${esc(s.n)}: ` : ''}<span>${s.v[i] == null ? '—' : sp.fmt(s.v[i])}</span></div>`).join('') + (sp.growth?.[i] != null ? `<div><i style="background:#fbbf24"></i>Crec. ${PERIOD === 'q' ? 'a/a' : 'anual'}: <span>${sgnp(sp.growth[i], 1)}</span></div>` : '');
    tip.style.display = 'block';
    const tw = tip.offsetWidth; tip.style.left = Math.min(W - tw - 4, Math.max(4, X(i) + 10 + tw > W - R ? X(i) - tw - 10 : X(i) + 10)) + 'px';
  };
  svg.onmouseleave = () => { hx.style.display = 'none'; tip.style.display = 'none'; };
}
