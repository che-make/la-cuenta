// ============================================================
//  auth.js — Autenticación en DOS modos
// ============================================================
//
//  - MODO SUPABASE (si hay credenciales): login real por email
//    mediante enlace mágico (magic link / OTP). Los invitados ven
//    en modo lectura; los usuarios autenticados pueden editar.
//
//  - MODO LOCAL (por defecto): no hay usuarios reales. El "login"
//    es solo un desbloqueo de edición protegido por una contraseña
//    local (LOCAL_EDIT_PASSWORD de config.js). El estado de
//    desbloqueo se guarda en sessionStorage para esta pestaña.
//
//  Otros módulos dependen de las firmas exactas exportadas aquí:
//    initAuth, canEdit, userLabel, mode, login, logout.
// ============================================================

import { isSupabaseConfigured, LOCAL_EDIT_PASSWORD } from "../config.js";
import { state, setSession, setEditUnlocked, notify } from "./state.js";
import { getClient } from "./backend-supabase.js";
import { el, openModal, toast } from "./util.js";

// Clave de sessionStorage para el desbloqueo de edición en modo local.
const LOCAL_EDIT_KEY = "lacuenta-edit";

/**
 * Devuelve el modo de autenticación activo.
 * @returns {"supabase"|"local"}
 */
export function mode() {
  return isSupabaseConfigured() ? "supabase" : "local";
}

/**
 * Inicializa la autenticación según el modo.
 *  - Supabase: recupera la sesión actual y se suscribe a los cambios
 *    de estado de auth (incluido el retorno del enlace mágico), y
 *    refleja la sesión en el state global.
 *  - Local: lee el flag de desbloqueo de sessionStorage.
 */
export async function initAuth() {
  if (mode() === "supabase") {
    // getClient() puede devolver una promesa la primera vez (importa el
    // cliente del CDN de forma perezosa); por eso lo esperamos.
    const client = await getClient();
    // Sesión actual (puede venir del enlace mágico detectado en la URL).
    const { data } = await client.auth.getSession();
    setSession(data?.session ?? null);
    notify();
    // Reaccionar a futuros cambios de sesión (login/logout/refresh).
    client.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      notify();
    });
  } else {
    // Modo local: el desbloqueo vive en sessionStorage de esta pestaña.
    const unlocked = sessionStorage.getItem(LOCAL_EDIT_KEY) === "1";
    setEditUnlocked(unlocked);
    notify();
  }
}

/**
 * ¿Puede editar el usuario actual?
 *  - Supabase: hay sesión iniciada.
 *  - Local: el flag de edición está desbloqueado.
 * @returns {boolean}
 */
export function canEdit() {
  if (mode() === "supabase") return !!state.session;
  return !!state.editUnlocked;
}

/**
 * Etiqueta legible del usuario actual.
 *  - Supabase: el email del usuario (o null si no hay sesión).
 *  - Local: "Editor" si está desbloqueado, o null.
 * @returns {string|null}
 */
export function userLabel() {
  if (mode() === "supabase") {
    return state.session?.user?.email ?? null;
  }
  return state.editUnlocked ? "Editor" : null;
}

/**
 * Inicia sesión / desbloquea edición según el modo.
 *  - Supabase: pide el email y envía un enlace mágico.
 *  - Local: pide la contraseña local y desbloquea la edición.
 */
export async function login() {
  if (mode() === "supabase") {
    await loginSupabase();
  } else {
    await loginLocal();
  }
}

/**
 * Cierra sesión / bloquea edición según el modo.
 */
export async function logout() {
  if (mode() === "supabase") {
    const client = await getClient();
    await client.auth.signOut();
    // onAuthStateChange actualizará el state, pero notificamos por si acaso.
    setSession(null);
  } else {
    sessionStorage.removeItem(LOCAL_EDIT_KEY);
    setEditUnlocked(false);
  }
  notify();
}

// ------------------------------------------------------------
//  Modo Supabase: enlace mágico por email
// ------------------------------------------------------------
function loginSupabase() {
  return new Promise((resolve) => {
    const input = el("input", {
      class: "input",
      type: "email",
      placeholder: "tu@email.com",
      autocomplete: "email",
    });

    const body = el(
      "div",
      { class: "field" },
      el("label", null, "Tu email"),
      input,
      el(
        "p",
        { class: "muted" },
        "Te enviaremos un enlace para entrar. No necesitas contraseña."
      )
    );

    const enviar = async (ctrl) => {
      const email = (input.value || "").trim();
      if (!email) {
        toast("Escribe tu email.", "error");
        return;
      }
      try {
        const client = await getClient();
        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: location.href,
            // Solo emails ya invitados: no se crean usuarios nuevos al vuelo.
            shouldCreateUser: false,
          },
        });
        if (error) throw error;
        ctrl.close();
        toast("Te enviamos un enlace. Revisa tu correo.", "success");
      } catch (err) {
        // Si el email no existe (no invitado), Supabase responde con un error
        // de tipo "signup/otp not allowed": lo traducimos a algo claro.
        const raw = err?.message || String(err);
        const friendly = /signup|not allowed|otp|user/i.test(raw)
          ? "Ese email no está invitado. Pide al organizador que te añada."
          : "No se pudo enviar el enlace: " + raw;
        toast(friendly, "error");
      }
    };

    // Enter en el input también envía.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        enviar({ close: () => modal.close() });
      }
    });

    const modal = openModal({
      title: "Entrar",
      body,
      actions: [
        { label: "Cancelar", kind: "ghost", onClick: (c) => c.close() },
        { label: "Enviar enlace", kind: "primary", onClick: enviar },
      ],
      onClose: () => resolve(),
    });

    // Foco al abrir.
    setTimeout(() => input.focus(), 0);
  });
}

// ------------------------------------------------------------
//  Modo local: contraseña de desbloqueo
// ------------------------------------------------------------
function loginLocal() {
  return new Promise((resolve) => {
    const input = el("input", {
      class: "input",
      type: "password",
      placeholder: "Contraseña de edición",
      autocomplete: "current-password",
    });

    const body = el(
      "div",
      { class: "field" },
      el("label", null, "Contraseña"),
      input,
      el(
        "p",
        { class: "muted" },
        "Introduce la contraseña para desbloquear la edición en este navegador."
      )
    );

    const desbloquear = (ctrl) => {
      const pass = input.value || "";
      if (pass === LOCAL_EDIT_PASSWORD) {
        sessionStorage.setItem(LOCAL_EDIT_KEY, "1");
        setEditUnlocked(true);
        notify();
        ctrl.close();
        toast("Edición desbloqueada.", "success");
      } else {
        toast("Contraseña incorrecta.", "error");
      }
    };

    // Enter en el input también confirma.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        desbloquear({ close: () => modal.close() });
      }
    });

    const modal = openModal({
      title: "Entrar",
      body,
      actions: [
        { label: "Cancelar", kind: "ghost", onClick: (c) => c.close() },
        { label: "Entrar", kind: "primary", onClick: desbloquear },
      ],
      onClose: () => resolve(),
    });

    setTimeout(() => input.focus(), 0);
  });
}
