/*
 * booking-widget.js — Buchungs-/Bestell-Oberfläche für La Légende.
 * Nutzt BookingEngine (availability.js) für die Live-Verfügbarkeit.
 * Muster „Bestellung mit Zeitfenster": Standort → Bestellung → Tag → Abholzeit
 * → Kontakt. Mobile-first, wenige Klicks, zweisprachig (FR/DE).
 *
 * DATA-ADAPTER-LAYER: das Widget spricht nie direkt mit einer Datenquelle,
 * sondern über einen Adapter mit getConfig(), getBusy(date), createBooking().
 * LocalAdapter = localStorage-Demo (GitHub Pages ohne Backend),
 * SupabaseAdapter = Echtbetrieb (Stufe 2, Edge Function `book`).
 */
(function () {
  "use strict";
  var E = (typeof window !== "undefined" && window.BookingEngine) || require("./availability.js");

  // ==== Lokalisierung ========================================================
  var STR = {
    fr: {
      brand_lead: "En quelques clics, votre pizza vous attend au camion.",
      step: "Étape", of: "sur",
      back: "← Retour",
      loc_title: "Où récupérez-vous ?", loc_sub: "Choisissez l'étape de la tournée.",
      loc_none: "Pas de tournée aujourd'hui — à bientôt !", loc_today: "aujourd'hui",
      order_title: "Composez votre commande", order_sub: "Ajoutez vos pizzas et gourmandises.",
      order_continue: "Continuer", order_empty: "Ajoutez au moins un article.",
      order_count_one: "pizza", order_count_many: "pizzas", order_items: "article(s)",
      date_title: "Quel jour ?", date_none: "Aucune date disponible pour cette étape prochainement.",
      time_title: "Heure de retrait", time_none: "Plus de créneau libre pour l'instant.",
      slot_taken: "réservé",
      time_left: "restant", time_left_full: "places",
      details_title: "Vos coordonnées",
      f_name: "Nom", f_email: "E-mail", f_phone: "Téléphone", f_notes: "Remarque (optionnel)",
      submit: "Commander fermement",
      pay_note: "Paiement sur place — cash ou TWINT. Aucune donnée de carte demandée.",
      done_title: "Commande envoyée", done_ok_title: "Commande confirmée",
      done_ok: "C'est noté ! Un e-mail de confirmation part vers vous. Rendez-vous au camion à l'heure choisie.",
      done_pending: "Bien reçu ! Vous recevrez une confirmation sous peu.",
      done_again: "Passer une autre commande",
      sum_when: "Retrait", sum_at: "à",
      taken: "Ce créneau vient malheureusement d'être pris.",
      midi: "midi", soir: "soir"
    },
    de: {
      brand_lead: "In wenigen Klicks wartet deine Pizza am Truck.",
      step: "Schritt", of: "von",
      back: "← Zurück",
      loc_title: "Wo holst du ab?", loc_sub: "Wähle die Tournée-Station.",
      loc_none: "Heute keine Tournée — bis bald!", loc_today: "heute",
      order_title: "Stell deine Bestellung zusammen", order_sub: "Füge Pizzen und Feines hinzu.",
      order_continue: "Weiter", order_empty: "Füge mindestens einen Artikel hinzu.",
      order_count_one: "Pizza", order_count_many: "Pizzen", order_items: "Artikel",
      date_title: "Welcher Tag?", date_none: "Für diese Station ist demnächst kein Tag verfügbar.",
      time_title: "Abholzeit", time_none: "Aktuell kein Fenster mehr frei.",
      slot_taken: "belegt",
      time_left: "frei", time_left_full: "Plätze",
      details_title: "Deine Angaben",
      f_name: "Name", f_email: "E-Mail", f_phone: "Telefon", f_notes: "Bemerkung (optional)",
      submit: "Verbindlich bestellen",
      pay_note: "Zahlung vor Ort — bar oder TWINT. Keine Kartendaten nötig.",
      done_title: "Bestellung gesendet", done_ok_title: "Bestellung bestätigt",
      done_ok: "Notiert! Eine Bestätigung ist unterwegs. Wir sehen uns zur gewählten Zeit am Truck.",
      done_pending: "Erhalten! Du bekommst gleich eine Bestätigung.",
      done_again: "Weitere Bestellung",
      sum_when: "Abholung", sum_at: "um",
      taken: "Dieses Fenster wurde leider gerade vergeben.",
      midi: "Mittag", soir: "Abend"
    }
  };
  var TAGS = {
    vegan: { fr: "vegan", de: "vegan" },
    veggie: { fr: "végé", de: "veggie" },
    signature: { fr: "signature", de: "Signature" },
    new: { fr: "nouveau", de: "neu" }
  };

  // ==== Adapter A — localStorage (Demo / GitHub Pages ohne Backend) ==========
  var LocalAdapter = {
    _cKey: "legende_config", _bKey: "legende_bookings",
    seed: function (config) { if (!localStorage.getItem(this._cKey)) localStorage.setItem(this._cKey, JSON.stringify(config)); },
    getConfig: function () { return Promise.resolve(JSON.parse(localStorage.getItem(this._cKey) || "{}")); },
    saveConfig: function (config) { localStorage.setItem(this._cKey, JSON.stringify(config)); },
    getBusy: function (date) {
      var all = JSON.parse(localStorage.getItem(this._bKey) || "[]");
      return Promise.resolve(date ? all.filter(function (b) { return b.date === date; }) : all);
    },
    createBooking: function (p) {
      var self = this;
      return self.getConfig().then(function (config) {
        var all = JSON.parse(localStorage.getItem(self._bKey) || "[]");
        var ok = E.isSlotAvailable(config, {
          date: p.date, serviceId: p.serviceId, locationId: p.locationId,
          partySize: p.partySize, start: p.start, existingBookings: all
        });
        if (!ok) throw new Error("__TAKEN__");
        var booking = Object.assign({
          id: "b_" + Date.now(),
          status: (config.booking && config.booking.autoConfirm) ? "confirmed" : "pending",
          createdAt: new Date().toISOString()
        }, p);
        all.push(booking); localStorage.setItem(self._bKey, JSON.stringify(all));
        return booking;
      });
    }
  };

  // ==== Adapter B — Supabase (Stufe 2, Echtbetrieb) ==========================
  // Direkt-Insert über den publishable Key: die RLS erlaubt anonymes INSERT in
  // `bookings` (aber kein Lesen fremder Buchungen). Re-Validierung derselben
  // Engine im Browser gegen die belegten Slots. Keine Edge Function nötig.
  // Automatische E-Mails lassen sich später über die Function `book` nachrüsten.
  function SupabaseAdapter(client, functionsUrl) {
    function loadConfig() { return client.rpc("get_booking_config").then(function (r) { return r.data; }); }
    function loadBusy(date) {
      return client.from("busy_slots").select("*").eq("booking_date", date).then(function (r) {
        return (r.data || []).map(function (row) {
          return { date: row.booking_date, start: String(row.start_time).slice(0, 5),
            serviceId: row.service_id, locationId: row.location_id, partySize: row.party_size, status: row.status };
        });
      });
    }
    return {
      getConfig: loadConfig,
      getBusy: loadBusy,
      createBooking: function (p) {
        // 1) Config + belegte Slots frisch laden, 2) im Browser prüfen, 3) einfügen.
        return loadConfig().then(function (config) {
          return loadBusy(p.date).then(function (busy) {
            var ok = E.isSlotAvailable(config, {
              date: p.date, serviceId: p.serviceId, locationId: p.locationId,
              partySize: p.partySize, start: p.start, existingBookings: busy
            });
            if (!ok) throw new Error("__TAKEN__");
            var auto = !(config.booking && config.booking.autoConfirm === false);
            return client.from("bookings").insert({
              service_id: p.serviceId, location_id: p.locationId || null,
              customer_name: p.customerName, customer_email: p.customerEmail, customer_phone: p.customerPhone || null,
              booking_date: p.date, start_time: p.start, end_time: p.end,
              party_size: p.partySize || 0, items: p.items || null, notes: p.notes || null,
              status: auto ? "confirmed" : "pending"
            }).then(function (res) {
              if (res.error) throw new Error(res.error.message || "Enregistrement impossible.");
              // anon darf Buchungen nicht zurücklesen → lokales Objekt für die Bestätigung.
              return { status: auto ? "confirmed" : "pending", date: p.date, start: p.start,
                locationId: p.locationId, items: p.items, partySize: p.partySize };
            });
          });
        });
      }
    };
  }

  // ==== DOM-Helfer ===========================================================
  function H(tag, attrs, kids) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "class") el.className = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function fmtDate(iso, locale) {
    return new Date(iso + "T00:00:00").toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" });
  }
  function tr(v, lang) { return (v && typeof v === "object") ? (v[lang] || v.fr || "") : (v || ""); }

  // ==== Widget ===============================================================
  function mount(root, opts) {
    opts = opts || {};
    var adapter = opts.adapter || LocalAdapter;
    adapter.getConfig().then(function (config) {
      var lang = opts.lang || (config.locale && config.locale.slice(0, 2)) || "fr";
      var t = STR[lang] || STR.fr;
      var locale = config.locale || (lang === "de" ? "de-CH" : "fr-CH");
      var f = config.features || {};
      var service = (config.services || [{}])[0];
      var state = { locationId: null, serviceId: service.id, items: {}, partySize: 0, itemCount: 0, date: null, start: null, booking: null };

      var sameDay = !!(config.booking && config.booking.sameDayOnly);
      var todayStr = E._util.ymd(new Date());
      var steps = [];
      if (f.multiLocation && (config.locations || []).length) steps.push("location");
      steps.push("order");
      if (!sameDay) steps.push("date");   // Tag-Auswahl kann im Admin ausgeschaltet werden
      steps.push("time", "details", "done");
      if (sameDay) state.date = todayStr;
      var i = 0;

      function locObj() { return (config.locations || []).find(function (l) { return l.id === state.locationId; }); }
      function locWeekdays(l) { return Object.keys(l.hours || {}).map(Number); }
      function daysUntil(l) {
        var todayWd = new Date().getDay();
        var ds = locWeekdays(l).map(function (wd) { return (wd - todayWd + 7) % 7; });
        return ds.length ? Math.min.apply(null, ds) : 99;
      }

      function computeTotals() {
        var pizzas = 0, count = 0;
        (config.menu ? config.menu.products : []).forEach(function (p) {
          var q = state.items[p.id] || 0;
          if (q > 0) { count += q; if (p.oven) pizzas += q; }
        });
        state.partySize = pizzas; state.itemCount = count;
      }

      function summaryLines() {
        var out = [];
        var lo = locObj();
        if (lo) out.push(H("div", { class: "bce__sumrow" }, [lo.name + " · " + lo.place]));
        if (state.itemCount) {
          out.push(H("div", { class: "bce__sumrow" }, [
            state.partySize + " " + (state.partySize === 1 ? t.order_count_one : t.order_count_many) +
            (state.itemCount > state.partySize ? "  ·  " + state.itemCount + " " + t.order_items : "")
          ]));
        }
        if (state.date) out.push(H("div", { class: "bce__sumrow" }, [
          t.sum_when + " " + fmtDate(state.date, locale) + (state.start ? "  " + t.sum_at + " " + state.start : "")
        ]));
        return out;
      }

      function shell(title, sub, bodyEl, showBack) {
        root.innerHTML = "";
        var card = H("div", { class: "bce" }, [
          H("div", { class: "bce__aside" }, [
            H("div", { class: "bce__brand" }, [config.businessName || "La Légende"]),
            H("p", { class: "bce__lead" }, [t.brand_lead]),
            (state.locationId || state.itemCount) ? H("div", { class: "bce__summary" }, summaryLines()) : H("span")
          ]),
          H("div", { class: "bce__main" }, [
            H("div", { class: "bce__steps" }, [t.step + " " + Math.min(i + 1, steps.length) + " " + t.of + " " + steps.length]),
            H("h2", { class: "bce__title" }, [title]),
            sub ? H("p", { class: "bce__sub" }, [sub]) : H("span"),
            bodyEl,
            showBack ? H("button", { class: "bce__back", type: "button", onclick: function () { i--; render(); } }, [t.back]) : H("span")
          ])
        ]);
        root.appendChild(card);
      }

      function render() {
        var step = steps[i];
        if (step === "location") return renderLocation();
        if (step === "order") return renderOrder();
        if (step === "date") return renderDate();
        if (step === "time") return renderTime();
        if (step === "details") return renderDetails();
        if (step === "done") return renderDone();
      }

      // --- Standort (heutige Stops zuerst; bei sameDay nur heute) ---
      function renderLocation() {
        var todayWd = new Date().getDay();
        var locs = (config.locations || []).slice();
        if (sameDay) locs = locs.filter(function (l) { return locWeekdays(l).indexOf(todayWd) >= 0; });
        locs.sort(function (a, b) { var da = daysUntil(a), db = daysUntil(b); return da !== db ? da - db : (a.sort || 0) - (b.sort || 0); });
        if (!locs.length) { shell(t.loc_title, t.loc_sub, H("p", { class: "bce__empty" }, [t.loc_none]), false); return; }
        var list = H("div", { class: "bce__list" }, locs.map(function (l) {
          var svcLabel = l.service === "midi" ? t.midi : t.soir;
          var hrs = (l.hours[Object.keys(l.hours)[0]] || [{}])[0];
          var isToday = daysUntil(l) === 0;
          var meta = [];
          if (isToday) meta.push(H("span", { class: "bce__opttoday" }, [t.loc_today]));
          meta.push(H("span", {}, [tr(l.weekdayLabel, lang) + " · " + svcLabel + (hrs ? "  " + hrs.start + "–" + hrs.end : "")]));
          return H("button", { class: "bce__opt" + (isToday ? " is-today" : ""), type: "button", onclick: function () { state.locationId = l.id; i++; render(); } }, [
            H("span", { class: "bce__optcol" }, [
              H("span", { class: "bce__optname" }, [l.name]),
              H("span", { class: "bce__optplace" }, [l.place])
            ]),
            H("span", { class: "bce__optmeta" }, meta)
          ]);
        }));
        shell(t.loc_title, t.loc_sub, list, false);
      }

      // --- Bestellung (Produkte + Mengen) ---
      function renderOrder() {
        var menu = config.menu || { categories: [], products: [] };
        var footer = H("div", { class: "bce__orderbar" });
        var cont = H("button", { class: "bce__cta", type: "button", disabled: "disabled", onclick: function () { i++; render(); } }, [t.order_continue]);
        var countLbl = H("span", { class: "bce__ordercount" }, []);

        function refresh() {
          computeTotals();
          countLbl.innerHTML = "";
          if (state.itemCount) {
            countLbl.appendChild(document.createTextNode(
              state.partySize + " " + (state.partySize === 1 ? t.order_count_one : t.order_count_many) +
              (state.itemCount > state.partySize ? " · " + state.itemCount + " " + t.order_items : "")
            ));
          } else {
            countLbl.appendChild(document.createTextNode(t.order_empty));
          }
          if (state.itemCount > 0) cont.removeAttribute("disabled"); else cont.setAttribute("disabled", "disabled");
        }

        var body = H("div", { class: "bce__order" });
        (menu.categories || []).forEach(function (cat) {
          var prods = (menu.products || []).filter(function (p) { return p.cat === cat.id; });
          if (!prods.length) return;
          body.appendChild(H("h3", { class: "bce__cat" }, [tr(cat.name, lang)]));
          prods.forEach(function (p) {
            var qEl = H("span", { class: "bce__qty" }, [String(state.items[p.id] || 0)]);
            function set(delta) {
              var q = Math.max(0, (state.items[p.id] || 0) + delta);
              if (q === 0) delete state.items[p.id]; else state.items[p.id] = q;
              qEl.textContent = String(q);
              row.classList.toggle("is-active", q > 0);
              refresh();
            }
            var tagEls = (p.tags || []).filter(function (x) { return TAGS[x]; }).map(function (x) {
              return H("span", { class: "bce__tag bce__tag--" + x }, [tr(TAGS[x], lang)]);
            });
            var nameRow = H("span", { class: "bce__pname" }, [tr(p.name, lang)].concat(tagEls));
            var row = H("div", { class: "bce__prod" + ((state.items[p.id] || 0) > 0 ? " is-active" : "") }, [
              H("span", { class: "bce__pcol" }, [
                nameRow,
                tr(p.desc, lang) ? H("span", { class: "bce__pdesc" }, [tr(p.desc, lang)]) : H("span")
              ]),
              H("span", { class: "bce__stepper" }, [
                H("button", { class: "bce__step", type: "button", "aria-label": "-", onclick: function () { set(-1); } }, ["−"]),
                qEl,
                H("button", { class: "bce__step", type: "button", "aria-label": "+", onclick: function () { set(1); } }, ["+"])
              ])
            ]);
            body.appendChild(row);
          });
        });

        footer.appendChild(countLbl);
        footer.appendChild(cont);
        var wrap = H("div", {}, [body, footer]);
        shell(t.order_title, t.order_sub, wrap, true);
        refresh();
      }

      // --- Tag ---
      function renderDate() {
        adapter.getBusy().then(function (busy) {
          var days = E.daysWithAvailability(config, {
            serviceId: state.serviceId, locationId: state.locationId, partySize: state.partySize,
            existingBookings: busy, horizonDays: Math.min(21, (config.booking && config.booking.bookingHorizonDays) || 14)
          });
          var open = days.filter(function (d) { return d.available; });
          if (!open.length) { shell(t.date_title, null, H("p", { class: "bce__empty" }, [t.date_none]), true); return; }
          var strip = H("div", { class: "bce__days" }, open.map(function (d) {
            return H("button", { class: "bce__day", type: "button", onclick: function () { state.date = d.date; state.start = null; i++; render(); } }, [
              H("span", { class: "bce__daywd" }, [fmtDate(d.date, locale)]),
              H("span", { class: "bce__daydot is-free" })
            ]);
          }));
          shell(t.date_title, null, strip, true);
        });
      }

      // --- Uhrzeit: alle künftigen Slots von oben nach unten ---
      // frei = wählbar, belegt = ausgegraut; die 3 letzten vergangenen ausgegraut.
      function renderTime() {
        adapter.getBusy(state.date).then(function (busy) {
          var free = {};
          E.computeAvailableSlots(config, {
            date: state.date, serviceId: state.serviceId, locationId: state.locationId,
            partySize: state.partySize, existingBookings: busy
          }).forEach(function (s) { free[s.start] = true; });

          var grid = E.daySlots(config, { date: state.date, serviceId: state.serviceId, locationId: state.locationId });
          if (!grid.length) { shell(t.time_title + " · " + fmtDate(state.date, locale), null, H("p", { class: "bce__empty" }, [t.time_none]), true); return; }

          var isToday = state.date === E._util.ymd(new Date());
          var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          var past = [], future = [];
          grid.forEach(function (s) { ((isToday && E._util.toMin(s.start) < nowMin) ? past : future).push(s); });

          function slotEl(s, kind) {
            var kids = [H("span", { class: "bce__ttime" }, [s.start])];
            if (kind === "taken") kids.push(H("span", { class: "bce__tlabel" }, [t.slot_taken]));
            if (kind === "free") return H("button", { class: "bce__tslot is-free", type: "button", onclick: function () { state.start = s.start; i++; render(); } }, kids);
            return H("div", { class: "bce__tslot is-" + kind, "aria-disabled": "true" }, kids);
          }

          var rows = [];
          past.slice(-3).forEach(function (s) { rows.push(slotEl(s, "past")); });
          future.forEach(function (s) { rows.push(slotEl(s, free[s.start] ? "free" : "taken")); });

          var body = H("div", { class: "bce__times" }, rows);
          if (!future.some(function (s) { return free[s.start]; })) body.appendChild(H("p", { class: "bce__empty" }, [t.time_none]));
          shell(t.time_title + " · " + fmtDate(state.date, locale), null, body, true);
        });
      }

      // --- Kontakt ---
      function renderDetails() {
        var err = H("p", { class: "bce__err" });
        var form = H("form", { class: "bce__form", onsubmit: function (e) {
          e.preventDefault();
          var fd = new FormData(e.target);
          var items = [];
          (config.menu ? config.menu.products : []).forEach(function (p) {
            var q = state.items[p.id] || 0; if (q > 0) items.push({ id: p.id, name: tr(p.name, "fr"), qty: q, oven: !!p.oven });
          });
          var btn = e.target.querySelector("button[type=submit]");
          btn.disabled = true;
          adapter.createBooking({
            serviceId: state.serviceId, locationId: state.locationId,
            date: state.date, start: state.start,
            end: E._util.toHHMM(E._util.toMin(state.start) + (service.durationMinutes || 15)),
            partySize: state.partySize,
            customerName: fd.get("name"), customerEmail: fd.get("email"), customerPhone: fd.get("phone"),
            notes: fd.get("notes"),
            items: items
          }).then(function (booking) {
            state.booking = booking; i++; render();
          }).catch(function (ex) {
            err.textContent = ex.message === "__TAKEN__" ? t.taken : ex.message; btn.disabled = false;
          });
        } }, [
          H("label", {}, [t.f_name, H("input", { class: "bce__in", name: "name", required: "required", autocomplete: "name" })]),
          H("label", {}, [t.f_email, H("input", { class: "bce__in", name: "email", type: "email", required: "required", autocomplete: "email" })]),
          H("label", {}, [t.f_phone, H("input", { class: "bce__in", name: "phone", type: "tel", required: "required", autocomplete: "tel" })]),
          H("label", {}, [t.f_notes, H("textarea", { class: "bce__in", name: "notes", rows: "2" })]),
          H("p", { class: "bce__paynote" }, [t.pay_note]),
          err,
          H("button", { class: "bce__cta", type: "submit" }, [t.submit])
        ]);
        shell(t.details_title, null, form, true);
      }

      // --- Fertig ---
      function renderDone() {
        var auto = config.booking && config.booking.autoConfirm;
        var body = H("div", { class: "bce__done" }, [
          H("div", { class: "bce__check", html: "✓" }),
          H("p", { class: "bce__donetxt" }, [auto ? t.done_ok : t.done_pending]),
          H("div", { class: "bce__summary bce__summary--big" }, summaryLines()),
          H("button", { class: "bce__back", type: "button", onclick: function () {
            state.locationId = steps.indexOf("location") >= 0 ? null : state.locationId;
            state.items = {}; state.partySize = 0; state.itemCount = 0; state.date = null; state.start = null;
            i = 0; render();
          } }, [t.done_again])
        ]);
        shell(auto ? t.done_ok_title : t.done_title, null, body, false);
      }

      render();
    });
  }

  var api = { mount: mount, LocalAdapter: LocalAdapter, SupabaseAdapter: SupabaseAdapter };
  if (typeof window !== "undefined") window.BookingWidget = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
