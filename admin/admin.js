/*
 * admin.js — Admin-Panel La Légende (FR).
 * Zwei Betriebsmodi, automatisch gewählt:
 *   • SUPABASE  — wenn assets/js/env.js Zugangsdaten setzt: echter Betrieb,
 *     Betreiber-Login (E-Mail/Passwort via Supabase Auth), Lese-/Schreibzugriff.
 *   • DEMO      — sonst: localStorage (teilt sich die Daten mit dem Widget),
 *     einfaches Passwort-Gate. Ideal zum Ausprobieren auf GitHub Pages.
 * Mobile-first, Bottom-Nav, Toast, Bestätigungs-Dialoge.
 */
(function () {
  "use strict";
  var CFG = window.LEGENDE_CONFIG || {};
  var LA = window.BookingWidget ? window.BookingWidget.LocalAdapter : null;
  var WD = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  var DEMO_PW = "legende"; // nur Demo-Modus — im Echtbetrieb zählt der Supabase-Login

  var app = document.getElementById("admin");
  var toastEl = document.getElementById("toast");
  var MODE = "local", sb = null, config = null, tab = "commandes", filter = "avenir";

  function H(t, a, k) { var e = document.createElement(t); for (var x in (a || {})) { if (x === "class") e.className = a[x]; else if (x === "html") e.innerHTML = a[x]; else if (x.indexOf("on") === 0) e.addEventListener(x.slice(2), a[x]); else if (a[x] != null) e.setAttribute(x, a[x]); } (k || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return e; }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); setTimeout(function () { toastEl.classList.remove("show"); }, 1800); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function fmt(d) { try { return new Date(d + "T00:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" }); } catch (e) { return d; } }
  function locName(id) { var l = (config.locations || []).find(function (x) { return x.id === id; }); return l ? l.name + (l.place ? " · " + l.place : "") : (id || "—"); }

  // ---- Modus + Auth --------------------------------------------------------
  function initMode() {
    var s = CFG.supabase || {};
    if (s.url && s.anonKey && window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(s.url, s.anonKey); MODE = "supabase"; return; } catch (e) { /* Fallback */ }
    }
    MODE = "local"; if (LA) LA.seed(CFG);
  }

  function gate() {
    app.innerHTML = "";
    var box = H("div", { class: "ad__gate" }, [H("div", { class: "ad__logo" }, ["La Légende"]), H("h1", {}, ["Espace admin"])]);
    if (MODE === "supabase") {
      var email = H("input", { class: "ad__in", type: "email", placeholder: "E-mail" });
      var pw = H("input", { class: "ad__in", type: "password", placeholder: "Mot de passe" });
      var btn = H("button", { class: "ad__btn ad__btn--red", onclick: function () {
        sb.auth.signInWithPassword({ email: email.value, password: pw.value }).then(function (r) {
          if (r.error) toast("Connexion refusée"); else start();
        });
      } }, ["Se connecter"]);
      box.appendChild(email); box.appendChild(pw); box.appendChild(btn);
      box.appendChild(H("p", { class: "ad__hint" }, ["Compte opérateur Supabase. Créez-le dans Supabase → Authentication."]));
      pw.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    } else {
      var inp = H("input", { class: "ad__in", type: "password", placeholder: "Mot de passe (démo : legende)" });
      var b2 = H("button", { class: "ad__btn ad__btn--red", onclick: function () { if (inp.value === DEMO_PW) start(); else toast("Mot de passe incorrect"); } }, ["Entrer"]);
      box.appendChild(inp); box.appendChild(b2);
      box.appendChild(H("p", { class: "ad__hint" }, ["Mode démonstration (localStorage). En production : login Supabase de l'opérateur."]));
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && inp.value === DEMO_PW) start(); });
    }
    app.appendChild(box);
  }

  function start() {
    loadConfig().then(function (c) { config = c || {}; render(); });
  }
  function loadConfig() {
    if (MODE === "supabase") return sb.rpc("get_booking_config").then(function (r) { return r.data; });
    return LA.getConfig();
  }
  function saveLocalConfig() { if (MODE === "local") LA.saveConfig(config); }

  // ---- Datenzugriff --------------------------------------------------------
  function loadBookings() {
    if (MODE === "supabase") return sb.from("bookings").select("*").order("booking_date").order("start_time").then(function (r) { return (r.data || []).map(norm); });
    var all = JSON.parse(localStorage.getItem(LA._bKey) || "[]");
    return Promise.resolve(all.map(norm));
  }
  function norm(b) {
    return {
      id: b.id,
      date: b.booking_date || b.date,
      time: (b.start_time ? String(b.start_time).slice(0, 5) : b.start) || "",
      locId: b.location_id || b.locationId,
      party: b.party_size != null ? b.party_size : b.partySize,
      items: b.items || [],
      name: b.customer_name || b.customerName,
      email: b.customer_email || b.customerEmail,
      phone: b.customer_phone || b.customerPhone,
      notes: b.notes,
      status: b.status
    };
  }
  function setBookingStatus(id, status) {
    if (MODE === "supabase") return sb.from("bookings").update({ status: status }).eq("id", id).then(function () { toast("Mis à jour"); });
    var all = JSON.parse(localStorage.getItem(LA._bKey) || "[]");
    var b = all.find(function (x) { return x.id === id; }); if (b) b.status = status;
    localStorage.setItem(LA._bKey, JSON.stringify(all)); toast("Mis à jour"); return Promise.resolve();
  }
  function loadEvents() {
    if (MODE === "supabase") return sb.from("event_requests").select("*").order("created_at", { ascending: false }).then(function (r) { return r.data || []; });
    return Promise.resolve(JSON.parse(localStorage.getItem("legende_events") || "[]"));
  }
  function setEventStatus(id, status) {
    if (MODE === "supabase") return sb.from("event_requests").update({ status: status }).eq("id", id).then(function () { toast("Mis à jour"); });
    toast("Démo : indisponible"); return Promise.resolve();
  }

  // ---- Rendering -----------------------------------------------------------
  function render() {
    app.innerHTML = "";
    app.appendChild(H("header", { class: "ad__top" }, [
      H("strong", {}, [config.businessName || "La Légende"]),
      H("div", { class: "ad__row" }, [
        H("span", { class: "ad__badge" + (MODE === "supabase" ? " ad__badge--live" : "") }, [MODE === "supabase" ? "Live" : "Démo"]),
        H("button", { class: "ad__logout", onclick: logout }, ["Quitter"])
      ])
    ]));
    var view = H("main", { class: "ad__view" });
    if (tab === "commandes") viewCommandes(view);
    if (tab === "evenements") viewEvenements(view);
    if (tab === "carte") viewCarte(view);
    if (tab === "tournee") viewTournee(view);
    if (tab === "reglages") viewReglages(view);
    app.appendChild(view);
    app.appendChild(nav());
  }

  function nav() {
    var items = [["commandes", "Commandes"], ["evenements", "Événements"], ["carte", "Carte"], ["tournee", "Tournée"], ["reglages", "Réglages"]];
    return H("nav", { class: "ad__nav" }, items.map(function (it) {
      return H("button", { class: "ad__navbtn" + (tab === it[0] ? " is-active" : ""), onclick: function () { tab = it[0]; render(); } }, [it[1]]);
    }));
  }

  function logout() {
    if (MODE === "supabase" && sb) sb.auth.signOut();
    gate();
  }

  // ---- Commandes -----------------------------------------------------------
  function viewCommandes(v) {
    v.appendChild(H("h2", {}, ["Commandes"]));
    var filters = [["avenir", "À venir"], ["today", "Aujourd'hui"], ["all", "Toutes"], ["cancelled", "Annulées"]];
    v.appendChild(H("div", { class: "ad__filters" }, filters.map(function (f) {
      return H("button", { class: "ad__filter" + (filter === f[0] ? " is-active" : ""), onclick: function () { filter = f[0]; render(); } }, [f[1]]);
    })));
    var list = H("div", { class: "ad__view", style: "padding:0;gap:12px" });
    v.appendChild(list);
    loadBookings().then(function (all) {
      var td = today();
      var rows = all.filter(function (b) {
        if (filter === "today") return b.date === td && b.status !== "cancelled" && b.status !== "declined";
        if (filter === "cancelled") return b.status === "cancelled" || b.status === "declined";
        if (filter === "avenir") return b.date >= td && (b.status === "pending" || b.status === "confirmed");
        return true;
      }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
      if (!rows.length) { list.appendChild(H("p", { class: "ad__muted" }, ["Aucune commande ici pour l'instant."])); return; }
      rows.forEach(function (b) {
        var items = (b.items || []).map(function (it) { return H("li", {}, ["• " + it.qty + "× " + (it.name || it.id)]); });
        list.appendChild(H("div", { class: "ad__card" }, [
          H("div", { class: "ad__cardhead" }, [H("span", {}, [fmt(b.date) + " · " + b.time]), H("span", { class: "ad__status ad__status--" + b.status }, [b.status])]),
          H("div", { class: "ad__cardbody" }, [
            H("strong", {}, [locName(b.locId)]), H("br"),
            (b.party != null ? b.party + " pizza(s) · " : ""),
            H("ul", { class: "ad__items" }, items),
            H("small", {}, [(b.name || "") + " · " + (b.email || "") + (b.phone ? " · " + b.phone : "")]),
            b.notes ? H("div", {}, [H("small", {}, ["Remarque : " + b.notes])]) : H("span")
          ]),
          H("div", { class: "ad__cardfoot" }, [
            b.status === "pending" ? H("button", { class: "ad__chip ad__chip--ok", onclick: function () { setBookingStatus(b.id, "confirmed").then(render); } }, ["Confirmer"]) : H("span"),
            b.status === "pending" ? H("button", { class: "ad__chip", onclick: function () { setBookingStatus(b.id, "declined").then(render); } }, ["Refuser"]) : H("span"),
            (b.status !== "cancelled" && b.status !== "declined") ? H("button", { class: "ad__chip ad__chip--red", onclick: function () { if (confirm("Annuler cette commande ?")) setBookingStatus(b.id, "cancelled").then(render); } }, ["Annuler"]) : H("span")
          ])
        ]));
      });
    });
  }

  // ---- Événements ----------------------------------------------------------
  function viewEvenements(v) {
    v.appendChild(H("h2", {}, ["Demandes de devis"]));
    var list = H("div", { style: "display:grid;gap:12px" }); v.appendChild(list);
    loadEvents().then(function (rows) {
      if (!rows.length) { list.appendChild(H("p", { class: "ad__muted" }, [MODE === "supabase" ? "Aucune demande pour l'instant." : "En mode démo, les demandes de devis ne sont pas stockées (envoi par e-mail)."])); return; }
      rows.forEach(function (e) {
        list.appendChild(H("div", { class: "ad__card" }, [
          H("div", { class: "ad__cardhead" }, [H("span", {}, [e.event_type || "Événement"]), H("span", { class: "ad__status ad__status--" + (e.status || "new") }, [e.status || "new"])]),
          H("div", { class: "ad__cardbody" }, [
            H("strong", {}, [e.name]), H("br"),
            (e.event_date ? "Date : " + e.event_date + "  ·  " : "") + (e.guests ? e.guests + " invités" : ""), H("br"),
            (e.place ? "Lieu : " + e.place : ""), H("br"),
            H("small", {}, [(e.email || "") + (e.phone ? " · " + e.phone : "")]),
            e.message ? H("div", {}, [H("small", {}, [e.message])]) : H("span")
          ]),
          H("div", { class: "ad__cardfoot" }, [
            H("button", { class: "ad__chip", onclick: function () { setEventStatus(e.id, "quoted").then(render); } }, ["Devis envoyé"]),
            H("button", { class: "ad__chip ad__chip--ok", onclick: function () { setEventStatus(e.id, "won").then(render); } }, ["Gagné"]),
            H("button", { class: "ad__chip ad__chip--red", onclick: function () { setEventStatus(e.id, "lost").then(render); } }, ["Perdu"])
          ])
        ]));
      });
    });
  }

  // ---- Carte ---------------------------------------------------------------
  function viewCarte(v) {
    v.appendChild(H("h2", {}, ["Carte & prix"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Renseignez les prix par article. Ils apparaissent sur la page « La carte »."]));
    var menu = config.menu || { products: [] };
    (menu.products || []).forEach(function (p) {
      var name = H("input", { class: "ad__in", value: (p.name && (p.name.fr || p.name)) || "", placeholder: "Nom" });
      var price = H("input", { class: "ad__in ad__in--s", type: "number", step: "0.5", value: p.price != null ? p.price : "", placeholder: "Prix CHF" });
      function saveP() {
        var newName = name.value, newPrice = price.value === "" ? null : Number(price.value);
        if (MODE === "supabase") {
          sb.from("products").update({ name_fr: newName, price: newPrice }).eq("id", p.id).then(function () { toast("Enregistré"); });
        } else {
          if (p.name && typeof p.name === "object") p.name.fr = newName; else p.name = { fr: newName, de: newName };
          p.price = newPrice; saveLocalConfig(); toast("Enregistré");
        }
      }
      name.addEventListener("change", saveP); price.addEventListener("change", saveP);
      v.appendChild(H("div", { class: "ad__card" }, [ H("div", { class: "ad__grid2" }, [name, price]) ]));
    });
  }

  // ---- Tournée (heures par étape) ------------------------------------------
  function viewTournee(v) {
    v.appendChild(H("h2", {}, ["Tournée — horaires"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Format : 18:15-20:00. Vide = pas de service ce jour-là."]));
    (config.locations || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).forEach(function (l) {
      var wd = Object.keys(l.hours || {})[0];
      var val = wd ? (l.hours[wd] || []).map(function (iv) { return iv.start + "-" + iv.end; }).join(", ") : "";
      var inp = H("input", { class: "ad__in", value: val, placeholder: "18:15-20:00" });
      inp.addEventListener("change", function () {
        var ivs = inp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (p) { var a = p.split("-"); return { start: (a[0] || "").trim(), end: (a[1] || "").trim() }; });
        saveLocationHours(l, wd, ivs);
      });
      v.appendChild(H("div", { class: "ad__card" }, [
        H("div", { class: "ad__cardhead" }, [H("span", {}, [l.name]), H("span", { class: "ad__badge" }, [(l.weekdayLabel && (l.weekdayLabel.fr || l.weekdayLabel)) + " · " + (l.service || "")])]),
        H("div", { class: "ad__cardbody" }, [l.place || ""]),
        inp
      ]));
    });
  }
  function saveLocationHours(l, wd, ivs) {
    if (!wd) { toast("Jour non défini"); return; }
    if (MODE === "supabase") {
      sb.from("availability_rules").delete().eq("scope", "location").eq("location_id", l.id).eq("weekday", Number(wd)).then(function () {
        if (!ivs.length) { toast("Enregistré"); return; }
        var rows = ivs.map(function (iv) { return { scope: "location", location_id: l.id, weekday: Number(wd), start_time: iv.start, end_time: iv.end }; });
        sb.from("availability_rules").insert(rows).then(function () { toast("Enregistré"); });
      });
    } else {
      if (ivs.length) l.hours[wd] = ivs; else delete l.hours[wd];
      saveLocalConfig(); toast("Enregistré");
    }
  }

  // ---- Réglages (modules, règles, capacité) --------------------------------
  function viewReglages(v) {
    v.appendChild(H("h2", {}, ["Capacité du four"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Nombre de pizzas réalisables par créneau de 15 min."]));
    var svc = (config.services || [{}])[0];
    var cap = H("input", { class: "ad__in ad__in--s", type: "number", min: "1", value: svc.capacity != null ? svc.capacity : 8 });
    cap.addEventListener("change", function () {
      var val = Number(cap.value) || 1;
      if (MODE === "supabase") sb.from("services").update({ capacity: val }).eq("id", svc.id).then(function () { toast("Enregistré"); });
      else { svc.capacity = val; saveLocalConfig(); toast("Enregistré"); }
    });
    v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, ["Pizzas / créneau"]), cap]));

    v.appendChild(H("h2", { class: "ad__mt" }, ["Règles de commande"]));
    var b = config.booking = config.booking || {};
    numRow(v, "Délai mini (min)", "leadTimeMinutes");
    numRow(v, "Horizon (jours)", "bookingHorizonDays");
    numRow(v, "Créneau (min)", "slotGranularityMinutes");
    v.appendChild(H("label", { class: "ad__row ad__toggle" }, [H("span", {}, ["Confirmation automatique"]), toggle(!!b.autoConfirm, function (on) { b.autoConfirm = on; persistSettings(); })]));

    v.appendChild(H("h2", { class: "ad__mt" }, ["Modules"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Dans le doute, laissez désactivé — moins d'étapes, plus de commandes."]));
    var labels = { multiLocation: "Choix de l'étape", emailNotifications: "E-mails de confirmation", reminders: "Rappels", cancellation: "Annulation par le client", smsNotifications: "SMS (payant)", customerAccounts: "Comptes clients", onlinePayment: "Paiement en ligne (Stripe)" };
    var f = config.features = config.features || {};
    Object.keys(labels).forEach(function (key) {
      v.appendChild(H("label", { class: "ad__row ad__toggle" }, [H("span", {}, [labels[key]]), toggle(!!f[key], function (on) { f[key] = on; persistSettings(); })]));
    });

    function numRow(v, label, key) {
      var inp = H("input", { class: "ad__in ad__in--s", type: "number", value: b[key] != null ? b[key] : "" });
      inp.addEventListener("change", function () { b[key] = inp.value === "" ? 0 : Number(inp.value); persistSettings(); });
      v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, [label]), inp]));
    }
  }
  function persistSettings() {
    if (MODE === "supabase") sb.from("settings").update({ feature_flags: config.features, booking: config.booking }).eq("id", true).then(function () { toast("Enregistré"); });
    else { saveLocalConfig(); toast("Enregistré"); }
  }

  function toggle(on, cb) {
    var t = H("button", { class: "ad__sw" + (on ? " is-on" : "") }, [H("span", { class: "ad__swdot" })]);
    t.addEventListener("click", function () { on = !on; t.classList.toggle("is-on", on); cb(on); });
    return t;
  }

  // ---- Boot ----------------------------------------------------------------
  initMode();
  if (MODE === "supabase") {
    sb.auth.getSession().then(function (r) { if (r.data && r.data.session) start(); else gate(); });
  } else {
    gate();
  }
})();
