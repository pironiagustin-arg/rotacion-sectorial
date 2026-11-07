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
  pct: (v) => nf(v, 1) + '%',
  usd: (v) => '$' + nf(v, 2),
  px: (v) => '$' + nf(v, Math.abs(v) >= 10 ? 0 : 2),
  big: (v) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); return a >= 1e12 ? nf(v / 1e12, 2) + ' T' : a >= 1e9 ? nf(v / 1e9, a >= 1e10 ? 0 : 1) + ' B' : nf(v / 1e6, a >= 1e7 ? 0 : 1) + ' M'; },
  sh: (v) => nf(v / 1e6, 0) + ' M',
  ratio: (v) => nf(v, Math.abs(v) < 10 ? 2 : 1) + 'x',
};

const HELP = {
  price: 'Precio de cierre diario.',
  per: 'PER = capitalización / beneficio neto de los últimos 12 meses.',
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
            <div><b>${h.fpe != null ? nf(h.fpe, 1) + "x" : "—"}</b><span>Fwd P/E</span></div>
            <div><b>${nf(h.price, 2)} US$</b><span>Precio ${h.chg != null ? `<i class="${h.chg >= 0 ? "up" : "dn"}">${h.chg >= 0 ? "▲ +" : "▼ "}${nf(h.chg, 2)}%</i>` : ""}</span></div>
            <small>${asTxt}</small>
          </div>
        </div>
        <div class="kf-card">
          <h4 class="kf-h">Crecimiento y valoración</h4>
          <div class="kf-tw"><table class="kf-tbl"><thead><tr><th class="l"></th>${t.cols.map((c, i) => `<th class="${i === iCur + 1 ? "sep" : ""}">${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr><td class="l">${esc(r.k)}</td>${r.v.map((v, i) => cell(r, v, i)).join("")}</tr>`).join("")}</tbody></table></div>
          <div class="kf-note">10A/5A/3A: crecimiento anual compuesto · PER y P/V: mediana del período${nEst ? " · e = estimación de analistas (AF = año fiscal)" : ""} · ${esc(D.source)}</div>
        </div>
      </div>
      <div class="kf-card kf-price">
        <div class="kf-row" id="kfPR"></div>
        <div class="fc" data-c="top"></div>
      </div>
    </div>
    <div class="kf-switch">${seg([["neg", "Negocio"], ["val", "Valoración"]], VIEW, "view")}</div>
    <div class="kf-card kf-ctrl" id="kfCtrl"></div>
    <div class="kf-grid" id="kfGrid"></div>`;
  el.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { VIEW = b.dataset.view; render(); }));
  renderBody();
}

function renderBody() {
  const ctrl = $("#kfCtrl", ROOT), grid = $("#kfGrid", ROOT);
  const avgTog = `<label class="kf-tog"><input type="checkbox" id="kfAvg" ${SHOW_AVG ? "checked" : ""}><i></i>Promedio del período</label>`;
  if (VIEW === "val") {
    ctrl.innerHTML = seg(["YTD", "1M", "6M", "1A", "2A", "3A", "5A"].map((k) => [k, k]), VRANGE, "vr") + avgTog;
    const cards = [["price", "Precio de la acción"], ["per", "PER"], ["ps", "Precio / ventas"], ["pfcf", "Precio / flujo de caja libre"], ["pocf", "Precio / flujo de caja operativo"], ["pop", "Precio / resultado operativo"], ["evebitda", "VE / EBITDA"], ["evebit", "VE / EBIT"]]
      .filter(([k]) => k === "price" || D.mult[k].some((v) => v != null));
    grid.innerHTML = cards.map(([k, l]) => card(k, l)).join("") + (cards.length < 8 ? `<div class="kf-card kf-miss">Sin datos para ${8 - cards.length} múltiplo(s): no aplican a este tipo de empresa (ej. bancos) o no hay estados contables.</div>` : "");
    ctrl.querySelectorAll("[data-vr]").forEach((b) => (b.onclick = () => { VRANGE = b.dataset.vr; renderBody(); }));
  } else {
    const all = PERIOD === "q" ? D.quarters : D.years, n = PERIOD === "q" ? NQ : NY;
    const opts = PERIOD === "q" ? [[8, "8T"], [12, "12T"], [20, "5 años"], [40, "10 años"]] : [[5, "5 años"], [10, "10 años"], [99, "Todo"]];
    ctrl.innerHTML = seg([["q", "Trimestral"], ["y", "Anual"]], PERIOD, "per") + seg(opts.filter(([k]) => k <= Math.max(all.length, opts[0][0])), n, "n") + avgTog
      + `<span class="kf-mut">${Math.min(n, all.length)} de ${all.length} ${PERIOD === "q" ? "trimestres" : "ejercicios"} disponibles</span>`;
    const rows = all.slice(-n);
    grid.innerHTML = BIZ.filter((b) => b.series.some((s) => rows.some((r) => r[s.k] != null))).map((b) => card(b.id, b.title, b.series.length > 1 ? b.series : null)).join("");
    ctrl.querySelectorAll("[data-per]").forEach((b) => (b.onclick = () => { PERIOD = b.dataset.per; renderBody(); }));
    ctrl.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { if (PERIOD === "q") NQ = +b.dataset.n; else NY = +b.dataset.n; renderBody(); }));
  }
  $("#kfAvg", ROOT).onchange = (e) => { SHOW_AVG = e.target.checked; drawAll(); };
  drawAll();
}

const card = (k, title, legend) => `<div class="kf-card kf-ch"><span class="kf-q" title="${esc(HELP[k] || "")}">?</span><h5>${esc(title)}</h5>
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
const VAL = { price: ['#3b82f6', F.px], per: ['#f59e0b', F.x], ps: ['#a78bfa', F.x], pfcf: ['#14b8a6', F.x], pocf: ['#38bdf8', F.x], pop: ['#f59e0b', F.x], evebitda: ['#f472b6', F.x], evebit: ['#f87171', F.x] };


function drawAll() {
  CH.length = 0;
  const q = (s) => ROOT.querySelector(s);
  const P = D.prices, i0 = cutoff(P.d, PRANGE), c = P.c.slice(i0), ret = c.length > 1 ? (c.at(-1) / c[0] - 1) * 100 : null;
  q("#kfPR").innerHTML = `<span class="kf-ret ${ret >= 0 ? "up" : "dn"}">${PRANGE} ${ret == null ? "" : (ret >= 0 ? "+" : "") + nf(ret, 1) + "%"}</span>` + seg(["1S", "1M", "6M", "YTD", "1A", "2A", "5A"].map((k) => [k, k]), PRANGE, "pr");
  q("#kfPR").querySelectorAll("[data-pr]").forEach((b) => (b.onclick = () => { PRANGE = b.dataset.pr; drawAll(); }));
  draw(q('.fc[data-c="top"]'), { kind: "line", x: P.d.slice(i0), y: c, color: ret >= 0 ? "#22c55e" : "#ef4444", fmt: F.px, h: 250, avg: false });
  if (VIEW === "val") {
    const j0 = cutoff(P.d, VRANGE), x = P.d.slice(j0);
    for (const k of Object.keys(VAL)) {
      const box = q(`.fc[data-c="${k}"]`); if (!box) continue;
      draw(box, { kind: "line", x, y: (k === "price" ? P.c : D.mult[k]).slice(j0), color: VAL[k][0], fmt: VAL[k][1], avg: SHOW_AVG, avgFmt: k === "price" ? F.px : F.x });
    }
  } else {
    const rows = (PERIOD === "q" ? D.quarters : D.years).slice(-(PERIOD === "q" ? NQ : NY));
    for (const b of BIZ) {
      const box = q(`.fc[data-c="${b.id}"]`); if (!box) continue;
      draw(box, { kind: b.kind, area: b.area, x: rows.map((r) => r.label), series: b.series.map((s) => ({ ...s, v: rows.map((r) => r[s.k]) })), fmt: b.fmt, avg: SHOW_AVG });
    }
  }
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
  const series = sp.kind === 'line' ? [{ v: sp.y, c: sp.color, n: '' }] : sp.series.filter((s) => s.v.some((v) => v != null));
  const all = series.flatMap((s) => s.v).filter((v) => v != null && isFinite(v));
  if (!all.length) { box.innerHTML = '<div class="kf-mut kf-nod">Sin datos en este rango</div>'; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (sp.kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  else { const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; if (sp.kind === 'lines' && !sp.area && lo < 0 && Math.min(...all) >= 0) lo = 0; }
  const ticks = niceTicks(lo, hi, H > 200 ? 8 : 7); lo = ticks[0]; hi = ticks.at(-1);
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
      if (sp.kind === 'line' || sp.area) g += `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.c}" stop-opacity=".38"/><stop offset="1" stop-color="${s.c}" stop-opacity="0"/></linearGradient></defs>`;
      for (const pts of segs) {
        const d = sp.kind === 'line' ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') : smooth(pts);
        if (sp.kind === 'line' || sp.area) g += `<path d="${d}L${pts.at(-1)[0]},${T + ph}L${pts[0][0]},${T + ph}Z" fill="url(#${gid})"/>`;
        g += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${sp.kind === 'line' ? 1.5 : 2}" stroke-linejoin="round"/>`;
        if (sp.kind === 'lines') g += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.c}" stroke="var(--panel)" stroke-width="1.5"/>`).join('');
      }
    });
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
    tip.innerHTML = `<b>${esc(lab)}</b>` + series.map((s) => `<div>${s.n ? `<i style="background:${s.c}"></i>${esc(s.n)}: ` : ''}<span>${s.v[i] == null ? '—' : sp.fmt(s.v[i])}</span></div>`).join('');
    tip.style.display = 'block';
    const tw = tip.offsetWidth; tip.style.left = Math.min(W - tw - 4, Math.max(4, X(i) + 10 + tw > W - R ? X(i) - tw - 10 : X(i) + 10)) + 'px';
  };
  svg.onmouseleave = () => { hx.style.display = 'none'; tip.style.display = 'none'; };
}
