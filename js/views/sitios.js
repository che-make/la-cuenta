// ============================================================
//  Vista 4 — Sitios (mini-eventos del evento)
// ============================================================
//  Cada "sitio" es un mini-evento dentro del evento actual: tiene
//  nombre, fecha opcional, descripcion opcional y una URL de mapa
//  opcional. Los gastos pueden asociarse a un sitio y heredar su fecha.
// ============================================================

import { el, fmtDate, toast, openModal, confirmDialog, safeHttpUrl } from "../util.js";
import * as store from "../store.js";
import { state } from "../state.js";
import { canEdit } from "../auth.js";

// --- Modal para crear / editar un sitio -------------------------------------
function openSiteModal(eventId, site) {
  const editing = Boolean(site);

  // Campos del formulario.
  const nameInput = el("input", {
    class: "input",
    type: "text",
    placeholder: "Nombre del sitio",
    value: site?.name || "",
  });
  const dateInput = el("input", {
    class: "input",
    type: "date",
    value: site?.date || "",
  });
  const descInput = el("textarea", {
    class: "input",
    placeholder: "Descripcion (opcional)",
  });
  descInput.value = site?.description || "";
  const urlInput = el("input", {
    class: "input",
    type: "url",
    placeholder: "https://maps.google.com/...",
    value: site?.location_url || "",
  });

  const body = el(
    "div",
    null,
    el("div", { class: "field" }, el("label", null, "Nombre"), nameInput),
    el("div", { class: "field" }, el("label", null, "Fecha (opcional)"), dateInput),
    el(
      "div",
      { class: "field" },
      el("label", null, "Descripcion (opcional)"),
      descInput
    ),
    el(
      "div",
      { class: "field" },
      el("label", null, "Enlace de Google Maps (opcional)"),
      urlInput
    )
  );

  async function save({ close }) {
    const name = nameInput.value.trim();
    if (!name) {
      toast("Pon un nombre al sitio", "error");
      return;
    }
    // Validar el esquema de la URL: solo persistimos http(s) (anti-XSS).
    const rawUrl = urlInput.value.trim();
    if (rawUrl && !safeHttpUrl(rawUrl)) {
      toast("El enlace debe empezar por http:// o https://", "error");
      return;
    }
    const data = {
      name,
      date: dateInput.value || null,
      description: descInput.value.trim() || null,
      location_url: rawUrl || null,
    };
    try {
      if (editing) {
        await store.updateMiniEvent(site.id, data);
        toast("Sitio actualizado", "success");
      } else {
        await store.createMiniEvent(eventId, data);
        toast("Sitio anadido", "success");
      }
      close();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el sitio", "error");
    }
  }

  openModal({
    title: editing ? "Editar sitio" : "Nuevo sitio",
    body,
    actions: [
      { label: "Cancelar", kind: "ghost", onClick: ({ close }) => close() },
      { label: "Guardar", kind: "primary", onClick: save },
    ],
  });
}

// --- Fila de un sitio en la lista -------------------------------------------
function siteRow(site, editable) {
  // Subtitulo: fecha + enlace al mapa si existe.
  const subParts = [];
  const fecha = fmtDate(site.date);
  if (fecha) subParts.push(el("span", null, fecha));
  // Validar el esquema de la URL antes de pintar el enlace (anti-XSS).
  const mapUrl = safeHttpUrl(site.location_url);
  if (mapUrl) {
    subParts.push(
      el(
        "a",
        {
          class: "link",
          href: mapUrl,
          target: "_blank",
          rel: "noopener",
        },
        "Ver en mapa"
      )
    );
  }
  if (subParts.length === 0) subParts.push(el("span", { class: "muted" }, "Sin fecha"));

  // Intercala separadores " · " entre los trozos del subtitulo.
  const subChildren = [];
  subParts.forEach((node, i) => {
    if (i > 0) subChildren.push(" · ");
    subChildren.push(node);
  });

  const children = [
    el(
      "div",
      { class: "grow" },
      el("div", { class: "title" }, site.name),
      el("div", { class: "sub" }, ...subChildren)
    ),
  ];

  if (editable) {
    children.push(
      el(
        "div",
        { class: "expense-actions" },
        el(
          "button",
          {
            class: "btn btn-ghost btn-sm",
            type: "button",
            onClick: () => openSiteModal(site.event_id, site),
          },
          "Editar"
        ),
        el(
          "button",
          {
            class: "btn btn-danger btn-sm",
            type: "button",
            onClick: async () => {
              const ok = await confirmDialog(
                `¿Eliminar el sitio "${site.name}"? Los gastos asociados quedaran sin sitio.`,
                { danger: true }
              );
              if (!ok) return;
              try {
                await store.deleteMiniEvent(site.id);
                toast("Sitio eliminado", "success");
              } catch (err) {
                console.error(err);
                toast("No se pudo eliminar", "error");
              }
            },
          },
          "Eliminar"
        )
      )
    );
  }

  return el("div", { class: "list-row" }, ...children);
}

// --- Render principal de la vista -------------------------------------------
export function render(container) {
  const eventId = state.currentEventId;
  const editable = canEdit();
  const sites = eventId ? store.miniEvents(eventId) : [];

  // Cabecera con titulo y, si se puede editar, boton de anadir.
  const head = el(
    "div",
    { class: "view-head" },
    el("h2", null, "Sitios"),
    editable
      ? el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: () => openSiteModal(eventId),
          },
          "+ Anadir sitio"
        )
      : null
  );

  const card = el("div", { class: "card" });

  if (sites.length === 0) {
    card.append(
      el(
        "div",
        { class: "empty-hint" },
        editable
          ? "Aun no hay sitios. Anade lugares (un bar, un restaurante, una casa rural...) para organizar mejor los gastos."
          : "Aun no hay sitios en este evento."
      )
    );
  } else {
    sites.forEach((s) => card.append(siteRow(s, editable)));
  }

  container.replaceChildren(head, card);
}
