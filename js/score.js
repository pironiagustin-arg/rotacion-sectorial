// Motor del score (compartido por el Screener y la ficha de empresa).
// 1) Cada empresa se asigna a un perfil de industria (banco, software, neocloud, retail, REIT, minería…).
// 2) El perfil define qué métricas cuentan y cuánto pesan; el tipo Lynch agrega y reajusta métricas.
// 3) Cada métrica se convierte en percentil contra sus pares (misma industria; si son pocos, el sector).
// 4) Un bloque "Vs su historia" compara los valores actuales con los últimos ejercicios de la propia empresa.
import { SECTORS, COUNTRIES } from "/lib/universe.js";

export const ok = (v) => v != null && isFinite(v);

// ---------- Catálogo de métricas ----------
// dir: +1 más alto es mejor, -1 más bajo es mejor. pos: solo comparable si es positiva (múltiplos).
export const METRICS = {
  peg:      { l: "PEG", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "P/E forward dividido el crecimiento esperado de las ganancias. Menos de 1 suele ser barato." },
  fpe:      { l: "P/E forward", f: "x", dir: -1, g: "Valuación", pos: true, q: "Precio sobre las ganancias estimadas a 12 meses." },
  pe:       { l: "P/E (12 meses)", f: "x", dir: -1, g: "Valuación", pos: true, q: "Precio sobre las ganancias de los últimos 12 meses." },
  pb:       { l: "Precio / valor libro", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "Precio contra el patrimonio contable. Clave en bancos, aseguradoras y empresas de activos." },
  evEbitda: { l: "EV / EBITDA", f: "x", dir: -1, g: "Valuación", pos: true, q: "Valor de la empresa (incluida la deuda) contra su caja operativa. El múltiplo de las cíclicas y las de capital intensivo." },
  evRev:    { l: "EV / Ventas", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "Valor de la empresa sobre sus ventas. Se usa cuando las ganancias todavía no reflejan el negocio (retail, software, neoclouds)." },
  pffo:     { l: "P / FFO", f: "x", dir: -1, g: "Valuación", pos: true, q: "Precio sobre el flujo de fondos operativo (ganancia + depreciación). El P/E de los REITs." },
  fcfY:     { l: "FCF yield", f: "%", dir: 1, g: "Valuación", q: "Caja libre anual como % del precio. Más alto, más barata." },
  roic:     { l: "ROIC", f: "%", dir: 1, g: "Calidad", q: "Retorno sobre el capital invertido. Mide si el negocio crea valor." },
  roa:      { l: "ROA", f: "%", d: 2, dir: 1, g: "Calidad", q: "Ganancia sobre activos totales. En bancos, más de 1% es bueno; más de 1,5% es excelente." },
  fcfConv:  { l: "Conversión de caja", f: "%", d: 0, dir: 1, g: "Calidad", q: "Free cash flow sobre ganancia neta (últimos 3 ejercicios). Arriba de 90%: las ganancias son reales y se cobran." },
  omTrend:  { l: "Tendencia del margen", f: "pp", d: 1, dir: 1, g: "Calidad", q: "Puntos que ganó o perdió el margen operativo en los últimos 3 ejercicios. Positivo = apalancamiento operativo." },
  dil:      { l: "Dilución anual", f: "%", d: 1, dir: -1, g: "Calidad", q: "Variación anual de la cantidad de acciones. Negativo = recompra acciones; positivo = te diluye." },
  roe:      { l: "ROE", f: "%", dir: 1, g: "Calidad", q: "Ganancia sobre el patrimonio. La métrica central en bancos y aseguradoras." },
  gm:       { l: "Margen bruto", f: "%", dir: 1, g: "Calidad", q: "Lo que queda de cada venta después del costo directo. Indica poder de precio." },
  om:       { l: "Margen operativo", f: "%", dir: 1, g: "Calidad", q: "Ganancia del negocio antes de intereses e impuestos, sobre ventas." },
  fcfM:     { l: "Margen FCF", f: "%", dir: 1, g: "Calidad", q: "Caja libre sobre ventas." },
  eff:      { l: "Efficiency ratio", f: "%", dir: -1, g: "Calidad", q: "Gastos operativos sobre ingresos de un banco. Menos de 55% es eficiente; más de 65% es caro de operar." },
  invTurn:  { l: "Rotación de inventario", f: "x", dir: 1, g: "Calidad", q: "Veces por año que vende su inventario. Clave en retail y hardware: más rotación, menos riesgo de stock viejo." },
  sbc:      { l: "Pago en acciones / ventas", f: "%", dir: -1, g: "Calidad", q: "Sueldos pagados con acciones. Si es alto, diluye al accionista aunque no se vea en la caja." },
  rnd:      { l: "I+D / ventas", f: "%", dir: 1, g: "Calidad", q: "Inversión en investigación y desarrollo. Alimenta el crecimiento futuro en tecnología y farma." },
  epsG:     { l: "Crecimiento EPS esperado", f: "%", dir: 1, g: "Crecimiento", q: "Cuánto se espera que crezcan las ganancias por acción (consenso)." },
  revG:     { l: "Crecimiento de ventas", f: "%", dir: 1, g: "Crecimiento", q: "Variación de las ventas contra el mismo período del año anterior." },
  revStab:  { l: "Volatilidad del crecimiento", f: "pp", d: 1, dir: -1, g: "Crecimiento", q: "Desvío del crecimiento de ventas año a año. Bajo = crecimiento predecible (lo que se busca en Stalwarts)." },
  evRevG:   { l: "EV/Ventas ajustado por crecimiento", f: "x", d: 2, dir: -1, g: "Valuación", pos: true, q: "EV/Ventas dividido el crecimiento de ventas (en puntos). El 'PEG' de las empresas que todavía no ganan plata." },
  rule40:   { l: "Rule of 40", f: "%", dir: 1, g: "Crecimiento", q: "Crecimiento de ventas + margen FCF. En software, arriba de 40% es un negocio sano." },
  backlog:  { l: "Backlog / ventas", f: "x", d: 1, dir: 1, g: "Crecimiento", q: "Contratos firmados pendientes de facturar (RPO, dato de la SEC) sobre las ventas anuales. Visibilidad de ingresos futuros." },
  ndEbitda: { l: "Deuda neta / EBITDA", f: "x", dir: -1, g: "Solidez", q: "Años de caja operativa para pagar la deuda. Más de 3x es exigente; en REITs y utilities se toleran 5-6x." },
  cr:       { l: "Liquidez corriente", f: "x", d: 2, dir: 1, g: "Solidez", q: "Activos de corto plazo sobre deudas de corto plazo. Debajo de 1 hay que mirar." },
  intCov:   { l: "Cobertura de intereses", f: "x", dir: 1, g: "Solidez", pos: true, q: "Ganancia operativa sobre intereses. Menos de 3x es frágil." },
  runway:   { l: "Años de caja", f: "x", d: 1, dir: 1, g: "Solidez", q: "Si quema caja: cuántos años le dura la caja actual al ritmo de quema." },
  divY:     { l: "Dividend yield", f: "%", dir: 1, g: "Dividendos", q: "Dividendo anual como % del precio." },
  payout:   { l: "Payout ratio", f: "%", dir: -1, g: "Dividendos", pos: true, q: "Qué parte de la ganancia reparte como dividendo. Más de 75% deja poco margen (salvo REITs y utilities)." },
  divG:     { l: "Crecimiento del dividendo", f: "%", dir: 1, g: "Dividendos", q: "Crecimiento anual compuesto del dividendo por acción en los últimos ejercicios." },
  shY:      { l: "Shareholder yield", f: "%", dir: 1, g: "Dividendos", q: "Dividendos + recompras de acciones sobre el valor de mercado." },
};
export const GROUPS = ["Valuación", "Calidad", "Crecimiento", "Solidez", "Dividendos", "Historia"];

