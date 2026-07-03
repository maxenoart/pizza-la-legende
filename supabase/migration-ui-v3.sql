-- ===========================================================================
-- migration-ui-v3.sql — auf eine BEREITS eingerichtete DB anwenden.
-- Zeitberechnung mit Produktion + Vorbereitung:
--   • productionMin (8) + prepMin (1) → reservierter Slot je Pizza = 9 Min
--   • Slot-Abstand (granularity) = productionMin + prepMin
-- Ersetzt das reine „transitionMin"-Anzeigefeld.
-- Einmalig im Supabase SQL Editor ausführen (idempotent).
-- ===========================================================================

update services set duration_minutes = 9 where id = 'commande';

update settings
   set booking = (booking - 'transitionMin')
        || '{"productionMin": 8}'::jsonb
        || '{"prepMin": 1}'::jsonb
        || '{"slotGranularityMinutes": 9}'::jsonb
 where id = true;
