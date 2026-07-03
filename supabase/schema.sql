-- ===========================================================================
-- schema.sql — Buchungs-/Bestellsystem La Légende (Supabase / PostgreSQL)
-- ===========================================================================
-- EIN Supabase-Projekt pro Kundenwebsite, EU-Region (Frankfurt) anlegen — es
-- werden personenbezogene Daten gespeichert (Name, E-Mail, Telefon, Bestellung).
--
-- Muster: „Bestellung mit Zeitfenster" (Food Truck). Der Kunde wählt einen
-- Tournée-Standort → Bestellung → Tag → Abholfenster. Verfügbarkeit wird NICHT
-- gespeichert, sondern aus Stammdaten + bestehenden Bestellungen BERECHNET
-- (assets/js/availability.js, geteilt mit den Edge Functions).
--
-- IDs sind bewusst TEXT (z. B. 'commande', 'corgemont', 'p_legende'), damit
-- Frontend-config.js, Widget-Payload und Datenbank identische Schlüssel nutzen.
--
-- Datenschutz: anonyme Besucher sehen nur belegte Zeitfenster OHNE PII
-- (View busy_slots) und dürfen Bestellungen/Anfragen NUR anlegen. Vollzugriff
-- hat die eingeloggte Betreiber-Rolle (authenticated) bzw. die service_role
-- (nur serverseitig in Edge Functions). RLS ist überall aktiv.
-- ===========================================================================

-- --- Einstellungen (Singleton) ---------------------------------------------
create table if not exists settings (
  id            boolean primary key default true check (id),
  business_name text default 'La Légende',
  timezone      text default 'Europe/Zurich',
  locale        text default 'fr-CH',
  menu_price_from integer default 13,
  feature_flags jsonb default '{
    "multiService": false, "multiStaff": false, "multiLocation": true,
    "emailNotifications": true, "smsNotifications": false, "reminders": true,
    "cancellation": true, "waitlist": false, "customerAccounts": false,
    "onlinePayment": false, "customForms": false
  }'::jsonb,
  booking jsonb default '{
    "slotPerItem": true, "sameDayOnly": false,
    "productionMin": 8, "prepMin": 1,
    "slotGranularityMinutes": 9, "leadTimeMinutes": 45, "bookingHorizonDays": 14,
    "cutoffMinutesBeforeSlot": 0, "maxBookingsPerDay": null, "autoConfirm": true
  }'::jsonb,
  updated_at timestamptz default now()
);

-- --- Tournée-Standorte ------------------------------------------------------
create table if not exists locations (
  id               text primary key,
  name             text not null,
  place            text,
  service          text,          -- 'midi' | 'soir'
  phone            text,
  weekday_label_fr text,
  weekday_label_de text,
  active           boolean default true,
  sort             integer default 0
);

-- --- Leistung(en) : hier die Abholbestellung, capacity = Pizzen/Ofen/Fenster
create table if not exists services (
  id                text primary key,
  name              text not null,
  duration_minutes  integer not null default 9,   -- Produktion + Vorbereitung pro Pizza (= ein Slot)
  buffer_before_min integer default 0,
  buffer_after_min  integer default 0,            -- Übergangs-/Aufräumzeit je Bestellung
  price             numeric,
  capacity          integer default 1,            -- (slotPerItem-Modus: 1)
  active            boolean default true,
  sort              integer default 0
);

-- --- Karte : Kategorien + Produkte ------------------------------------------
create table if not exists product_categories (
  id      text primary key,
  name_fr text not null,
  name_de text,
  sort    integer default 0
);
create table if not exists products (
  id          text primary key,
  category_id text references product_categories(id) on delete set null,
  name_fr     text not null,
  name_de     text,
  desc_fr     text,
  desc_de     text,
  oven        boolean default true,   -- zählt in die Ofen-Kapazität (partySize)
  price       numeric,                -- optional, vom Betreiber zu pflegen
  tags        text[] default '{}',    -- 'vegan' | 'veggie' | 'signature' | 'new'
  allergens   text[] default '{}',    -- z.B. 'gluten','lactose','oeuf' (Lebensmittelrecht)
  image       text,                   -- optionale Produktbild-URL
  active      boolean default true,
  sort        integer default 0
);

-- --- Öffnungszeiten je Standort (scope='location') --------------------------
create table if not exists availability_rules (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'location',  -- 'business' | 'location'
  location_id text references locations(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6), -- 0=So … 6=Sa
  start_time  time not null,
  end_time    time not null
);

