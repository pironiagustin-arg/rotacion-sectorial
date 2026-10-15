// Metadatos del Screener. Lo usan el front (screener.html) y la API (api/screener.js, api/sync.js).
import { UNIVERSE } from "./universe-data.js";
export { UNIVERSE };

export const SECTORS = {
  tech: "Tecnología", fin: "Financiero", health: "Salud", discr: "Consumo discrecional",
  staples: "Consumo básico", energy: "Energía", ind: "Industrial", mat: "Materiales",
  util: "Servicios públicos", re: "Bienes raíces", comm: "Comunicaciones",
};

export const MARKETS = {
  SP500: "S&P 500", NDX: "Nasdaq 100", USX: "EE.UU. (otras)", IA: "Canasta IA", GLOBAL: "Internacional",
  CHINA: "China y HK", KOSPI: "KOSPI", IBOV: "Bovespa", MERV: "Argentina",
};

export const COUNTRIES = {
  US: "Estados Unidos", AR: "Argentina", BR: "Brasil", UY: "Uruguay", KR: "Corea del Sur", CN: "China",
  HK: "Hong Kong", TW: "Taiwán", JP: "Japón", IN: "India", NL: "Países Bajos", DE: "Alemania", FR: "Francia",
  GB: "Reino Unido", CH: "Suiza", DK: "Dinamarca", ES: "España", SE: "Suecia", CA: "Canadá", AU: "Australia",
  SG: "Singapur", LU: "Luxemburgo", MX: "México", CL: "Chile", CO: "Colombia", NO: "Noruega",
  IT: "Italia", FI: "Finlandia", ZA: "Sudáfrica", NG: "Nigeria", IL: "Israel", IE: "Irlanda",
};

// Acciones sin CEDEAR que se usan solo como pares de comparación (mercado "REF"): no aparecen en Screener ni candidatas
export const isRef = (mk) => (mk || "").split(" ").includes("REF");

// Lotes fijos: el mismo lote siempre tiene los mismos símbolos, así el CDN de Vercel lo cachea.
export const BATCH_SIZE = 40;
export const SYMBOLS = UNIVERSE.map((r) => r[0]);
export const BATCH_COUNT = Math.ceil(SYMBOLS.length / BATCH_SIZE);
export const batchSymbols = (i) => SYMBOLS.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
