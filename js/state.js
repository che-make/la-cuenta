// ============================================================
//  state.js — Estado global de la UI de "La Cuenta"
//  Evento/vista actuales, sesión, desbloqueo de edición y
//  filtros de la vista de gastos. Patrón observable simple.
//  Persiste currentEventId y currentView en localStorage
//  "la-cuenta-ui" y los restaura al cargar.
// ============================================================

const UI_KEY = "la-cuenta-ui";

// Filtros por defecto de la vista de gastos.
function defaultFilters() {
  return {
    people: [], // array de person_id seleccionados
    concepto: "", // texto a buscar en el concepto
    miniEventId: "", // id de sitio (mini-evento) o "" para todos
    dateFrom: "", // "YYYY-MM-DD" o ""
    dateTo: "", // "YYYY-MM-DD" o ""
    estado: "", // ""|"pendiente"|"liquidado"
  };
}

// Lee de localStorage el estado de UI persistido (currentEventId, currentView).
function loadUI() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

const _ui = loadUI();

// ---------- Estado ----------
export const state = {
  currentEventId: _ui.currentEventId ?? null,
  currentView: _ui.currentView || "resumen",
  session: null, // sesión de Supabase (o null)
  editUnlocked: false, // desbloqueo de edición en modo local
  filters: defaultFilters(),
};

// ---------- Suscriptores ----------
const _subs = new Set();

// Suscribe una función a los cambios de estado.
// Devuelve una función para desuscribirse.
export function onChange(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

// Notifica a todos los suscriptores.
export function notify() {
  for (const fn of _subs) {
    try {
      fn();
    } catch (err) {
      // Un suscriptor con error no debe romper al resto.
      console.error("Error en suscriptor de state:", err);
    }
  }
}

// Persiste en localStorage solo currentEventId y currentView.
function persistUI() {
  try {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        currentEventId: state.currentEventId,
        currentView: state.currentView,
      })
    );
  } catch {
    // Si localStorage falla (modo privado, cuota), seguimos sin persistir.
  }
}

// ---------- Mutadores ----------
export function setEvent(id) {
  if (state.currentEventId === id) return;
  state.currentEventId = id ?? null;
  // Al cambiar de evento, los filtros dejan de tener sentido.
  state.filters = defaultFilters();
  persistUI();
  notify();
}

export function setView(v) {
  if (state.currentView === v) return;
  state.currentView = v;
  persistUI();
  notify();
}

export function setSession(s) {
  state.session = s || null;
  notify();
}

export function setEditUnlocked(b) {
  state.editUnlocked = !!b;
  notify();
}

// Aplica un parche parcial a los filtros.
export function setFilters(patch) {
  state.filters = { ...state.filters, ...patch };
  notify();
}

// Restablece los filtros a sus valores por defecto.
export function resetFilters() {
  state.filters = defaultFilters();
  notify();
}
