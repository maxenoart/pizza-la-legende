-- ===========================================================================
-- migration-ui-v2.sql — auf eine BEREITS eingerichtete DB anwenden.
-- Neue Felder & Realtime für die UI-Überarbeitung:
--   • bookings.reminder_channel (none | email | messenger) — Erinnerung 10 Min vorher
--   • settings.booking.transitionMin (nur Anzeige im Admin zwischen den Karten)
--   • slot_events + Trigger + Realtime-Publication (Live-Update der Zeitfenster)
-- Status 'paid' und der Blocker ('__BLOCK__' in notes) brauchen KEIN Schema —
-- die Spalten status/notes sind bereits frei.
-- Einmalig im Supabase SQL Editor ausführen (idempotent).
-- ===========================================================================

alter table bookings add column if not exists reminder_channel text default 'none';

update settings
   set booking = booking || '{"transitionMin": 1}'::jsonb
 where id = true;

-- Realtime-Events (PII-frei), damit anonyme Kunden Slot-Änderungen live sehen.
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

alter table slot_events enable row level security;
drop policy if exists "public read slot_events" on slot_events;
create policy "public read slot_events" on slot_events for select to anon, authenticated using (true);
grant select on slot_events to anon, authenticated;