-- --- Pausen / Ferien / Sonderöffnungen --------------------------------------
create table if not exists breaks (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'business',
  location_id text references locations(id) on delete cascade,
  weekday     smallint check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null
);
create table if not exists closures (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'business',  -- 'business' | location_id
  location_id text references locations(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text
);
create table if not exists date_overrides (
  id         uuid primary key default gen_random_uuid(),
  the_date   date not null,
  start_time time not null,
  end_time   time not null
);

-- --- Bestellungen -----------------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  service_id     text references services(id),
  location_id    text references locations(id),
  customer_name  text not null,
  customer_email text not null,
  customer_phone text,
  booking_date   date not null,
  start_time     time not null,
  end_time       time not null,
  party_size     integer default 0,   -- Anzahl Pizzen = belegte Folge-Slots
  items          jsonb,               -- [{id,name,qty,oven}]
  notes          text,                -- '__BLOCK__' = Pause/Blocker (keine echte Bestellung)
  reminder_channel text default 'none', -- none | email | messenger (Erinnerung 10 Min vorher)
  client_ref     text,                -- Idempotenz: verhindert Doppel-Absenden
  status         text not null default 'pending', -- pending | confirmed | ready | paid | declined | cancelled
  cancel_token   uuid default gen_random_uuid(),
  created_at     timestamptz default now()
);

-- Realtime (Schritt 3): PII-freie Event-Tabelle. Anonyme Kunden dürfen `bookings`
-- nicht lesen (Datenschutz) und könnten daher keine Realtime-Events davon
-- empfangen. Ein Trigger schreibt bei jeder Änderung einen neutralen Eintrag
-- (nur Datum + Standort) hierher; darauf hört das Kunden-Widget.
create table if not exists slot_events (
  id           bigserial primary key,
  booking_date date,
  location_id  text,
  created_at   timestamptz default now()
);
create or replace function notify_slot_change() returns trigger language plpgsql security definer as $$
begin
  insert into slot_events (booking_date, location_id)
  values (coalesce(new.booking_date, old.booking_date), coalesce(new.location_id, old.location_id));
  return null;
end $$;
drop trigger if exists trg_slot_change on bookings;
create trigger trg_slot_change after insert or update or delete on bookings
  for each row execute function notify_slot_change();
do $$ begin alter publication supabase_realtime add table slot_events; exception when duplicate_object then null; end $$;
-- bookings ebenfalls in Realtime: der eingeloggte Betreiber (Admin) bekommt so
-- einen Ton bei neuer Bestellung. Anonyme sehen dank RLS nichts davon.
do $$ begin alter publication supabase_realtime add table bookings; exception when duplicate_object then null; end $$;

alter table slot_events enable row level security;
drop policy if exists "public read slot_events" on slot_events;
create policy "public read slot_events" on slot_events for select to anon, authenticated using (true);
grant select on slot_events to anon, authenticated;
create index if not exists bookings_date_idx on bookings (booking_date);
create index if not exists bookings_loc_date_idx on bookings (location_id, booking_date);
create unique index if not exists bookings_client_ref_idx on bookings (client_ref) where client_ref is not null;

-- Warteliste: wenn ein Wunschtag/Standort ausgebucht ist.
create table if not exists waitlist (
  id             uuid primary key default gen_random_uuid(),
  service_id     text references services(id),
  location_id    text references locations(id),
  desired_date   date,
  customer_name  text not null,
  customer_email text not null,
  customer_phone text,
  status         text not null default 'waiting', -- waiting | notified | done
  created_at     timestamptz default now()
);

-- --- Event-/Vermietungsanfragen (Louez La Légende) --------------------------
create table if not exists event_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  event_type  text,
  event_date  date,
  guests      integer,
  place       text,
  message     text,
  status      text not null default 'new',  -- new | quoted | won | lost
  created_at  timestamptz default now()
);

-- --- Benachrichtigungs-Protokoll (Idempotenz Erinnerungen) ------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  channel    text not null,   -- email | sms
  kind       text not null,   -- confirmation | reminder | cancellation
  sent_at    timestamptz default now()
);

-- ===========================================================================
-- Öffentliche, PII-freie Sicht: nur belegte Zeitfenster (inkl. Standort/Menge).
-- Das Widget braucht diese Werte zur Kapazitätsberechnung, aber NIE fremde
-- Namen/Kontaktdaten.
-- ===========================================================================
create or replace view busy_slots
with (security_invoker = false) as
  select id, service_id, location_id, booking_date, start_time, end_time, party_size, status
  from bookings
  where status in ('pending', 'confirmed');

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table settings           enable row level security;
alter table locations          enable row level security;
alter table services           enable row level security;
alter table product_categories enable row level security;
alter table products           enable row level security;
alter table availability_rules enable row level security;
alter table breaks             enable row level security;
alter table closures           enable row level security;
alter table date_overrides     enable row level security;
alter table bookings           enable row level security;
alter table event_requests     enable row level security;
alter table waitlist           enable row level security;
alter table notifications      enable row level security;

-- Öffentlich LESBARE Stammdaten (nötig für die Verfügbarkeitsberechnung + Karte).
do $$
declare t text;
begin
  foreach t in array array[
    'settings','locations','services','product_categories','products',
    'availability_rules','breaks','closures','date_overrides'
  ] loop
    execute format('drop policy if exists "public read" on %I;', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true);', t);
  end loop;
