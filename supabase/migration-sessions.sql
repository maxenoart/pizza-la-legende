-- ===========================================================================
-- migration-sessions.sql — auf eine BEREITS eingerichtete DB anwenden.
-- Stellt das Bestellsystem vom Kapazitäts- auf das Session-Modell um:
--   • Session-Dauer (duration_minutes) + Übergangszeit (buffer_after_min)
--   • eine Session pro Slot (capacity = 1)
--   • Slot-Abstand (granularity) = Dauer + Übergangszeit
-- Werte sind Startwerte — danach im Admin unter „Réglages" anpassbar.
-- Einmalig im Supabase SQL Editor ausführen.
-- ===========================================================================

update services
   set duration_minutes = 10,
       buffer_after_min = 5,
       capacity         = 1
 where id = 'commande';

-- Slot-Abstand = Dauer + Übergangszeit (hier 10 + 5 = 15).
update settings
   set booking = booking || '{"slotGranularityMinutes": 15}'::jsonb
 where id = true;