// ---------- Perfiles por industria ----------
// w: pesos. hist: métricas a comparar contra su propia historia. kpi: KPIs del sector que se cargan a mano.
const K = (k, l, hint) => ({ k, l, hint });
export const PROFILES = {
  software:   { l: "Software", why: "Se mira crecimiento con rentabilidad (Rule of 40), múltiplo de ventas y dilución por pago en acciones.",
    w: { rule40: 14, evRev: 10, revG: 14, gm: 10, fcfM: 10, sbc: 6, om: 8, peg: 8, backlog: 8, ndEbitda: 6, roic: 6, dil: 8, evRevG: 8, fcfConv: 4 }, hist: ["evRev", "fpe", "gm", "om"],
    kpi: [K("arr", "ARR (US$ M)", "Ingresos recurrentes anualizados"), K("nrr", "Retención neta NRR (%)", "Más de 120% es excelente"), K("big", "Clientes > US$ 100k", "")] },
  neocloud:   { fixed: true, l: "Neocloud / infraestructura IA", why: "Negocio en construcción: pesan el crecimiento, el backlog contratado, el múltiplo de ventas y la capacidad de financiar el capex.",
    w: { revG: 18, backlog: 16, evRev: 14, ndEbitda: 12, gm: 10, om: 8, cr: 8, runway: 6, intCov: 8, dil: 6 }, hist: ["evRev", "gm"],
    kpi: [K("arr", "ARR (US$ M)", "Ingresos recurrentes anualizados"), K("mw", "Capacidad contratada (MW)", ""), K("conc", "Concentración top cliente (%)", "Más de 50% es riesgo alto")] },
  semis:      { l: "Semiconductores", why: "Industria cíclica de alta tecnología: márgenes brutos, retorno sobre capital, I+D y PEG.",
    w: { peg: 12, fpe: 8, gm: 14, om: 10, roic: 12, revG: 12, epsG: 10, rnd: 6, fcfY: 8, invTurn: 4, ndEbitda: 4, omTrend: 6, fcfConv: 4 }, hist: ["fpe", "evEbitda", "gm", "om"],
    kpi: [K("share", "Market share en su nicho (%)", ""), K("dio", "Días de inventario", "Si sube rápido, anticipa caída del ciclo")] },
  hardware:   { l: "Hardware y equipos", why: "Márgenes más bajos que software: caja libre, retorno sobre capital e inventario.",
    w: { fpe: 12, peg: 10, evEbitda: 8, fcfY: 12, roic: 12, om: 10, revG: 10, epsG: 10, ndEbitda: 8, invTurn: 8, fcfConv: 6 }, hist: ["fpe", "evEbitda", "om"], kpi: [] },
  itservices: { l: "Servicios IT", why: "Negocio de personas: márgenes estables, caja libre y crecimiento.",
    w: { fpe: 14, fcfY: 12, roic: 14, om: 12, revG: 12, epsG: 12, divY: 6, ndEbitda: 6, shY: 6, fcfConv: 8, dil: 4 }, hist: ["fpe", "om"], kpi: [K("bb", "Book-to-bill (x)", "Más de 1 = crecen los contratos")] },
  internet:   { l: "Internet y plataformas", why: "Crecimiento de ventas, márgenes que escalan y múltiplo de ventas.",
    w: { evRev: 12, peg: 12, revG: 16, om: 12, fcfY: 12, roic: 10, epsG: 10, sbc: 6, ndEbitda: 6, dil: 6, evRevG: 6, omTrend: 6 }, hist: ["evRev", "fpe", "om"],
    kpi: [K("users", "Usuarios activos (M)", ""), K("arpu", "ARPU (US$)", "Ingreso promedio por usuario")] },
  telecom:    { l: "Telecomunicaciones", why: "Negocio maduro de capital intensivo: EV/EBITDA, caja libre, deuda y dividendo.",
    w: { evEbitda: 18, fcfY: 18, ndEbitda: 18, divY: 14, payout: 8, revG: 8, om: 8, intCov: 8, fcfConv: 6 }, hist: ["evEbitda", "fcfY"], kpi: [K("churn", "Churn mensual (%)", "Menos de 1% es bueno"), K("arpu", "ARPU", "")] },
  retail:     { l: "Retail", why: "En retail los márgenes son finos: EV/Ventas, rotación de inventario y retorno sobre capital.",
    w: { evRev: 12, fpe: 10, invTurn: 14, om: 12, roic: 14, revG: 12, fcfY: 10, ndEbitda: 8, epsG: 8, omTrend: 6 }, hist: ["evRev", "fpe", "om"],
    kpi: [K("sss", "Ventas mismas tiendas (%)", "El dato clave del trimestre"), K("stores", "Cantidad de tiendas", "")] },
  restaurants:{ l: "Restaurantes", why: "Crecimiento orgánico, márgenes y retorno sobre capital.",
    w: { fpe: 12, evEbitda: 12, roic: 14, om: 12, revG: 12, epsG: 12, fcfY: 10, ndEbitda: 10, divY: 6, fcfConv: 4 }, hist: ["fpe", "evEbitda", "om"],
    kpi: [K("sss", "Ventas mismas tiendas (%)", ""), K("units", "Aperturas netas", "")] },
  brands:     { l: "Marcas de consumo", why: "Poder de marca: margen bruto, retorno sobre capital e inventario.",
    w: { fpe: 12, peg: 10, gm: 12, om: 12, roic: 14, revG: 12, fcfY: 10, invTurn: 8, ndEbitda: 10, fcfConv: 6, omTrend: 4 }, hist: ["fpe", "gm", "om"], kpi: [] },
  leisure:    { l: "Turismo y ocio", why: "Muy cíclico y apalancado: EV/EBITDA, deuda y caja libre.",
    w: { evEbitda: 16, fcfY: 14, ndEbitda: 16, om: 12, revG: 12, epsG: 10, intCov: 10, roic: 10 }, hist: ["evEbitda", "om"], kpi: [K("occ", "Ocupación (%)", "")] },
  autos:      { l: "Automotrices", why: "Cíclico con márgenes finos: EV/Ventas, margen operativo y caja.",
    w: { evRev: 12, fpe: 12, om: 14, fcfY: 14, revG: 12, ndEbitda: 10, roic: 10, invTurn: 8, divY: 8 }, hist: ["evRev", "fpe", "om"],
    kpi: [K("deliv", "Entregas (unidades)", ""), K("asp", "Precio promedio por vehículo", "")] },
  pharma:     { l: "Farmacéuticas", why: "Ganancias estables: P/E, caja libre, I+D y dividendo. Ojo con vencimientos de patentes.",
    w: { fpe: 14, peg: 10, fcfY: 14, om: 12, rnd: 8, roic: 10, revG: 10, epsG: 10, divY: 6, payout: 4, ndEbitda: 6, fcfConv: 6 }, hist: ["fpe", "evEbitda", "om"],
    kpi: [K("ph3", "Productos en fase 3", ""), K("loe", "Ventas con patente por vencer en 5 años (%)", "Más de 30% es riesgo alto")] },
  biotech:    { l: "Biotecnología", why: "Si todavía no gana plata, manda cuántos años de caja tiene y el crecimiento de ventas.",
    w: { evRev: 14, revG: 18, gm: 10, runway: 14, cr: 10, rnd: 6, om: 10, ndEbitda: 8, fcfM: 10, dil: 10 }, hist: ["evRev"],
    kpi: [K("ph3", "Productos en fase 3", ""), K("cat", "Próximo catalizador", "Fecha de lectura de ensayos o aprobación")] },
  medtech:    { l: "Dispositivos médicos", why: "Crecimiento estable con márgenes altos.",
    w: { peg: 12, fpe: 10, gm: 12, om: 12, roic: 12, revG: 12, epsG: 12, fcfY: 10, ndEbitda: 8, fcfConv: 6, omTrend: 4 }, hist: ["fpe", "evEbitda", "om"], kpi: [] },
  hcservices: { l: "Servicios de salud", why: "Márgenes finos y mucho volumen: P/E, crecimiento de ganancias y caja.",
    w: { fpe: 16, peg: 10, om: 10, roe: 12, revG: 12, epsG: 14, fcfY: 14, ndEbitda: 6, divY: 6, fcfConv: 6 }, hist: ["fpe"], kpi: [K("mlr", "Medical loss ratio (%)", "Si sube, se achica el margen")] },
  bank:       { l: "Bancos", why: "ROE contra precio/valor libro y eficiencia operativa. ROIC, deuda y EV no aplican.",
    w: { fpe: 14, pb: 14, roe: 18, eff: 16, epsG: 10, revG: 8, divY: 10, payout: 4, divG: 6, roa: 14 }, hist: ["pe", "pb", "roe", "eff"],
    kpi: [K("npl", "Morosidad (%)", "Menos de 2% es sana"), K("cet1", "CET1 (%)", "Capital: más de 11% es holgado"), K("nim", "Margen financiero NIM (%)", "")] },
  insurance:  { l: "Aseguradoras", why: "ROE, precio/valor libro y crecimiento de primas.",
    w: { fpe: 14, pb: 16, roe: 18, epsG: 12, revG: 10, divY: 10, divG: 8, payout: 6, fcfY: 6, roa: 6 }, hist: ["pe", "pb", "roe"],
    kpi: [K("cr", "Combined ratio (%)", "Menos de 100% = gana con el negocio de seguros"), K("prem", "Crecimiento de primas (%)", "")] },
  payments:   { l: "Pagos y fintech", why: "Escala con márgenes altos: crecimiento, margen operativo y caja.",
    w: { peg: 12, fpe: 10, om: 14, roe: 10, revG: 16, epsG: 12, fcfY: 14, fcfM: 6, sbc: 6, omTrend: 6, dil: 6 }, hist: ["fpe", "om"],
    kpi: [K("tpv", "TPV (US$ B)", "Volumen procesado"), K("take", "Take rate (%)", "")] },
  capmarkets: { l: "Mercados de capitales y gestoras", why: "Ingresos ligados al mercado: ROE, márgenes y retorno al accionista.",
    w: { fpe: 14, pb: 6, roe: 16, om: 14, revG: 12, epsG: 12, divY: 10, fcfY: 10, shY: 6, roa: 4 }, hist: ["pe", "om", "roe"],
    kpi: [K("aum", "Activos bajo gestión (US$ B)", ""), K("flows", "Flujos netos (US$ B)", "")] },
  crypto:     { l: "Tesorería cripto / mineras", why: "Valen por los activos que tienen: precio/valor libro y liquidez. Cargá el mNAV a mano.",
    w: { pb: 30, cr: 20, revG: 20, ndEbitda: 10, om: 10 }, hist: ["pb"],
    kpi: [K("mnav", "mNAV (x)", "Market cap sobre el valor de sus criptos. Más de 2x es caro"), K("cps", "Cripto por acción", "")] },
  reit:       { l: "REITs", why: "Se mide por el flujo que distribuye (P/FFO), el dividendo y el endeudamiento, no por el P/E.",
    w: { pffo: 18, divY: 16, ndEbitda: 16, revG: 12, divG: 10, evEbitda: 10, pb: 6, intCov: 6 }, hist: ["pffo", "evEbitda", "divY"],
    kpi: [K("occ", "Ocupación (%)", "Más de 95% es sólida"), K("affo", "AFFO por acción", ""), K("walt", "Plazo promedio de contratos (años)", "")] },
  realestate: { l: "Desarrolladoras e inmobiliarias", why: "Valen por sus activos: precio/valor libro, deuda y márgenes.",
    w: { pb: 18, evEbitda: 12, ndEbitda: 14, om: 12, revG: 12, fpe: 12, roe: 12, divY: 8 }, hist: ["pb", "om"], kpi: [K("nav", "Descuento a NAV (%)", "")] },
  utility:    { l: "Servicios públicos regulados", why: "Negocio regulado: dividendo sostenible, deuda y crecimiento estable de ganancias.",
    w: { fpe: 14, divY: 16, payout: 10, ndEbitda: 16, epsG: 14, divG: 10, roe: 10, intCov: 10 }, hist: ["pe", "evEbitda", "divY"],
    kpi: [K("rb", "Crecimiento base tarifaria (%)", ""), K("aroe", "ROE autorizado (%)", "")] },
  ipp:        { l: "Generadoras independientes", why: "Ligadas a la demanda eléctrica (IA, data centers): crecimiento, caja y EV/EBITDA.",
    w: { fpe: 12, peg: 12, evEbitda: 14, fcfY: 14, epsG: 14, revG: 10, ndEbitda: 12, om: 8, divY: 4 }, hist: ["evEbitda", "fpe"], kpi: [K("ppa", "Capacidad con contratos largos (%)", "")] },
  oilgas:     { l: "Petróleo y gas", why: "Commodity: EV/EBITDA, caja libre, deuda y retorno al accionista. El P/E engaña en el pico del ciclo.",
    w: { evEbitda: 16, fcfY: 16, ndEbitda: 14, divY: 10, shY: 10, roic: 10, pb: 6, om: 8, intCov: 6, payout: 4 }, hist: ["evEbitda", "fcfY", "om"],
    kpi: [K("prod", "Producción (kboe/d)", ""), K("rl", "Vida de reservas (años)", "Más de 10 años es holgado"), K("be", "Breakeven (US$/barril)", "Menos de 50 es resiliente")] },
  midstream:  { l: "Midstream (ductos)", why: "Peajes con contratos: dividendo, deuda y estabilidad de la caja.",
    w: { evEbitda: 16, divY: 16, ndEbitda: 16, fcfY: 14, payout: 10, divG: 10, intCov: 10, revG: 8 }, hist: ["evEbitda", "divY"], kpi: [] },
  oilservices:{ l: "Servicios petroleros", why: "Cíclico ligado a la inversión de las petroleras: caja, retorno y márgenes.",
    w: { evEbitda: 14, fcfY: 14, roic: 12, om: 12, revG: 12, epsG: 10, ndEbitda: 12, peg: 6, divY: 4, invTurn: 4 }, hist: ["evEbitda", "om"], kpi: [] },
  mining:     { l: "Minería y metales", why: "Commodity: EV/EBITDA, caja libre, deuda y valor libro. Cargá el costo de producción (AISC).",
    w: { evEbitda: 16, fcfY: 14, ndEbitda: 14, pb: 10, om: 12, roic: 10, divY: 8, revG: 8, intCov: 8 }, hist: ["evEbitda", "pb", "om"],
    kpi: [K("aisc", "Costo total de producción AISC", "Contra el precio del metal: el margen real"), K("rl", "Vida de reservas (años)", "")] },
  chemicals:  { l: "Químicos y materiales", why: "Cíclico industrial: EV/EBITDA, caja libre, deuda y márgenes.",
    w: { evEbitda: 14, fcfY: 14, ndEbitda: 12, om: 12, roic: 12, divY: 8, fpe: 8, revG: 10, epsG: 10 }, hist: ["evEbitda", "om"], kpi: [] },
  aerospace:  { l: "Aeroespacial y defensa", why: "Contratos largos: backlog, márgenes y retorno sobre capital.",
    w: { peg: 10, fpe: 10, om: 12, roic: 12, fcfY: 12, revG: 12, epsG: 12, backlog: 12, ndEbitda: 8, fcfConv: 6 }, hist: ["fpe", "evEbitda", "om"],
    kpi: [K("bb", "Book-to-bill (x)", "Más de 1 = crece la cartera")] },
  airlines:   { l: "Aerolíneas", why: "Muy apalancadas y cíclicas: EV/EBITDA, deuda, márgenes y liquidez.",
    w: { evEbitda: 16, evRev: 10, ndEbitda: 16, om: 14, fcfY: 14, revG: 10, intCov: 10, cr: 10 }, hist: ["evEbitda", "om"],
    kpi: [K("lf", "Load factor (%)", "Ocupación de asientos"), K("casm", "CASM ex combustible", "Costo por asiento-milla")] },
  transport:  { l: "Transporte e infraestructura", why: "Activos de larga vida: márgenes, retorno sobre capital y EV/EBITDA.",
    w: { evEbitda: 14, fcfY: 12, roic: 12, om: 14, ndEbitda: 12, revG: 10, epsG: 10, divY: 8, fpe: 8 }, hist: ["evEbitda", "om"], kpi: [K("traffic", "Tráfico / volumen (var. %)", "")] },
  machinery:  { l: "Industriales y maquinaria", why: "Equilibrio entre valuación, retorno sobre capital y crecimiento.",
    w: { peg: 10, fpe: 10, evEbitda: 8, fcfY: 12, roic: 14, om: 12, revG: 10, epsG: 12, ndEbitda: 8, invTurn: 4, fcfConv: 6 }, hist: ["fpe", "evEbitda", "om"], kpi: [K("bb", "Book-to-bill (x)", "")] },
  staples:    { l: "Consumo básico", why: "Calidad estable: retorno sobre capital, caja libre y dividendo por encima del crecimiento.",
    w: { fpe: 12, fcfY: 12, roic: 14, om: 12, gm: 6, epsG: 10, revG: 8, ndEbitda: 8, divY: 10, payout: 4, divG: 6, fcfConv: 8, revStab: 6 }, hist: ["fpe", "evEbitda", "om"],
    kpi: [K("vol", "Crecimiento de volumen (%)", "Crecer por volumen vale más que por precio")] },
  agro:       { l: "Agro", why: "Valor de la tierra y ciclo de commodities: precio/valor libro, EV/EBITDA y deuda.",
    w: { evEbitda: 16, pb: 14, fcfY: 12, ndEbitda: 14, om: 10, roe: 12, revG: 10, divY: 6 }, hist: ["pb", "evEbitda"], kpi: [K("ha", "Hectáreas", "")] },
  // Respaldos por sector cuando la industria no está mapeada
  growth:     { l: "Crecimiento", why: "Se priorizan crecimiento, márgenes y PEG.", w: { peg: 14, fpe: 8, fcfY: 8, roic: 12, gm: 6, om: 8, epsG: 14, revG: 14, ndEbitda: 8 }, hist: ["fpe", "om"], kpi: [] },
  industrial: { l: "Industrial", why: "Equilibrio entre valuación, retorno sobre capital y crecimiento.", w: { peg: 10, fpe: 10, evEbitda: 8, fcfY: 10, roic: 14, om: 10, epsG: 12, revG: 10, ndEbitda: 10 }, hist: ["fpe", "evEbitda", "om"], kpi: [] },
  commodity:  { l: "Commodities", why: "El P/E engaña en el pico del ciclo: EV/EBITDA, caja libre, deuda y valor libro.", w: { evEbitda: 16, fcfY: 16, pb: 8, roic: 12, om: 8, ndEbitda: 16, divY: 8, epsG: 4, revG: 4 }, hist: ["evEbitda", "om"], kpi: [] },
  financial:  { l: "Financiero", why: "Manda el ROE contra el precio/valor libro.", w: { fpe: 16, pb: 16, roe: 22, epsG: 12, revG: 8, divY: 10 }, hist: ["pe", "pb", "roe"], kpi: [] },
};