end $$;

-- Kunde darf Bestellungen/Anfragen NUR anlegen, nicht fremde lesen.
drop policy if exists "public insert bookings" on bookings;
create policy "public insert bookings" on bookings
  for insert to anon, authenticated with check (true);

drop policy if exists "public insert events" on event_requests;
create policy "public insert events" on event_requests
  for insert to anon, authenticated with check (true);

drop policy if exists "public insert waitlist" on waitlist;
create policy "public insert waitlist" on waitlist
  for insert to anon, authenticated with check (true);

-- Betreiber (eingeloggt) hat Vollzugriff. Da keine Kundenkonten existieren und
-- die Registrierung im Supabase-Projekt deaktiviert wird, ist 'authenticated'
-- gleichbedeutend mit „der Betreiber". (Alternativ per E-Mail-Allowlist einschränken.)
do $$
declare t text;
begin
  foreach t in array array[
    'settings','locations','services','product_categories','products',
    'availability_rules','breaks','closures','date_overrides',
    'bookings','event_requests','waitlist','notifications'
  ] loop
    execute format('drop policy if exists "admin all" on %I;', t);
    execute format('create policy "admin all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Belegte Slots (ohne PII) öffentlich lesbar.
grant select on busy_slots to anon, authenticated;

-- ===========================================================================
-- RPC: komplette Config als JSON, exakt so wie availability.js / config.js sie
-- lesen. Frontend & Edge Function rufen nur `select public.get_booking_config()`.
-- ===========================================================================
create or replace function get_booking_config()
returns jsonb language sql stable security definer set search_path = public as $$
  with cfg as (select * from settings limit 1),
  loc as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'place', l.place, 'service', l.service, 'phone', l.phone,
      'weekdayLabel', jsonb_build_object('fr', l.weekday_label_fr, 'de', l.weekday_label_de),
      'sort', l.sort,
      'hours', coalesce(lh.hours, '{}'::jsonb)
    ) order by l.sort), '[]'::jsonb) as arr
    from locations l
    left join (
      select location_id, jsonb_object_agg(weekday::text, ivs) as hours
      from (
        select location_id, weekday,
               jsonb_agg(jsonb_build_object('start', to_char(start_time,'HH24:MI'),
                                            'end',   to_char(end_time,'HH24:MI')) order by start_time) as ivs
        from availability_rules
        where scope = 'location' and location_id is not null
        group by location_id, weekday
      ) g group by location_id
    ) lh on lh.location_id = l.id
    where l.active
  ),
  svc as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'durationMinutes', duration_minutes,
      'bufferBeforeMinutes', buffer_before_min, 'bufferAfterMinutes', buffer_after_min,
      'price', price, 'capacity', capacity) order by sort), '[]'::jsonb) as arr
    from services where active
  ),
  cats as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', jsonb_build_object('fr', name_fr, 'de', name_de)) order by sort), '[]'::jsonb) as arr
    from product_categories
  ),
  prods as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'cat', category_id,
      'name', jsonb_build_object('fr', name_fr, 'de', name_de),
      'desc', jsonb_build_object('fr', desc_fr, 'de', desc_de),
      'oven', oven, 'price', price, 'tags', tags,
      'allergens', allergens, 'image', image) order by sort), '[]'::jsonb) as arr
    from products where active
  ),
  brks as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'days', case when weekday is null then null else jsonb_build_array(weekday) end,
      'start', to_char(start_time,'HH24:MI'), 'end', to_char(end_time,'HH24:MI'))), '[]'::jsonb) as arr
    from breaks where scope = 'business'
  ),
  cls as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'start', start_date, 'end', end_date, 'reason', reason,
      'scope', case when scope='location' then location_id else 'business' end)), '[]'::jsonb) as arr
    from closures
  ),
  ovr as (
    select coalesce(jsonb_object_agg(the_date::text,
      jsonb_build_array(jsonb_build_object('start', to_char(start_time,'HH24:MI'),
                                           'end',   to_char(end_time,'HH24:MI')))), '{}'::jsonb) as obj
    from date_overrides
  )
  select jsonb_build_object(
    'businessName', (select business_name from cfg),
    'timezone',     (select timezone from cfg),
    'locale',       (select locale from cfg),
    'features',     (select feature_flags from cfg),
    'booking',      (select booking from cfg),
    'hours',        '{}'::jsonb,
    'locations',    (select arr from loc),
    'services',     (select arr from svc),
    'menu',         jsonb_build_object(
                      'priceFrom', (select menu_price_from from cfg),
                      'categories', (select arr from cats),
                      'products',   (select arr from prods)),
    'breaks',       (select arr from brks),
    'closures',     (select arr from cls),
    'dateOverrides',(select obj from ovr)
  );
$$;
grant execute on function get_booking_config() to anon, authenticated;
