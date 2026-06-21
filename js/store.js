// ============================================================
//  store.js — Capa de datos de "La Cuenta"
// ------------------------------------------------------------
//  - Elige el backend según la configuración (Supabase o local).
//  - Mantiene una CACHE en memoria del dataset completo.
//  - Los GETTERS son SÍNCRONOS (leen de la cache).
//  - Las MUTACIONES son ASÍNCRONAS (escriben en el backend,
//    actualizan la cache y notifican a los suscriptores).
//
//  Cada mutación fija id (uid) y created_at si faltan, llama al
//  backend, actualiza la cache y llama a state.notify().
// ============================================================

import { isSupabaseConfigured } from "../config.js"; // config.js está en el RAÍZ
import { uid, todayISO } from "./util.js";
import { state, setEvent, notify } from "./state.js";
import * as local from "./backend-local.js";
import * as supabase from "./backend-supabase.js";

// ---- Estado interno del módulo --------------------------------------------

let backend = null;          // backend elegido (local o supabase)
let ready = false;           // ¿se ha completado init()?

// Cache en memoria: dataset completo. Estructura por defecto vacía.
let cache = emptyDataset();

function emptyDataset() {
  return {
    events: [],
    people: [],
    participants: [],
    mini_events: [],
    expenses: [],
  };
}

// Normaliza un dataset recibido del backend para asegurar que tiene
// todas las tablas como arrays (defensa frente a blobs incompletos).
function normalizeDataset(ds) {
  const base = emptyDataset();
  if (!ds || typeof ds !== "object") return base;
  return {
    events: Array.isArray(ds.events) ? ds.events : [],
    people: Array.isArray(ds.people) ? ds.people : [],
    participants: Array.isArray(ds.participants) ? ds.participants : [],
    mini_events: Array.isArray(ds.mini_events) ? ds.mini_events : [],
    expenses: Array.isArray(ds.expenses) ? ds.expenses : [],
  };
}

// ---- Inicialización y recarga ---------------------------------------------

export async function init() {
  // Elegir backend según configuración.
  backend = isSupabaseConfigured() ? supabase : local;
  cache = normalizeDataset(await backend.load());
  ready = true;

  // Restaurar / validar el evento seleccionado: si el id guardado ya no
  // existe, seleccionar el primer evento disponible (o ninguno).
  validateCurrentEvent();
  return cache;
}

export async function reload() {
  cache = normalizeDataset(await backend.load());
  validateCurrentEvent();
  notify();
  return cache;
}

// Asegura que state.currentEventId apunta a un evento existente.
function validateCurrentEvent() {
  const exists = state.currentEventId &&
    cache.events.some((ev) => ev.id === state.currentEventId);
  if (!exists) {
    const first = cache.events[0];
    setEvent(first ? first.id : null);
  }
}

export function isReady() {
  return ready;
}

export function mode() {
  // "supabase" | "local" según el backend elegido.
  return backend ? backend.name : (isSupabaseConfigured() ? "supabase" : "local");
}

export function getDataset() {
  // La cache (de solo lectura por convención).
  return cache;
}

// ---- Helpers internos de mutación -----------------------------------------

// Prepara una fila nueva: asegura id y created_at.
function prepareRow(data) {
  const row = { ...data };
  if (!row.id) row.id = uid();
  if (!row.created_at) row.created_at = new Date().toISOString();
  return row;
}

// Inserta en backend + cache.
async function insertRow(table, data) {
  const row = prepareRow(data);
  const saved = await backend.insert(table, row);
  const finalRow = saved || row;
  cache[table].push(finalRow);
  return finalRow;
}

// Actualiza en backend + cache.
async function updateRow(table, id, patch) {
  const saved = await backend.update(table, id, patch);
  const idx = cache[table].findIndex((r) => r.id === id);
  if (idx !== -1) {
    cache[table][idx] = saved || { ...cache[table][idx], ...patch };
    return cache[table][idx];
  }
  // Si la fila no estaba en cache (recarga parcial o carrera en Supabase),
  // la insertamos para que la cache siga reflejando el backend.
  if (saved) {
    cache[table].push(saved);
    return saved;
  }
  return null;
}

// Borra en backend + cache.
async function removeRow(table, id) {
  await backend.remove(table, id);
  const idx = cache[table].findIndex((r) => r.id === id);
  if (idx !== -1) cache[table].splice(idx, 1);
}

// ============================================================
//  EVENTOS
// ============================================================

export function events() {
  return cache.events;
}

export function getEvent(id) {
  return cache.events.find((ev) => ev.id === id) || null;
}

