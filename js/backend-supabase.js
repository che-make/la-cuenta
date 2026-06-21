// ============================================================
//  Backend SUPABASE — persistencia sobre base de datos remota
// ============================================================
//
//  Implementa el mismo interfaz que js/backend-local.js, pero
//  hablando con Supabase via @supabase/supabase-js v2. El cliente
//  se importa de forma DINAMICA (ESM por CDN) y se crea de forma
//  perezosa la primera vez que se necesita.
//
//  Tablas validas: "events" | "people" | "participants"
//                   | "mini_events" | "expenses"
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ESM } from "../config.js";
import { toast } from "./util.js";

// Nombre de este backend (lo consulta store.js / auth.js).
export const name = "supabase";

// Tablas del modelo, en orden de dependencia (padres antes que hijos),
// util para los inserts en cascada de replaceAll.
const TABLES = ["events", "people", "participants", "mini_events", "expenses"];

// Cliente cacheado (singleton) y promesa de creacion en curso.
let _client = null;
let _clientPromise = null;

// Crea (perezosamente) y devuelve el cliente de Supabase.
// Importa el modulo del cliente de forma dinamica desde el CDN ESM.
export function getClient() {
  // Si ya esta creado, lo devolvemos directamente (sincrono).
  if (_client) return _client;

  // Si no, devolvemos una promesa que resuelve al cliente. Cacheamos
  // la promesa para no lanzar varias importaciones en paralelo.
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const { createClient } = await import(SUPABASE_ESM);
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return _client;
    })();
  }
  return _clientPromise;
}

// Resuelve siempre a un cliente listo (await sobre getClient()).
async function client() {
  return _client || (await getClient());
}

// Valida el nombre de tabla antes de usarlo.
function checkTable(table) {
  if (!TABLES.includes(table)) {
    throw new Error(`Tabla desconocida: ${table}`);
  }
}

// Carga el dataset completo: select * de cada tabla.
export async function load() {
  const sb = await client();
  const dataset = {
    events: [],
    people: [],
    participants: [],
    mini_events: [],
    expenses: [],
  };
  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select("*");
    if (error) throw error;
    dataset[table] = data || [];
  }
  return dataset;
}

// Inserta una fila y devuelve la fila creada por la BD.
export async function insert(table, row) {
  checkTable(table);
  const sb = await client();
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

// Aplica un patch sobre la fila con ese id y devuelve la fila resultante.
export async function update(table, id, patch) {
  checkTable(table);
  const sb = await client();
  const { data, error } = await sb
    .from(table)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Elimina la fila con ese id de la tabla indicada.
export async function remove(table, id) {
  checkTable(table);
  const sb = await client();
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Sustituye "todo" (best-effort): inserta las filas del dataset SIN
// borrar las remotas. Si algo falla, avisa con un toast pero no rompe.
export async function replaceAll(dataset) {
  const sb = await client();
  let huboError = false;
  for (const table of TABLES) {
    const rows = Array.isArray(dataset?.[table]) ? dataset[table] : [];
    if (!rows.length) continue;
    // upsert: si ya existe una fila con ese id, la actualiza (evita choques).
    const { error } = await sb.from(table).upsert(rows);
    if (error) {
      huboError = true;
      console.error(`replaceAll: error al subir "${table}"`, error);
    }
  }
  if (huboError) {
    toast("Algunos datos no se pudieron subir a Supabase.", "error");
  }
}
