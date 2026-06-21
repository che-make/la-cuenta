// ============================================================
//  Vista 2 — Gastos (con filtros combinables y modal de gasto)
// ============================================================
//  Lista de gastos del evento con un bloque de filtros (personas,
//  concepto, sitio, rango de fechas y estado) que se combinan con AND.
//  Permite crear y editar gastos con un modal que incluye el editor
//  cantidad x precio y el selector de reparto (split).
// ============================================================

import {
  el,
  euro,
  fmtDate,
  toast,
  openModal,
  confirmDialog,
  debounce,
  safeHttpUrl,
} from "../util.js";
import * as store from "../store.js";
import { state, setFilters, resetFilters } from "../state.js";
import { canEdit } from "../auth.js";

// ------------------------------------------------------------------
//  Helpers de reparto (split)
// ------------------------------------------------------------------

// person_id de los participantes que cubren un gasto, ya filtrados a los
// participantes actuales del evento. Replica la logica de store.summary.
function shareIds(expense, participantIds) {
  if (expense.split === "all") return participantIds.slice();
  const arr = Array.isArray(expense.split)
    ? expense.split.filter((pid) => participantIds.includes(pid))
    : [];
  return arr.length ? arr : participantIds.slice();
}

// ------------------------------------------------------------------
//  Filtrado (combinacion AND de los filtros de state.filters)
// ------------------------------------------------------------------
function applyFilters(expenses, filters, participantIds) {
  const concepto = (filters.concepto || "").trim().toLowerCase();
  const people = filters.people || [];

  return expenses.filter((e) => {
    // --- Personas: pasa si paga uno de los seleccionados, o si alguno
    //     del reparto esta en la seleccion.
    if (people.length) {
      const share = shareIds(e, participantIds);
      const matchPayer = e.paid_by && people.includes(e.paid_by);
      const matchShare = share.some((pid) => people.includes(pid));
      if (!matchPayer && !matchShare) return false;
    }

    // --- Concepto: substring sin distinguir mayus/minus.
    if (concepto) {
      if (!(e.name || "").toLowerCase().includes(concepto)) return false;
    }

    // --- Sitio: coincidencia exacta de mini_event_id.
    if (filters.miniEventId) {
      if (e.mini_event_id !== filters.miniEventId) return false;
    }

    // --- Fechas: la fecha efectiva debe caer dentro del rango (inclusive).
    //     Si hay filtro de fecha, los gastos sin fecha efectiva se excluyen.
    if (filters.dateFrom || filters.dateTo) {
      const ed = store.effectiveDate(e); // ISO o null
      if (!ed) return false;
      if (filters.dateFrom && ed < filters.dateFrom) return false;
      if (filters.dateTo && ed > filters.dateTo) return false;
    }

    // --- Estado: pendiente = algun participante del reparto NO liquidado;
    //     liquidado = todos los del reparto liquidados.
    if (filters.estado) {
      const share = shareIds(e, participantIds);
      const settledMap = filters.__settledMap;
      const allSettled =
        share.length > 0 && share.every((pid) => settledMap[pid]);
      if (filters.estado === "liquidado" && !allSettled) return false;
      if (filters.estado === "pendiente" && allSettled) return false;
    }

    return true;
  });
}

