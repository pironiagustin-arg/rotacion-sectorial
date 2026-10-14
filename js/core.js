// Datos compartidos por el Screener y la ficha: Supabase, snapshots, ediciones del usuario.
import { UNIVERSE, BATCH_COUNT } from "/lib/universe.js";

export const META = new Map(UNIVERSE.map((r) => [r[0], r]));
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function loadLocal(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
export function saveLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
export function toast(msg) {
  let t = $("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

export const state = { sb: null, user: null, ov: new Map(), onAuth: null };

// Completa la fila con lo que sabemos del universo (sector, país, mercados, ticker BYMA)
export function withMeta(row) {
  const m = META.get(row.s);
  return m ? { ...row, sec: m[2], c: m[3], mk: m[4], ced: m[5], n: row.n && row.n !== row.s ? row.n : m[1] } : null;
}

export async function initSupabase() {
  const c = window.APP_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseAnonKey) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    state.sb = createClient(c.supabaseUrl, c.supabaseAnonKey);
    const { data } = await state.sb.auth.getSession();
    state.user = data?.session?.user || null;
    state.sb.auth.onAuthStateChange(async (_e, sess) => {
      const u = sess?.user || null;
      if ((u?.id || null) !== (state.user?.id || null)) { state.user = u; await loadOverrides(); state.onAuth?.(); }
    });
  } catch { state.sb = null; }
}

export async function authClick() {
  if (!state.sb) return;
  if (state.user) { await state.sb.auth.signOut(); return; }
  const email = prompt("Tu email. Te llega un link para entrar sin contraseña:");
  if (!email) return;
  const { error } = await state.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  toast(error ? "Error: " + error.message : "Revisá tu mail y abrí el link");
}

// Snapshots guardados por el sync diario
export async function loadSnapshots() {
  const out = new Map(); let newest = 0;
  if (!state.sb) return { rows: out, updated: null };
  const { data, error } = await state.sb.from("snapshots").select("symbol,data,updated_at").range(0, 4999);
  if (error || !data) return { rows: out, updated: null };
  for (const d of data) { const r = withMeta(d.data); if (r) { out.set(d.symbol, r); newest = Math.max(newest, Date.parse(d.updated_at)); } }
  return { rows: out, updated: newest || null };
}

// Datos en vivo de Yahoo por lotes (si la base está vacía o vieja)
export async function loadLive(target, onProgress) {
  let done = 0, fails = 0;
  const queue = [...Array(BATCH_COUNT).keys()];
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      try {
        const r = await fetch(`/api/screener?batch=${i}`);
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        for (const row of j.rows) if (row.ok) { const x = withMeta(row); if (x) target.set(row.s, x); }
      } catch { fails++; }
      done++; onProgress?.(done, BATCH_COUNT);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return fails;
}

// ---------- Ediciones del usuario (Supabase con sesión, si no en el navegador) ----------
export async function loadOverrides() {
  state.ov = new Map(Object.entries(loadLocal("scr_overrides", {})));
  if (state.sb && state.user) {
    const { data, error } = await state.sb.from("overrides").select("symbol,fair_value,lynch_type,notes,metrics");
    if (!error) {
      state.ov = new Map(data.map((d) => [d.symbol, d]));
      const local = loadLocal("scr_overrides", {});
      const pending = Object.entries(local).filter(([s]) => !state.ov.has(s));
      for (const [s, o] of pending) await saveOverride(s, o);
      if (pending.length) { saveLocal("scr_overrides", {}); toast(`Subí ${pending.length} ediciones locales a tu cuenta`); }
    }
  }
  return state.ov;
}

export async function saveOverride(sym, patch) {
  const cur = { symbol: sym, fair_value: null, lynch_type: null, notes: null, metrics: {}, ...(state.ov.get(sym) || {}) };
  const next = { ...cur, ...patch, metrics: { ...cur.metrics, ...(patch.metrics || {}) } };
  for (const [k, v] of Object.entries(next.metrics)) if (v === null || v === "") delete next.metrics[k];
  state.ov.set(sym, next);
  if (state.sb && state.user) {
    const { error } = await state.sb.from("overrides").upsert({ symbol: sym, fair_value: next.fair_value, lynch_type: next.lynch_type, notes: next.notes, metrics: next.metrics, updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
    if (error) { toast("No se pudo guardar: " + error.message); return false; }
  } else saveLocal("scr_overrides", Object.fromEntries(state.ov));
  return true;
}

export function userMult() { return state.ov.get("__settings")?.metrics?.mult || loadLocal("scr_mult", {}); }
