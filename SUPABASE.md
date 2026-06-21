# Conectar La Cuenta con Supabase

Por defecto, **La Cuenta funciona en modo local**: los datos se guardan en el
`localStorage` del navegador y no se comparten entre dispositivos. Eso es
perfecto para probar o para uso individual.

Si quieres que **todo el grupo comparta la misma cuenta** desde varios móviles y
ordenadores, conecta la app con **Supabase** (gratis para este tamaño de uso).
La diferencia clave del modo Supabase es:

- Los datos viven en una base de datos compartida en la nube.
- El acceso de edición se hace con **login real por email** (enlace mágico):
  los invitados ven la cuenta en **solo lectura** y quien inicia sesión puede editar.

> Sin credenciales de Supabase en `config.js`, la app sigue funcionando en modo
> local automáticamente. No tienes que tocar nada para probarla.

A continuación tienes la guía paso a paso.

---

## 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) y crea una cuenta (o inicia sesión).
2. Pulsa **New project**.
3. Elige una **organización**, ponle un **nombre** al proyecto (p. ej. `la-cuenta`)
   y una **contraseña de base de datos** (guárdala, aunque para esta app no la
   necesitarás en el día a día).
4. Selecciona una **región** cercana (p. ej. *West EU (Ireland)* o *EU Frankfurt*).
5. Pulsa **Create new project** y espera 1–2 minutos a que termine de aprovisionarse.

---

## 2. Crear las tablas (pegar `schema.sql`)

1. En el menú lateral del proyecto, abre **SQL Editor**.
2. Pulsa **New query**.
3. Abre el fichero [`supabase/schema.sql`](./supabase/schema.sql) de este
   repositorio, copia **todo su contenido** y pégalo en el editor.
4. Pulsa **Run** (o `Ctrl/Cmd + Enter`).

Esto crea las 5 tablas (`events`, `people`, `participants`, `mini_events`,
`expenses`), sus relaciones, índices y las **políticas RLS** (Row Level Security).

> El script es repetible: si lo vuelves a ejecutar, no rompe nada (usa
> `create table if not exists` y recrea las políticas).

### ¿Qué hace la seguridad (RLS)?

- **Leer**: lo puede hacer cualquiera (incluidos los invitados sin sesión).
- **Crear / editar / borrar**: solo usuarios **autenticados**.

Por eso la `anon key` puede ser pública sin problema: aunque alguien la copie,
no podrá modificar los datos sin iniciar sesión.

---

## 3. Copiar las credenciales a `config.js`

1. En el menú lateral, ve a **Project Settings → API**.
2. Copia estos dos valores:
   - **Project URL** (algo como `https://xxxxxxxxxxxx.supabase.co`).
   - **Project API keys → `anon` `public`** (una cadena larga que empieza por `eyJ...`).
3. Abre `config.js` en la raíz del proyecto y pégalos:

   ```js
   export const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

En cuanto estos dos valores no estén vacíos, la app arranca en **modo Supabase**.

> Recuerda: usa la clave **`anon` / `public`**, **nunca** la `service_role`
> (esa es secreta y daría acceso total saltándose las RLS).

---

## 4. Configurar el login por email (enlace mágico)

La Cuenta usa **Magic Link**: el usuario escribe su email, recibe un correo con un
enlace y al pulsarlo queda autenticado. Para que el enlace vuelva a tu app debes
configurar las URLs permitidas.

1. En el menú lateral, ve a **Authentication → URL Configuration**.
2. En **Site URL**, pon la URL principal de tu app desplegada, por ejemplo:
   ```
   https://la-cuenta.vercel.app
   ```
3. En **Redirect URLs**, añade **todas** las direcciones desde las que vas a usar
   la app (una por línea). Como mínimo:
   ```
   http://localhost:3000
   http://localhost:5173
   https://la-cuenta.vercel.app
   ```
   Ajusta el puerto local al que uses (p. ej. el de `npx serve`, que suele ser
   `http://localhost:3000`) y pon tu dominio real de Vercel.
4. Guarda los cambios.

> El proveedor **Email** viene activado por defecto en Supabase. Si lo desactivaste,
> actívalo en **Authentication → Providers → Email**.

### Sobre los correos

- Por defecto Supabase envía los correos con su propio servicio (con un límite
  de envíos pensado para pruebas). Para un grupo de amigos suele bastar.
- Para uso intensivo o más fiable, configura un **SMTP propio** en
  **Authentication → Emails / SMTP Settings**.

---

## 5. Desplegar

La app es 100% estática, así que cualquier hosting estático sirve. La forma más
sencilla es **Vercel**:

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com), **Add New → Project** e importa el repo.
3. **Framework Preset: Other**. No hace falta build ni configuración: pulsa **Deploy**.
4. Cuando tengas la URL final (p. ej. `https://la-cuenta.vercel.app`), vuelve al
   **paso 4** y asegúrate de que esa URL está en **Site URL** y en **Redirect URLs**.

> Si cambias el dominio de Vercel más adelante, actualiza también las URLs en
> Supabase o el enlace mágico no funcionará.

---

## 6. Comprobar que funciona

1. Abre la app desplegada (o en local con `npx serve .`).
2. Arriba a la derecha pulsa **Entrar**, escribe tu email y revisa tu correo.
3. Pulsa el enlace mágico: deberías volver a la app ya autenticado y ver los
   controles de edición (crear eventos, gastos, etc.).
4. Abre la misma URL en otro navegador o móvil **sin** iniciar sesión: verás la
   misma cuenta en **modo lectura**.

---

## Pasar tus datos del modo local a Supabase

Si ya habías usado la app en **modo local** y quieres llevarte esos datos a la
base de datos compartida:

1. **Antes** de poner las credenciales (todavía en modo local), inicia sesión de
   edición y usa **Exportar** para descargar un fichero `.json` con tu cuenta.
2. Conecta Supabase (pasos 1–4) y recarga la app.
3. Inicia sesión por email y usa **Importar** para subir ese `.json`.

> En modo Supabase la importación es **best-effort**: inserta las filas del
> fichero sin borrar lo que ya exista en la nube. Si algo falla, la app te avisa
> con un aviso (toast).

---

## Resumen rápido

| Paso | Dónde | Qué |
|------|-------|-----|
| 1 | supabase.com | Crear proyecto |
| 2 | SQL Editor | Pegar y ejecutar `supabase/schema.sql` |
| 3 | Project Settings → API | Copiar URL + `anon key` a `config.js` |
| 4 | Authentication → URL Configuration | Site URL + Redirect URLs (local y Vercel) |
| 5 | Vercel | Desplegar (Framework: Other) |
| 6 | — | Probar login por email y modo lectura |

Sin los pasos 3–4, la app sigue funcionando en **modo local** sin tocar nada.