export async function createEvent(data) {
  const ev = await insertRow("events", {
    name: (data && data.name) || "",
    description: (data && data.description) || "",
    start_date: (data && data.start_date) || null,
    end_date: (data && data.end_date) || null,
  });
  setEvent(ev.id); // seleccionar el evento recién creado
  notify();
  return ev;
}

export async function updateEvent(id, patch) {
  const ev = await updateRow("events", id, patch);
  notify();
  return ev;
}

export async function deleteEvent(id) {
  // Borrado en CASCADA en modo local: participantes, sitios y gastos del evento.
  // En Supabase la cascada la hacen las claves foráneas (ON DELETE CASCADE),
  // pero limpiamos la cache local igualmente para reflejarlo al instante.
  if (mode() === "local") {
    for (const p of cache.participants.filter((p) => p.event_id === id)) {
      await removeRow("participants", p.id);
    }
    for (const m of cache.mini_events.filter((m) => m.event_id === id)) {
      await removeRow("mini_events", m.id);
    }
    for (const e of cache.expenses.filter((e) => e.event_id === id)) {
      await removeRow("expenses", e.id);
    }
  } else {
    // Reflejar la cascada del servidor en la cache local.
    cache.participants = cache.participants.filter((p) => p.event_id !== id);
    cache.mini_events = cache.mini_events.filter((m) => m.event_id !== id);
    cache.expenses = cache.expenses.filter((e) => e.event_id !== id);
  }

  await removeRow("events", id);

  // Si era el evento seleccionado, elegir otro (o ninguno).
  if (state.currentEventId === id) {
    const first = cache.events[0];
    setEvent(first ? first.id : null);
  }
  notify();
}

// ============================================================
//  PERSONAS (amigos globales)
// ============================================================

export function people() {
  return cache.people;
}

export async function createPerson(data) {
  const person = await insertRow("people", {
    name: (data && data.name) || "",
  });
  notify();
  return person;
}

export async function updatePerson(id, patch) {
  const person = await updateRow("people", id, patch);
  notify();
  return person;
}

export async function deletePerson(id) {
  // Quitar todas las participaciones de esa persona.
  // En local, además, poner a null el paid_by de los gastos donde pagó.
  if (mode() === "local") {
    for (const p of cache.participants.filter((p) => p.person_id === id)) {
      await removeRow("participants", p.id);
    }
    for (const e of cache.expenses.filter((e) => e.paid_by === id)) {
      await updateRow("expenses", e.id, { paid_by: null });
    }
  } else {
    // En Supabase: participants ON DELETE CASCADE y expenses.paid_by SET NULL.
    cache.participants = cache.participants.filter((p) => p.person_id !== id);
    for (const e of cache.expenses) {
      if (e.paid_by === id) e.paid_by = null;
    }
  }

  await removeRow("people", id);
  notify();
}

// ============================================================
//  PARTICIPANTES (persona <-> evento)
// ============================================================

// Devuelve los participantes de un evento enriquecidos con los datos
// de la persona: [{ ...person, settled, participantId }], ignorando
// participaciones huérfanas (persona inexistente).
export function participants(eventId) {
  return cache.participants
    .filter((p) => p.event_id === eventId)
    .map((p) => {
      const person = cache.people.find((per) => per.id === p.person_id);
      if (!person) return null;
      return {
        ...person,
        settled: !!p.settled,
        participantId: p.id,
      };
    })
    .filter(Boolean);
}

export async function addParticipant(eventId, personId) {
  // Evitar duplicados: si ya participa, no insertar de nuevo.
  const existing = cache.participants.find(
    (p) => p.event_id === eventId && p.person_id === personId
  );
  if (existing) return existing;

  const part = await insertRow("participants", {
    event_id: eventId,
    person_id: personId,
    settled: false,
  });
  notify();
  return part;
}

export async function removeParticipant(eventId, personId) {
  const part = cache.participants.find(
    (p) => p.event_id === eventId && p.person_id === personId
  );
  if (!part) return;
  await removeRow("participants", part.id);
  notify();
}

export async function setSettled(eventId, personId, settled) {
  const part = cache.participants.find(
    (p) => p.event_id === eventId && p.person_id === personId
  );
  if (!part) return null;
  const updated = await updateRow("participants", part.id, { settled: !!settled });
  notify();
  return updated;
}

// ============================================================
//  SITIOS (mini-eventos)
// ============================================================

export function miniEvents(eventId) {
  return cache.mini_events.filter((m) => m.event_id === eventId);
}

export async function createMiniEvent(eventId, data) {
  const mini = await insertRow("mini_events", {
    event_id: eventId,
    name: (data && data.name) || "",
    date: (data && data.date) || null,
    description: (data && data.description) || "",
    location_url: (data && data.location_url) || "",
  });
  notify();
  return mini;
}

