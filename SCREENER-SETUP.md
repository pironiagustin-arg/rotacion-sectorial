# Screener global: puesta en marcha

## 1. Subir los archivos al repo
Subí todo respetando las carpetas, desde GitHub: Add file → Upload files, arrastrando las carpetas.

- Nuevos: `screener.html`, `config.js`, `js/screener.js`, `lib/universe.js`, `lib/universe-data.js`, `api/_screen.js`, `api/screener.js`, `api/sync.js`, `supabase/schema.sql`, `.github/workflows/sync-screener.yml`
- Modificados: `vercel.json` (timeouts de las APIs nuevas) y la barra de navegación de `index.html`, `rotation.html`, `rotation-stocks.html`, `fundamentals.html` y `watchlist.html` (ahora tienen el link "Screener").
- Limpieza: la carpeta `api/api/` es un duplicado viejo. Borrala.

Si la carpeta `.github` no aparece al arrastrar (Mac oculta las carpetas que empiezan con punto), creala a mano: Add file → Create new file, escribí `.github/workflows/sync-screener.yml` como nombre y pegá el contenido.

**Con este paso ya funciona.** Los datos se bajan en vivo de Yahoo y tus ediciones se guardan en el navegador.

## 2. Supabase (base de datos y ediciones sincronizadas)
1. En supabase.com creá un proyecto nuevo (por ejemplo `screener`).
2. Andá a SQL Editor, pegá `supabase/schema.sql` y ejecutalo.
3. En Authentication → URL Configuration, poné tu dominio de Vercel como Site URL (por ejemplo `https://rotacion-sectorial.vercel.app`).
4. En Project Settings → API copiá:
   - la Project URL y la clave `anon public`, que van en `config.js`;
   - la clave `service_role`, que va a Vercel (paso 3) y **nunca** a `config.js`.

## 3. Variables de entorno en Vercel
En Project → Settings → Environment Variables cargá:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | La Project URL |
| `SUPABASE_SERVICE_KEY` | La clave service_role |
| `SYNC_SECRET` | Cualquier texto largo inventado por vos |

Después hacé Redeploy.

## 4. Sync diario (GitHub Actions)
1. En el repo andá a Settings → Secrets and variables → Actions → New repository secret y cargá:
   - `SITE_URL`: tu dominio de Vercel, sin barra al final;
   - `SYNC_SECRET`: el mismo texto del paso 3.
2. En Actions → Sync screener → Run workflow corré la primera carga.

Después corre solo de lunes a viernes a las 19:30 (hora de Buenos Aires). Con eso el screener abre al instante desde Supabase y guarda una foto diaria de cada acción en `snapshot_history`.

## Cómo editar el universo
`lib/universe-data.js` tiene una línea por acción con este formato: `[símbolo Yahoo, nombre, sector, país, mercados]`.
- Para agregar una acción, sumá una línea. Ejemplos de símbolo: `AAPL`, `PETR4.SA`, `GGAL`, `005930.KS`, `0700.HK`.
- Los sectores válidos son `tech fin health discr staples energy ind mat util re comm`.
- Los mercados válidos son `SP500 NDX IBOV MERV KOSPI CHINA GLOBAL IA`.

## Cómo funciona el score
- Cada métrica se convierte en un percentil (0 a 100) dentro de su grupo de pares: el sector global, o el sector dentro de su país.
- Esos percentiles se ponderan con los pesos que elegís en "Pesos del score".
- Valuación: PEG, P/E forward y FCF yield. Calidad: ROIC, ROE, margen operativo y deuda/patrimonio. Crecimiento: EPS esperado y ventas.
- El PEG se calcula a mano como P/E forward ÷ crecimiento de EPS esperado. Si el EPS esperado no está disponible, se usa EPS forward vs. LTM.
- **Candidata**: score ≥ 70 y PEG < 1 (o < 1,5 si es Fast Grower). También entra si tu precio justo deja 15% o más de margen.
- El ROIC es aproximado: EBIT × (1 − 21%) ÷ (deuda + patrimonio − caja).