// ------------------------------------------------------------------
//  Modal de gasto (crear / editar)
// ------------------------------------------------------------------
function openExpenseModal(eventId, participants, sites, expense) {
  const editing = Boolean(expense);

  // Estado local del reparto: "all" o array de person_id.
  let split = expense
    ? expense.split === "all"
      ? "all"
      : Array.isArray(expense.split)
      ? expense.split.slice()
      : "all"
    : "all";

  // --- Concepto -----------------------------------------------------
  const nameInput = el("input", {
    class: "input",
    type: "text",
    placeholder: "Concepto (p. ej. Cena, Taxi...)",
    value: expense?.name || "",
  });

  // --- Cantidad x precio = total (en vivo) --------------------------
  const qtyInput = el("input", {
    class: "input qty",
    type: "number",
    min: "0",
    step: "1",
    value: expense ? String(expense.qty ?? 1) : "1",
  });
  const priceInput = el("input", {
    class: "input price",
    type: "number",
    min: "0",
    step: "0.01",
    value: expense ? String(expense.unit_price ?? 0) : "0",
  });
  const totalOut = el("span", { class: "total" }, euro(0));

  function refreshTotal() {
    const total = (Number(qtyInput.value) || 0) * (Number(priceInput.value) || 0);
    totalOut.textContent = euro(total);
  }
  qtyInput.addEventListener("input", refreshTotal);
  priceInput.addEventListener("input", refreshTotal);

  const qtyPrice = el(
    "div",
    { class: "qtyprice" },
    qtyInput,
    el("span", { class: "op" }, "×"),
    el("div", { class: "price-wrap" }, priceInput),
    el("span", { class: "eq" }, "="),
    totalOut
  );

  // --- Pagado por (solo participantes del evento) -------------------
  const payerSelect = el("select", { class: "input" });
  payerSelect.append(el("option", { value: "" }, "Nadie / sin asignar"));
  participants.forEach((p) => {
    payerSelect.append(el("option", { value: p.id }, p.name));
  });
  payerSelect.value = expense?.paid_by || "";

  // --- Selector de reparto (toggle "Todos" + toggle por persona) ----
  const splitChips = el("div", { class: "chips" });

  function renderSplitChips() {
    splitChips.replaceChildren();

    const allActive = split === "all";
    const allBtn = el(
      "button",
      {
        class: "toggle all" + (allActive ? " active" : ""),
        type: "button",
        onClick: () => {
          // Pulsar "Todos" siempre activa el reparto entre todos.
          split = "all";
          renderSplitChips();
        },
      },
      "Todos"
    );
    splitChips.append(allBtn);

    participants.forEach((p) => {
      const inArray = split !== "all" && split.includes(p.id);
      const active = allActive || inArray;
      splitChips.append(
        el(
          "button",
          {
            class: "toggle" + (active && !allActive ? " active" : ""),
            type: "button",
            onClick: () => {
              if (split === "all") {
                // Estando en "all", pulsar una persona deja solo a esa.
                split = [p.id];
              } else {
                // Toggle dentro del array.
                if (split.includes(p.id)) {
                  split = split.filter((id) => id !== p.id);
                } else {
                  split = split.concat(p.id);
                }
                // Si queda vacio, vuelve a "all".
                if (split.length === 0) split = "all";
              }
              renderSplitChips();
            },
          },
          p.name
        )
      );
    });
  }
  renderSplitChips();

  // --- Fecha (opcional, hereda del sitio si se deja vacia) ----------
  const dateInput = el("input", {
    class: "input",
    type: "date",
    value: expense?.date || "",
  });

  // --- Sitio (opcional) ---------------------------------------------
  const siteSelect = el("select", { class: "input" });
  siteSelect.append(el("option", { value: "" }, "Sin sitio"));
  sites.forEach((s) => {
    siteSelect.append(el("option", { value: s.id }, s.name));
  });
  siteSelect.value = expense?.mini_event_id || "";

  refreshTotal();

  const body = el(
    "div",
    null,
    el("div", { class: "field" }, el("label", null, "Concepto"), nameInput),
    el(
      "div",
      { class: "field" },
      el("label", null, "Cantidad × precio"),
      qtyPrice
    ),
    el("div", { class: "field" }, el("label", null, "Pagado por"), payerSelect),
    el(
      "div",
      { class: "field" },
      el("label", null, "Se reparte entre"),
      splitChips
    ),
    el(
      "div",
      { class: "field" },
      el("label", null, "Fecha (opcional)"),
      dateInput,
      el(
        "div",
        { class: "muted", style: "font-size:12px;margin-top:6px;" },
        "Si la dejas vacia, hereda la fecha del sitio."
      )
    ),
    el("div", { class: "field" }, el("label", null, "Sitio (opcional)"), siteSelect)
  );

  async function save({ close }) {
    const name = nameInput.value.trim();
    if (!name) {
      toast("Pon un concepto al gasto", "error");
      return;
    }
    // Normaliza split: array vacio -> "all".
    let finalSplit = split;
    if (Array.isArray(finalSplit) && finalSplit.length === 0) finalSplit = "all";

    const data = {
      name,
      qty: Number(qtyInput.value) || 0,
      unit_price: Number(priceInput.value) || 0,
      paid_by: payerSelect.value || null,
      split: finalSplit,
      date: dateInput.value || null,
      mini_event_id: siteSelect.value || null,
    };

    try {
      if (editing) {
        await store.updateExpense(expense.id, data);
        toast("Gasto actualizado", "success");
      } else {
        await store.createExpense(eventId, data);
        toast("Gasto anadido", "success");
      }
      close();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el gasto", "error");
    }
  }

  openModal({
    title: editing ? "Editar gasto" : "Nuevo gasto",
    body,
    actions: [
      { label: "Cancelar", kind: "ghost", onClick: ({ close }) => close() },
      { label: "Guardar", kind: "primary", onClick: save },
    ],
  });
}

