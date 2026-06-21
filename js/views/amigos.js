// js/views/amigos.js — Vista 3: Amigos.
// Gestiona los participantes del evento actual y los amigos globales reutilizables.

import { el, mount, toast, openModal, confirmDialog } from "../util.js";
import { state } from "../state.js";
import * as store from "../store.js";
import { canEdit } from "../auth.js";

// Modal para editar el nombre de un amigo global.
function abrirEditarAmigo(person) {
  const input = el("input", {
    class: "input",
    type: "text",
    value: person.name,
    placeholder: "Nombre",
  });

  const modal = openModal({
    title: "Editar amigo",
    body: el("div", { class: "field" },
      el("label", null, "Nombre"),
      input,
    ),
    actions: [
      { label: "Cancelar", kind: "ghost", onClick: ({ close }) => close() },
      {
        label: "Guardar",
        kind: "primary",
        onClick: async ({ close }) => {
          const nombre = input.value.trim();
          if (!nombre) { toast("Escribe un nombre", "error"); return; }
          try {
            await store.updatePerson(person.id, { name: nombre });
            close();
            toast("Amigo actualizado", "success");
          } catch (err) {
            toast("No se pudo guardar", "error");
          }
        },
      },
    ],
  });

  // Foco en el campo al abrir.
  input.focus();
  return modal;
}

// Seccion: anadir un amigo nuevo o uno global ya existente al evento.
function bloqueAnadir(eventId) {
  // --- Crear amigo nuevo (nombre) y anadirlo al evento ---
  const nuevoInput = el("input", {
    class: "input",
    type: "text",
    placeholder: "Nombre del amigo",
  });

  async function crearAmigo() {
    const nombre = nuevoInput.value.trim();
    if (!nombre) { toast("Escribe un nombre", "error"); return; }
    try {
      const person = await store.createPerson({ name: nombre });
      await store.addParticipant(eventId, person.id);
      nuevoInput.value = "";
      toast("Amigo anadido", "success");
    } catch (err) {
      toast("No se pudo anadir", "error");
    }
  }

  nuevoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") crearAmigo(); });

  const formNuevo = el("div", { class: "field" },
    el("label", null, "Nuevo amigo"),
    el("div", { class: "inline-form" },
      nuevoInput,
      el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: crearAmigo }, "Crear"),
    ),
  );

  // --- Anadir un amigo global existente que no este en el evento ---
  const enEvento = new Set(store.participants(eventId).map((p) => p.id));
  const disponibles = store.people().filter((p) => !enEvento.has(p.id));

  const select = el("select", { class: "input" },
    el("option", { value: "" }, disponibles.length ? "Elige un amigo…" : "No hay amigos guardados libres"),
    ...disponibles.map((p) => el("option", { value: p.id }, p.name)),
  );

  async function anadirExistente() {
    const personId = select.value;
    if (!personId) { toast("Elige un amigo", "error"); return; }
    try {
      await store.addParticipant(eventId, personId);
      toast("Amigo anadido", "success");
    } catch (err) {
      toast("No se pudo anadir", "error");
    }
  }

  const formExistente = el("div", { class: "field" },
    el("label", null, "Anadir un amigo ya guardado"),
    el("div", { class: "inline-form" },
      select,
      el("button", {
        class: "btn btn-secondary btn-sm",
        type: "button",
        disabled: !disponibles.length,
        onClick: anadirExistente,
      }, "Anadir"),
    ),
  );

  return el("div", { class: "card" },
    el("h3", null, "Anadir amigos"),
    formNuevo,
    formExistente,
  );
}

// Seccion: participantes del evento actual.
function bloqueParticipantes(eventId) {
  const editable = canEdit();
  const lista = store.participants(eventId); // [{ ...person, settled, participantId }]

  const card = el("div", { class: "card" }, el("h3", null, "En este evento"));

  if (!lista.length) {
    card.append(el("p", { class: "empty-hint" }, "Aun no hay nadie en este evento."));
    return card;
  }

  for (const p of lista) {
    const acciones = [];
    if (editable) {
      acciones.push(
        el("button", {
          class: "icon-btn",
          type: "button",
          title: "Editar nombre",
          onClick: () => abrirEditarAmigo(p),
        }, "✏️"),
        el("button", {
          class: "icon-btn danger",
          type: "button",
          title: "Quitar del evento",
          onClick: async () => {
            const ok = await confirmDialog(
              `¿Quitar a ${p.name} de este evento? Seguira guardado como amigo.`,
              { danger: true },
            );
            if (!ok) return;
            try {
              await store.removeParticipant(eventId, p.id);
              toast("Amigo quitado del evento", "success");
            } catch (err) {
              toast("No se pudo quitar", "error");
            }
          },
        }, "🗑️"),
      );
    }

    card.append(
      el("div", { class: "list-row" },
        el("div", { class: "grow" },
          el("div", { class: "title" }, p.name),
          el("div", { class: "sub" }, p.settled ? "Ya ha pagado" : "Pendiente de pagar"),
        ),
        ...acciones,
      ),
    );
  }

  return card;
}

// Seccion: amigos guardados (globales) reutilizables.
function bloqueGlobales(eventId) {
  const editable = canEdit();
  const todos = store.people();

  const card = el("div", { class: "card" },
    el("h3", null, "Amigos guardados"),
    el("p", { class: "muted" }, "Amigos disponibles para cualquier evento."),
  );

  if (!todos.length) {
    card.append(el("p", { class: "empty-hint" }, "Todavia no has guardado ningun amigo."));
    return card;
  }

  const enEvento = new Set(store.participants(eventId).map((p) => p.id));

  for (const person of todos) {
    const acciones = [];
    if (editable) {
      acciones.push(
        el("button", {
          class: "icon-btn danger",
          type: "button",
          title: "Eliminar amigo",
          onClick: async () => {
            const ok = await confirmDialog(
              `¿Eliminar a ${person.name} de forma permanente? Se quitara de todos los eventos.`,
              { danger: true },
            );
            if (!ok) return;
            try {
              await store.deletePerson(person.id);
              toast("Amigo eliminado", "success");
            } catch (err) {
              toast("No se pudo eliminar", "error");
            }
          },
        }, "🗑️"),
      );
    }

    card.append(
      el("div", { class: "list-row" },
        el("div", { class: "grow" },
          el("div", { class: "title" }, person.name),
          el("div", { class: "sub" }, enEvento.has(person.id) ? "En este evento" : "No esta en este evento"),
        ),
        ...acciones,
      ),
    );
  }

  return card;
}

export function render(container) {
  const eventId = state.currentEventId;

  // Sin evento no podemos gestionar participantes (app.js gestiona el vacio global).
  if (!eventId) {
    mount(container, el("div", { class: "empty-state" },
      el("div", { class: "big-emoji" }, "🧑‍🤝‍🧑"),
      el("p", null, "Selecciona un evento para gestionar a sus amigos."),
    ));
    return;
  }

  const editable = canEdit();
  const partes = [];

  // Solo los editores pueden anadir amigos.
  if (editable) partes.push(bloqueAnadir(eventId));

  partes.push(bloqueParticipantes(eventId));
  partes.push(bloqueGlobales(eventId));

  mount(container, el("div", null, ...partes));
}
