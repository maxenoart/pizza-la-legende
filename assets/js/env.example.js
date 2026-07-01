/*
 * env.example.js — Modèle de configuration Supabase.
 * ---------------------------------------------------------------------------
 * COPIEZ ce fichier en `env.js` (dans le même dossier) et renseignez vos
 * valeurs. `env.js` est ignoré par git (voir .gitignore) : il ne doit PAS
 * contenir de secret — la clé « anon » est publique par conception, protégée
 * par les règles RLS de Supabase. Ne mettez JAMAIS la service_role ici.
 *
 * Sans env.js, le site fonctionne en mode démo (localStorage) : parfait pour
 * tester, mais les commandes ne sont pas réellement enregistrées.
 */
window.LEGENDE_ENV = {
  // Project Settings → API
  supabaseUrl: "https://VOTRE-PROJET.supabase.co",
  supabaseAnonKey: "VOTRE_CLE_ANON_PUBLIQUE",
  // = supabaseUrl + "/functions/v1"
  functionsUrl: "https://VOTRE-PROJET.supabase.co/functions/v1"
};
