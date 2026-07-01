// send-reminder/index.ts — Supabase Edge Function (Deno), zeitgesteuert.
// Findet bestätigte Bestellungen für morgen ohne bisherige Erinnerung und mailt
// eine Erinnerung (FR). Idempotent über die Tabelle `notifications`.
//
// Deploy:  supabase functions deploy send-reminder --no-verify-jwt
// Auslösen: Supabase Scheduled Function (z. B. stündlich, via Dashboard/pg_cron).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, MAIL_FROM (optional).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM") || "La Légende <onboarding@resend.dev>";

  const { data: config } = await admin.rpc("get_booking_config");
  if (!config?.features?.reminders || !key) return new Response("reminders off", { status: 200 });

  const t = new Date(); t.setDate(t.getDate() + 1);
  const target = t.toISOString().slice(0, 10);

  const { data: rows } = await admin
    .from("bookings").select("*").eq("booking_date", target).eq("status", "confirmed");

  let sent = 0;
  for (const b of rows || []) {
    const { data: n } = await admin.from("notifications")
      .select("id").eq("booking_id", b.id).eq("kind", "reminder").limit(1);
    if (n && n.length) continue;

    // deno-lint-ignore no-explicit-any
    const loc = (config.locations || []).find((l: any) => l.id === b.location_id) || {};
    const time = String(b.start_time).slice(0, 5);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: b.customer_email,
        subject: `Rappel : votre commande La Légende demain à ${time}`,
        html: `<div style="font-family:Arial,sans-serif;color:#261E17">
          <p>Bonjour ${b.customer_name},</p>
          <p>Petit rappel : votre commande vous attend <strong>demain à ${time}</strong>
             à ${loc.name || ""}${loc.place ? " (" + loc.place + ")" : ""}.</p>
          <p>À tout de suite au camion !<br/>La Légende</p></div>`,
      }),
    });
    await admin.from("notifications").insert({ booking_id: b.id, channel: "email", kind: "reminder" });
    sent++;
  }
  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
});