// ------------------------------------------------------------------
//  Bloque de filtros
// ------------------------------------------------------------------
function buildFilters(participants, sites, filters) {
  // --- Personas (multi-seleccion con toggles) -----------------------
  const peopleChips = el("div", { class: "chips" });
  const selected = filters.people || [];
  participants.forEach((p) => {
    const active = selected.includes(p.id);
    peopleChips.append(
      el(
        "button",
        {
          class: "toggle" + (active ? " active" : ""),
          type: "button",
          onClick: () => {
            const cur = state.filters.people || [];
            const next = cur.includes(p.id)
              ? cur.filter((id) => id !== p.id)
              : cur.concat(p.id);
            setFilters({ people: next });
          },
        },
        p.name
      )
    );
  });

  // --- Concepto (texto, con debounce) -------------------------------
  const conceptInput = el("input", {
    class: "input",
    type: "text",
    placeholder: "Buscar concepto...",
    value: filters.concepto || "",
  });
  const onConcept = debounce((v) => setFilters({ concepto: v }), 250);
  conceptInput.addEventListener("input", () => onConcept(conceptInput.value));

  // --- Sitio --------------------------------------------------------
  const siteSelect = el("select", { class: "input" });
  siteSelect.append(el("option", { value: "" }, "Todos los sitios"));
  sites.forEach((s) => siteSelect.append(el("option", { value: s.id }, s.name)));
  siteSelect.value = filters.miniEventId || "";
  siteSelect.addEventListener("change", () =>
    setFilters({ miniEventId: siteSelect.value })
  );

  // --- Fechas desde / hasta -----------------------------------------
  const fromInput = el("input", {
    class: "input",
    type: "date",
    value: filters.dateFrom || "",
  });
  fromInput.addEventListener("change", () => setFilters({ dateFrom: fromInput.value }));
  const toInput = el("input", {
    class: "input",
    type: "date",
    value: filters.dateTo || "",
  });
  toInput.addEventListener("change", () => setFilters({ dateTo: toInput.value }));

  // --- Estado -------------------------------------------------------
  // Nota: el estado se deriva del "pagado" por persona del evento, no por gasto.
  // Liquidado = todos los implicados en ese gasto han saldado el evento.
  const estadoSelect = el("select", {
    class: "input",
    title:
      "Liquidado = todos los implicados en el gasto han saldado su parte del evento. Pendiente = alguno sigue sin saldar.",
  });
  estadoSelect.append(el("option", { value: "" }, "Todos"));
  estadoSelect.append(el("option", { value: "pendiente" }, "Pendiente"));
  estadoSelect.append(el("option", { value: "liquidado" }, "Liquidado"));
  estadoSelect.value = filters.estado || "";
  estadoSelect.addEventListener("change", () =>
    setFilters({ estado: estadoSelect.value })
  );

  // --- Boton limpiar ------------------------------------------------
  const clearBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      type: "button",
      onClick: () => resetFilters(),
    },
    "Limpiar"
  );

  return el(
    "div",
    { class: "filters" },
    el(
      "div",
      { class: "field" },
      el("label", null, "Personas"),
      participants.length
        ? peopleChips
        : el("span", { class: "muted" }, "Sin participantes")
    ),
    el("div", { class: "field" }, el("label", null, "Concepto"), conceptInput),
    el("div", { class: "field" }, el("label", null, "Sitio"), siteSelect),
    el("div", { class: "field" }, el("label", null, "Desde"), fromInput),
    el("div", { class: "field" }, el("label", null, "Hasta"), toInput),
    el("div", { class: "field" }, el("label", null, "Estado"), estadoSelect),
    el("div", { class: "field" }, el("label", null, " "), clearBtn)
  );
}

