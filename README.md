# La Cuenta 🧾

App estática para dividir gastos en euros entre un grupo de amigos.

- **Añade amigos** y un listado de **gastos** (concepto + precio).
- Asigna cada gasto a **una persona**, a **varias**, o repártelo entre **todos**.
- Ve al instante **cuánto paga cada uno** y el **total**.

Todo se guarda en el `localStorage` del navegador: no hay servidor ni base de datos.

## Cómo asignar un gasto

Cada gasto tiene una fila de chips:

- **Todos** (azul) → se reparte a partes iguales entre todas las personas.
- Pulsa **el nombre de una persona** → ese gasto es solo suyo.
- Pulsa **varios nombres** → se reparte solo entre los seleccionados.

## Probar en local

Abre `index.html` en el navegador. O sirve la carpeta:

```bash
npx serve .
```

## Desplegar en Vercel

Al ser estático, no hace falta configuración.

**Opción A — desde la web (lo más fácil):**
1. Entra en [vercel.com](https://vercel.com) y crea un proyecto nuevo.
2. Importa este repositorio (o arrastra la carpeta en *Add New → Project*).
3. Framework Preset: **Other**. Deja todo por defecto y pulsa **Deploy**.

**Opción B — desde la terminal:**
```bash
npm i -g vercel
vercel
```

## Nota sobre los datos

Los datos viven en el navegador de cada persona (no se comparten entre dispositivos).
Para un proyecto informal es perfecto. Si más adelante quieres que el grupo comparta
la misma cuenta desde varios móviles, habría que añadir un backend ligero
(Supabase, Vercel KV/Upstash, etc.).
