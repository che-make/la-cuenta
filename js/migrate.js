// ============================================================
//  migrate.js — Migración v1->v2, exportación e importación
// ============================================================
//
//  - migrateLegacy(): SOLO en modo local. Convierte los datos del
//    viejo localStorage "la-cuenta-v1" al modelo v2, sin pérdida y
//    sin borrar el v1 original (se conserva como copia de seguridad).
//
//  - exportJSON(): descarga el dataset actual como fichero .json.
//
//  - importJSON(file): carga un dataset desde un fichero .json (con
//    confirmación), lo vuelca al backend y recarga el store.
//
//  Otros módulos dependen de las firmas exactas exportadas aquí.
// ============================================================

import { isSupabaseConfigured } from "../config.js";
import * as store from "./store.js";
import * as backendLocal from "./backend-local.js";
import { uid, todayISO, confirmDialog, toast } from "./util.js";

// Claves de localStorage.
const V1_KEY = "la-cuenta-v1";

/**
 * Estructura vacía de dataset v2.
 */
function emptyDataset() {
  return {
    events: [],
    people: [],
    participants: [],
    mini_events: [],
    expenses: [],
  };
}

/**
 * Migra los datos heredados de v1 al modelo v2.
 *
 * Solo se ejecuta en MODO LOCAL. Si existe "la-cuenta-v1" y el dataset
 * v2 actual NO tiene eventos, crea un evento "Mi cuenta", da de alta a
 * todas las personas y sus gastos, y añade a todas las personas como
 * participantes del nuevo evento. NO borra "la-cuenta-v1".
 *
 * El formato v1 esperado es flexible: aceptamos { people:[...], expenses:[...] }
 * donde cada gasto tiene al menos { name, qty, price, split?, paid_by? } y cada
 * persona { id?, name }. Se normaliza al modelo v2.
 */
export async function migrateLegacy() {
  // La migración legacy solo aplica al backend local.
  if (isSupabaseConfigured()) return;

  // ¿Hay datos v1?
  const rawV1 = localStorage.getItem(V1_KEY);
  if (!rawV1) return;

  // ¿El dataset v2 ya tiene eventos? Si es así, no migramos (evita duplicar).
  let current;
  try {
    current = await backendLocal.load();
  } catch {
    current = emptyDataset();
  }
  if (current && Array.isArray(current.events) && current.events.length > 0) {
    return;
  }

  // Parsear el v1.
  let v1;
  try {
    v1 = JSON.parse(rawV1);
  } catch {
    // v1 corrupto: no migramos, pero tampoco rompemos el arranque.
    return;
  }
  if (!v1 || typeof v1 !== "object") return;

  const v1People = Array.isArray(v1.people) ? v1.people : [];
  const v1Expenses = Array.isArray(v1.expenses) ? v1.expenses : [];

  // Nada que migrar.
  if (v1People.length === 0 && v1Expenses.length === 0) return;

  const now = new Date().toISOString();
  const dataset = emptyDataset();

  // 1) Evento contenedor "Mi cuenta".
  const eventId = uid();
  dataset.events.push({
    id: eventId,
    name: "Mi cuenta",
    description: "Migrado desde la versión anterior.",
    start_date: null,
    end_date: null,
    created_at: now,
  });

  // 2) Personas. Mapeamos el id v1 (si lo hay) -> id v2, para reusarlo
  //    al resolver paid_by/split de los gastos.
  const idMap = new Map();
  for (const p of v1People) {
    const newId = uid();
    const oldId = p && p.id != null ? String(p.id) : null;
    if (oldId !== null) idMap.set(oldId, newId);
    dataset.people.push({
      id: newId,
      name: (p && p.name) ? String(p.name) : "Sin nombre",
      created_at: now,
    });
  }

  // Resolver una referencia a persona de v1 (por id) a id v2.
  const mapPerson = (ref) => {
    if (ref == null) return null;
    return idMap.get(String(ref)) ?? null;
  };

  // 3) Participantes: todas las personas pertenecen al evento.
  for (const person of dataset.people) {
    dataset.participants.push({
      id: uid(),
      event_id: eventId,
      person_id: person.id,
      settled: false,
    });
  }

  // 4) Gastos. Mapeo: name, qty, unit_price=price, split, paid_by (remapeado),
  //    date=null, mini_event_id=null. (Intentamos preservar split y paid_by
  //    si venían con ids de persona reconocibles.)
  for (const e of v1Expenses) {
    if (!e || typeof e !== "object") continue;

    // split: "all" o array de person_id (remapeados). Si no es válido -> "all".
    let split = "all";
    if (Array.isArray(e.split)) {
      const mapped = e.split.map(mapPerson).filter((x) => x != null);
      split = mapped.length > 0 ? mapped : "all";
    } else if (e.split === "all") {
      split = "all";
    }

    dataset.expenses.push({
      id: uid(),
      event_id: eventId,
      name: e.name ? String(e.name) : "Gasto",
      qty: Number(e.qty) || 0,
      // En v1 el precio unitario se llamaba "price".
      unit_price: Number(e.price ?? e.unit_price) || 0,
      // Preservamos quien pago si v1 lo aporta (mapPerson devuelve null si no
      // se reconoce la referencia, por lo que es seguro).
      paid_by: mapPerson(e.paid_by),
      date: null,
      mini_event_id: null,
      split,
      created_at: now,
    });
  }

  // 5) Persistir el dataset v2 completo. No tocamos "la-cuenta-v1".
  await backendLocal.replaceAll(dataset);
}

