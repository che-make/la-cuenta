// ============================================================
//  La Cuenta v2 — Punto de entrada de la SPA
// ------------------------------------------------------------
//  Responsabilidades de este modulo:
//   - Arranque (migracion legacy en local, store.init, auth.initAuth).
//   - Cabecera: selector de eventos, botones nuevo/editar evento, area de login.
//   - Pestanas (router de vistas).
//   - Banner de solo lectura.
//   - Router que monta la vista activa o el estado vacio "sin evento".
//   - Re-render reactivo ante cambios de state.
// ============================================================

import { isSupabaseConfigured } from "../config.js";
import * as store from "./store.js";
import * as auth from "./auth.js";
import { state, setEvent, setView, onChange } from "./state.js";
import * as util from "./util.js";
import * as migrate from "./migrate.js";

import * as resumenView from "./views/resumen.js";
import * as gastosView from "./views/gastos.js";
import * as amigosView from "./views/amigos.js";
import * as sitiosView from "./views/sitios.js";

const { el } = util;

// Mapa pestana -> { contenedor, render } para el router.
const VIEWS = {
  resumen: { id: "view-resumen", render: resumenView.render },
  gastos: { id: "view-gastos", render: gastosView.render },
  amigos: { id: "view-amigos", render: amigosView.render },
  sitios: { id: "view-sitios", render: sitiosView.render },
};

// Referencias a nodos del DOM (index.html ya las define).
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------
//  Cabecera: selector de eventos
// ---------------------------------------------------------------
function renderEventSelect() {
  const select = $("event-select");
  util.clear(select);

  const list = store.events();
  if (!list.length) {
    // Sin eventos: una opcion placeholder, deshabilitada.
    select.appendChild(
      el("option", { value: "" }, "— Sin eventos —")
    );
    select.value = "";
    return;
  }

  for (const ev of list) {
    select.appendChild(el("option", { value: ev.id }, ev.name || "(sin nombre)"));
  }
  // Selecciona el evento actual si sigue siendo valido.
  select.value = state.currentEventId || "";
}

// ---------------------------------------------------------------
//  Cabecera: botones de evento (nuevo / editar) + area de auth
// ---------------------------------------------------------------
function renderHeaderControls() {
  const editable = auth.canEdit();

  // Botones nuevo / editar evento: solo visibles si se puede editar.
  const btnNew = $("btn-new-event");
  const btnEdit = $("btn-edit-event");
  btnNew.hidden = !editable;
  // El boton de editar requiere ademas que exista un evento seleccionado.
  btnEdit.hidden = !editable || !state.currentEventId;

  // Area de autenticacion (se reconstruye entera).
  const authArea = $("auth-area");
  util.clear(authArea);

  if (editable) {
    const label = auth.userLabel() || "Editor";
    authArea.appendChild(
      el("span", { class: "user-pill" }, "👤 ", label)
    );
    // Exportar / Importar datos (solo editores).
    authArea.appendChild(
      el(
        "button",
        {
          class: "btn btn-secondary btn-sm",
          type: "button",
          title: "Descargar una copia de los datos en JSON",
          onClick: () => migrate.exportJSON(),
        },
        "Exportar"
      )
    );
    authArea.appendChild(
      el(
        "button",
        {
          class: "btn btn-secondary btn-sm",
          type: "button",
          title: "Importar datos desde un fichero JSON",
          // Dispara el <input type=file> oculto cableado en wireHeader().
          onClick: () => $("import-file-input")?.click(),
        },
        "Importar"
      )
    );
    authArea.appendChild(
      el(
        "button",
        {
          class: "btn btn-ghost btn-sm",
          type: "button",
          onClick: () => auth.logout(),
        },
        "Salir"
      )
    );
  } else {
    authArea.appendChild(el("span", { class: "guest-pill" }, "👀 Invitado"));
    authArea.appendChild(
      el(
        "button",
        {
          class: "btn btn-secondary btn-sm",
          type: "button",
          onClick: () => auth.login(),
        },
        "Entrar"
      )
    );
  }
}

