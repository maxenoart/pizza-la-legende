// purge-old/index.ts — Supabase Edge Function (Deno), zeitgesteuert.
// Setzt die Datenschutz-Aufbewahrung technisch durch: löscht Bestellungen,
// Wartelisten- und Event-Einträge, die älter als 12 Monate sind.
//
// Deploy:  supabase functions deploy purge-old --no-verify-jwt
// Auslösen: Scheduled Function, z. B. täglich oder monatlich.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
  const iso = cutoff.toISOString();
  const day = iso.slice(0, 10);

  const b = await admin.from("bookings").delete().lt("booking_date", day);
  const w = await admin.from("waitlist").delete().lt("created_at", iso);
  const e = await admin.from("event_requests").delete().lt("created_at", iso);
  const s = await admin.from("slot_events").delete().lt("created_at", iso);

  return new Response(JSON.stringify({
    ok: true, cutoff: day,
    errors: [b.error, w.error, e.error, s.error].filter(Boolean).map((x) => x!.message),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
