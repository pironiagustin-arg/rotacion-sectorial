// /api/sectors?range=1w|1m|3m|6m|1y|3y|5y  — rendimiento acumulado, spread relativo, RRG, alertas y correlaciones de sectores SPDR vs SPY
import { SECTOR_META, rangeParams, fetchChart, align, round, rrg, relMomentum, rsChange, zScoreLast, correlation, liveQuote } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const rp = rangeParams(String(req.query?.range || "1y"));
    const symbols = Object.keys(SECTOR_META);
    const failed = [];
    const needsDaily = ["1w", "3y", "5y"].includes(rp.key);
    const [charts, daily] = await Promise.all([
      Promise.all(symbols.map((s) => fetchChart(s, rp.qs).catch(() => { failed.push(s); return null; }))),
      // para la cotización "en vivo" necesitamos barras diarias; con rangos semanales / intradiarios se piden aparte
      needsDaily ? Promise.all(symbols.map((s) => fetchChart(s, "range=5d&interval=1d").catch(() => null))) : Promise.resolve(symbols.map(() => null)),
    ]);
    const C = Object.fromEntries(symbols.map((s, i) => [s, charts[i]]));
    const D = Object.fromEntries(symbols.map((s, i) => [s, daily[i]]));
    if (!C.SPY) { res.status(502).json({ error: "No pude obtener el benchmark (SPY)" }); return; }

    const others = Object.fromEntries(symbols.filter((s) => s !== "SPY" && C[s]).map((s) => [s, C[s]]));
    const { dates, closes } = align(C.SPY, others);
    const bench = closes.__bench;

    const series = symbols.filter((s) => s === "SPY" || closes[s]).map((s) => {
      const px = s === "SPY" ? bench : closes[s];
      const first = px.find((v) => v != null);
      const cum = px.map((v) => (v != null && first ? (v / first - 1) * 100 : null));
      const benchFirst = bench[0];
      const benchCum = bench.map((v) => (v / benchFirst - 1) * 100);
      return {
        symbol: s, name: SECTOR_META[s].name, color: SECTOR_META[s].color, is_benchmark: !!SECTOR_META[s].is_benchmark,
        dates, cum_return_pct: cum.map((v) => round(v, 3)),
        rel_spread_pct: cum.map((v, i) => (v == null ? null : round(v - benchCum[i], 3))),
      };
    });

    // RRG y alertas (momentum y z-score sobre las barras del rango elegido, ventana de 20 barras)
    const rrgOut = {}, alerts = {};
    for (const s of symbols) {
      if (s === "SPY" || !closes[s]) continue;
      rrgOut[s] = rrg(closes[s], bench, dates);
      const mom = relMomentum(closes[s], bench, 20);
      const z = zScoreLast(rsChange(closes[s], bench, 20));
      let status = "neutral";
      if (mom.filter((x) => x != null).length < 10 || z == null) status = "insuficiente_historial";
      else if (z >= 1.5) status = "rotacion_alcista";
      else if (z <= -1.5) status = "rotacion_bajista";
      alerts[s] = status === "insuficiente_historial" ? { status } : { z: round(z, 2), momentum_20d: round(mom[mom.length - 1], 2), status };
    }

    const live = {};
    for (const s of symbols) if (D[s] || C[s]) live[s] = liveQuote(D[s] || C[s]);

    const corr = {};
    const cs = ["SPY", ...Object.keys(others)];
    for (const a of cs) {
      corr[a] = {};
      for (const b of cs) corr[a][b] = a === b ? 1 : round(correlation(a === "SPY" ? bench : closes[a], b === "SPY" ? bench : closes[b]), 2);
    }

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ meta: SECTOR_META, range: rp.key, series, live, alerts, rrg: rrgOut, correlations: corr, last_update: new Date().toISOString(), failed_tickers: failed });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
