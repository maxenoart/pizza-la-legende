/*
 * admin.js — Admin-Panel La Légende (FR). Reine UI; alle Datenzugriffe über
 * window.LegendeData (adapters.js). Modus (Supabase/Demo) wird dort gewählt.
 *
 * Aufbau:
 *   1) Helfer & Nachschlage-Funktionen
 *   2) Store-Fassade (Lesen/Schreiben je Modus)
 *   3) Auth-Gate
 *   4) Rahmen + Navigation
 *   5) Ansichten: Commandes (Zeitleiste) · Non payées · Événements · Carte ·
 *      Tournée · Réglages
 */
(function () {
  "use strict";
  var CFG = window.LEGENDE_CONFIG || {};
  var D = window.LegendeData;
  var E = window.BookingEngine;
  var MODE = D.mode(), sb = D.client();

  var WD = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  var DEMO_PW = "legende";
  var BLOCK = "__BLOCK__";

  var PIZZA_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
    '<rect width="40" height="40" rx="9" fill="#261E17"/>' +
    '<path d="M20 8 L31 29 Q20 34 9 29 Z" fill="#F6F1E9"/>' +
    '<path d="M9 29 Q20 34 31 29" fill="none" stroke="#594736" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="17" cy="19" r="2" fill="#E2073B"/><circle cx="23" cy="22" r="2" fill="#E2073B"/><circle cx="19" cy="26" r="1.8" fill="#4f6b1e"/></svg>');

  var app = document.getElementById("admin");
  var toastEl = document.getElementById("toast");
  var config = null, tab = "commandes";
  var ctx = { date: null, locId: null };

  // ===========================================================================
  // 1) Helfer
  // ===========================================================================
  function H(t, a, k) { var e = document.createElement(t); for (var x in (a || {})) { if (x === "class") e.className = a[x]; else if (x === "html") e.innerHTML = a[x]; else if (x.indexOf("on") === 0) e.addEventListener(x.slice(2), a[x]); else if (a[x] != null) e.setAttribute(x, a[x]); } (k || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return e; }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); setTimeout(function () { toastEl.classList.remove("show"); }, 1800); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function wdOf(d) { return new Date(d + "T00:00:00").getDay(); }
  function fmtDay(d) { try { return new Date(d + "T00:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long" }); } catch (e) { return d; } }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function toMin(hhmm) { var p = String(hhmm).split(":"); return (+p[0]) * 60 + (+p[1]); }
  function loc(id) { return (config.locations || []).find(function (l) { return l.id === id; }) || {}; }
  function perPizza() { return ((config.services || [{}])[0].durationMinutes) || 5; }
  function granularity() { return (config.booking && config.booking.slotGranularityMinutes) || perPizza(); }
  function transitionMin() { return (config.booking && config.booking.transitionMin) || 0; }
  function productById(id) { return ((config.menu && config.menu.products) || []).find(function (p) { return p.id === id; }); }
  function itemName(it) { var p = productById(it.id); return it.name || (p && (p.name.fr || p.name)) || it.id; }
  function itemsSummary(items) { return (items || []).map(function (it) { return it.qty + "× " + itemName(it); }).join(" · "); }
  function firstImg(items) {
    var m = (window.LEGENDE_CONFIG && window.LEGENDE_CONFIG.media) || {}; var it = (items || [])[0]; if (!it) return PIZZA_SVG;
    if (it.id === "p_legende" && m.pizzaLegende) return m.pizzaLegende;
    if (it.id === "p_botanica" && m.pizzaBotanica) return m.pizzaBotanica;
    var p = productById(it.id); return (p && p.image) || PIZZA_SVG;
  }

  // ===========================================================================
  // 2) Store-Fassade
  // ===========================================================================
  function loadConfig() { return D.getConfig(); }
  function saveLocalConfig() { if (MODE === "local") D.local.saveConfig(config); }

  function loadBookings() {
    if (MODE === "supabase") return sb.from("bookings").select("*").order("booking_date").order("start_time").then(function (r) { return (r.data || []).map(norm); });
    return Promise.resolve(D.local.all().map(norm));
  }
  function norm(b) {
    return {
      id: b.id, date: b.booking_date || b.date,
      time: (b.start_time ? String(b.start_time).slice(0, 5) : b.start) || "",
      locId: b.location_id || b.locationId, items: b.items || [],
      qty: (b.party_size != null ? b.party_size : b.partySize) || 0,
      name: b.customer_name || b.customerName, email: b.customer_email || b.customerEmail, phone: b.customer_phone || b.customerPhone,
      notes: b.notes, status: b.status, blocker: (b.notes === BLOCK)
    };
  }
  function setStatus(id, status) {
    if (MODE === "supabase") return sb.from("bookings").update({ status: status }).eq("id", id).then(function () { toast("Mis à jour"); });
    var all = D.local.all(); var b = all.find(function (x) { return x.id === id; }); if (b) b.status = status; D.local.save(all); toast("Mis à jour"); return Promise.resolve();
  }
  function removeBooking(id) {
    if (MODE === "supabase") return sb.from("bookings").delete().eq("id", id).then(function () { toast("Retiré"); });
    D.local.save(D.local.all().filter(function (x) { return x.id !== id; })); toast("Retiré"); return Promise.resolve();
  }
  function createBlocker(tStart) {
    var end = mmToHHMM(toMin(tStart) + perPizza());
    if (MODE === "supabase") {
      return sb.from("bookings").insert({ service_id: (config.services || [{}])[0].id, location_id: ctx.locId, customer_name: "Blocker", customer_email: "block@legende.local", booking_date: ctx.date, start_time: tStart, end_time: end, party_size: 0, items: null, notes: BLOCK, status: "confirmed" }).then(function (r) { if (r.error) toast(r.error.message); else toast("Blocker ajouté"); });
    }
    var all = D.local.all(); all.push({ id: "b_" + Date.now(), serviceId: (config.services || [{}])[0].id, locationId: ctx.locId, customerName: "Blocker", date: ctx.date, start: tStart, end: end, partySize: 0, items: [], notes: BLOCK, status: "confirmed" }); D.local.save(all); toast("Blocker ajouté"); return Promise.resolve();
  }
  function mmToHHMM(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

  function loadEvents() { return MODE === "supabase" ? sb.from("event_requests").select("*").order("created_at", { ascending: false }).then(function (r) { return r.data || []; }) : Promise.resolve([]); }
  function setEventStatus(id, s) { if (MODE === "supabase") return sb.from("event_requests").update({ status: s }).eq("id", id).then(function () { toast("Mis à jour"); }); toast("Démo : indisponible"); return Promise.resolve(); }

  // ===========================================================================
  // 3) Auth-Gate
  // ===========================================================================
  function gate() {
    app.innerHTML = "";
    var box = H("div", { class: "ad__gate" }, [H("div", { class: "ad__logo" }, ["La Légende"]), H("h1", {}, ["Espace admin"])]);
    if (MODE === "supabase") {
      var email = H("input", { class: "ad__in", type: "email", placeholder: "E-mail" });
      var pw = H("input", { class: "ad__in", type: "password", placeholder: "Mot de passe" });
      var btn = H("button", { class: "ad__btn ad__btn--red", onclick: function () { sb.auth.signInWithPassword({ email: email.value, password: pw.value }).then(function (r) { if (r.error) toast("Connexion refusée"); else start(); }); } }, ["Se connecter"]);
      box.appendChild(email); box.appendChild(pw); box.appendChild(btn);
      box.appendChild(H("p", { class: "ad__hint" }, ["Compte opérateur Supabase (Authentication → Users)."]));
      pw.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    } else {
      var inp = H("input", { class: "ad__in", type: "password", placeholder: "Mot de passe (démo : legende)" });
      var b2 = H("button", { class: "ad__btn ad__btn--red", onclick: function () { if (inp.value === DEMO_PW) start(); else toast("Mot de passe incorrect"); } }, ["Entrer"]);
      box.appendChild(inp); box.appendChild(b2); box.appendChild(H("p", { class: "ad__hint" }, ["Mode démonstration (localStorage)."]));
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && inp.value === DEMO_PW) start(); });
    }
    app.appendChild(box);
  }
  function start() { loadConfig().then(function (c) { config = c || {}; if (!ctx.date) ctx.date = today(); render(); }); }
  function logout() { if (MODE === "supabase" && sb) sb.auth.signOut(); gate(); }

  // ===========================================================================
  // 4) Rahmen + Navigation
  // ===========================================================================
  function render() {
    app.innerHTML = "";
    app.appendChild(H("header", { class: "ad__top" }, [
      H("strong", {}, [config.businessName || "La Légende"]),
      H("div", { class: "ad__row" }, [H("span", { class: "ad__badge" + (MODE === "supabase" ? " ad__badge--live" : "") }, [MODE === "supabase" ? "Live" : "Démo"]), H("button", { class: "ad__logout", onclick: logout }, ["Quitter"])])
    ]));
    var view = H("main", { class: "ad__view" });
    if (tab === "commandes") viewCommandes(view);
    if (tab === "evenements") viewEvenements(view);
    if (tab === "carte") viewCarte(view);
    if (tab === "tournee") viewTournee(view);
    if (tab === "reglages") viewReglages(view);
    app.appendChild(view);
    app.appendChild(H("nav", { class: "ad__nav" }, [["commandes", "Commandes"], ["evenements", "Événements"], ["carte", "Carte"], ["tournee", "Tournée"], ["reglages", "Réglages"]].map(function (it) {
      return H("button", { class: "ad__navbtn" + (tab === it[0] ? " is-active" : ""), onclick: function () { tab = it[0]; render(); } }, [it[1]]);
    })));
  }

  // ===========================================================================
  // 5a) Commandes — Zeitleiste
  // ===========================================================================
  function todaysStops(d) { var wd = wdOf(d); return (config.locations || []).filter(function (l) { return Object.keys(l.hours || {}).map(Number).indexOf(wd) >= 0; }); }
  function defaultLoc(d) { var s = todaysStops(d); if (!s.length) return (config.locations || [{}])[0].id; var svc = new Date().getHours() < 15 ? "midi" : "soir"; return (s.find(function (x) { return x.service === svc; }) || s[0]).id; }

  function viewCommandes(v) {
    if (!ctx.locId || loc(ctx.locId).id !== ctx.locId) ctx.locId = defaultLoc(ctx.date);
    var stops = todaysStops(ctx.date);
    var options = (stops.length ? stops : (config.locations || [])).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    var cur = loc(ctx.locId);
    var hrs = (cur.hours && cur.hours[Object.keys(cur.hours)[0]] || [{}])[0];

    var dateInp = H("input", { class: "oc__date", type: "date", value: ctx.date });
    dateInp.addEventListener("change", function () { ctx.date = dateInp.value; ctx.locId = defaultLoc(ctx.date); render(); });
    var sel = H("select", { class: "oc__sel" }, options.map(function (l) { return H("option", { value: l.id, selected: l.id === ctx.locId ? "selected" : null }, [l.name + (l.service ? " · " + l.service : "")]); }));
    sel.addEventListener("change", function () { ctx.locId = sel.value; render(); });
    v.appendChild(H("div", { class: "oc__head" }, [
      H("div", { class: "oc__headtop" }, [dateInp, sel]),
      H("div", { class: "oc__headsub" }, [H("span", { class: "oc__place" }, [cur.name || "—", cur.place ? H("span", { class: "oc__spot" }, [" · " + cur.place]) : H("span")]), H("span", { class: "oc__hrs" }, [hrs ? hrs.start + "–" + hrs.end : "—"])])
    ]));

    var list = H("div", { class: "tl" }); v.appendChild(list);
    var unpaidWrap = H("div", {}); v.appendChild(unpaidWrap);
    list.appendChild(H("p", { class: "ad__muted" }, ["Chargement…"]));

    loadBookings().then(function (all) {
      list.innerHTML = "";
      var isToday = ctx.date === today();
      var now = isToday ? nowMin() : -1;
      var g = granularity();
      var mine = all.filter(function (b) { return b.date === ctx.date && b.locId === ctx.locId && b.status !== "cancelled" && b.status !== "declined"; });

      // Belegung (Bestellung mit N Pizzen belegt N Folge-Slots)
      var grid = (E ? E.daySlots(config, { date: ctx.date, serviceId: (config.services || [{}])[0].id, locationId: ctx.locId }) : []).map(function (s) { return s.start; });
      var owner = {}, cont = {};
      mine.forEach(function (b) {
        var span = b.blocker ? 1 : Math.max(1, b.qty || 1);
        owner[b.time] = b; var idx = grid.indexOf(b.time);
        if (idx >= 0) for (var k = 1; k < span; k++) { var tt = grid[idx + k]; if (tt && !owner[tt]) cont[tt] = b; }
      });

      // Overdue-unbezahlt: aktive Bestellung, >3 Slots vergangen, nicht bezahlt
      var overdue = mine.filter(function (b) { return !b.blocker && b.status !== "paid" && isToday && toMin(b.time) < now - 3 * g; });
      var overdueIds = {}; overdue.forEach(function (b) { overdueIds[b.id] = true; });

      if (!grid.length) { list.appendChild(H("p", { class: "ad__muted" }, ["Pas de service à cette étape ce jour-là."])); }

      var pastTimes = [], futureTimes = [];
      grid.forEach(function (tt) { ((isToday && toMin(tt) < now) ? pastTimes : futureTimes).push(tt); });

      // Vergangene: bis zu 3 Karten mit Bestellung/Blocker (nicht overdue) — ausgegraut
      var pastCards = pastTimes.filter(function (tt) { var b = owner[tt]; return b && !overdueIds[b.id]; }).slice(-3);
      pastCards.forEach(function (tt) { list.appendChild(card(tt, owner[tt], cont[tt], cur, true)); });

      // Jetzt-Marker
      if (isToday && futureTimes.length) list.appendChild(H("div", { class: "tl__now" }, [H("span", { class: "tl__nowdot" }), "maintenant · " + mmToHHMM(now)]));

      // Zukunft: alle Slots + kleine Übergangszeit dazwischen
      futureTimes.forEach(function (tt, idx) {
        var b = owner[tt];
        if (b && overdueIds[b.id]) return; // overdue landet in der Liste unten
        if (idx > 0 && transitionMin() > 0) list.appendChild(H("div", { class: "tl__trans" }, [transitionMin() + " MIN"]));
        list.appendChild(card(tt, b, cont[tt], cur, false));
      });

      // Non payées
      if (overdue.length) {
        unpaidWrap.appendChild(H("div", { class: "tl__unpaidhead" }, ["Non payées"]));
        overdue.sort(function (a, b) { return a.time.localeCompare(b.time); }).forEach(function (b) { unpaidWrap.appendChild(card(b.time, b, null, cur, true)); });
      }
    });

    // ---- Kartenbau ----
    function card(tStart, b, contB, cur, greyed) {
      if (contB && !b) return H("div", { class: "tl__card tl__card--cont" }, [H("b", { class: "tl__time" }, [tStart]), H("span", { class: "tl__contlbl" }, ["⟶ même commande"])]);
      if (b && b.blocker) return blockerCard(tStart, b);
      if (b) return orderCard(tStart, b, cur, greyed);
      return emptyCard(tStart);
    }

    function timeCol(tStart, label) { return H("div", { class: "tl__timecol" }, [H("b", { class: "tl__time" }, [tStart]), H("span", { class: "tl__state" }, [label])]); }

    function orderCard(tStart, b, cur, greyed) {
      var paid = b.status === "paid";
      var prep = Math.max(1, b.qty || 1) * perPizza();
      var col = H("div", { class: "tl__timecol" }, [
        H("b", { class: "tl__time" }, [tStart]),
        H("span", { class: "tl__state tl__state--busy" }, ["Occupé"]),
        H("span", { class: "tl__prep" }, ["≈ " + prep + " min"])
      ]);
      var mid = H("div", { class: "tl__mid" }, [
        H("div", { class: "tl__order" }, [itemsSummary(b.items) || "—"]),
        H("div", { class: "tl__cust" }, [(b.name || "—"), b.phone ? H("a", { class: "tl__phone", href: "tel:" + String(b.phone).replace(/\s/g, "") }, [" · " + b.phone]) : H("span")]),
        b.notes && b.notes !== BLOCK ? H("div", { class: "tl__note" }, ["“" + b.notes + "”"]) : H("span")
      ]);
      var payBtn = H("button", { class: "tl__pay" + (paid ? " is-paid" : ""), onclick: function () { setStatus(b.id, paid ? "confirmed" : "paid").then(render); } }, [paid ? "💰 Payé" : "💰 Payé ?"]);
      return H("div", { class: "tl__card tl__card--order" + (greyed || paid ? " is-grey" : ""), style: "background-image:none" }, [
        H("img", { class: "tl__thumb", src: firstImg(b.items), alt: "", onerror: function () { this.src = PIZZA_SVG; } }),
        col, mid, H("div", { class: "tl__act" }, [payBtn])
      ]);
    }

    function emptyCard(tStart) {
      return H("div", { class: "tl__card tl__card--empty" }, [
        timeCol(tStart, "Libre"),
        H("div", { class: "tl__mid tl__mid--empty" }, [""]),
        H("div", { class: "tl__act" }, [H("button", { class: "tl__block", onclick: function () { createBlocker(tStart).then(render); } }, ["🔒 Bloquer"])])
      ]);
    }

    function blockerCard(tStart, b) {
      var end = mmToHHMM(toMin(tStart) + perPizza());
      return H("div", { class: "tl__card tl__card--block" }, [
        H("div", { class: "tl__timecol" }, [H("b", { class: "tl__time" }, [tStart]), H("span", { class: "tl__state tl__state--block" }, ["Pause"])]),
        H("div", { class: "tl__mid" }, [H("div", { class: "tl__blocktxt" }, ["🔒 Tu prends une pause jusqu'à " + end + ". Aucune commande ne peut être réservée sur ce créneau."])]),
        H("div", { class: "tl__act" }, [H("button", { class: "tl__unblock", title: "Retirer", onclick: function () { removeBooking(b.id).then(render); } }, ["Retirer"])])
      ]);
    }
  }

  // ===========================================================================
  // 5b) Événements
  // ===========================================================================
  function viewEvenements(v) {
    v.appendChild(H("h2", {}, ["Demandes de devis"]));
    var list = H("div", { style: "display:grid;gap:12px" }); v.appendChild(list);
    loadEvents().then(function (rows) {
      if (!rows.length) { list.appendChild(H("p", { class: "ad__muted" }, [MODE === "supabase" ? "Aucune demande pour l'instant." : "En mode démo, les demandes ne sont pas stockées."])); return; }
      rows.forEach(function (e) {
        list.appendChild(H("div", { class: "ad__card" }, [
          H("div", { class: "ad__cardhead" }, [H("span", {}, [e.event_type || "Événement"]), H("span", { class: "ad__status ad__status--" + (e.status || "new") }, [e.status || "new"])]),
          H("div", { class: "ad__cardbody" }, [H("strong", {}, [e.name]), H("br"), (e.event_date ? "Date : " + e.event_date + "  ·  " : "") + (e.guests ? e.guests + " invités" : ""), H("br"), (e.place ? "Lieu : " + e.place : ""), H("br"), H("small", {}, [(e.email || "") + (e.phone ? " · " + e.phone : "")]), e.message ? H("div", {}, [H("small", {}, [e.message])]) : H("span")]),
          H("div", { class: "ad__cardfoot" }, [H("button", { class: "ad__chip", onclick: function () { setEventStatus(e.id, "quoted").then(render); } }, ["Devis envoyé"]), H("button", { class: "ad__chip ad__chip--ok", onclick: function () { setEventStatus(e.id, "won").then(render); } }, ["Gagné"]), H("button", { class: "ad__chip ad__chip--red", onclick: function () { setEventStatus(e.id, "lost").then(render); } }, ["Perdu"])])
        ]));
      });
    });
  }

  // ===========================================================================
  // 5c) Carte
  // ===========================================================================
  function viewCarte(v) {
    v.appendChild(H("h2", {}, ["Carte & prix"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Renseignez les prix par article. Ils apparaissent sur « La carte »."]));
    ((config.menu || {}).products || []).forEach(function (p) {
      var name = H("input", { class: "ad__in", value: (p.name && (p.name.fr || p.name)) || "", placeholder: "Nom" });
      var price = H("input", { class: "ad__in ad__in--s", type: "number", step: "0.5", value: p.price != null ? p.price : "", placeholder: "Prix CHF" });
      function saveP() {
        var nm = name.value, pr = price.value === "" ? null : Number(price.value);
        if (MODE === "supabase") sb.from("products").update({ name_fr: nm, price: pr }).eq("id", p.id).then(function () { toast("Enregistré"); });
        else { if (p.name && typeof p.name === "object") p.name.fr = nm; else p.name = { fr: nm, de: nm }; p.price = pr; saveLocalConfig(); toast("Enregistré"); }
      }
      name.addEventListener("change", saveP); price.addEventListener("change", saveP);
      v.appendChild(H("div", { class: "ad__card" }, [H("div", { class: "ad__grid2" }, [name, price])]));
    });
  }

  // ===========================================================================
  // 5d) Tournée
  // ===========================================================================
  function viewTournee(v) {
    v.appendChild(H("h2", {}, ["Tournée — horaires"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Format : 18:15-20:00. Vide = pas de service ce jour-là."]));
    (config.locations || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).forEach(function (l) {
      var wd = Object.keys(l.hours || {})[0];
      var val = wd ? (l.hours[wd] || []).map(function (iv) { return iv.start + "-" + iv.end; }).join(", ") : "";
      var inp = H("input", { class: "ad__in", value: val, placeholder: "18:15-20:00" });
      inp.addEventListener("change", function () { var ivs = inp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (p) { var a = p.split("-"); return { start: (a[0] || "").trim(), end: (a[1] || "").trim() }; }); saveLocationHours(l, wd, ivs); });
      v.appendChild(H("div", { class: "ad__card" }, [H("div", { class: "ad__cardhead" }, [H("span", {}, [l.name]), H("span", { class: "ad__badge" }, [(l.weekdayLabel && (l.weekdayLabel.fr || l.weekdayLabel)) + " · " + (l.service || "")])]), H("div", { class: "ad__cardbody" }, [l.place || ""]), inp]));
    });
  }
  function saveLocationHours(l, wd, ivs) {
    if (!wd) { toast("Jour non défini"); return; }
    if (MODE === "supabase") {
      sb.from("availability_rules").delete().eq("scope", "location").eq("location_id", l.id).eq("weekday", Number(wd)).then(function () {
        if (!ivs.length) { toast("Enregistré"); return; }
        sb.from("availability_rules").insert(ivs.map(function (iv) { return { scope: "location", location_id: l.id, weekday: Number(wd), start_time: iv.start, end_time: iv.end }; })).then(function () { toast("Enregistré"); });
      });
    } else { if (ivs.length) l.hours[wd] = ivs; else delete l.hours[wd]; saveLocalConfig(); toast("Enregistré"); }
  }

  // ===========================================================================
  // 5e) Réglages
  // ===========================================================================
  function viewReglages(v) {
    var svc = (config.services || [{}])[0];
    var b = config.booking = config.booking || {};
    function saveBooking() { if (MODE === "supabase") sb.from("settings").update({ booking: b }).eq("id", true).then(function () { toast("Enregistré"); }); else { saveLocalConfig(); toast("Enregistré"); } }

    v.appendChild(H("h2", {}, ["Durée par pizza"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Temps pour une pizza = un créneau. Une commande de N pizzas occupe N créneaux."]));
    var dur = H("input", { class: "ad__in ad__in--s", type: "number", min: "1", value: svc.durationMinutes != null ? svc.durationMinutes : 5 });
    dur.addEventListener("change", function () {
      var d = Number(dur.value) || 1; svc.durationMinutes = d; b.slotGranularityMinutes = d;
      if (MODE === "supabase") sb.from("services").update({ duration_minutes: d }).eq("id", svc.id).then(function () { sb.from("settings").update({ booking: b }).eq("id", true).then(function () { toast("Enregistré"); }); });
      else { saveLocalConfig(); toast("Enregistré"); }
    });
    v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, ["Durée par pizza (min)"]), dur]));

    var tr = H("input", { class: "ad__in ad__in--s", type: "number", min: "0", value: b.transitionMin != null ? b.transitionMin : 0 });
    tr.addEventListener("change", function () { b.transitionMin = Number(tr.value) || 0; saveBooking(); });
    v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, ["Transition affichée (min)"]), tr]));

    v.appendChild(H("h2", { class: "ad__mt" }, ["Parcours client"]));
    v.appendChild(H("label", { class: "ad__row ad__toggle" }, [H("span", {}, ["Commander uniquement pour aujourd'hui"]), toggle(!!b.sameDayOnly, function (on) { b.sameDayOnly = on; saveBooking(); })]));

    v.appendChild(H("h2", { class: "ad__mt" }, ["Règles"]));
    numRow("Délai mini avant retrait (min)", "leadTimeMinutes");
    numRow("Réserver jusqu'à (jours)", "bookingHorizonDays");
    function numRow(label, key) { var inp = H("input", { class: "ad__in ad__in--s", type: "number", value: b[key] != null ? b[key] : "" }); inp.addEventListener("change", function () { b[key] = inp.value === "" ? 0 : Number(inp.value); saveBooking(); }); v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, [label]), inp])); }
  }
  function toggle(on, cb) { var t = H("button", { class: "ad__sw" + (on ? " is-on" : "") }, [H("span", { class: "ad__swdot" })]); t.addEventListener("click", function () { on = !on; t.classList.toggle("is-on", on); cb(on); }); return t; }

  // ===========================================================================
  // Boot
  // ===========================================================================
  if (MODE === "supabase") { sb.auth.getSession().then(function (r) { if (r.data && r.data.session) start(); else gate(); }); }
  else { gate(); }
})();
