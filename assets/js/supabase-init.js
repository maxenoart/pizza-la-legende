/*
 * supabase-init.js — wählt den Datenadapter und stellt das Widget-Mounting bereit.
 * Ist Supabase in assets/js/env.js konfiguriert (url + anonKey + functionsUrl)
 * und supabase-js geladen → echter Betrieb (Stufe 2). Sonst: localStorage-Demo,
 * damit die Seite auch ohne Backend auf GitHub Pages sofort funktioniert.
 */
(function () {
  "use strict";
  var CONFIG = window.LEGENDE_CONFIG || {};

  function buildAdapter() {
    var sb = CONFIG.supabase || {};
    if (sb.url && sb.anonKey && sb.functionsUrl && window.supabase && window.supabase.createClient) {
      try {
        var client = window.supabase.createClient(sb.url, sb.anonKey);
        return window.BookingWidget.SupabaseAdapter(client, sb.functionsUrl);
      } catch (e) { /* fällt unten auf Demo zurück */ }
    }
    // Fallback: localStorage-Demo (seed aus config.js)
    window.BookingWidget.LocalAdapter.seed(CONFIG);
    return window.BookingWidget.LocalAdapter;
  }

  window.LEGENDE_ADAPTER = window.BookingWidget ? buildAdapter() : null;

  // Von site.js bei Sprachwechsel + beim Laden aufgerufen.
  window.__mountBookingWidget = function (lang) {
    var el = document.getElementById("book-widget");
    if (!el || !window.BookingWidget) return;
    if (!window.LEGENDE_ADAPTER) window.LEGENDE_ADAPTER = buildAdapter();
    window.BookingWidget.mount(el, {
      adapter: window.LEGENDE_ADAPTER,
      lang: lang || localStorage.getItem("legende_lang") || "fr"
    });
  };
})();