const IND = [
  [/^Software - |^Information Technology Services$/, (r) => (r.sec === "fin" ? "payments" : /Information Technology Services/.test(r.ind) ? "itservices" : "software")],
  [/^Semiconductor/, "semis"],
  [/^Computer Hardware|^Communication Equipment|^Electronic Components|^Business Equipment|^Solar|^Scientific & Technical/, "hardware"],
  [/^Consumer Electronics/, (r) => (r.sec === "tech" ? "hardware" : "brands")],
  [/^Internet Content|^Internet Retail|^Electronic Gaming|^Entertainment/, "internet"],
  [/^Telecom Services/, "telecom"],
  [/Retail|^Discount Stores|^Department Stores|^Auto Parts/, "retail"],
  [/^Restaurants/, "restaurants"],
  [/^Footwear|^Apparel Manufacturing|^Luxury|^Leisure|^Household & Personal/, (r) => (r.sec === "staples" ? "staples" : "brands")],
  [/^Travel Services|^Resorts|^Lodging|^Recreational Vehicles|^Gambling/, "leisure"],
  [/^Auto Manufacturers/, "autos"],
  [/^Drug Manufacturers/, "pharma"],
  [/^Biotechnology|^Health Information/, "biotech"],
  [/^Medical Devices|^Medical Instruments|^Diagnostics/, "medtech"],
  [/^Healthcare Plans|^Medical Distribution|^Medical Care/, "hcservices"],
  [/^Banks|^Mortgage Finance/, "bank"],
  [/^Insurance/, (r) => (r.sec === "health" ? "hcservices" : "insurance")],
  [/^Credit Services/, "payments"],
  [/^Capital Markets|^Asset Management|^Financial Data/, (r) => (r.sec === "tech" ? "crypto" : "capmarkets")],
  [/^REIT/, "reit"],
  [/^Real Estate/, "realestate"],
  [/^Utilities - Independent Power|^Utilities - Renewable/, "ipp"],
  [/^Utilities/, "utility"],
  [/^Oil & Gas Integrated|^Oil & Gas E&P|^Oil & Gas Refining/, "oilgas"],
  [/^Oil & Gas Midstream/, "midstream"],
  [/^Oil & Gas Equipment/, "oilservices"],
  [/^Gold|^Silver|^Copper|^Aluminum|^Steel|^Other Industrial Metals|^Other Precious|^Uranium|^Coking Coal/, "mining"],
  [/Chemicals|^Agricultural Inputs|^Packaging|^Paper|^Building Materials|^Lumber/, "chemicals"],
  [/^Aerospace/, "aerospace"],
  [/^Airlines/, "airlines"],
  [/^Airports|^Railroads|^Integrated Freight|^Infrastructure Operations|^Rental & Leasing|^Marine Shipping|^Trucking/, "transport"],
  [/^Farm & Heavy|^Specialty Industrial|^Electrical Equipment|^Conglomerates|^Tools|^Building Products|^Industrial Distribution|^Engineering|^Consulting|^Waste/, "machinery"],
  [/^Beverages|^Tobacco|^Confectioners|^Packaged Foods|^Food Distribution|^Grocery/, "staples"],
  [/^Farm Products/, "agro"],
];
const SYMBOL_PROFILE = { CRWV: "neocloud", NBIS: "neocloud", IREN: "neocloud", APLD: "neocloud", MSTR: "crypto", BMNR: "crypto", HUT: "crypto", RIOT: "crypto", COIN: "capmarkets", PAM: "utility", CRESY: "agro", "LEDE.BA": "staples" };
const SECTOR_DEFAULT = { tech: "growth", comm: "growth", health: "growth", discr: "growth", staples: "staples", ind: "industrial", energy: "commodity", mat: "commodity", fin: "financial", re: "reit", util: "utility" };

