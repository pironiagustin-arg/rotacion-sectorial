// Lectura automática de lo que dijo el management en el comunicado de resultados (tono, guidance y temas)
export function talkRead(tk) {
  const en = [...tk.quotes.map((q) => q.text), ...tk.outlook].join(" ");
  const cnt = (re) => (en.match(re) || []).length;
  const pos = cnt(/\b(record|strong|accelerat\w*|momentum|exceed\w*|robust|confident|inflection|exceptional|outstanding|best|healthy|expand\w*)\b/gi);
  const neg = cnt(/\b(headwind\w*|challeng\w*|uncertain\w*|declin\w*|pressure\w*|soft\w*|weak\w*|cautious|slow\w*|difficult|volatil\w*|tariff\w*|disappoint\w*)\b/gi);
  const tone = pos + neg === 0 ? null : (pos - neg) / (pos + neg);
  const g = /rais(e|ed|es|ing)\b[^.]{0,50}(outlook|guidance|forecast)|(outlook|guidance)[^.]{0,30}\brais/i.test(en) ? ["sube", "pos", "Subió el guidance"]
    : /(lower|reduc|cut)(s|ed|ing)?\b[^.]{0,50}(outlook|guidance|forecast)/i.test(en) ? ["baja", "neg", "Bajó el guidance"]
    : /reaffirm|reiterat|maintain(s|ed)? (its |the |our )?(full[- ]year |annual )?(outlook|guidance)/i.test(en) ? ["mantiene", "", "Ratificó el guidance"]
    : tk.outlook.length ? ["da", "", "Dio guidance para el próximo período"] : null;
  const TH = [["IA", /\bAI\b|artificial intelligence|generative|GPU|inference|tokens?\b/i], ["Demanda", /demand|backlog|bookings|pipeline|orders/i], ["Márgenes", /margin/i], ["Inversión y capacidad", /capital expenditure|capex|data cent|capacity|build ?out|infrastructure/i], ["Recompras y dividendos", /repurchase|buyback|dividend|returned .{0,20}shareholders/i], ["Costos y eficiencia", /cost|efficien|restructur|productivity/i], ["Macro y consumo", /macro|tariff|consumer|inflation|interest rate|economy/i], ["Productos nuevos", /launch|new product|introduc|platform|innovation/i], ["Clientes", /customer|client|users?\b|subscriber|members/i], ["Expansión internacional", /international|global|emerging markets|China|Europe/i]];
  const themes = TH.filter(([, re]) => re.test(en)).map(([l]) => l).slice(0, 6);
  return { tone, toneTxt: tone == null ? null : tone > 0.35 ? "Optimista" : tone < -0.2 ? "Cauto" : "Equilibrado", g, themes, date: tk.date, url: tk.url, quotes: tk.quotes, outlook: tk.outlook, outlook_es: tk.outlook_es };
}

// Traducción al español desde el navegador (traductor público de Google). Devuelve null si falla.
export async function trEs(text) {
  if (!text) return null;
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text.slice(0, 1800))}`);
    if (!r.ok) return null;
    return ((await r.json())?.[0] || []).map((x) => x[0]).join("");
  } catch { return null; }
}
