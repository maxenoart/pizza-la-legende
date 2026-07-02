// send-reminder/index.ts — Supabase Edge Function (Deno), zeitgesteuert.
// Schickt ~10 Min vor der Abholung eine Erinnerung (nur wenn der Kunde
// reminder_channel = 'email' gewählt hat). Idempotent über `notifications`.
//
// Deploy:  supabase functions deploy send-reminder --no-verify-jwt
// Auslösen: Scheduled Function alle paar Minuten (z. B. alle 5 Min).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, MAIL_FROM (optional).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM") || "La Légende <onboarding@resend.dev>";
  if (!key) return new Response("no mail key", { status: 200 });

  const { data: config } = await admin.rpc("get_booking_config");
  const loc = (id: string) => (config?.locations || []).find((l: { id: string }) => l.id === id) || {};

  // Zielfenster: Abholung in ~10 Minuten (heute).
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const target = new Date(now.getTime() + 10 * 60000);
  const hhmmFrom = new Date(now.getTime() + 8 * 60000).toTimeString().slice(0, 5);
  const hhmmTo = new Date(now.getTime() + 12 * 60000).toTimeString().slice(0, 5);

  const { data: rows } = await admin
    .from("bookings").select("*")
    .eq("booking_date", todayStr)
    .eq("reminder_channel", "email")
    .in("status", ["confirmed", "pending", "paid"])
    .gte("start_time", hhmmFrom).lte("start_time", hhmmTo);

  let sent = 0;
  for (const b of rows || []) {
    if (b.notes === "__BLOCK__") continue;
    const { data: n } = await admin.from("notifications").select("id").eq("booking_id", b.id).eq("kind", "reminder").limit(1);
    if (n && n.length) continue;

    const l = loc(b.location_id);
    const time = String(b.start_time).slice(0, 5);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: b.customer_email,
        subject: `Rappel : votre commande La Légende à ${time}`,
        html: `<div style="font-family:Arial,sans-serif;color:#261E17">
          <p>Bonjour ${b.customer_name},</p>
          <p>Votre commande vous attend <strong>à ${time}</strong>${l.name ? " à " + l.name : ""}${l.place ? " (" + l.place + ")" : ""} — dans environ 10 minutes.</p>
          <p>À tout de suite au camion !<br/>La Légende</p></div>`,
      }),
    });
    await admin.from("notifications").insert({ booking_id: b.id, channel: "email", kind: "reminder" });
    sent++;
  }
  return new Response(JSON.stringify({ sent, window: [hhmmFrom, hhmmTo], target: target.toISOString() }), { status: 200, headers: { "Content-Type": "application/json" } });
});
