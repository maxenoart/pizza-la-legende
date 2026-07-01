// event-request/index.ts — Supabase Edge Function (Deno).
// Speichert eine Vermietungs-/Event-Anfrage ("Louez La Légende") und
// benachrichtigt den Betreiber + schickt dem Kunden eine Empfangsbestätigung (FR).
//
// Deploy:  supabase functions deploy event-request --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          BUSINESS_EMAIL, MAIL_FROM (optional).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    if (!p.name || !p.email) return json({ ok: false, message: "name/email requis" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: row, error } = await admin.from("event_requests").insert({
      name: p.name, email: p.email, phone: p.phone ?? null,
      event_type: p.eventType ?? null,
      event_date: p.date ? p.date : null,
      guests: p.guests ? Number(p.guests) : null,
      place: p.place ?? null, message: p.message ?? null,
    }).select().single();
    if (error) throw error;

    await notify(p, row);
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 400);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function notify(p: any, row: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const from = Deno.env.get("MAIL_FROM") || "La Légende <onboarding@resend.dev>";
  const businessEmail = Deno.env.get("BUSINESS_EMAIL");

  // 1) Interne Meldung an den Betreiber
  if (businessEmail) {
    const html = `
      <div style="font-family:Arial,sans-serif;color:#261E17">
        <h3>Nouvelle demande de devis</h3>
        <p><strong>${p.name}</strong> — ${p.email}${p.phone ? " · " + p.phone : ""}</p>
        <p>Type : ${p.eventType || "—"}<br/>Date : ${p.date || "—"}<br/>
        Invités : ${p.guests || "—"}<br/>Lieu : ${p.place || "—"}</p>
        <p>${(p.message || "").replace(/</g, "&lt;")}</p>
        <p style="font-size:12px;color:#8a7f74">Réf. ${row?.id || ""}</p>
      </div>`;
    await send(key, from, businessEmail, "Devis — " + (p.eventType || "événement") + " (" + p.name + ")", html);
  }

  // 2) Empfangsbestätigung an den Kunden
  const ack = `
    <div style="font-family:Arial,sans-serif;color:#261E17;max-width:520px">
      <h2 style="color:#E2073B;margin:0 0 6px">La Légende</h2>
      <p>Bonjour ${p.name},</p>
      <p>Merci pour votre demande ! Nous avons bien reçu les détails de votre événement
         et revenons vers vous rapidement avec une proposition.</p>
      <p style="font-size:13px;color:#8a7f74">La Légende — Food Truck · 079 369 10 36</p>
    </div>`;
  await send(key, from, p.email, "La Légende — votre demande de devis", ack);
}

async function send(key: string, from: string, to: string, subject: string, html: string) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
}
