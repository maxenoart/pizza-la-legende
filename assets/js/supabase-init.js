/*
 * supabase-init.js — mountet das Buchungs-Widget.
 * Die Datenschicht (window.LegendeData, adapters.js) wählt den Modus selbst
 * (Supabase wenn env.js gesetzt, sonst localStorage-Demo). Hier nur noch das
 * Mounting, damit site.js es bei Sprachwechsel erneut aufrufen kann.
 */
(function () {
  "use strict";
  window.__mountBookingWidget = function (lang) {
    var el = document.getElementById("book-widget");
    if (!el || !window.BookingWidget) return;
    window.BookingWidget.mount(el, { lang: lang || localStorage.getItem("legende_lang") || "fr" });
  };
})();
