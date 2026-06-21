# La Cuenta 🧾

App **estática** (HTML + CSS + JavaScript vanilla con módulos ES, sin frameworks
ni build) para **dividir gastos en euros** entre un grupo de amigos.

Pensada para viajes, cenas o cualquier plan en grupo: apunta los gastos, di quién
pagó y entre quiénes se reparte, y ve al instante **cuánto debe poner cada uno**.

## Qué puedes hacer

- **Varios eventos / cuentas**: cada viaje, cena o plan es un evento independiente.
  Cambia entre ellos desde el selector de la cabecera.
- **Amigos reutilizables**: las personas son globales; añade a tus amigos una vez y
  reutilízalos en cualquier evento.
- **Gastos detallados**: concepto, **cantidad × precio por unidad** (el total se
  calcula solo), quién lo pagó y entre quiénes se reparte.
- **Reparto flexible**: un gasto puede ser de **todos**, de **una persona** o de un
  **subconjunto** del grupo.
- **Sitios (mini-eventos)**: agrupa gastos por lugar/momento, con fecha y enlace a
  Google Maps. Los gastos pueden **heredar la fecha** de su sitio.
- **Filtros**: por persona, concepto, sitio, rango de fechas y estado (pendiente /
  liquidado), combinables entre sí.
- **Resumen claro**: por participante verás **gastado**, **pendiente** y su
  **balance** (le deben / debe), más el **total** del evento. Marca a quién ya ha
  liquidado su parte.
- **Exportar / Importar**: descarga toda tu cuenta como `.json` y vuelve a cargarla
  cuando quieras (útil para copias o para migrar de modo local a Supabase).

## Vistas

| Pestaña | Para qué |
|---------|----------|
| **Resumen** | Total del evento y, por persona, gastado / pendiente / balance. |
| **Gastos** | Lista de gastos con filtros; crear, editar y eliminar. |
| **Amigos** | Participantes del evento y catálogo de amigos guardados. |
| **Sitios** | Mini-eventos/lugares del evento, con fecha y mapa. |

## Dos modos de funcionamiento

La app detecta sola en qué modo arranca según `config.js`:

### Modo local (por defecto)

- Sin credenciales de Supabase: **no hay servidor**.
- Los datos se guardan en el `localStorage` del navegador (no se comparten entre
  dispositivos).
- La edición se **desbloquea con una contraseña local** (`LOCAL_EDIT_PASSWORD` en
  `config.js`, por defecto `lacuenta`).
- Ideal para probar o para uso individual.

### Modo Supabase (compartido)

- En cuanto rellenas `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `config.js`, la app
  usa una **base de datos compartida en la nube**.
- El acceso de edición se hace con **login real por email** (enlace mágico).
- Los **invitados** ven la cuenta en **solo lectura**; quien inicia sesión puede
  editar.
- Guía completa de configuración: **[`SUPABASE.md`](./SUPABASE.md)**.

> La clave `anon` de Supabase es pública por diseño: la escritura la protegen las
> políticas **RLS** definidas en [`supabase/schema.sql`](./supabase/schema.sql).

## Probar en local

Abre `index.html` en el navegador, o sirve la carpeta (recomendado, para que los
módulos ES carguen bien):

```bash
npx serve .
```

Para editar en modo local, pulsa **Entrar** e introduce la contraseña local
(`lacuenta` por defecto; cámbiala en `config.js`).

## Desplegar en Vercel

Al ser estática, no necesita configuración de build.

**Opción A — desde la web (lo más fácil):**

1. Sube el proyecto a GitHub.
2. Entra en [vercel.com](https://vercel.com) → **Add New → Project** e importa el repo.
3. **Framework Preset: Other**. Deja todo por defecto y pulsa **Deploy**.

**Opción B — desde la terminal:**

```bash
npm i -g vercel
vercel
```

Si vas a usar el modo Supabase, recuerda añadir tu dominio de Vercel a las
**Redirect URLs** de Supabase (ver [`SUPABASE.md`](./SUPABASE.md)).

## Estructura del proyecto

```
index.html            Maquetación y contenedores de vista
config.js             Credenciales de Supabase y opciones (modo local/Supabase)
styles.css            Estilos
DESIGN.md             Referencia de diseño
SUPABASE.md           Guía para conectar Supabase
supabase/schema.sql   Tablas, relaciones, índices y políticas RLS
js/                   Lógica (módulos ES): store, estado, backends, vistas…
```

## Tus datos

- En **modo local** los datos viven solo en el navegador de cada persona.
- En **modo Supabase** se comparten entre todos los dispositivos del grupo.
- En cualquier momento puedes **Exportar** tu cuenta a `.json` e **Importarla**
  después (por ejemplo, para pasar tus datos del modo local a Supabase).
