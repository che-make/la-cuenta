// La Cuenta — divide gastos entre amigos. Todo se guarda en localStorage.

const STORAGE_KEY = "la-cuenta-v1";

/**
 * state.people: [{ id, name }]
 * state.items:  [{ id, name, price, split }]
 *   split === "all"  -> se reparte entre todas las personas (dinámico)
 *   split === [ids]  -> se reparte solo entre esas personas (uno = individual)
 */
let state = load();

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) || "id-" + Date.now() + "-" + Math.round(Math.random() * 1e6);

// ---------- Persistencia ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { people: [], items: [] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Cálculo del reparto ----------
function participantsOf(item) {
  if (item.split === "all") return state.people.map((p) => p.id);
  const valid = item.split.filter((id) => state.people.some((p) => p.id === id));
  // Si las personas de un gasto personalizado ya no existen, vuelve a "todos".
  return valid.length ? valid : state.people.map((p) => p.id);
}

function computeTotals() {
  const totals = Object.fromEntries(state.people.map((p) => [p.id, 0]));
  let grand = 0;
  for (const item of state.items) {
    const price = Number(item.price) || 0;
    grand += price;
    const ids = participantsOf(item);
    if (!ids.length) continue;
    const share = price / ids.length;
    for (const id of ids) totals[id] += share;
  }
  return { totals, grand };
}

// ---------- Personas ----------
const personForm = document.getElementById("person-form");
const personInput = document.getElementById("person-input");

personForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = personInput.value.trim();
  if (!name) return;
  state.people.push({ id: uid(), name });
  personInput.value = "";
  save();
  render();
  personInput.focus();
});

function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  // Quita a esa persona de los gastos personalizados.
  for (const item of state.items) {
    if (Array.isArray(item.split)) {
      item.split = item.split.filter((pid) => pid !== id);
      if (!item.split.length) item.split = "all";
    }
  }
  save();
  render();
}

// ---------- Gastos ----------
document.getElementById("add-item").addEventListener("click", () => {
  state.items.push({ id: uid(), name: "", price: "", split: "all" });
  save();
  render();
  // Enfoca el nombre del nuevo gasto.
  const inputs = document.querySelectorAll(".item-name");
  if (inputs.length) inputs[inputs.length - 1].focus();
});

function removeItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  save();
  render();
}

function toggleParticipant(item, personId) {
  if (item.split === "all") {
    // Pasamos de "todos" a personalizado con solo esta persona.
    item.split = [personId];
  } else {
    const has = item.split.includes(personId);
    item.split = has ? item.split.filter((id) => id !== personId) : [...item.split, personId];
    if (!item.split.length) item.split = "all"; // sin nadie -> vuelve a todos
  }
  save();
  render();
}

// ---------- Render ----------
const peopleList = document.getElementById("people-list");
const peopleEmpty = document.getElementById("people-empty");
const itemsList = document.getElementById("items-list");
const itemsEmpty = document.getElementById("items-empty");
const summaryList = document.getElementById("summary-list");
const summaryEmpty = document.getElementById("summary-empty");
const grandTotalEl = document.getElementById("grand-total");

function render() {
  renderPeople();
  renderItems();
  renderSummary();
}

function renderPeople() {
  peopleList.innerHTML = "";
  peopleEmpty.style.display = state.people.length ? "none" : "block";
  for (const p of state.people) {
    const chip = document.createElement("span");
    chip.className = "person-chip";
    const label = document.createElement("span");
    label.textContent = p.name;
    const btn = document.createElement("button");
    btn.className = "remove";
    btn.type = "button";
    btn.textContent = "✕";
    btn.title = "Quitar";
    btn.addEventListener("click", () => removePerson(p.id));
    chip.append(label, btn);
    peopleList.appendChild(chip);
  }
}

function renderItems() {
  itemsList.innerHTML = "";
  itemsEmpty.style.display = state.items.length ? "none" : "block";

  for (const item of state.items) {
    const row = document.createElement("div");
    row.className = "item";

    // Línea superior: nombre + precio + borrar
    const top = document.createElement("div");
    top.className = "item-top";

    const name = document.createElement("input");
    name.className = "input item-name";
    name.type = "text";
    name.placeholder = "Concepto (p. ej. Cena)";
    name.value = item.name;
    name.addEventListener("input", () => {
      item.name = name.value;
      save();
    });

    const priceWrap = document.createElement("div");
    priceWrap.className = "item-price-wrap";
    const price = document.createElement("input");
    price.className = "input item-price";
    price.type = "number";
    price.min = "0";
    price.step = "0.01";
    price.placeholder = "0,00";
    price.value = item.price;
    price.addEventListener("input", () => {
      item.price = price.value;
      save();
      renderSummary();
      renderGrandTotal();
    });
    priceWrap.appendChild(price);

    const del = document.createElement("button");
    del.className = "icon-btn";
    del.type = "button";
    del.textContent = "🗑";
    del.title = "Eliminar gasto";
    del.addEventListener("click", () => removeItem(item.id));

    top.append(name, priceWrap, del);

    // Línea de participantes: Todos + una persona por chip
    const people = document.createElement("div");
    people.className = "item-people";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "toggle all" + (item.split === "all" ? " active" : "");
    allBtn.textContent = "Todos";
    allBtn.addEventListener("click", () => {
      item.split = "all";
      save();
      render();
    });
    people.appendChild(allBtn);

    for (const p of state.people) {
      const isActive = item.split !== "all" && item.split.includes(p.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toggle" + (isActive ? " active" : "");
      btn.textContent = p.name;
      btn.addEventListener("click", () => toggleParticipant(item, p.id));
      people.appendChild(btn);
    }

    if (!state.people.length) {
      const hint = document.createElement("span");
      hint.className = "empty-hint";
      hint.textContent = "Añade amigos para repartir este gasto.";
      people.appendChild(hint);
    }

    row.append(top, people);
    itemsList.appendChild(row);
  }
}

function renderGrandTotal() {
  const { grand } = computeTotals();
  grandTotalEl.textContent = euro.format(grand);
}

function renderSummary() {
  const { totals, grand } = computeTotals();
  renderGrandTotal();
  summaryList.innerHTML = "";

  const hasData = state.people.length && state.items.length;
  summaryEmpty.style.display = hasData ? "none" : "block";
  if (!hasData) return;

  const max = Math.max(1, ...Object.values(totals));
  for (const p of state.people) {
    const amount = totals[p.id] || 0;

    const rowEl = document.createElement("div");
    rowEl.className = "summary-row";

    const labelEl = document.createElement("div");
    labelEl.className = "label";
    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = p.name;
    const amountEl = document.createElement("span");
    amountEl.className = "amount";
    amountEl.textContent = euro.format(amount);
    labelEl.append(nameEl, amountEl);

    const barEl = document.createElement("div");
    barEl.className = "bar";
    const fillEl = document.createElement("span");
    fillEl.style.width = (amount / max) * 100 + "%";
    barEl.appendChild(fillEl);

    rowEl.append(labelEl, barEl);
    summaryList.appendChild(rowEl);
  }
}

// ---------- Reset ----------
document.getElementById("reset").addEventListener("click", () => {
  if (confirm("¿Borrar todos los amigos y gastos?")) {
    state = { people: [], items: [] };
    save();
    render();
  }
});

render();
