/*
 * adapters.js — Datenschicht (Single Source für alle Datenzugriffe).
 * ---------------------------------------------------------------------------
 * Kapselt WO die Daten liegen (Supabase oder localStorage-Demo) hinter EINER
 * API. Widget und Admin sprechen nur mit `window.LegendeData` und wissen nichts
 * von Supabase-Details. So bleibt die UI schlank und das System wartbar.
 *
 * API (window.LegendeData):
 *   mode()            → 'supabase' | 'local'
 *   client()          → Supabase-Client (oder null im Demo-Modus)
 *   local             → { getConfigSync, saveConfig, all, save }  (Demo-Store)
 *   getConfig()       → Promise<config>            (RPC bzw. localStorage)
 *   getBusy(date?)    → Promise<busy[]>            (belegte Slots, PII-frei)
 *   createBooking(p)  → Promise<booking>           (Direkt-Insert + Re-Validierung)
 *   subscribe(date,cb)→ unsubscribe()              (Realtime; Demo: no-op)
 */
window.LegendeData = (function () {
  "use strict";
  var CFG = window.LEGENDE_CONFIG || {};
  var E = window.BookingEngine;
  var sb = null, MODE = "local";

  // --- Demo-Store (localStorage) --------------------------------------------
  var CKEY = "legende_config", BKEY = "legende_bookings";
  var Local = {
    seed: function (c) { if (!localStorage.getItem(CKEY)) localStorage.setItem(CKEY, JSON.stringify(c)); },
    getConfigSync: function () { return JSON.parse(localStorage.getItem(CKEY) || "{}"); },
    saveConfig: function (c) { localStorage.setItem(CKEY, JSON.stringify(c)); },
    all: function () { return JSON.parse(localStorage.getItem(BKEY) || "[]"); },
    save: function (a) { localStorage.setItem(BKEY, JSON.stringify(a)); }
  };

  // --- Init: Modus wählen ----------------------------------------------------
  (function init() {
    var s = CFG.supabase || {};
    if (s.url && s.anonKey && window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(s.url, s.anonKey); MODE = "supabase"; } catch (e) { MODE = "local"; }
    }
    if (MODE === "local") Local.seed(CFG);
  })();

  // --- Mapping Supabase-Row → Engine-Format ---------------------------------
  function mapBusy(row) {
    return {
      date: row.booking_date, start: String(row.start_time).slice(0, 5),
      serviceId: row.service_id, locationId: row.location_id,
      partySize: row.party_size, status: row.status
    };
  }

  // --- Lesezugriffe ----------------------------------------------------------
  function getConfig() {
    return MODE === "supabase"
      ? sb.rpc("get_booking_config").then(function (r) { return r.data; })
      : Promise.resolve(Local.getConfigSync());
  }
  function getBusy(date) {
    if (MODE === "supabase") {
      var q = sb.from("busy_slots").select("*");
      if (date) q = q.eq("booking_date", date);
      return q.then(function (r) { return (r.data || []).map(mapBusy); });
    }
    var all = Local.all();
    return Promise.resolve(date ? all.filter(function (b) { return b.date === date; }) : all);
  }

  // --- Buchung anlegen (Direkt-Insert + Re-Validierung) ---------------------
  function createBooking(p) {
    return getConfig().then(function (config) {
      return getBusy(p.date).then(function (busy) {
        var ok = E.isSlotAvailable(config, {
          date: p.date, serviceId: p.serviceId, locationId: p.locationId,
          partySize: p.partySize, start: p.start, existingBookings: busy
        });
        if (!ok) throw new Error("__TAKEN__");
        var auto = !(config.booking && config.booking.autoConfirm === false);
        var status = auto ? "confirmed" : "pending";
        if (MODE === "supabase") {
          return sb.from("bookings").insert(rowFrom(p, status)).then(function (res) {
            if (res.error) throw new Error(res.error.message || "Enregistrement impossible.");
            return { status: status, date: p.date, start: p.start, locationId: p.locationId, items: p.items, partySize: p.partySize };
          });
        }
        var all = Local.all();
        var booking = Object.assign({ id: "b_" + Date.now(), status: status, createdAt: new Date().toISOString() }, camelRow(p));
        all.push(booking); Local.save(all);
        return booking;
      });
    });
  }
  function rowFrom(p, status) {
    return {
      service_id: p.serviceId, location_id: p.locationId || null,
      customer_name: p.customerName, customer_email: p.customerEmail, customer_phone: p.customerPhone || null,
      booking_date: p.date, start_time: p.start, end_time: p.end,
      party_size: p.partySize || 0, items: p.items || null, notes: p.notes || null,
      reminder_channel: p.reminderChannel || "none", status: status
    };
  }
  function camelRow(p) {
    return {
      serviceId: p.serviceId, locationId: p.locationId, customerName: p.customerName,
      customerEmail: p.customerEmail, customerPhone: p.customerPhone, date: p.date,
      start: p.start, end: p.end, partySize: p.partySize || 0, items: p.items || [],
      notes: p.notes || null, reminderChannel: p.reminderChannel || "none"
    };
  }

  // --- Realtime (Schritt 3: Zeitfenster live aktualisieren) -----------------
  function subscribe(date, cb) {
    if (MODE !== "supabase" || !sb.channel) return function () {};
    // Hört auf die PII-freie slot_events-Tabelle (Trigger auf bookings).
    var ch = sb.channel("slots-" + date)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "slot_events", filter: "booking_date=eq." + date }, function () { cb(); })
      .subscribe();
    return function () { try { sb.removeChannel(ch); } catch (e) {} };
  }

  return {
    mode: function () { return MODE; },
    client: function () { return sb; },
    local: Local,
    getConfig: getConfig,
    getBusy: getBusy,
    createBooking: createBooking,
    subscribe: subscribe
  };
})();