/**
 * Exporta el dataset actual a un fichero JSON descargable.
 * El nombre incluye la fecha de hoy: la-cuenta-export-AAAA-MM-DD.json
 */
export async function exportJSON() {
  const dataset = store.getDataset();
  const json = JSON.stringify(dataset, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `la-cuenta-export-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast("Datos exportados.", "success");
}

/**
 * Importa un dataset desde un fichero JSON.
 *  1) Lee el fichero y lo valida.
 *  2) Pide confirmación (sobrescribe los datos actuales).
 *  3) backend.replaceAll(dataset) (en supabase: best-effort vía store/backend).
 *  4) store.reload() para refrescar la cache y la UI.
 *
 * @param {File} file Fichero JSON seleccionado por el usuario.
 */
export async function importJSON(file) {
  if (!file) {
    toast("No se seleccionó ningún fichero.", "error");
    return;
  }

  // Leer el contenido del fichero.
  let text;
  try {
    text = await file.text();
  } catch {
    toast("No se pudo leer el fichero.", "error");
    return;
  }

  // Parsear y validar mínimamente la forma del dataset.
  let dataset;
  try {
    dataset = JSON.parse(text);
  } catch {
    toast("El fichero no es un JSON válido.", "error");
    return;
  }
  if (!isValidDataset(dataset)) {
    toast("El fichero no tiene el formato esperado de La Cuenta.", "error");
    return;
  }

  // Confirmar. El mensaje depende del backend: en local se reemplaza todo;
  // en Supabase replaceAll es best-effort (upsert sin borrar lo remoto), así
  // que avisamos de que se fusionará en lugar de reemplazar.
  const mensaje = isSupabaseConfigured()
    ? "Vas a importar datos a la nube (Supabase). Se añadirán o actualizarán " +
        "las filas del fichero, pero NO se borrará lo que ya exista en la nube " +
        "y no esté en el fichero. ¿Continuar?"
    : "Vas a importar datos. En modo local se reemplazarán los datos actuales " +
        "de este navegador. ¿Continuar?";
  const ok = await confirmDialog(mensaje, { danger: true });
  if (!ok) return;

  // Normalizar: garantizar las 5 colecciones aunque falte alguna.
  const safe = {
    events: Array.isArray(dataset.events) ? dataset.events : [],
    people: Array.isArray(dataset.people) ? dataset.people : [],
    participants: Array.isArray(dataset.participants)
      ? dataset.participants
      : [],
    mini_events: Array.isArray(dataset.mini_events) ? dataset.mini_events : [],
    expenses: Array.isArray(dataset.expenses) ? dataset.expenses : [],
  };

  // Volcar al backend. En modo Supabase, replaceAll es best-effort
  // (inserta sin borrar lo remoto) y mostrará su propio aviso si falla.
  try {
    if (isSupabaseConfigured()) {
      const backendSupabase = await import("./backend-supabase.js");
      await backendSupabase.replaceAll(safe);
    } else {
      await backendLocal.replaceAll(safe);
    }
  } catch (err) {
    toast("No se pudo importar: " + (err?.message || err), "error");
    return;
  }

  // Refrescar la cache y la UI.
  await store.reload();
  toast("Datos importados.", "success");
}

/**
 * Comprueba que el objeto se parece a un dataset de La Cuenta:
 * al menos una de las colecciones conocidas es un array.
 */
function isValidDataset(obj) {
  if (!obj || typeof obj !== "object") return false;
  const keys = ["events", "people", "participants", "mini_events", "expenses"];
  return keys.some((k) => Array.isArray(obj[k]));
}
