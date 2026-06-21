// ============================================================
//  Configuración de La Cuenta
// ============================================================
//
//  La app funciona en DOS modos:
//
//  1) MODO LOCAL (por defecto): si no hay credenciales de Supabase,
//     los datos se guardan en localStorage de este navegador y el
//     "login" es solo un desbloqueo de edición con una contraseña local.
//
//  2) MODO SUPABASE: en cuanto rellenes SUPABASE_URL y SUPABASE_ANON_KEY,
//     la app usa la base de datos compartida y el login real por email
//     (enlace mágico). Los invitados ven en modo lectura; los usuarios
//     autenticados pueden editar.
//
//  Pega tus credenciales aquí (Project Settings → API en Supabase).
//  La "anon public key" está pensada para ser pública: el acceso lo
//  protegen las políticas RLS de supabase/schema.sql.
// ============================================================

export const SUPABASE_URL = "https://tcwkhjvptkzfjukooyci.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjd2toanZwdGt6Zmp1a29veWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzEyMTIsImV4cCI6MjA5NzY0NzIxMn0.ck6nj_aUG3sT39r0UCdzvnFKncwOAtXkwSmIWFDhBE4";

// Solo se usa en MODO LOCAL (sin Supabase): contraseña para desbloquear edición.
export const LOCAL_EDIT_PASSWORD = "lacuenta";

// URL del CDN del cliente de Supabase (se carga solo si hay credenciales).
export const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