export async function updateMiniEvent(id, patch) {
  const mini = await updateRow("mini_events", id, patch);
  notify();
  return mini;
}

export async function deleteMiniEvent(id) {
  // Poner a null mini_event_id en los gastos asociados (en local).
  // En Supabase lo hace ON DELETE SET NULL; reflejarlo en cache.
  if (mode() === "local") {
    for (const e of cache.expenses.filter((e) => e.mini_event_id === id)) {
      await updateRow("expenses", e.id, { mini_event_id: null });
    }
  } else {
    for (const e of cache.expenses) {
      if (e.mini_event_id === id) e.mini_event_id = null;
    }
  }
  await removeRow("mini_events", id);
  notify();
}

// ============================================================
//  GASTOS
// ============================================================

export function expenses(eventId) {
  return cache.expenses.filter((e) => e.event_id === eventId);
}

export async function createExpense(eventId, data) {
  const d = data || {};
  const expense = await insertRow("expenses", {
    event_id: eventId,
    name: d.name || "",
    qty: d.qty != null ? d.qty : 1,
    unit_price: d.unit_price != null ? d.unit_price : 0,
    paid_by: d.paid_by != null ? d.paid_by : null,
    date: d.date != null ? d.date : null,
    mini_event_id: d.mini_event_id != null ? d.mini_event_id : null,
    split: d.split != null ? d.split : "all",
  });
  notify();
  return expense;
}

export async function updateExpense(id, patch) {
  const expense = await updateRow("expenses", id, patch);
  notify();
  return expense;
}

export async function deleteExpense(id) {
  await removeRow("expenses", id);
  notify();
}

// ============================================================
//  CÁLCULOS (síncronos, sobre la cache)
// ============================================================

// Importe de un gasto = cantidad * precio unitario.
export function expenseAmount(e) {
  return (Number(e.qty) || 0) * (Number(e.unit_price) || 0);
}

// Fecha efectiva: la del gasto o, si no tiene, la del sitio (mini-evento).
export function effectiveDate(e) {
  if (e.date) return e.date;
  if (e.mini_event_id) {
    const mini = cache.mini_events.find((m) => m.id === e.mini_event_id);
    if (mini && mini.date) return mini.date;
  }
  return null;
}

// Total del evento = suma de importes de sus gastos.
export function eventTotal(eventId) {
  return expenses(eventId).reduce((acc, e) => acc + expenseAmount(e), 0);
}

// Resumen por participante (ordenado por nombre).
export function summary(eventId) {
  const parts = participants(eventId);                 // participantes actuales
  const partIds = parts.map((p) => p.id);              // person_id participantes
  const partIdSet = new Set(partIds);

  // Acumuladores por person_id.
  const gastado = {};
  const parte = {};
  for (const pid of partIds) {
    gastado[pid] = 0;
    parte[pid] = 0;
  }

  for (const e of expenses(eventId)) {
    const amount = expenseAmount(e);

    // Calcular el reparto (share).
    let share;
    if (e.split === "all") {
      share = partIds.slice();
    } else if (Array.isArray(e.split)) {
      share = e.split.filter((pid) => partIdSet.has(pid));
      if (share.length === 0) share = partIds.slice(); // vacío -> todos
    } else {
      share = partIds.slice();
    }

    if (share.length > 0) {
      const per = amount / share.length;
      for (const pid of share) {
        parte[pid] = (parte[pid] || 0) + per;
      }
    }

    // Quien adelantó el dinero (solo si es participante actual).
    if (e.paid_by != null && partIdSet.has(e.paid_by)) {
      gastado[e.paid_by] = (gastado[e.paid_by] || 0) + amount;
    }
  }

  // Construir filas, una por participante.
  const rows = parts.map((person) => {
    const g = gastado[person.id] || 0;
    const p = parte[person.id] || 0;
    const rawBalance = g - p;                     // saldo crudo: >0 le deben; <0 debe
    // Si la persona está liquidada, su deuda/crédito se considera saldado:
    // mostramos balance 0 y pendiente 0 para no contradecir el estado "pagado".
    const balance = person.settled ? 0 : rawBalance;
    const pendiente = person.settled
      ? 0
      : (rawBalance < 0 ? -rawBalance : 0);       // lo que aún debe poner
    return {
      person,
      settled: !!person.settled,
      gastado: g,
      parte: p,
      balance,
      pendiente,
    };
  });

  // Ordenar por nombre (es-ES, sin distinguir mayúsculas/acentos).
  rows.sort((a, b) =>
    (a.person.name || "").localeCompare(b.person.name || "", "es", {
      sensitivity: "base",
    })
  );

  return rows;
}
