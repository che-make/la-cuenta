// ============================================================
//  Backend LOCAL — persistencia sobre localStorage
// ============================================================
//
//  Implementa el mismo interfaz que js/backend-supabase.js, pero
//  guardando todo el "dataset" en una sola clave de localStorage
//  ("la-cuenta-v2"). Cada operacion sigue el patron
//  leer-modificar-escribir sobre el blob completo.
//
//  Tablas validas: "events" | "people" | "participants"
//                   | "mini_events" | "expenses"
// ============================================================

// Nombre de este backend (lo consulta store.js / migrate.js).
export const name = "local";

// Clave de almacenamiento del dataset v2.
const STORAGE_KEY = "la-cuenta-v2";

// Dataset vacio por defecto: todas las tablas como arrays.
function emptyDataset() {
  return {
    events: [],
    people: [],
    participants: [],
    mini_events: [],
    expenses: [],
  };
}

// Lee y parsea el blob entero de localStorage, devolviendo siempre
// un dataset bien formado (con las 5 tablas como arrays).
function readBlob() {
  const base = emptyDataset();
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Si localStorage no esta disponible, trabajamos en memoria vacia.
    return base;
  }
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    // Garantizamos que cada tabla exista y sea un array.
    for (const table of Object.keys(base)) {
      if (Array.isArray(parsed[table])) base[table] = parsed[table];
    }
    return base;
  } catch {
    // Blob corrupto: empezamos de cero (no borramos por si quiere rescatarse).
    return base;
  }
}

// Serializa y guarda el dataset completo en localStorage.
function writeBlob(dataset) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
  } catch {
    // Sin persistencia (modo incognito lleno, etc.): no rompemos la app.
  }
}

// Devuelve el array de una tabla del dataset, validando el nombre.
function tableArray(dataset, table) {
  if (!Object.prototype.hasOwnProperty.call(dataset, table)) {
    throw new Error(`Tabla desconocida: ${table}`);
  }
  return dataset[table];
}

// Carga el dataset completo desde localStorage.
export async function load() {
  return readBlob();
}

// Inserta una fila tal cual en la tabla indicada y la devuelve.
export async function insert(table, row) {
  const dataset = readBlob();
  const rows = tableArray(dataset, table);
  rows.push(row);
  writeBlob(dataset);
  return row;
}

// Aplica un patch (merge superficial) sobre la fila con ese id.
// Devuelve la fila resultante (o null si no existe).
export async function update(table, id, patch) {
  const dataset = readBlob();
  const rows = tableArray(dataset, table);
  const idx = rows.findIndex((r) => r && r.id === id);
  if (idx === -1) return null;
  const merged = { ...rows[idx], ...patch };
  rows[idx] = merged;
  writeBlob(dataset);
  return merged;
}

// Elimina la fila con ese id de la tabla indicada.
export async function remove(table, id) {
  const dataset = readBlob();
  const rows = tableArray(dataset, table);
  const next = rows.filter((r) => !(r && r.id === id));
  dataset[table] = next;
  writeBlob(dataset);
}

// Sustituye TODO el dataset (usado por importar / migrar).
export async function replaceAll(dataset) {
  const base = emptyDataset();
  if (dataset && typeof dataset === "object") {
    for (const table of Object.keys(base)) {
      if (Array.isArray(dataset[table])) base[table] = dataset[table];
    }
  }
  writeBlob(base);
}
