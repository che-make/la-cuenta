-- ============================================================
--  La Cuenta v2 — Esquema de base de datos para Supabase
-- ============================================================
--
--  Pega este fichero completo en el SQL Editor de tu proyecto
--  Supabase y pulsa "Run". Crea las 5 tablas del modelo, las
--  claves foráneas, los índices y las políticas RLS.
--
--  Notas de diseño:
--   - El "id" de cada fila lo genera el CLIENTE (crypto.randomUUID),
--     por eso no se usa default gen_random_uuid(): la app envía el id.
--   - La "anon key" es PÚBLICA por diseño. La escritura la protegen
--     las políticas RLS: leer puede cualquiera (anon + authenticated),
--     pero crear/editar/borrar solo usuarios autenticados.
--   - "split" se guarda como jsonb: la cadena "all" o un array de
--     person_id (uuid en formato texto dentro del JSON).
--
--  Es idempotente en lo razonable: usa "create table if not exists",
--  "drop policy if exists" y "create index if not exists".
-- ============================================================


-- ------------------------------------------------------------
--  Tablas
-- ------------------------------------------------------------

-- Eventos: cada "cuenta" o viaje/cena que se divide.
create table if not exists public.events (
  id          uuid primary key,
  name        text not null,
  description text,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now()
);

-- Personas: amigos GLOBALES, reutilizables entre eventos.
create table if not exists public.people (
  id         uuid primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Participantes: pertenencia persona <-> evento, con marca de "pagado/liquidado".
create table if not exists public.participants (
  id        uuid primary key,
  event_id  uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  settled   boolean not null default false,
  -- Una persona no puede estar dos veces en el mismo evento.
  unique (event_id, person_id)
);

-- Mini-eventos / "Sitios" dentro de un evento.
create table if not exists public.mini_events (
  id           uuid primary key,
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null,
  date         date,
  description  text,
  location_url text,
  created_at   timestamptz not null default now()
);

-- Gastos de un evento.
create table if not exists public.expenses (
  id            uuid primary key,
  event_id      uuid not null references public.events(id) on delete cascade,
  name          text not null,
  qty           numeric not null default 1,
  unit_price    numeric not null default 0,
  -- Quien adelantó el dinero. Si se borra la persona -> queda null.
  paid_by       uuid references public.people(id) on delete set null,
  date          date,
  -- Sitio asociado. Si se borra el sitio -> queda null (el gasto sigue).
  mini_event_id uuid references public.mini_events(id) on delete set null,
  -- "all" (reparto entre todos) o un array de person_id.
  split         jsonb not null default to_jsonb('all'::text),
  created_at    timestamptz not null default now()
);


-- ------------------------------------------------------------
--  Índices (consultas siempre por evento)
-- ------------------------------------------------------------
create index if not exists idx_participants_event_id on public.participants(event_id);
create index if not exists idx_participants_person_id on public.participants(person_id);
create index if not exists idx_mini_events_event_id   on public.mini_events(event_id);
create index if not exists idx_expenses_event_id      on public.expenses(event_id);
create index if not exists idx_expenses_mini_event_id on public.expenses(mini_event_id);
create index if not exists idx_expenses_paid_by       on public.expenses(paid_by);


-- ------------------------------------------------------------
--  Row Level Security (RLS)
-- ------------------------------------------------------------
--  Activamos RLS en las 5 tablas y definimos políticas:
--   - SELECT: cualquiera (anon + authenticated)        -> using (true)
--   - INSERT/UPDATE/DELETE: solo authenticated          -> with check (true)
--
--  Recreamos las políticas (drop if exists) para que el
--  script se pueda volver a ejecutar sin error.
-- ------------------------------------------------------------

alter table public.events       enable row level security;
alter table public.people       enable row level security;
alter table public.participants enable row level security;
alter table public.mini_events  enable row level security;
alter table public.expenses     enable row level security;


-- ===== events =====
drop policy if exists "events_select_all"        on public.events;
drop policy if exists "events_insert_auth"       on public.events;
drop policy if exists "events_update_auth"       on public.events;
drop policy if exists "events_delete_auth"       on public.events;

create policy "events_select_all"  on public.events
  for select to anon, authenticated using (true);
create policy "events_insert_auth" on public.events
  for insert to authenticated with check (true);
create policy "events_update_auth" on public.events
  for update to authenticated using (true) with check (true);
create policy "events_delete_auth" on public.events
  for delete to authenticated using (true);


-- ===== people =====
drop policy if exists "people_select_all"  on public.people;
drop policy if exists "people_insert_auth" on public.people;
drop policy if exists "people_update_auth" on public.people;
drop policy if exists "people_delete_auth" on public.people;

create policy "people_select_all"  on public.people
  for select to anon, authenticated using (true);
create policy "people_insert_auth" on public.people
  for insert to authenticated with check (true);
create policy "people_update_auth" on public.people
  for update to authenticated using (true) with check (true);
create policy "people_delete_auth" on public.people
  for delete to authenticated using (true);


-- ===== participants =====
drop policy if exists "participants_select_all"  on public.participants;
drop policy if exists "participants_insert_auth" on public.participants;
drop policy if exists "participants_update_auth" on public.participants;
drop policy if exists "participants_delete_auth" on public.participants;

create policy "participants_select_all"  on public.participants
  for select to anon, authenticated using (true);
create policy "participants_insert_auth" on public.participants
  for insert to authenticated with check (true);
create policy "participants_update_auth" on public.participants
  for update to authenticated using (true) with check (true);
create policy "participants_delete_auth" on public.participants
  for delete to authenticated using (true);


-- ===== mini_events =====
drop policy if exists "mini_events_select_all"  on public.mini_events;
drop policy if exists "mini_events_insert_auth" on public.mini_events;
drop policy if exists "mini_events_update_auth" on public.mini_events;
drop policy if exists "mini_events_delete_auth" on public.mini_events;

create policy "mini_events_select_all"  on public.mini_events
  for select to anon, authenticated using (true);
create policy "mini_events_insert_auth" on public.mini_events
  for insert to authenticated with check (true);
create policy "mini_events_update_auth" on public.mini_events
  for update to authenticated using (true) with check (true);
create policy "mini_events_delete_auth" on public.mini_events
  for delete to authenticated using (true);


-- ===== expenses =====
drop policy if exists "expenses_select_all"  on public.expenses;
drop policy if exists "expenses_insert_auth" on public.expenses;
drop policy if exists "expenses_update_auth" on public.expenses;
drop policy if exists "expenses_delete_auth" on public.expenses;

create policy "expenses_select_all"  on public.expenses
  for select to anon, authenticated using (true);
create policy "expenses_insert_auth" on public.expenses
  for insert to authenticated with check (true);
create policy "expenses_update_auth" on public.expenses
  for update to authenticated using (true) with check (true);
create policy "expenses_delete_auth" on public.expenses
  for delete to authenticated using (true);

-- ============================================================
--  Fin del esquema.
-- ============================================================
