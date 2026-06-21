// ============================================================
//  util.js — Utilidades base de "La Cuenta"
//  Formato, fechas, IDs, construcción de DOM (anti-XSS),
//  modales, diálogos de confirmación y toasts.
// ============================================================

// ---------- Formato de dinero ----------
// Devuelve una cadena en euros con formato español (es-ES).
const _euroFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
export const euro = (n) => _euroFmt.format(Number(n) || 0);

// ---------- Fechas ----------
// Convierte una ISO "YYYY-MM-DD" a "dd/mm/aaaa". "" si no hay valor.
export function fmtDate(iso) {
  if (!iso) return "";
  // Aceptamos tanto "YYYY-MM-DD" como timestamps ISO; tomamos la parte de fecha.
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

// Fecha de hoy en formato "YYYY-MM-DD" (hora local).
export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// ---------- IDs ----------
export function uid() {
  return crypto.randomUUID();
}

// ---------- URLs seguras (anti-XSS) ----------
// Devuelve la URL solo si su esquema es http: o https:; en cualquier otro
// caso (javascript:, data:, URL invalida, etc.) devuelve null. Sirve para
// no pintar enlaces peligrosos guardados por un editor.
export function safeHttpUrl(u) {
  if (!u) return null;
  try {
    const parsed = new URL(String(u));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // URL invalida.
  }
  return null;
}

// ============================================================
//  el() — hyperscript anti-XSS
//  - attrs.class -> className
//  - onClick / onInput / onChange / ... -> addEventListener(evento en minúscula)
//  - value / checked / disabled / hidden / selected -> propiedades
//  - resto (href, title, type, placeholder, min, step, ...) -> setAttribute
//  - children: nodos del DOM o strings/números (se añaden con textContent vía textNode)
//  - Ignora null / false / undefined
//  - NUNCA usa innerHTML
// ============================================================

// Propiedades que deben fijarse como propiedad del elemento (no atributo).
const PROP_ATTRS = new Set([
  "value",
  "checked",
  "disabled",
  "hidden",
  "selected",
  "readOnly",
  "readonly",
  "multiple",
]);

function appendChild(parent, child) {
  // Ignora valores vacíos para permitir expresiones condicionales (cond && el(...)).
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  // strings / números / otros primitivos -> texto seguro (anti-XSS).
  parent.appendChild(document.createTextNode(String(child)));
}

export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);

  if (attrs && typeof attrs === "object" && !(attrs instanceof Node)) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val == null || val === false) continue;

      // Manejadores de eventos: onClick, onInput, onChange, onSubmit, etc.
      if (/^on[A-Z]/.test(key)) {
        const evt = key.slice(2).toLowerCase();
        if (typeof val === "function") node.addEventListener(evt, val);
        continue;
      }

      // class -> className
      if (key === "class" || key === "className") {
        node.className = val;
        continue;
      }

      // dataset: { dataset: { foo: "bar" } } o data-* directos
      if (key === "dataset" && typeof val === "object") {
        for (const [dk, dv] of Object.entries(val)) {
          if (dv != null) node.dataset[dk] = dv;
        }
        continue;
      }

      // Propiedades (estado del control), no atributos.
      if (PROP_ATTRS.has(key)) {
        const prop = key === "readonly" ? "readOnly" : key;
        node[prop] = val;
        continue;
      }

      // El resto, como atributo. true -> atributo presente sin valor.
      node.setAttribute(key, val === true ? "" : String(val));
    }
  } else if (attrs != null) {
    // Si el 2º argumento no es un objeto de atributos, trátalo como hijo.
    children.unshift(attrs);
  }

  for (const child of children) appendChild(node, child);
  return node;
}

// ---------- Manipulación de contenedores ----------
// Vacía un nodo de todos sus hijos.
export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Limpia el contenedor y monta un único nodo dentro.
export function mount(container, node) {
  clear(container);
  if (node != null) appendChild(container, node);
}

// ============================================================
//  toast(msg, type) — aviso breve flotante
//  type: "success" | "error" | "" (neutro). Se quita solo a ~2.5s.
// ============================================================
export function toast(msg, type = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const cls = type ? `toast ${type}` : "toast";
  const node = el("div", { class: cls }, msg);
  root.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 2500);
}

// ============================================================
//  openModal({ title, body, actions, onClose })
//  - body: nodo del DOM
//  - actions: [{ label, kind, onClick }]
//      kind -> clase btn: primary/secondary/danger/ghost (por defecto secondary)
//      onClick recibe el control { close }
//  - Pinta overlay .modal-overlay > .modal en #modal-root.
//  - Cierra al pulsar el overlay (fuera del modal) o con Escape.
//  - Devuelve { close }.
// ============================================================
export function openModal({ title, body, actions = [], onClose } = {}) {
  const root = document.getElementById("modal-root");
  let closed = false;

  // Botones de acción.
  const actionNodes = actions.map((a) => {
    const kind = a.kind || "secondary";
    return el(
      "button",
      {
        class: `btn btn-${kind}`,
        type: "button",
        onClick: () => a.onClick && a.onClick(control),
      },
      a.label
    );
  });

  const modal = el(
    "div",
    {
      class: "modal",
      role: "dialog",
      "aria-modal": "true",
      // Evita que el clic dentro del modal cierre el overlay.
      onClick: (ev) => ev.stopPropagation(),
    },
    title ? el("h3", null, title) : null,
    body || null,
    actionNodes.length ? el("div", { class: "modal-actions" }, actionNodes) : null
  );

  const overlay = el(
    "div",
    {
      class: "modal-overlay",
      // Clic en el fondo (no en el modal) -> cerrar.
      onClick: () => control.close(),
    },
    modal
  );

  function onKey(ev) {
    if (ev.key === "Escape") control.close();
  }

  const control = {
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (typeof onClose === "function") onClose();
    },
  };

  document.addEventListener("keydown", onKey);
  if (root) root.appendChild(overlay);

  // Enfoca el primer campo o botón para accesibilidad.
  const focusable = modal.querySelector(
    "input, select, textarea, button, [tabindex]"
  );
  if (focusable) focusable.focus();

  return control;
}

// ============================================================
//  confirmDialog(message, opts) -> Promise<boolean>
//  opts: { danger?: bool }. Botones "Cancelar" / "Confirmar".
//  El botón Confirmar usa estilo danger si opts.danger.
// ============================================================
export function confirmDialog(message, opts = {}) {
  const danger = !!opts.danger;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val, ctrl) => {
      if (settled) return;
      settled = true;
      resolve(val);
      if (ctrl) ctrl.close();
    };

    openModal({
      title: opts.title || "¿Confirmar?",
      body: el("p", { class: "muted" }, message),
      actions: [
        {
          label: "Cancelar",
          kind: "ghost",
          onClick: (ctrl) => finish(false, ctrl),
        },
        {
          label: opts.confirmLabel || "Confirmar",
          kind: danger ? "danger" : "primary",
          onClick: (ctrl) => finish(true, ctrl),
        },
      ],
      // Cerrar por Escape u overlay equivale a cancelar.
      onClose: () => finish(false, null),
    });
  });
}

// ============================================================
//  debounce(fn, ms) — retrasa la ejecución de fn.
// ============================================================
export function debounce(fn, ms = 250) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn.apply(this, args);
    }, ms);
  };
}