// ---------------------------------------------------------------
//  Modal de evento (crear / editar)
// ---------------------------------------------------------------
function openEventModal(existing) {
  const isEdit = Boolean(existing);

  // Campos del formulario.
  const inName = el("input", {
    class: "input",
    type: "text",
    placeholder: "Nombre del evento",
    value: existing?.name || "",
  });
  const inDesc = el("textarea", {
    class: "input",
    placeholder: "Descripcion (opcional)",
  });
  inDesc.value = existing?.description || "";
  const inStart = el("input", {
    class: "input",
    type: "date",
    value: existing?.start_date || "",
  });
  const inEnd = el("input", {
    class: "input",
    type: "date",
    value: existing?.end_date || "",
  });

  const body = el(
    "div",
    {},
    el("div", { class: "field" },
      el("label", {}, "Nombre"),
      inName
    ),
    el("div", { class: "field" },
      el("label", {}, "Descripcion"),
      inDesc
    ),
    el("div", { class: "field-row" },
      el("div", { class: "field" },
        el("label", {}, "Inicio"),
        inStart
      ),
      el("div", { class: "field" },
        el("label", {}, "Fin"),
        inEnd
      )
    )
  );

  util.openModal({
    title: isEdit ? "Editar evento" : "Nuevo evento",
    body,
    actions: [
      // Eliminar (solo al editar): a la izquierda, separado de Guardar.
      ...(isEdit
        ? [
            {
              label: "Eliminar",
              kind: "danger",
              onClick: async (ctrl) => {
                const ok = await util.confirmDialog(
                  `¿Eliminar el evento "${existing.name}" con todos sus gastos, participantes y sitios? Esta accion no se puede deshacer.`,
                  { danger: true }
                );
                if (!ok) return;
                try {
                  await store.deleteEvent(existing.id);
                  util.toast("Evento eliminado", "success");
                  ctrl.close();
                } catch (err) {
                  console.error(err);
                  util.toast("No se pudo eliminar el evento", "error");
                }
              },
            },
          ]
        : []),
      { label: "Cancelar", kind: "ghost", onClick: (ctrl) => ctrl.close() },
      {
        label: isEdit ? "Guardar" : "Crear",
        kind: "primary",
        onClick: async (ctrl) => {
          const name = inName.value.trim();
          if (!name) {
            util.toast("Ponle un nombre al evento", "error");
            return;
          }
          const data = {
            name,
            description: inDesc.value.trim() || null,
            start_date: inStart.value || null,
            end_date: inEnd.value || null,
          };
          try {
            if (isEdit) {
              await store.updateEvent(existing.id, data);
              util.toast("Evento actualizado", "success");
            } else {
              await store.createEvent(data);
              util.toast("Evento creado", "success");
            }
            ctrl.close();
          } catch (err) {
            console.error(err);
            util.toast("No se pudo guardar el evento", "error");
          }
        },
      },
    ],
  });
}

// ---------------------------------------------------------------
//  Pestanas (router de vistas)
// ---------------------------------------------------------------
function renderTabs() {
  const tabs = $("tabs").querySelectorAll(".tab");
  tabs.forEach((tab) => {
    const active = tab.dataset.view === state.currentView;
    tab.classList.toggle("active", active);
  });
}

// ---------------------------------------------------------------
//  Banner de solo lectura
// ---------------------------------------------------------------
function renderReadonlyBanner() {
  $("readonly-banner").hidden = auth.canEdit();
}

