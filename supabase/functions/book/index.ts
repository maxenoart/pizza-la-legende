// book/index.ts — Supabase Edge Function (Deno).
// Der einzige Weg, eine Bestellung zu schreiben. Validiert serverseitig NEU mit
// derselben Engine wie das Frontend (Race-Condition-Schutz, Kapazität pro
// Standort/Fenster), speichert und löst die Bestätigungs-Mail (FR) aus.
//
// Deploy:  supabase functions deploy book --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          BUSINESS_EMAIL, MAIL_FROM (optional), SITE_URL (optional).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — reine JS-Engine, geteilt mit dem Frontend
import BookingEngine from "../_shared/availability.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) Config + belegte Slots des Tages laden.
    const { data: config } = await admin.rpc("get_booking_config");
    const { data: busyRows } = await admin
      .from("bookings")
      .select("id, service_id, location_id, booking_date, start_time, party_size, status")
      .eq("booking_date", p.date)
      .in("status", ["pending", "confirmed"]);
    const busy = (busyRows || []).map((r: Record<string, unknown>) => ({
      date: r.booking_date, start: String(r.start_time).slice(0, 5),
      serviceId: r.service_id, locationId: r.location_id, partySize: r.party_size, status: r.status,
    }));

    // 2) Erneut prüfen — Kapazität am gewählten Standort/Fenster.
    const free = BookingEngine.isSlotAvailable(config, {
      date: p.date, serviceId: p.serviceId, locationId: p.locationId,
      partySize: p.partySize, start: p.start, existingBookings: busy,
    });
    if (!free) return json({ ok: false, message: "__TAKEN__" }, 409);

    // 3) Speichern.
    const autoConfirm = config?.booking?.autoConfirm !== false;
    const { data: booking, error } = await admin.from("bookings").insert({
      service_id: p.serviceId, location_id: p.locationId ?? null,
      customer_name: p.customerName, customer_email: p.customerEmail, customer_phone: p.customerPhone ?? null,
      booking_date: p.date, start_time: p.start, end_time: p.end,
      party_size: p.partySize ?? 0, items: p.items ?? null, notes: p.notes ?? null,
      status: autoConfirm ? "confirmed" : "pending",
    }).select().single();
    if (error) throw error;

    // 4) Bestätigung senden (nur wenn Modul aktiv).
    if (config?.features?.emailNotifications) await sendConfirmation(admin, config, booking);

    return json({ ok: true, booking }, 200);
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 400);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function sendConfirmation(admin: any, config: any, b: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const from = Deno.env.get("MAIL_FROM") || "La Légende <onboarding@resend.dev>";
  const base = Deno.env.get("SUPABASE_URL") || "";
  const loc = (config.locations || []).find((l: any) => l.id === b.location_id) || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const lines = items.map((it: any) => `• ${it.qty}× ${it.name}`).join("<br />");
  const when = `${b.booking_date} — ${String(b.start_time).slice(0, 5)}`;
  const cancelUrl = base ? `${base}/functions/v1/cancel?token=${b.cancel_token}` : "";
  const confirmed = b.status === "confirmed";

  const subject = `La Légende — ${confirmed ? "commande confirmée" : "commande reçue"} (${when})`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#261E17;max-width:520px">
      <h2 style="color:#E2073B;margin:0 0 6px">La Légende</h2>
      <p>Bonjour ${b.customer_name},</p>
      <p>${confirmed
        ? "Votre commande est <strong>confirmée</strong>. Merci et à tout de suite au camion !"
        : "Nous avons bien reçu votre commande. Vous recevrez une confirmation sous peu."}</p>
      <h3 style="margin:18px 0 6px">Votre commande</h3>
      <p style="line-height:1.6">${lines || "—"}</p>
      <h3 style="margin:18px 0 6px">Retrait</h3>
      <p style="line-height:1.6">
        <strong>${loc.name || ""}</strong>${loc.place ? " · " + loc.place : ""}<br />
        ${when}
      </p>
      ${b.notes ? `<p><em>Remarque : ${b.notes}</em></p>` : ""}
      <p style="margin-top:16px">Paiement sur place — cash ou TWINT.</p>
      ${cancelUrl ? `<p style="font-size:13px;color:#8a7f74">Besoin d'annuler ? <a href="${cancelUrl}">Annuler ma commande</a>.</p>` : ""}
      <p style="font-size:13px;color:#8a7f74;margin-top:20px">La Légende — Food Truck · ${loc.phone || "079 369 10 36"}</p>
    </div>`;

  for (const to of [b.customer_email, Deno.env.get("BUSINESS_EMAIL")].filter(Boolean)) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
  }
  await admin.from("notifications").insert({ booking_id: b.id, channel: "email", kind: "confirmation" });
}
