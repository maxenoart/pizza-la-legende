-- ===========================================================================
-- migrate-existing-db.sql — bringt eine SCHON eingerichtete Datenbank auf den
-- aktuellen Stand. Fasst alle bisherigen Migrationen idempotent zusammen:
--   Slot-pro-Pizza-Modell · Produktion+Vorbereitung · Realtime (slot_events +
--   bookings) · reminder_channel · Idempotenz (client_ref) · Warteliste ·
--   Allergene/Bild · Status 'paid'/'ready' (kein Schema nötig).
-- Einmal im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist gefahrlos.
-- (Frische DB: stattdessen schema.sql + seed.sql ausführen — dort ist alles drin.)
-- ===========================================================================

-- 1) Zeitmodell: 1 Pizza = 1 Slot, Slot = Produktion + Vorbereitung.
update services set duration_minutes = 9, buffer_after_min = 0, capacity = 1 where id = 'commande';
update settings set booking = (booking - 'transitionMin')
     || '{"slotPerItem": true}'::jsonb || '{"sameDayOnly": false}'::jsonb
     || '{"productionMin": 8}'::jsonb || '{"prepMin": 1}'::jsonb
     || '{"slotGranularityMinutes": 9}'::jsonb
 where id = true;

-- 2) Neue Spalten.
alter table bookings add column if not exists reminder_channel text default 'none';
alter table bookings add column if not exists client_ref text;
create unique index if not exists bookings_client_ref_idx on bookings (client_ref) where client_ref is not null;
alter table products add column if not exists allergens text[] default '{}';
alter table products add column if not exists image text;

-- 3) Warteliste.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  service_id text references services(id), location_id text references locations(id),
  desired_date date, customer_name text not null, customer_email text not null,
  customer_phone text, status text not null default 'waiting', created_at timestamptz default now()
);
alter table waitlist enable row level security;
drop policy if exists "public insert waitlist" on waitlist;
create policy "public insert waitlist" on waitlist for insert to anon, authenticated with check (true);
drop policy if exists "admin all" on waitlist;
create policy "admin all" on waitlist for all to authenticated using (true) with check (true);

-- 4) Realtime: PII-freie slot_events (Kunden) + bookings (Admin-Ton).
create table if not exists slot_events (
  id bigserial primary key, booking_date date, location_id text, created_at timestamptz default now()
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
do $$ begin alter publication supabase_realtime add table bookings; exception when duplicate_object then null; end $$;
alter table slot_events enable row level security;
drop policy if exists "public read slot_events" on slot_events;
create policy "public read slot_events" on slot_events for select to anon, authenticated using (true);
grant select on slot_events to anon, authenticated;

-- 5) RPC neu (Allergene/Bild in der Config).
create or replace function get_booking_config()
returns jsonb language sql stable security definer set search_path = public as $$
  with cfg as (select * from settings limit 1),
  loc as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'place', l.place, 'service', l.service, 'phone', l.phone,
      'weekdayLabel', jsonb_build_object('fr', l.weekday_label_fr, 'de', l.weekday_label_de),
      'sort', l.sort, 'hours', coalesce(lh.hours, '{}'::jsonb)
    ) order by l.sort), '[]'::jsonb) as arr
    from locations l
    left join (
      select location_id, jsonb_object_agg(weekday::text, ivs) as hours
      from (
        select location_id, weekday,
               jsonb_agg(jsonb_build_object('start', to_char(start_time,'HH24:MI'),
                                            'end',   to_char(end_time,'HH24:MI')) order by start_time) as ivs
        from availability_rules where scope = 'location' and location_id is not null
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
    'businessName', (select business_name from cfg), 'timezone', (select timezone from cfg),
    'locale', (select locale from cfg), 'features', (select feature_flags from cfg),
    'booking', (select booking from cfg), 'hours', '{}'::jsonb,
    'locations', (select arr from loc), 'services', (select arr from svc),
    'menu', jsonb_build_object('priceFrom', (select menu_price_from from cfg),
                               'categories', (select arr from cats), 'products', (select arr from prods)),
    'breaks', (select arr from brks), 'closures', (select arr from cls), 'dateOverrides', (select obj from ovr)
  );
$$;
grant execute on function get_booking_config() to anon, authenticated;