export function profileOf(r) {
  if (SYMBOL_PROFILE[r.s]) return SYMBOL_PROFILE[r.s];
  const ind = r.ind || "";
  for (const [re, p] of IND) if (re.test(ind)) return typeof p === "function" ? p(r) : p;
  return SECTOR_DEFAULT[r.sec] || "growth";
}
// Métricas que no tienen sentido para cierta industria (no se muestran ni comparan)
const BANKISH = ["fcfConv", "evRevG", "dil", "evRev", "evEbitda", "pffo", "fcfM", "fcfY", "rule40", "runway", "gm", "invTurn", "cr", "intCov", "ndEbitda", "rnd", "sbc", "capexInt", "backlog"];
export function relevant(r, k) {
  if (r.sec === "fin" && !["payments", "crypto"].includes(r.profile) && BANKISH.includes(k)) return false;
  if (k === "pffo" && !["reit", "realestate"].includes(r.profile)) return false;
  if (k === "rule40" && !["software", "internet", "neocloud", "payments"].includes(r.profile)) return false;
  if (k === "runway" && !(ok(r.fcf) && r.fcf < 0)) return false;
  if (k === "eff" && r.profile !== "bank") return false;
  if (k === "roa" && r.sec !== "fin") return false;
  if (k === "evRevG" && !(ok(r.revG) && r.revG > 2)) return false;
  return true;
}
// Compatibilidad: familia = perfil
export const FAMILIES = PROFILES;
export const SECTOR_FAMILY = SECTOR_DEFAULT;

