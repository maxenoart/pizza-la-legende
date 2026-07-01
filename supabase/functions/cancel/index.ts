// cancel/index.ts — Supabase Edge Function (Deno).
// Selbst-Stornierung einer Bestellung über den cancel_token aus der
// Bestätigungs-E-Mail (kein Login nötig). Öffnet als Link (GET) und zeigt eine
// kleine Bestätigungsseite (FR).
//
// Deploy: supabase functions deploy cancel --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let title = "Commande introuvable";
  let msg = "Ce lien d'annulation n'est plus valide.";

  if (token) {
    const { data: b } = await admin.from("bookings").select("id, status").eq("cancel_token", token).maybeSingle();
    if (b && b.status !== "cancelled") {
      await admin.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
      await admin.from("notifications").insert({ booking_id: b.id, channel: "email", kind: "cancellation" });
      title = "Commande annulée";
      msg = "Votre commande a bien été annulée. À bientôt au camion !";
    } else if (b && b.status === "cancelled") {
      title = "Déjà annulée";
      msg = "Cette commande était déjà annulée.";
    }
  }

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} — La Légende</title>
    <style>body{margin:0;font-family:system-ui,Arial,sans-serif;background:#F6F1E9;color:#261E17;
      display:grid;place-items:center;min-height:100vh;padding:24px}
      .c{max-width:460px;text-align:center;background:#fff;border:1px solid #e7ddd0;border-radius:16px;padding:40px}
      h1{color:#E2073B;font-size:26px;margin:0 0 12px}p{color:#594736;line-height:1.6}
      a{display:inline-block;margin-top:18px;color:#E2073B;font-weight:700}</style></head>
    <body><div class="c"><h1>${title}</h1><p>${msg}</p></div></body></html>`;

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
});