// ------------------------------------------------------------------
//  Tarjeta de un gasto
// ------------------------------------------------------------------
function expenseCard(expense, participants, sites, participantIds, settledMap, editable) {
  const amount = store.expenseAmount(expense);
  const byId = (id) => participants.find((p) => p.id === id);

  // --- Meta tags ----------------------------------------------------
  const meta = el("div", { class: "expense-meta" });

  // Pagado por.
  if (expense.paid_by) {
    const payer = byId(expense.paid_by);
    if (payer) meta.append(el("span", { class: "tag payer" }, "Pago: " + payer.name));
  }

  // Participantes del reparto.
  if (expense.split === "all") {
    meta.append(el("span", { class: "tag" }, "Todos"));
  } else if (Array.isArray(expense.split)) {
    const present = expense.split
      .map((pid) => byId(pid))
      .filter(Boolean);
    if (present.length === 0) {
      // Reparto que ya no aplica a nadie -> en calculo cae a "todos".
      meta.append(el("span", { class: "tag" }, "Todos"));
    } else {
      present.forEach((p) => meta.append(el("span", { class: "tag" }, p.name)));
    }
  }

  // Fecha efectiva (indicando si es heredada del sitio).
  const ownDate = expense.date;
  const effective = store.effectiveDate(expense);
  if (effective) {
    const inherited = !ownDate; // si no tiene fecha propia, viene del sitio
    meta.append(
      el(
        "span",
        { class: "tag date" },
        fmtDate(effective) + (inherited ? " (del sitio)" : "")
      )
    );
  }

  // Sitio (con enlace al mapa si lo hay).
  if (expense.mini_event_id) {
    const site = sites.find((s) => s.id === expense.mini_event_id);
    if (site) {
      const siteTag = el("span", { class: "tag site" });
      // Validar el esquema de la URL antes de hacer el nombre clicable (anti-XSS).
      const siteUrl = safeHttpUrl(site.location_url);
      if (siteUrl) {
        siteTag.append(
          el(
            "a",
            {
              class: "link",
              href: siteUrl,
              target: "_blank",
              rel: "noopener",
            },
            site.name
          )
        );
      } else {
        siteTag.append(site.name);
      }
      meta.append(siteTag);
    }
  }

  const children = [
    el(
      "div",
      { class: "expense-top" },
      el("span", { class: "expense-name" }, expense.name),
      el("span", { class: "expense-amount" }, euro(amount))
    ),
    el(
      "div",
      { class: "expense-calc" },
      `${Number(expense.qty) || 0} × ${euro(expense.unit_price)}`
    ),
    meta,
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
            onClick: () => openExpenseModal(expense.event_id, participants, sites, expense),
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
                `¿Eliminar el gasto "${expense.name}"?`,
                { danger: true }
              );
              if (!ok) return;
              try {
                await store.deleteExpense(expense.id);
                toast("Gasto eliminado", "success");
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

  return el("div", { class: "expense" }, ...children);
}

// ------------------------------------------------------------------
//  Render principal de la vista
// ------------------------------------------------------------------
export function render(container) {
  const eventId = state.currentEventId;
  const editable = canEdit();

  const participants = eventId ? store.participants(eventId) : [];
  const participantIds = participants.map((p) => p.id);
  const settledMap = {};
  participants.forEach((p) => {
    settledMap[p.id] = !!p.settled;
  });
  const sites = eventId ? store.miniEvents(eventId) : [];
  const allExpenses = eventId ? store.expenses(eventId) : [];

  // --- Cabecera -----------------------------------------------------
  const head = el(
    "div",
    { class: "view-head" },
    el("h2", null, "Gastos"),
    editable
      ? el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: () => openExpenseModal(eventId, participants, sites),
          },
          "+ Anadir gasto"
        )
      : null
  );

  // --- Filtros (se combinan con AND) --------------------------------
  const filters = state.filters || {};
  const filtersBlock = buildFilters(participants, sites, filters);

  // Filtrado: paso settledMap al filtro de estado via copia.
  const filtered = applyFilters(
    allExpenses,
    { ...filters, __settledMap: settledMap },
    participantIds
  );

  // --- Resumen de filtrado ------------------------------------------
  const sumFiltered = filtered.reduce((acc, e) => acc + store.expenseAmount(e), 0);
  const filterSummary = el(
    "div",
    { class: "filter-summary" },
    `Mostrando ${filtered.length} de ${allExpenses.length} gastos · ${euro(sumFiltered)}`
  );

  // --- Lista de gastos ----------------------------------------------
  const card = el("div", { class: "card" });
  if (allExpenses.length === 0) {
    card.append(
      el(
        "div",
        { class: "empty-hint" },
        editable
          ? "Aun no hay gastos. Pulsa “+ Anadir gasto” para empezar."
          : "Aun no hay gastos en este evento."
      )
    );
  } else if (filtered.length === 0) {
    card.append(
      el(
        "div",
        { class: "empty-hint" },
        "Ningun gasto coincide con los filtros."
      )
    );
  } else {
    filtered.forEach((e) =>
      card.append(
        expenseCard(e, participants, sites, participantIds, settledMap, editable)
      )
    );
  }

  container.replaceChildren(head, filtersBlock, filterSummary, card);
}