// ---------- Tipos Lynch ----------
export const LYNCH = { slow: "Slow Grower", stalwart: "Stalwart", fast: "Fast Grower", cyclical: "Cíclica", turnaround: "Turnaround", asset: "Asset Play" };
export const LYNCH_INFO = {
  slow: "Crece menos de 7% anual. Se compra por dividendo: se mira el payout, que el dividendo crezca y el precio bajo.",
  stalwart: "Empresa grande y sólida que crece 7-18% anual. Se compra cuando cotiza debajo de su P/E histórico y se toma ganancia en 30-50%.",
  fast: "Crece más de 18% anual. Lo clave es que el crecimiento siga y el PEG no se dispare (hasta 1,5 tolerado).",
  cyclical: "Ganancias que suben y bajan con el ciclo. Se compra con P/E alto (ganancias en el piso) y se vende con P/E bajo: se mira EV/EBITDA contra su historia, deuda y valor libro.",
  turnaround: "Viene de pérdidas y se espera que vuelva a ganar. Lo clave es que sobreviva: caja, años de caja, deuda e intereses.",
  asset: "Vale más por lo que tiene que por lo que gana: precio contra valor libro.",
};
const LYNCH_MOD = {
  fast:       { g: { Crecimiento: 1.5, Dividendos: 0.2 }, m: { peg: 1.3 }, add: { peg: 12, revG: 10, epsG: 10, omTrend: 6, dil: 4 } },
  stalwart:   { g: { Calidad: 1.25, Valuación: 1.15, Crecimiento: 0.9 }, m: {}, add: { roe: 8, divG: 6, revStab: 6, fcfConv: 6 }, hist: 1.3 },
  slow:       { g: { Dividendos: 1.8, Valuación: 1.2, Crecimiento: 0.5 }, m: {}, add: { payout: 10, divY: 12, divG: 8, shY: 6 } },
  cyclical:   { g: { Solidez: 1.4, Crecimiento: 0.5 }, m: { peg: 0.3, fpe: 0.5, pe: 0.5 }, add: { evEbitda: 12, pb: 8, ndEbitda: 8 }, hist: 1.4 },
  turnaround: { g: { Solidez: 1.8, Calidad: 0.7 }, m: { peg: 0, fpe: 0.4 }, add: { runway: 10, cr: 10, intCov: 8, ndEbitda: 8, omTrend: 10 } },
  asset:      { g: { Crecimiento: 0.5 }, m: { pb: 2 }, add: { pb: 16 } },
};
const CYCLICAL_PROFILES = new Set(["oilgas", "mining", "chemicals", "airlines", "autos", "leisure", "oilservices", "agro"]);

export function classifyLynch(r) {
  if (ok(r.eps) && r.eps <= 0) return "turnaround";
  if (r.sec !== "fin" && ok(r.pb) && r.pb > 0 && r.pb < 0.8) return "asset";
  if (CYCLICAL_PROFILES.has(r.profile) || r.profile === "semis" && /Equipment/.test(r.ind || "")) return "cyclical";
  if (r.c === "AR") return null;
  const g = ok(r.epsG) ? r.epsG : r.revG;
  if (!ok(g)) return null;
  return g < 7 ? "slow" : g < 18 ? "stalwart" : "fast";
}

