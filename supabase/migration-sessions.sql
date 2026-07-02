-- ===========================================================================
-- migration-sessions.sql — auf eine BEREITS eingerichtete DB anwenden.
-- Stellt das Bestellsystem auf das „Slot-pro-Pizza"-Modell um:
--   • ein Slot = eine Pizza (duration_minutes = Dauer pro Pizza)
--   • eine Bestellung mit N Pizzen belegt N aufeinanderfolgende Slots
--   • buffer_after_min = Übergangs-/Aufräumzeit je Bestellung
--   • slotPerItem = true, Slot-Abstand (granularity) = Dauer pro Pizza
--   • sameDayOnly = false (im Admin umschaltbar: nur heute bestellen)
-- Werte sind Startwerte — danach im Admin unter „Réglages" anpassbar.
-- Einmalig im Supabase SQL Editor ausführen.
-- ===========================================================================

update services
   set duration_minutes = 5,
       buffer_after_min = 0,
       capacity         = 1
 where id = 'commande';

update settings
   set booking = booking
        || '{"slotPerItem": true}'::jsonb
        || '{"sameDayOnly": false}'::jsonb
        || '{"slotGranularityMinutes": 5}'::jsonb
 where id = true;