// ---------------------------------------------------------------
//  Estado vacio "sin evento"
// ---------------------------------------------------------------
function renderNoEvent() {
  const node = $("no-event");
  util.clear(node);

  const editable = auth.canEdit();

  node.appendChild(el("div", { class: "big-emoji" }, "🧾"));
  node.appendChild(el("h2", {}, "Aun no hay ningun evento"));

  if (editable) {
    node.appendChild(
      el("p", {}, "Crea tu primer evento para empezar a repartir gastos entre amigos.")
    );
    node.appendChild(
      el(
        "button",
        {
          class: "btn btn-primary",
          type: "button",
          onClick: () => openEventModal(null),
        },
        "Crear primer evento"
      )
    );
  } else {
    node.appendChild(
      el("p", {}, "Todavia no se ha creado ningun evento. Vuelve mas tarde o inicia sesion para crear uno.")
    );
  }
}

// ---------------------------------------------------------------
//  Router: monta la vista activa o el estado vacio
// ---------------------------------------------------------------
function renderCurrentView() {
  const hasEvent = Boolean(state.currentEventId && store.getEvent(state.currentEventId));
  const noEvent = $("no-event");

  if (!hasEvent) {
    // Sin evento: mostrar estado vacio y ocultar todas las vistas.
    for (const key of Object.keys(VIEWS)) $(VIEWS[key].id).hidden = true;
    noEvent.hidden = false;
    renderNoEvent();
    return;
  }

  // Hay evento: ocultar estado vacio.
  noEvent.hidden = true;

  // Mostrar solo la vista activa; las demas ocultas.
  for (const key of Object.keys(VIEWS)) {
    const view = VIEWS[key];
    const container = $(view.id);
    const isActive = key === state.currentView;
    container.hidden = !isActive;
    if (isActive) {
      // Cada vista limpia su propio contenedor; aqui solo invocamos render.
      view.render(container);
    }
  }
}

// ---------------------------------------------------------------
//  Re-render completo (cabecera + pestanas + banner + vista)
// ---------------------------------------------------------------
function renderAll() {
  renderEventSelect();
  renderHeaderControls();
  renderTabs();
  renderReadonlyBanner();
  renderCurrentView();
}

// ---------------------------------------------------------------
//  Cableado de eventos del DOM (una sola vez)
// ---------------------------------------------------------------
function wireHeader() {
  // Cambio de evento en el selector.
  $("event-select").addEventListener("change", (e) => {
    setEvent(e.target.value || null);
  });

  // Nuevo evento.
  $("btn-new-event").addEventListener("click", () => openEventModal(null));

  // Editar evento actual.
  $("btn-edit-event").addEventListener("click", () => {
    const ev = state.currentEventId && store.getEvent(state.currentEventId);
    if (ev) openEventModal(ev);
  });

  // Input de fichero oculto para importar datos (se reutiliza en cada import).
  // Lo crea app.js una sola vez y lo dispara el boton "Importar" de la cabecera.
  let fileInput = $("import-file-input");
  if (!fileInput) {
    fileInput = el("input", {
      id: "import-file-input",
      type: "file",
      accept: "application/json",
      hidden: true,
    });
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await migrate.importJSON(file);
      // Permite volver a elegir el mismo fichero otra vez.
      e.target.value = "";
    });
    document.body.appendChild(fileInput);
  }
}

function wireTabs() {
  $("tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    const view = tab.dataset.view;
    if (view) setView(view);
  });
}

// ---------------------------------------------------------------
//  Arranque
// ---------------------------------------------------------------
async function init() {
  try {
    // En modo local, migrar datos de la version anterior si procede.
    if (!isSupabaseConfigured()) {
      await migrate.migrateLegacy();
    }

    // Cargar datos y sesion.
    await store.init();
    await auth.initAuth();
  } catch (err) {
    console.error("Error al iniciar La Cuenta:", err);
    util.toast("No se pudieron cargar los datos", "error");
  }

  // Cablear interacciones fijas del DOM.
  wireHeader();
  wireTabs();

  // Suscribirse a cambios de estado (re-render reactivo).
  onChange(renderAll);

  // Primer pintado.
  renderAll();
}

// Lanzar cuando el DOM este listo (el script es type=module, asi que el DOM
// ya esta parseado, pero protegemos por si acaso).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