// Pesos efectivos: perfil + ajuste Lynch + multiplicadores del usuario
// ---------- Ajustes automáticos por empresa ----------
// Además del perfil de industria y el tipo Lynch, cada empresa tiene situaciones propias que vuelven
// inútiles (o más importantes) ciertas métricas. Se detectan solas y quedan explicadas en la ficha.
const BIG_DEBT_OK = new Set(["reit", "utility", "midstream", "telecom", "realestate", "ipp"]);
function autoAdjust(r, w) {
  const out = [], fin = r.sec === "fin" && !["payments", "crypto"].includes(r.profile);
  const has = (k) => k in w;
  const drop = (ks) => ks.filter((k) => has(k)).map((k) => (delete w[k], k));
  const add = (k, v) => { if (!has(k) && METRICS[k]) { w[k] = v; return k; } return null; };
  const scale = (ks, f) => ks.filter((k) => has(k)).map((k) => ((w[k] *= f), k));
  const note = (t, ks) => { const k = ks.filter(Boolean); if (k.length) out.push({ t, k }); };

  // 1. Pierde plata: P/E y PEG no existen; se valúa por ventas
  if ((ok(r.eps) && r.eps <= 0) || (ok(r.fpe) && r.fpe <= 0)) {
    const k = drop(["pe", "fpe", "peg", "payout", "fcfConv"]);
    if (!fin) k.push(add("evRev", 12), ok(r.revG) && r.revG > 2 ? add("evRevG", 8) : null, add("runway", 6));
    note("Hoy pierde plata: no se usan P/E, PEG ni payout; se valúa por ventas y se mira cuánta caja le queda.", k);
  }
  // 2. Patrimonio casi nulo o negativo (recompras agresivas): ROE y P/B quedan inflados
  if (!fin && ((ok(r.pb) && r.pb <= 0) || (ok(r.roe) && r.roe > 100) || (ok(r.pb) && r.pb > 40))) {
    const moved = ["roe", "pb"].filter(has).reduce((a, k) => a + w[k], 0);
    const k = drop(["roe", "pb"]);
    if (k.length) { w.roic = (w.roic || 0) + moved; k.push("roic"); }
    note("Patrimonio contable casi nulo o negativo por recompras: ROE y precio/valor libro están distorsionados, su peso pasa al ROIC.", k);
  }
  // 3. No paga dividendo: no se la castiga por eso (salvo Slow Growers, que se compran por dividendo)
  if (!(r.divY > 0) && r.lynch !== "slow") note("No paga dividendo: dividend yield, payout y crecimiento del dividendo no cuentan.", drop(["divY", "payout", "divG"]));
  // 4. Ganancia extraordinaria: el margen neto supera por mucho al operativo
  if (!fin && ok(r.nm) && ok(r.om) && r.nm > r.om + 12) {
    note("El margen neto supera por mucho al operativo (probable ganancia extraordinaria): el P/E pesa menos y se suma EV/EBITDA.", [...scale(["pe", "fpe", "peg"], 0.5), add("evEbitda", 8)]);
  }
  // 5. Hipercrecimiento: el múltiplo de ganancias engaña, manda el crecimiento
  if (ok(r.revG) && r.revG >= 40 && r.lynch !== "cyclical") {
    note(`Crece ${fmt(r.revG, "%", 0)} anual: pesa más el crecimiento y se valúa con EV/Ventas ajustado por crecimiento.`, [...scale(["pe", "fpe"], 0.6), ...scale(["revG", "rule40"], 1.3), !fin ? add("evRevG", 8) : null]);
  }
  // 6. Pocos analistas: el crecimiento estimado es poco confiable
  if (ok(r.nAn) && r.nAn < 4) note(`Solo ${r.nAn} ${r.nAn === 1 ? "analista la cubre" : "analistas la cubren"}: el crecimiento estimado y el PEG pesan menos.`, scale(["epsG", "peg"], 0.4));
  // 7. Quema caja: importa cuánto le dura
  if (!fin && ok(r.fcf) && r.fcf < 0) note("Quema caja: se suman años de caja y liquidez.", [add("runway", 10), add("cr", 6)]);
  // 8. Deuda alta para su industria
  if (!fin && ok(r.ndEbitda) && r.ndEbitda > 3 && !BIG_DEBT_OK.has(r.profile)) {
    note(`Deuda neta de ${fmt(r.ndEbitda, "x")} su EBITDA: la solidez financiera pesa más.`, [...scale(["ndEbitda", "cr", "intCov"], 1.4), add("intCov", 8), add("ndEbitda", 10)]);
  }
  // 9. Caja neta: la cobertura de intereses no aporta
  if (!fin && ok(r.ndEbitda) && r.ndEbitda < 0) note("Tiene más caja que deuda: la cobertura de intereses no aporta.", drop(["intCov"]));
  // 10. Paga mucho en acciones aunque no sea software
  if (ok(r.sbc) && r.sbc > 8) note(`Paga ${fmt(r.sbc, "%", 0)} de sus ventas en acciones: se suma la dilución.`, [add("sbc", 6), add("dil", 6)]);
  // 11. Dividendo que crece de forma sostenida (Stalwarts y Slow Growers)
  if (["stalwart", "slow"].includes(r.lynch) && ok(r.divG) && r.divG > 5 && r.divY > 1.5) note("Dividendo que crece más de 5% anual: se suma su crecimiento.", [add("divG", 8), add("payout", 4)]);
  // 12. Mucha caja sobre su valor: EV/EBITDA refleja mejor el precio que el P/E
  if (!fin && ok(r.ndEbitda) && r.ndEbitda < -2) note("Mucha caja neta: se suma EV/EBITDA, que descuenta esa caja del precio.", [add("evEbitda", 8)]);
  return out;
}

export function weightsFor(r, userMult = {}, profW = {}) {
  const w = { ...(profW[r.profile] || PROFILES[r.profile].w) };
  const mod = LYNCH_MOD[r.lynch];
  if (mod) {
    for (const [k, v] of Object.entries(mod.add || {})) if (!(k in w)) w[k] = v;
    for (const [k, v] of Object.entries(mod.m || {})) if (k in w) w[k] *= v;
    for (const k of Object.keys(w)) w[k] *= mod.g?.[METRICS[k].g] ?? 1;
  }
  if (r.sec === "fin" && !["payments", "crypto"].includes(r.profile)) for (const k of ["roic", "ndEbitda", "evEbitda", "evRev", "cr", "fcfY", "intCov", "fcfM"]) delete w[k];
  r.auto = autoAdjust(r, w);
  // Argentina: crecimiento y PEG en pesos no son comparables (inflación)
  if (r.c === "AR") for (const k of ["revG", "epsG", "peg", "rule40", "evRevG", "divG", "omTrend"]) delete w[k];
  r.offKeys = [];
  for (const k of r.off || []) if (k in w) { delete w[k]; r.offKeys.push(k); }
  for (const k of Object.keys(w)) { if (!METRICS[k]) { delete w[k]; continue; } w[k] *= userMult[METRICS[k].g] ?? 1; if (!w[k]) delete w[k]; }
  return w;
}

// ---------- Preparación de cada fila ----------
export function derive(raw, ov, fx) {
  const r = { ...raw };
  r.epsG = raw.epsLT ?? raw.epsNY ?? (raw.feps > 0 && raw.eps > 0 ? (raw.feps / raw.eps - 1) * 100 : null) ?? raw.epsQ;
  if (r.sec === "fin") { r.roic = null; r.de = null; r.ndEbitda = null; r.gm = null; }
  if (ok(r.roic) && Math.abs(r.roic) > 150) r.roic = null;
  if (ok(r.evEbitda) && (r.evEbitda <= 0 || r.evEbitda > 300)) r.evEbitda = null;
  if (!(r.divY > 0)) r.payout = null;
  // Métricas de estados anuales (sync semanal)
  r.fx = fx || null;
  const L = fx?.latest || {};
  for (const k of ["fcfM", "rnd", "sbc", "invTurn", "eff", "intCov", "divG", "runway", "backlog", "capexInt", "roa", "fcfConv", "omTrend", "dil", "revStab"]) if (r[k] == null && ok(L[k])) r[k] = L[k];
  if (r.c === "AR") r.epsG = null;
  if (r.sec !== "fin" && !ok(r.ndEbitda) && ok(fx?.fy?.ndEbitda?.at(-1))) r.ndEbitda = fx.fy.ndEbitda.at(-1);
  r.pffo = ok(r.mcap) && L.ffoUsd > 0 ? r.mcap / L.ffoUsd : null;
  r.shY = ok(r.mcap) && ok(L.payoutsUsd) ? (L.payoutsUsd / r.mcap) * 100 : null;
  r.rule40 = ok(r.revG) && ok(r.fcfM) ? r.revG + r.fcfM : null;
  r.evRevG = ok(r.evRev) && r.evRev > 0 && ok(r.revG) && r.revG > 2 ? r.evRev / r.revG : null;
  r.d52 = ok(raw.px) && raw.hi52 ? (raw.px / raw.hi52 - 1) * 100 : null;
  r.edited = new Set();
  for (const [k, v] of Object.entries(ov?.metrics || {})) if (METRICS[k] || ["pe", "nm", "eps", "feps"].includes(k)) if (v !== "" && v != null && isFinite(Number(v))) { r[k] = Number(v); r.edited.add(k); }
  r.peg = ok(r.fpe) && r.fpe > 0 && ok(r.epsG) && r.epsG > 0 ? r.fpe / r.epsG : null;
  r.profile = ov?.metrics?.profile || profileOf(r);
  r.lynchAuto = classifyLynch(r);
  r.lynch = ov?.lynch_type || r.lynchAuto;
  r.fair = ov?.fair_value != null && ov.fair_value !== "" && isFinite(Number(ov.fair_value)) ? Number(ov.fair_value) : null;
  r.fairUp = r.fair && r.px ? (r.fair / r.px - 1) * 100 : null;
  r.notes = ov?.notes || "";
  r.thesis = ov?.metrics?.thesis || null;
  r.kpi = ov?.metrics?.kpi || {};
  r.off = Array.isArray(ov?.metrics?.off) ? ov.metrics.off : [];
  r.hasThesis = !!(r.fair || r.notes || ov?.lynch_type || r.thesis);
  r.family = r.profile;
  return r;
}

