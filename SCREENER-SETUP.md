# Screener global: puesta en marcha

## 1. Subir los archivos al repo
Subí todo respetando las carpetas, desde GitHub: Add file → Upload files, arrastrando las carpetas.

- Nuevos: `screener.html`, `config.js`, `js/screener.js`, `lib/universe.js`, `lib/universe-data.js`, `api/_screen.js`, `api/screener.js`, `api/sync.js`, `supabase/schema.sql`, `.github/workflows/sync-screener.yml`
- Modificados: `vercel.json` (timeouts de las APIs nuevas) y la barra de navegación de `index.html`, `rotation.html`, `rotation-stocks.html`, `fundamentals.html` y `watchlist.html` (ahora tienen el link "Screener").
- Limpieza: la carpeta `api/api/` es un duplicado viejo. Borrala.

Si la carpeta `.github` no aparece al arrastrar (Mac oculta las carpetas que empiezan con punto), creala a mano: Add file → Create new file, escribí `.github/workflows/sync-screener.yml` como nombre y pegá el contenido.

**Con este paso ya funciona.** Los datos se bajan en vivo de Yahoo y tus ediciones se guardan en el navegador.

## 2. Supabase y Vercel (ya configurado)
- Proyecto Supabase: `screener` (sa-east-1), con las tablas `snapshots`, `snapshot_history` y `overrides`, todas con RLS.
- `config.js` ya tiene la URL y la clave pública.
- El sync escribe con la función `sync_snapshots`, que valida el secreto. No hace falta la service key.
- Vercel solo necesita la variable `SYNC_SECRET`.

## 3. Sync diario (GitHub Actions)
En Settings → Secrets and variables → Actions cargá dos secrets:
- `SITE_URL`: el dominio de Vercel, sin barra al final.
- `SYNC_SECRET`: el mismo valor que tiene Vercel.

Después corré Actions → Sync screener → Run workflow. A partir de ahí se ejecuta solo de lunes a viernes a las 19:30 (hora de Buenos Aires).

## Cómo editar el universo
`lib/universe-data.js` tiene una línea por acción con este formato: `[símbolo Yahoo, nombre, sector, país, mercados]`.
- Para agregar una acción, sumá una línea. Ejemplos de símbolo: `AAPL`, `PETR4.SA`, `GGAL`, `005930.KS`, `0700.HK`.
- Los sectores válidos son `tech fin health discr staples energy ind mat util re comm`.
- Los mercados válidos son `SP500 NDX IBOV MERV KOSPI CHINA GLOBAL IA`.

## Cómo funciona el score
- **Perfil de industria:** cada empresa se asigna a uno de 39 perfiles (bancos, software, neocloud, retail, REITs, minería, etc.) según su industria en Yahoo. Se puede cambiar a mano en la ficha.
- **Qué mide cada perfil:** el perfil define qué métricas cuentan y cuánto pesa cada una. Por ejemplo, efficiency ratio en bancos, Rule of 40 en software, backlog (RPO de la SEC) en neoclouds, P/FFO en REITs y rotación de inventario en retail.
- **Ajuste por tipo Lynch:** agrega y reajusta métricas. Slow Grower suma payout y crecimiento del dividendo; cíclica suma EV/EBITDA, valor libro y deuda; turnaround suma años de caja y cobertura de intereses.
- **Ajustes automáticos por empresa:** según su situación, cada empresa ajusta sola qué métricas cuentan:
  - si pierde plata, no se usan P/E ni PEG y se valúa por ventas;
  - si tiene patrimonio negativo por recompras, el peso de ROE y P/B pasa al ROIC;
  - si no paga dividendo, no se la castiga por eso;
  - si tuvo una ganancia extraordinaria, el P/E pesa la mitad;
  - si crece más de 40%, manda el crecimiento;
  - si la cubren pocos analistas, el crecimiento estimado pesa menos;
  - si quema caja o tiene deuda alta, pesa más la solidez;
  - si paga mucho en acciones, se suma la dilución.

  Cada ajuste aparece explicado en la ficha.
- **Comparación contra pares:** percentiles contra la misma industria, o contra el sector si hay menos de 5 datos.
- **Historia propia:** el 25% del score compara los valores actuales con el promedio de los últimos 4-5 ejercicios de la empresa. En Stalwarts y cíclicas pesa más.
- **Fuentes de datos:**
  - Diaria: `snapshots`, sync de lunes a viernes.
  - Semanal: `fund_extra`, estados anuales de Yahoo más RPO de la SEC, workflow "Sync fundamentales" los domingos.

## App de página única
`/` es la app: navegación fija arriba y cada sección (Dashboard, RRG, Screener, Fundamental, Watchlist) adentro. Las URLs quedan como `/#empresa?s=AAPL`. Cada página sigue funcionando sola, por ejemplo `/screener.html`.
