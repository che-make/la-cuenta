// js/views/resumen.js — Vista 1: Resumen del evento.
// Muestra el total del evento y, por participante, gastado/pendiente/balance.

import { el, mount, euro, fmtDate, toast } from "../util.js";
import { state, setView } from "../state.js";
import * as store from "../store.js";
import { canEdit } from "../auth.js";

// Devuelve la clase de balance segun el signo (>0 le deben, <0 debe, ~0 cero).
function balanceClase(balance) {
  if (balance > 0.005) return "balance pos";
  if (balance < -0.005) return "balance neg";
  return "balance zero";
}

// Construye una fila de participante a partir de una fila de summary().
function filaParticipante(eventId, fila) {
  const editable = canEdit();

  // Saldo crudo (antes de aplicar el estado "liquidado"): a quien le deben
  // (parte < gastado) le corresponde un copy distinto al que aun debe poner.
  const rawBalance = (fila.gastado || 0) - (fila.parte || 0);
  const leDeben = rawBalance > 0.005; // balance positivo: adelanto mas de su parte

  // Copy del check segun el signo del balance:
  //  - debe poner (balance < 0): "Marcar como pagado"
  //  - le deben (balance > 0):   "Marcar como saldado/reembolsado"
  const accionLabel = leDeben
    ? "Marcar como saldado (reembolsado)"
    : "Marcar como pagado";
  const estadoLabel = leDeben ? "Saldado (reembolsado)" : "Pagado";

  // Checkbox de "pagado" (settled). Solo pulsable si se puede editar.
  const check = el("button", {
    class: "check" + (fila.settled ? " on" : ""),
    type: "button",
    disabled: !editable,
    title: editable ? accionLabel : estadoLabel,
    "aria-label": fila.settled
      ? (leDeben ? "Marcado como saldado" : "Marcado como pagado")
      : accionLabel,
    onClick: editable
      ? async () => {
          try {
            await store.setSettled(eventId, fila.person.id, !fila.settled);
          } catch (err) {
            toast("No se pudo guardar el cambio", "error");
          }
        }
      : null,
  }, fila.settled ? "✓" : "");

  // Etiqueta de estado textual junto al nombre (Pagado / Pendiente), para que
  // el estado sea legible sin depender solo del tachado o del checkbox.
  const tagEstado = el(
    "span",
    { class: "tag" + (fila.settled ? " payer" : "") },
    fila.settled ? estadoLabel : "Pendiente"
  );

  // Bloque central: nombre + cifras.
  const main = el("div", { class: "person-main" },
    el("div", { class: "person-name" + (fila.settled ? " settled" : "") },
      fila.person.name,
      " ",
      tagEstado,
    ),
    el("div", { class: "person-figures" },
      el("span", null, "Gastado ", el("b", null, euro(fila.gastado))),
      el("span", null, "Pendiente ", el("b", null, euro(fila.pendiente))),
    ),
  );

  // Balance a la derecha.
  const balance = el("div", { class: balanceClase(fila.balance) }, euro(fila.balance));

  return el("div", { class: "person-row" }, check, main, balance);
}

export function render(container) {
  const eventId = state.currentEventId;
  const ev = eventId ? store.getEvent(eventId) : null;

  // Sin evento no hay nada que resumir (app.js ya gestiona el estado global vacio).
  if (!ev) {
    mount(container, el("div", { class: "empty-state" },
      el("div", { class: "big-emoji" }, "🧾"),
      el("p", null, "Selecciona un evento para ver su resumen."),
    ));
    return;
  }

  // Cabecera: nombre del evento + fechas (si hay) + total.
  const fechas = [];
  if (ev.start_date) fechas.push(fmtDate(ev.start_date));
  if (ev.end_date && ev.end_date !== ev.start_date) fechas.push(fmtDate(ev.end_date));
  const textoFechas = fechas.join(" – ");

  const cabeceraCard = el("div", { class: "card" },
    el("div", { class: "view-head" },
      el("div", null,
        el("h2", null, ev.name),
        textoFechas ? el("div", { class: "muted" }, textoFechas) : null,
      ),
    ),
    el("div", { class: "summary-total" },
      el("span", null, "Total del evento"),
      el("span", { class: "big" }, euro(store.eventTotal(eventId))),
    ),
    el("p", { class: "legend" },
      "Gastado: lo que ha adelantado cada uno. " +
      "Pendiente: lo que aun debe poner. " +
      "Balance: positivo (verde) significa que le deben; negativo (rojo) que debe.",
    ),
  );

  // Lista de participantes (filas del summary).
  const filas = store.summary(eventId);

  let bloquePersonas;
  if (!filas.length) {
    // Sin participantes: invitamos a anadir amigos (enlace a la pestana Amigos).
    bloquePersonas = el("div", { class: "card" },
      el("p", { class: "empty-hint" }, "Aun no hay nadie en este evento."),
      el("p", { class: "empty-hint" },
        el("a", {
          class: "link",
          href: "#",
          onClick: (e) => { e.preventDefault(); setView("amigos"); },
        }, "Anade amigos al evento"),
        " para empezar a repartir gastos.",
      ),
    );
  } else {
    bloquePersonas = el("div", { class: "card" },
      ...filas.map((f) => filaParticipante(eventId, f)),
    );
  }

  mount(container, el("div", null, cabeceraCard, bloquePersonas));
}