export const median = (a) => { const b = a.filter(ok).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
function cmpVal(r, k) { const v = r[k]; if (!ok(v)) return null; if (METRICS[k]?.pos && v <= 0) return null; return v; }
const avg = (a) => { const v = a.filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

// Historia propia: valor actual contra los últimos ejercicios
const CYCLE_FLIP = new Set(["pe", "fpe", "evEbitda", "om", "gm", "roic", "roe"]);
export function histOf(r, k) {
  const s = r.fx?.fy?.[k];
  if (!s) return null;
  const vals = s.filter(ok).filter((v) => !(METRICS[k]?.pos && v <= 0));
  const cur = cmpVal(r, k);
  if (vals.length < 3 || cur == null) return null;
  const a = avg(vals);
  // Cíclicas (Lynch): P/E y EV/EBITDA altos y márgenes bajos contra su historia = cerca del piso del ciclo
  const flip = r.lynch === "cyclical" && CYCLE_FLIP.has(k);
  const dir = (METRICS[k]?.dir ?? 1) * (flip ? -1 : 1);
  let better = 0;
  for (const v of vals) { if (dir > 0 ? cur > v : cur < v) better++; else if (cur === v) better += 0.5; }
  const diff = a ? (cur / a - 1) * 100 : null;
  return { avg: a, cur, n: vals.length, years: r.fx.years, series: s, p: Math.round((better / vals.length) * 100), diff, flip, better: ok(diff) ? (dir > 0 ? diff > 0 : diff < 0) : null };
}

export function scoreAll(rows, { peer = "sector", userMult = {}, profW = {} } = {}) {
  const groupKey = (r) => (peer === "sector-country" ? r.sec + "|" + r.c : r.sec);
  // Las acciones argentinas no entran como pares de las del resto del mundo (inflación en pesos distorsiona crecimiento y márgenes)
  const mk = () => ({ sec: new Map(), prof: new Map() });
  const G = { all: mk(), ext: mk() };
  for (const r of rows) {
    const a = groupKey(r), b = r.profile + (peer === "sector-country" ? "|" + r.c : "");
    for (const g of r.c === "AR" ? [G.all] : [G.all, G.ext]) {
      if (!g.sec.has(a)) g.sec.set(a, []); g.sec.get(a).push(r);
      if (!g.prof.has(b)) g.prof.set(b, []); g.prof.get(b).push(r);
    }
  }
  const histW = 0.25 * (userMult["Historia"] ?? 1);
  for (const r of rows) {
    const g = r.c === "AR" ? G.all : G.ext;
    const prof = g.prof.get(r.profile + (peer === "sector-country" ? "|" + r.c : "")), sect = g.sec.get(groupKey(r));
    // Industrias con pares fijos (neocloud: NBIS, CRWV, IREN, APLD) se comparan solo entre sí aunque sean pocas
    const fixed = !!PROFILES[r.profile].fixed;
    r.peerN = prof.length >= 6 || fixed ? prof.length : sect.length;
    r.peerLabel = prof.length >= 6 || fixed ? PROFILES[r.profile].l : peer === "sector-country" ? `${SECTORS[r.sec]} · ${COUNTRIES[r.c] || r.c}` : SECTORS[r.sec];
    r.pct = {}; r.med = {}; r.hist = {};
    for (const k of Object.keys(METRICS)) {
      // Pares: misma industria si hay al menos 5 con dato; si no, el sector
      let peers = prof, vals = prof.map((p) => cmpVal(p, k)).filter(ok);
      if (vals.length < 5 && !fixed) { peers = sect; vals = sect.map((p) => cmpVal(p, k)).filter(ok); }
      r.med[k] = median(vals);
      const v = cmpVal(r, k);
      if (v == null) { if (METRICS[k].pos && ok(r[k]) && r[k] <= 0 && k !== "payout") r.pct[k] = 0; if (k === "peg" && r.peg == null && ok(r.fpe) && (r.fpe <= 0 || (ok(r.epsG) && r.epsG <= 0))) r.pct[k] = 0; continue; }
      if (vals.length < (fixed ? 3 : 4)) continue;
      let below = 0, eq = 0;
      for (const x of vals) { if (x < v) below++; else if (x === v) eq++; }
      let p = ((below + eq / 2) / vals.length) * 100;
      if (METRICS[k].dir < 0) p = 100 - p;
      r.pct[k] = Math.round(p);
      const h = histOf(r, k); if (h) r.hist[k] = h;
    }
    for (const k of ["nm", "upside", "d52", "beta", "capexInt"]) r.med[k] = median(sect.map((p) => p[k]));
    // Score contra pares
    r.weights = weightsFor(r, userMult, profW);
    let tot = 0, sw = 0, ss = 0; const gs = {};
    for (const [k, w] of Object.entries(r.weights)) {
      tot += w; const g = METRICS[k].g; gs[g] = gs[g] || { s: 0, w: 0 };
      if (r.pct[k] == null) continue;
      sw += w; ss += w * r.pct[k]; gs[g].s += w * r.pct[k]; gs[g].w += w;
    }
    r.coverage = tot ? sw / tot : 0;
    const peerScore = r.coverage >= 0.5 ? ss / sw : null;
    // Bloque "Vs su historia"
    const mod = LYNCH_MOD[r.lynch];
    const hk = PROFILES[r.profile].hist.filter((k) => r.hist[k]);
    r.histKeys = hk;
    const hs = hk.length >= 2 ? avg(hk.map((k) => r.hist[k].p)) : null;
    const hw = Math.min(0.6, histW * (mod?.hist ?? 1));
    r.score = peerScore == null ? null : Math.round(hs != null && hw > 0 ? peerScore * (1 - hw) + hs * hw : peerScore);
    r.gscore = Object.fromEntries(GROUPS.map((g) => [g, g === "Historia" ? (hs != null ? Math.round(hs) : null) : gs[g]?.w ? Math.round(gs[g].s / gs[g].w) : null]));
    // Fundamentos y alertas
    r.why = []; r.alerts = [];
    for (const [k, w] of Object.entries(r.weights)) {
      const p = r.pct[k], m = METRICS[k];
      if (p == null || !ok(r[k])) continue;
      if (p >= 80) r.why.push({ k, w, p, t: `${m.l} de ${fmt(r[k], m.f, m.d)}: mejor que el ${p}% de ${r.peerLabel}` });
      if (p <= 20) r.alerts.push({ k, w, p, t: `${m.l} de ${fmt(r[k], m.f, m.d)}: peor que el ${100 - p}% de ${r.peerLabel}` });
    }
    for (const k of hk) {
      const h = r.hist[k], m = METRICS[k];
      if (Math.abs(h.diff ?? 0) < 10) continue;
      const better = h.better;
      const t = `${m.l} ${fmt(h.cur, m.f, m.d)} vs ${fmt(h.avg, m.f, m.d)} de promedio en sus últimos ${h.n} ejercicios`;
      const head = h.flip ? (better ? "Cíclica cerca del piso del ciclo" : "Cíclica cerca del pico del ciclo") : better ? (m.g === "Valuación" ? "Más barata que su historia" : "Mejor que su historia") : (m.g === "Valuación" ? "Más cara que su historia" : "Peor que su historia");
      (better ? r.why : r.alerts).push({ k, w: 8, p: better ? 85 : 15, t: `${head}: ${t}` });
    }
    if (ok(r.fcf) && r.fcf < 0 && r.sec !== "fin") r.alerts.push({ w: 99, t: ok(r.runway) ? `Quema caja: le alcanza para ${fmt(r.runway, "x", 1).replace("x", "")} años al ritmo actual` : "Quema caja: el free cash flow es negativo" });
    if (ok(r.eps) && r.eps <= 0) r.alerts.push({ w: 98, t: "Hoy pierde plata (EPS de los últimos 12 meses negativo)" });
    if (ok(r.revG) && r.revG < -5) r.alerts.push({ w: 97, t: `Ventas cayendo ${fmt(-r.revG, "%")} interanual` });
    if (ok(r.ndEbitda) && r.ndEbitda > (["reit", "utility", "midstream", "telecom"].includes(r.profile) ? 6.5 : 4)) r.alerts.push({ w: 96, t: `Deuda alta: ${fmt(r.ndEbitda, "x")} su EBITDA` });
    if (ok(r.payout) && r.payout > (["reit", "utility", "midstream"].includes(r.profile) ? 110 : 85)) r.alerts.push({ w: 95, t: `Payout de ${fmt(r.payout, "%", 0)}: el dividendo está poco cubierto por la ganancia` });
    if (ok(r.sbc) && r.sbc > 15) r.alerts.push({ w: 94, t: `Paga ${fmt(r.sbc, "%", 0)} de sus ventas en acciones: diluye al accionista` });
    if (ok(r.eff) && r.eff > 65) r.alerts.push({ w: 93, t: `Banco poco eficiente: gasta ${fmt(r.eff, "%", 0)} de sus ingresos en operar` });
    if (ok(r.dil) && r.dil > 4) r.alerts.push({ w: 91, t: `Diluye: la cantidad de acciones crece ${fmt(r.dil, "%", 1)} por año` });
    if (ok(r.fcfConv) && r.fcfConv < 50 && r.sec !== "fin" && ok(r.eps) && r.eps > 0) r.alerts.push({ w: 90, t: `Solo ${fmt(r.fcfConv, "%", 0)} de la ganancia se convierte en caja: revisar la calidad de las ganancias` });
    if (r.profile === "bank" && ok(r.roa) && r.roa < 0.7) r.alerts.push({ w: 89, t: `ROA de ${fmt(r.roa, "%", 2)}: rentabilidad baja sobre sus activos` });
    if (ok(r.intCov) && r.intCov < 2 && r.intCov > -50 && r.sec !== "fin") r.alerts.push({ w: 92, t: `La ganancia operativa cubre ${fmt(r.intCov, "x")} los intereses` });
    r.why.sort((a, b) => b.w * b.p - a.w * a.p);
    r.alerts.sort((a, b) => b.w - a.w);
    // Candidata
    const val = r.gscore["Valuación"];
    const pegMax = r.lynch === "fast" ? 1.5 : 1.2;
    const pegOk = !["fast", "stalwart"].includes(r.lynch) || r.profile === "neocloud" || (ok(r.peg) && r.peg <= pegMax);
    const base = ok(r.score) && r.score >= 70 && ok(val) && val >= 55 && pegOk;
    // Tesorerías cripto: valen por su cripto (mNAV), no por fundamentales: no se marcan solas como candidatas
    r.cand = (base && r.c !== "AR" && r.profile !== "crypto") || (ok(r.fairUp) && r.fairUp >= 15);
    r.candReason = base ? `Score ${r.score} con valuación mejor que el ${val}% de ${r.peerLabel}${["fast", "stalwart"].includes(r.lynch) && ok(r.peg) ? ` y PEG ${fmt(r.peg, "x", 2)}` : ""}` : r.cand ? `Tu precio justo deja ${fmt(r.fairUp, "%", 0)} de margen` : "";
    r.verdict = verdict(r);
  }
  return rows;
}

function verdict(r) {
  const lv = (s) => (!ok(s) ? null : s >= 70 ? "good" : s >= 45 ? "mid" : "bad");
  const g = r.gscore;
  const v = {
    Calidad: { q: "¿Es buen negocio?", s: g["Calidad"], t: { good: "Sí: rentabilidad por encima de sus pares.", mid: "Normal para su industria.", bad: "Rentabilidad por debajo de sus pares." } },
    Crecimiento: { q: "¿Crece?", s: g["Crecimiento"], t: { good: "Crece más rápido que su industria.", mid: "Crece en línea con su industria.", bad: "Crece menos que su industria." } },
    Valuación: { q: "¿Está barata?", s: g["Valuación"], t: { good: "Barata contra sus pares.", mid: "Precio en línea con sus pares.", bad: "Cara contra sus pares." } },
    Solidez: { q: "¿Está sana?", s: g["Solidez"], t: { good: "Deuda baja y buena liquidez.", mid: "Deuda manejable.", bad: "Deuda o liquidez para vigilar." } },
    Historia: { q: "¿Y contra su historia?", s: g["Historia"], t: { good: "Mejor o más barata que su promedio de los últimos años.", mid: "En línea con su historia.", bad: "Peor o más cara que su promedio de los últimos años." } },
  };
  if (!ok(v.Solidez.s) && r.sec === "fin") delete v.Solidez;
  for (const x of Object.values(v)) { x.lv = lv(x.s); x.txt = x.lv ? x.t[x.lv] : "Sin datos suficientes."; }
  return v;
}

// ---------- Formato ----------
const nfCache = {};
export const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
export function fmt(v, f, d) {
  if (!ok(v)) return "—";
  const dd = d ?? (f === "%" || f === "x" ? 1 : 2);
  if (Math.abs(v) < 0.5 * 10 ** -dd) v = 0;
  if (f === "%") return nf(dd).format(v) + "%";
  if (f === "x") return nf(dd).format(v) + "x";
  if (f === "pp") return (v > 0 ? "+" : "") + nf(dd).format(v) + " pp";
  return nf(dd).format(v);
}
export function fmtCap(v) {
  if (!ok(v)) return "—";
  if (Math.abs(v) >= 1e12) return "US$ " + nf(2).format(v / 1e12) + " T";
  if (Math.abs(v) >= 1e9) return "US$ " + nf(1).format(v / 1e9) + " B";
  return "US$ " + nf(0).format(v / 1e6) + " M";
}
export function fmtBig(v, cur) {
  if (!ok(v)) return "—";
  const a = Math.abs(v), s = cur && cur !== "USD" ? cur + " " : "US$ ";
  if (a >= 1e12) return s + nf(2).format(v / 1e12) + " T";
  if (a >= 1e9) return s + nf(1).format(v / 1e9) + " B";
  if (a >= 1e6) return s + nf(0).format(v / 1e6) + " M";
  return s + nf(0).format(v);
}
export const scoreCls = (s) => (!ok(s) ? "s-na" : s >= 70 ? "s-good" : s >= 45 ? "s-mid" : "s-bad");
