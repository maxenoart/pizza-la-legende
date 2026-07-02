/*
 * booking-widget.js — Kunden-Bestelloberfläche (reine UI).
 * ---------------------------------------------------------------------------
 * Datenzugriffe laufen ausschliesslich über window.LegendeData (adapters.js).
 * Verfügbarkeit kommt aus window.BookingEngine (availability.js).
 *
 * Ablauf (Same-Day): Standort → Bestellung → Abholzeit → Kontakt → (Bestätigung
 * mit Benachrichtigungswahl). Muster „Slot pro Pizza": N Pizzen = N Folge-Slots.
 * Mobile-first, zweisprachig FR/DE.
 */
(function () {
  "use strict";
  var E = window.BookingEngine;

  // ===========================================================================
  // Lokalisierung
  // ===========================================================================
  var STR = {
    fr: {
      brand_lead: "En quelques clics, votre pizza vous attend au camion.",
      step: "Étape", of: "sur", back: "← Retour",
      loc_title: "Où récupérez-vous ?", loc_sub: "Le camion est là aujourd'hui — et ailleurs les autres jours.",
      loc_unavailable: "indisponible aujourd'hui", loc_none: "Pas de tournée aujourd'hui — à bientôt !",
      order_title: "Composez votre commande", order_sub: "Ajoutez vos pizzas et gourmandises.",
      order_continue: "Continuer", order_empty: "Ajoutez au moins un article.",
      order_count_one: "pizza", order_count_many: "pizzas", order_items: "article(s)",
      time_title: "Heure de retrait", time_none: "Plus de créneau libre pour l'instant.", slot_taken: "réservé",
      details_title: "Vos coordonnées",
      f_name: "Nom", f_email: "E-mail", f_phone: "Téléphone", f_notes: "Remarque (optionnel)",
      submit: "Valider la commande", pay_note: "Paiement sur place — cash ou TWINT.",
      notify_title: "Un petit rappel ?", notify_sub: "10 min avant votre retrait.",
      notify_email: "Par e-mail", notify_messenger: "Sur WhatsApp", notify_none: "Sans rappel",
      done_title: "Commande confirmée",
      done_txt: "C'est noté ! Rendez-vous au camion à l'heure choisie.",
      done_email: "Rappel par e-mail 10 min avant le retrait.",
      done_msg: "Recevoir le rappel sur WhatsApp",
      done_again: "Passer une autre commande",
      sum_when: "Retrait", sum_at: "à", taken: "Ce créneau vient d'être pris — choisissez-en un autre.",
      midi: "midi", soir: "soir"
    },
    de: {
      brand_lead: "In wenigen Klicks wartet deine Pizza am Truck.",
      step: "Schritt", of: "von", back: "← Zurück",
      loc_title: "Wo holst du ab?", loc_sub: "Heute ist der Truck hier — an anderen Tagen woanders.",
      loc_unavailable: "heute nicht verfügbar", loc_none: "Heute keine Tournée — bis bald!",
      order_title: "Stell deine Bestellung zusammen", order_sub: "Füge Pizzen und Feines hinzu.",
      order_continue: "Weiter", order_empty: "Füge mindestens einen Artikel hinzu.",
      order_count_one: "Pizza", order_count_many: "Pizzen", order_items: "Artikel",
      time_title: "Abholzeit", time_none: "Aktuell kein Fenster mehr frei.", slot_taken: "belegt",
      details_title: "Deine Angaben",
      f_name: "Name", f_email: "E-Mail", f_phone: "Telefon", f_notes: "Bemerkung (optional)",
      submit: "Bestellung abschliessen", pay_note: "Zahlung vor Ort — bar oder TWINT.",
      notify_title: "Eine Erinnerung?", notify_sub: "10 Min vor der Abholung.",
      notify_email: "Per E-Mail", notify_messenger: "Per WhatsApp", notify_none: "Ohne Erinnerung",
      done_title: "Bestellung bestätigt",
      done_txt: "Notiert! Wir sehen uns zur gewählten Zeit am Truck.",
      done_email: "Erinnerung per E-Mail 10 Min vor der Abholung.",
      done_msg: "Erinnerung per WhatsApp erhalten",
      done_again: "Weitere Bestellung",
      sum_when: "Abholung", sum_at: "um", taken: "Dieses Fenster wurde gerade vergeben — bitte anderes wählen.",
      midi: "Mittag", soir: "Abend"
    }
  };
  var TAGS = {
    vegan: { fr: "vegan", de: "vegan" }, veggie: { fr: "végé", de: "veggie" },
    signature: { fr: "signature", de: "Signature" }, new: { fr: "nouveau", de: "neu" }
  };

  // ===========================================================================
  // DOM-Helfer
  // ===========================================================================
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
  function fmtDate(iso, locale) { return new Date(iso + "T00:00:00").toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" }); }
  function tr(v, lang) { return (v && typeof v === "object") ? (v[lang] || v.fr || "") : (v || ""); }

  // ===========================================================================
  // Widget
  // ===========================================================================
  function mount(root, opts) {
    opts = opts || {};
    var data = window.LegendeData;
    data.getConfig().then(function (config) {
      var lang = opts.lang || (config.locale && config.locale.slice(0, 2)) || "fr";
      var t = STR[lang] || STR.fr;
      var locale = config.locale || (lang === "de" ? "de-CH" : "fr-CH");
      var f = config.features || {};
      var service = (config.services || [{}])[0];
      var todayStr = E._util.ymd(new Date());

      var state = {
        locationId: null, serviceId: service.id, items: {}, partySize: 0, itemCount: 0,
        date: todayStr, start: null, customer: {}, reminder: "none", booking: null, unsub: null
      };

      // Fortschritts-Schritte (OHNE Bestätigung — die ist kein Schritt).
      var steps = [];
      if (f.multiLocation && (config.locations || []).length) steps.push("location");
      steps.push("order", "time", "details");
      var i = 0, phase = "steps";

      // --- Hilfen ---
      function locObj() { return (config.locations || []).find(function (l) { return l.id === state.locationId; }); }
      function locWeekdays(l) { return Object.keys(l.hours || {}).map(Number); }
      function availableToday(l) { return locWeekdays(l).indexOf(new Date().getDay()) >= 0; }
      function daysUntil(l) {
        var wd = new Date().getDay();
        var ds = locWeekdays(l).map(function (x) { return (x - wd + 7) % 7; });
        return ds.length ? Math.min.apply(null, ds) : 99;
      }
      function computeTotals() {
        var pizzas = 0, count = 0;
        (config.menu ? config.menu.products : []).forEach(function (p) {
          var q = state.items[p.id] || 0; if (q > 0) { count += q; if (p.oven) pizzas += q; }
        });
        state.partySize = pizzas; state.itemCount = count;
      }
      function clearSub() { if (state.unsub) { state.unsub(); state.unsub = null; } }

      // --- Gerüst ---
      function summaryLines() {
        var out = [], lo = locObj();
        if (lo) out.push(H("div", { class: "bce__sumrow" }, [lo.name + " · " + lo.place]));
        if (state.itemCount) out.push(H("div", { class: "bce__sumrow" }, [
          state.partySize + " " + (state.partySize === 1 ? t.order_count_one : t.order_count_many) +
          (state.itemCount > state.partySize ? "  ·  " + state.itemCount + " " + t.order_items : "")
        ]));
        if (state.start) out.push(H("div", { class: "bce__sumrow" }, [t.sum_when + " " + t.sum_at + " " + state.start]));
        return out;
      }
      function shell(title, sub, bodyEl, showBack) {
        root.innerHTML = "";
        var counter = (phase === "steps") ? H("div", { class: "bce__steps" }, [t.step + " " + (i + 1) + " " + t.of + " " + steps.length]) : H("span");
        root.appendChild(H("div", { class: "bce" }, [
          H("div", { class: "bce__aside" }, [
            H("div", { class: "bce__brand" }, [config.businessName || "La Légende"]),
            H("p", { class: "bce__lead" }, [t.brand_lead]),
            (state.locationId || state.itemCount) ? H("div", { class: "bce__summary" }, summaryLines()) : H("span")
          ]),
          H("div", { class: "bce__main" }, [
            counter,
            H("h2", { class: "bce__title" }, [title]),
            sub ? H("p", { class: "bce__sub" }, [sub]) : H("span"),
            bodyEl,
            showBack ? H("button", { class: "bce__back", type: "button", onclick: function () { i--; render(); } }, [t.back]) : H("span")
          ])
        ]));
      }

      function render() {
        clearSub();
        if (phase === "notify") return renderNotify();
        if (phase === "done") return renderDone();
        var step = steps[i];
        if (step === "location") return renderLocation();
        if (step === "order") return renderOrder();
        if (step === "time") return renderTime();
        if (step === "details") return renderDetails();
      }

      // --- Schritt 1: Standort (alle sichtbar, nur heute klickbar) ---
      function renderLocation() {
        var locs = (config.locations || []).slice().sort(function (a, b) {
          var da = daysUntil(a), db = daysUntil(b); return da !== db ? da - db : (a.sort || 0) - (b.sort || 0);
        });
        var anyToday = locs.some(availableToday);
        var list = H("div", { class: "bce__list" }, locs.map(function (l) {
          var open = availableToday(l);
          var svcLabel = l.service === "midi" ? t.midi : t.soir;
          var hrs = (l.hours[Object.keys(l.hours)[0]] || [{}])[0];
          var meta = open
            ? tr(l.weekdayLabel, lang) + " · " + svcLabel + (hrs ? "  " + hrs.start + "–" + hrs.end : "")
            : tr(l.weekdayLabel, lang) + " · " + t.loc_unavailable;
          var metaKids = [];
          if (open) metaKids.push(H("span", { class: "bce__opttoday" }, [lang === "de" ? "heute" : "aujourd'hui"]));
          metaKids.push(H("span", {}, [meta]));
          return H("button", {
            class: "bce__opt" + (open ? " is-today" : " is-off"), type: "button", disabled: open ? null : "disabled",
            onclick: open ? function () { state.locationId = l.id; i++; render(); } : null
          }, [
            H("span", { class: "bce__optcol" }, [
              H("span", { class: "bce__optname" }, [l.name]),
              H("span", { class: "bce__optplace" }, [l.place])
            ]),
            H("span", { class: "bce__optmeta" }, metaKids)
          ]);
        }));
        shell(t.loc_title, anyToday ? t.loc_sub : t.loc_none, list, false);
      }

      // --- Schritt 2: Bestellung ---
      function renderOrder() {
        var menu = config.menu || { categories: [], products: [] };
        var cont = H("button", { class: "bce__cta", type: "button", disabled: "disabled", onclick: function () { i++; render(); } }, [t.order_continue]);
        var countLbl = H("span", { class: "bce__ordercount" }, []);
        function refresh() {
          computeTotals();
          countLbl.textContent = state.itemCount
            ? (state.partySize + " " + (state.partySize === 1 ? t.order_count_one : t.order_count_many) + (state.itemCount > state.partySize ? " · " + state.itemCount + " " + t.order_items : ""))
            : t.order_empty;
          if (state.itemCount > 0) cont.removeAttribute("disabled"); else cont.setAttribute("disabled", "disabled");
        }
        var body = H("div", { class: "bce__order" });
        (menu.categories || []).forEach(function (cat) {
          var prods = (menu.products || []).filter(function (p) { return p.cat === cat.id; });
          if (!prods.length) return;
          body.appendChild(H("h3", { class: "bce__cat" }, [tr(cat.name, lang)]));
          prods.forEach(function (p) {
            var qEl = H("span", { class: "bce__qty" }, [String(state.items[p.id] || 0)]);
            var row = H("div", { class: "bce__prod" + ((state.items[p.id] || 0) > 0 ? " is-active" : "") }, [
              H("span", { class: "bce__pcol" }, [
                H("span", { class: "bce__pname" }, [tr(p.name, lang)].concat((p.tags || []).filter(function (x) { return TAGS[x]; }).map(function (x) { return H("span", { class: "bce__tag bce__tag--" + x }, [tr(TAGS[x], lang)]); }))),
                tr(p.desc, lang) ? H("span", { class: "bce__pdesc" }, [tr(p.desc, lang)]) : H("span")
              ]),
              H("span", { class: "bce__stepper" }, [
                H("button", { class: "bce__step", type: "button", "aria-label": "-", onclick: function () { setQ(-1); } }, ["−"]),
                qEl,
                H("button", { class: "bce__step", type: "button", "aria-label": "+", onclick: function () { setQ(1); } }, ["+"])
              ])
            ]);
            function setQ(d) {
              var q = Math.max(0, (state.items[p.id] || 0) + d);
              if (q === 0) delete state.items[p.id]; else state.items[p.id] = q;
              qEl.textContent = String(q); row.classList.toggle("is-active", q > 0); refresh();
            }
            body.appendChild(row);
          });
        });
        shell(t.order_title, t.order_sub, H("div", {}, [body, H("div", { class: "bce__orderbar" }, [countLbl, cont])]), true);
        refresh();
      }

      // --- Schritt 3: Abholzeit (Realtime) ---
      function renderTime() {
        function paint() {
          data.getBusy(state.date).then(function (busy) {
            var free = {};
            E.computeAvailableSlots(config, { date: state.date, serviceId: state.serviceId, locationId: state.locationId, partySize: state.partySize, existingBookings: busy })
              .forEach(function (s) { free[s.start] = true; });
            var grid = E.daySlots(config, { date: state.date, serviceId: state.serviceId, locationId: state.locationId });
            var host = document.getElementById("bce-times");
            if (!host) return;
            host.innerHTML = "";
            if (!grid.length) { host.appendChild(H("p", { class: "bce__empty" }, [t.time_none])); return; }
            var isToday = state.date === E._util.ymd(new Date());
            var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
            var past = [], future = [];
            grid.forEach(function (s) { ((isToday && E._util.toMin(s.start) < nowMin) ? past : future).push(s); });
            past.slice(-3).forEach(function (s) { host.appendChild(slotEl(s, "past")); });
            future.forEach(function (s) { host.appendChild(slotEl(s, free[s.start] ? "free" : "taken")); });
            if (!future.some(function (s) { return free[s.start]; })) host.appendChild(H("p", { class: "bce__empty" }, [t.time_none]));
          });
        }
        function slotEl(s, kind) {
          var kids = [H("span", { class: "bce__ttime" }, [s.start])];
          if (kind === "taken") kids.push(H("span", { class: "bce__tlabel" }, [t.slot_taken]));
          if (kind === "free") return H("button", { class: "bce__tslot is-free", type: "button", onclick: function () { state.start = s.start; i++; render(); } }, kids);
          return H("div", { class: "bce__tslot is-" + kind, "aria-disabled": "true" }, kids);
        }
        shell(t.time_title + " · " + fmtDate(state.date, locale), null, H("div", { class: "bce__times", id: "bce-times" }, []), true);
        paint();
        // Live-Aktualisierung, wenn andere Kunden buchen.
        state.unsub = data.subscribe(state.date, paint);
      }

      // --- Schritt 4: Kontakt ---
      function renderDetails() {
        var err = H("p", { class: "bce__err" });
        var form = H("form", { class: "bce__form", onsubmit: function (e) {
          e.preventDefault();
          var fd = new FormData(e.target);
          state.customer = { name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"), notes: fd.get("notes") };
          phase = "notify"; render();
        } }, [
          H("label", {}, [t.f_name, H("input", { class: "bce__in", name: "name", required: "required", autocomplete: "name", value: state.customer.name || "" })]),
          H("label", {}, [t.f_email, H("input", { class: "bce__in", name: "email", type: "email", required: "required", autocomplete: "email", value: state.customer.email || "" })]),
          H("label", {}, [t.f_phone, H("input", { class: "bce__in", name: "phone", type: "tel", required: "required", autocomplete: "tel", value: state.customer.phone || "" })]),
          H("label", {}, [t.f_notes, H("textarea", { class: "bce__in", name: "notes", rows: "2" }, [state.customer.notes || ""])]),
          H("p", { class: "bce__paynote" }, [t.pay_note]), err,
          H("button", { class: "bce__cta", type: "submit" }, [t.submit])
        ]);
        shell(t.details_title, null, form, true);
      }

      // --- Bestätigung: Benachrichtigungswahl (kein nummerierter Schritt) ---
      function renderNotify() {
        var err = H("p", { class: "bce__err" });
        function choose(channel) {
          var svc = service;
          data.createBooking({
            serviceId: state.serviceId, locationId: state.locationId, date: state.date, start: state.start,
            end: E._util.toHHMM(E._util.toMin(state.start) + (svc.durationMinutes || 5) * Math.max(1, state.partySize)),
            partySize: state.partySize, customerName: state.customer.name, customerEmail: state.customer.email,
            customerPhone: state.customer.phone, notes: state.customer.notes,
            items: itemsArray(), reminderChannel: channel
          }).then(function (b) { state.booking = b; state.reminder = channel; phase = "done"; render(); })
            .catch(function (ex) {
              if (ex.message === "__TAKEN__") { phase = "steps"; i = steps.indexOf("time"); render(); }
              else err.textContent = ex.message;
            });
        }
        var opts = H("div", { class: "bce__notify" }, [
          H("button", { class: "bce__nopt", type: "button", onclick: function () { choose("email"); } }, [H("span", { class: "bce__nicon" }, ["✉"]), t.notify_email]),
          H("button", { class: "bce__nopt", type: "button", onclick: function () { choose("messenger"); } }, [H("span", { class: "bce__nicon" }, ["💬"]), t.notify_messenger]),
          H("button", { class: "bce__nopt bce__nopt--muted", type: "button", onclick: function () { choose("none"); } }, [t.notify_none])
        ]);
        shell(t.notify_title, t.notify_sub, H("div", {}, [opts, err]), false);
      }
      function itemsArray() {
        var items = [];
        (config.menu ? config.menu.products : []).forEach(function (p) { var q = state.items[p.id] || 0; if (q > 0) items.push({ id: p.id, name: tr(p.name, "fr"), qty: q, oven: !!p.oven }); });
        return items;
      }

      // --- Fertig ---
      function renderDone() {
        var extra = H("span");
        if (state.reminder === "email") extra = H("p", { class: "bce__donehint" }, [t.done_email]);
        else if (state.reminder === "messenger") {
          var wa = (config.contact && config.contact.whatsapp) || "41793691036";
          var msg = encodeURIComponent("La Légende — rappel pour ma commande à " + state.start + ".");
          extra = H("a", { class: "bce__whatsapp", href: "https://wa.me/" + wa + "?text=" + msg, target: "_blank", rel: "noopener" }, ["💬 " + t.done_msg]);
        }
        var body = H("div", { class: "bce__done" }, [
          H("div", { class: "bce__check", html: "✓" }),
          H("p", { class: "bce__donetxt" }, [t.done_txt]),
          H("div", { class: "bce__summary bce__summary--big" }, summaryLines()),
          extra,
          H("button", { class: "bce__back", type: "button", onclick: function () {
            state.locationId = steps.indexOf("location") >= 0 ? null : state.locationId;
            state.items = {}; state.partySize = 0; state.itemCount = 0; state.start = null; state.customer = {}; state.reminder = "none";
            i = 0; phase = "steps"; render();
          } }, [t.done_again])
        ]);
        shell(t.done_title, null, body, false);
      }

      render();
    });
  }

  window.BookingWidget = { mount: mount };
})();
