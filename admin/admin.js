/*
 * admin.js — Admin-Panel La Légende (FR).
 * Zwei Betriebsmodi, automatisch gewählt:
 *   • SUPABASE  — wenn env.js Zugangsdaten setzt: echter Betrieb, Betreiber-Login
 *     (E-Mail/Passwort via Supabase Auth), Lese-/Schreibzugriff.
 *   • DEMO      — sonst: localStorage (teilt sich die Daten mit dem Widget),
 *     einfaches Passwort-Gate.
 *
 * Bestell-Panel = kompakte Session-Liste des Tages/Standorts: jede Zeile ist ein
 * Zeitfenster (Session) mit Bestellung, Pause-Blocker oder frei. Der Kopf zeigt
 * Tag/Ort/Service (midi/soir je nach Uhrzeit). Rechts: Erledigt / Nicht erschienen.
 */
(function () {
  "use strict";
  var CFG = window.LEGENDE_CONFIG || {};
  var LA = window.BookingWidget ? window.BookingWidget.LocalAdapter : null;
  var E = window.BookingEngine;
  var WD = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  var DEMO_PW = "legende";
  var PAUSE = "__PAUSE__";

  var PIZZA_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
    '<rect width="40" height="40" rx="9" fill="#261E17"/>' +
    '<path d="M20 8 L31 29 Q20 34 9 29 Z" fill="#F6F1E9"/>' +
    '<path d="M9 29 Q20 34 31 29" fill="none" stroke="#594736" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="17" cy="19" r="2" fill="#E2073B"/><circle cx="23" cy="22" r="2" fill="#E2073B"/><circle cx="19" cy="26" r="1.8" fill="#4f6b1e"/>' +
    '</svg>');

  var app = document.getElementById("admin");
  var toastEl = document.getElementById("toast");
  var MODE = "local", sb = null, config = null, tab = "commandes";
  var ctx = { date: null, locId: null };

  function H(t, a, k) { var e = document.createElement(t); for (var x in (a || {})) { if (x === "class") e.className = a[x]; else if (x === "html") e.innerHTML = a[x]; else if (x.indexOf("on") === 0) e.addEventListener(x.slice(2), a[x]); else if (a[x] != null) e.setAttribute(x, a[x]); } (k || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return e; }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); setTimeout(function () { toastEl.classList.remove("show"); }, 1800); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function wdOf(dateStr) { return new Date(dateStr + "T00:00:00").getDay(); }
  function fmtDay(d) { try { return new Date(d + "T00:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long" }); } catch (e) { return d; } }
  function loc(id) { return (config.locations || []).find(function (l) { return l.id === id; }) || {}; }
  function media() { return (window.LEGENDE_CONFIG && window.LEGENDE_CONFIG.media) || {}; }
  function productById(id) { return ((config.menu && config.menu.products) || []).find(function (p) { return p.id === id; }); }
  function itemName(it) { var p = productById(it.id); return it.name || (p && (p.name.fr || p.name)) || it.id; }
  function itemsSummary(items) { return (items || []).map(function (it) { return it.qty + "× " + itemName(it); }).join(" · "); }
  function firstImg(items) {
    var m = media(); var it = (items || [])[0]; if (!it) return PIZZA_SVG;
    if (it.id === "p_legende" && m.pizzaLegende) return m.pizzaLegende;
    if (it.id === "p_botanica" && m.pizzaBotanica) return m.pizzaBotanica;
    var p = productById(it.id); if (p && p.image) return p.image;
    return PIZZA_SVG;
  }

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
        sb.auth.signInWithPassword({ email: email.value, password: pw.value }).then(function (r) { if (r.error) toast("Connexion refusée"); else start(); });
      } }, ["Se connecter"]);
      box.appendChild(email); box.appendChild(pw); box.appendChild(btn);
      box.appendChild(H("p", { class: "ad__hint" }, ["Compte opérateur Supabase (Authentication → Users)."]));
      pw.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    } else {
      var inp = H("input", { class: "ad__in", type: "password", placeholder: "Mot de passe (démo : legende)" });
      var b2 = H("button", { class: "ad__btn ad__btn--red", onclick: function () { if (inp.value === DEMO_PW) start(); else toast("Mot de passe incorrect"); } }, ["Entrer"]);
      box.appendChild(inp); box.appendChild(b2);
      box.appendChild(H("p", { class: "ad__hint" }, ["Mode démonstration (localStorage)."]));
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && inp.value === DEMO_PW) start(); });
    }
    app.appendChild(box);
  }

  function start() { loadConfig().then(function (c) { config = c || {}; if (!ctx.date) ctx.date = today(); render(); }); }
  function loadConfig() { return MODE === "supabase" ? sb.rpc("get_booking_config").then(function (r) { return r.data; }) : LA.getConfig(); }
  function saveLocalConfig() { if (MODE === "local") LA.saveConfig(config); }

  // ---- Datenzugriff --------------------------------------------------------
  function loadBookings() {
    if (MODE === "supabase") return sb.from("bookings").select("*").order("booking_date").order("start_time").then(function (r) { return (r.data || []).map(norm); });
    return Promise.resolve(JSON.parse(localStorage.getItem(LA._bKey) || "[]").map(norm));
  }
  function norm(b) {
    return {
      id: b.id, date: b.booking_date || b.date,
      time: (b.start_time ? String(b.start_time).slice(0, 5) : b.start) || "",
      locId: b.location_id || b.locationId,
      items: b.items || [], name: b.customer_name || b.customerName,
      email: b.customer_email || b.customerEmail, phone: b.customer_phone || b.customerPhone,
      notes: b.notes, status: b.status, pause: (b.notes === PAUSE)
    };
  }
  function setStatus(id, status) {
    if (MODE === "supabase") return sb.from("bookings").update({ status: status }).eq("id", id).then(function () { toast("Mis à jour"); });
    var all = JSON.parse(localStorage.getItem(LA._bKey) || "[]");
    var b = all.find(function (x) { return x.id === id; }); if (b) b.status = status;
    localStorage.setItem(LA._bKey, JSON.stringify(all)); toast("Mis à jour"); return Promise.resolve();
  }
  function createBlocker(t) {
    var svc = (config.services || [{}])[0];
    var end = E._util.toHHMM(E._util.toMin(t) + (svc.durationMinutes || 10));
    if (MODE === "supabase") {
      return sb.from("bookings").insert({
        service_id: svc.id, location_id: ctx.locId, customer_name: "Pause", customer_email: "pause@legende.local",
        booking_date: ctx.date, start_time: t, end_time: end, party_size: 0, items: null, notes: PAUSE, status: "confirmed"
      }).then(function (r) { if (r.error) toast(r.error.message); else toast("Pause ajoutée"); });
    }
    var all = JSON.parse(localStorage.getItem(LA._bKey) || "[]");
    all.push({ id: "b_" + Date.now(), serviceId: svc.id, locationId: ctx.locId, customerName: "Pause", date: ctx.date, start: t, end: end, partySize: 0, items: [], notes: PAUSE, status: "confirmed" });
    localStorage.setItem(LA._bKey, JSON.stringify(all)); toast("Pause ajoutée"); return Promise.resolve();
  }
  function loadEvents() {
    if (MODE === "supabase") return sb.from("event_requests").select("*").order("created_at", { ascending: false }).then(function (r) { return r.data || []; });
    return Promise.resolve([]);
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
  function logout() { if (MODE === "supabase" && sb) sb.auth.signOut(); gate(); }

  // ---- Bestell-Panel (Session-Liste) --------------------------------------
  function todaysStops(dateStr) {
    var wd = wdOf(dateStr);
    return (config.locations || []).filter(function (l) { return Object.keys(l.hours || {}).map(Number).indexOf(wd) >= 0; });
  }
  function defaultLoc(dateStr) {
    var stops = todaysStops(dateStr);
    if (!stops.length) return (config.locations || [{}])[0].id;
    var svc = (new Date()).getHours() < 15 ? "midi" : "soir";
    var pick = stops.find(function (s) { return s.service === svc; });
    return (pick || stops[0]).id;
  }

  function viewCommandes(v) {
    if (!ctx.locId || (loc(ctx.locId).id !== ctx.locId)) ctx.locId = defaultLoc(ctx.date);
    var stops = todaysStops(ctx.date);
    var options = (stops.length ? stops : (config.locations || [])).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    var cur = loc(ctx.locId);
    var hrs = (cur.hours && cur.hours[Object.keys(cur.hours)[0]] || [{}])[0];

    // Kopf: Datum + Standort + Zeiten
    var dateInp = H("input", { class: "oc__date", type: "date", value: ctx.date });
    dateInp.addEventListener("change", function () { ctx.date = dateInp.value; ctx.locId = defaultLoc(ctx.date); render(); });
    var sel = H("select", { class: "oc__sel" }, options.map(function (l) {
      return H("option", { value: l.id, selected: l.id === ctx.locId ? "selected" : null }, [l.name + (l.service ? " · " + (l.service === "midi" ? "midi" : "soir") : "")]);
    }));
    sel.addEventListener("change", function () { ctx.locId = sel.value; render(); });

    v.appendChild(H("div", { class: "oc__head" }, [
      H("div", { class: "oc__headtop" }, [dateInp, sel]),
      H("div", { class: "oc__headsub" }, [
        H("span", { class: "oc__place" }, [cur.name || "—", cur.place ? H("span", { class: "oc__spot" }, [" · " + cur.place]) : H("span")]),
        H("span", { class: "oc__hrs" }, [hrs ? (hrs.start + "–" + hrs.end) : "—"])
      ])
    ]));

    var list = H("div", { class: "oc__list" }); v.appendChild(list);
    var doneWrap = H("div", {}); v.appendChild(doneWrap);
    list.appendChild(H("p", { class: "ad__muted" }, ["Chargement…"]));

    loadBookings().then(function (all) {
      list.innerHTML = "";
      var mine = all.filter(function (b) { return b.date === ctx.date && b.locId === ctx.locId; });
      var active = mine.filter(function (b) { return b.status === "pending" || b.status === "confirmed"; });
      var byTime = {}; active.forEach(function (b) { byTime[b.time] = b; });

      var grid = (E ? E.daySlots(config, { date: ctx.date, serviceId: (config.services || [{}])[0].id, locationId: ctx.locId }) : []).map(function (s) { return s.start; });
      var times = grid.slice();
      Object.keys(byTime).forEach(function (t) { if (times.indexOf(t) < 0) times.push(t); });
      times.sort();

      if (!times.length) { list.appendChild(H("p", { class: "ad__muted" }, ["Pas de service à cette étape ce jour-là."])); }
      var dayShort = WD[wdOf(ctx.date)];
      times.forEach(function (t) {
        var b = byTime[t];
        if (!b) return list.appendChild(emptyRow(t));
        if (b.pause) return list.appendChild(pauseRow(b));
        list.appendChild(orderRow(b, dayShort, cur));
      });

      // Letzte 3 erledigte
      var done = mine.filter(function (b) { return b.status === "done"; }).sort(function (a, b) { return a.time.localeCompare(b.time); }).slice(-3);
      if (done.length) {
        doneWrap.appendChild(H("div", { class: "oc__donehead" }, ["Terminées"]));
        done.forEach(function (b) {
          doneWrap.appendChild(H("div", { class: "oc__row oc__row--done" }, [
            H("img", { class: "oc__thumb", src: firstImg(b.items), alt: "" }),
            H("div", { class: "oc__mid" }, [H("div", { class: "oc__line1" }, [H("b", { class: "oc__time" }, [b.time]), H("span", { class: "oc__name" }, [b.name || ""])]), H("div", { class: "oc__items" }, [itemsSummary(b.items) || "—"])]),
            H("span", { class: "oc__doneflag" }, ["✓"])
          ]));
        });
      }
    });

    function orderRow(b, dayShort, cur) {
      return H("div", { class: "oc__row" }, [
        H("img", { class: "oc__thumb", src: firstImg(b.items), alt: "", onerror: function () { this.src = PIZZA_SVG; } }),
        H("div", { class: "oc__mid" }, [
          H("div", { class: "oc__line1" }, [
            H("b", { class: "oc__time" }, [b.time]),
            H("span", { class: "oc__name" }, [b.name || "—"]),
            b.phone ? H("a", { class: "oc__phone", href: "tel:" + String(b.phone).replace(/\s/g, "") }, [b.phone]) : H("span")
          ]),
          H("div", { class: "oc__items" }, [itemsSummary(b.items) || "—"]),
          H("div", { class: "oc__meta" }, [(cur.name || "") + " · " + dayShort]),
          b.notes && b.notes !== PAUSE ? H("div", { class: "oc__note" }, ["“" + b.notes + "”"]) : H("span")
        ]),
        H("div", { class: "oc__act" }, [
          H("button", { class: "oc__done", title: "Terminée", onclick: function () { setStatus(b.id, "done").then(render); } }, ["✓"]),
          H("button", { class: "oc__no", title: "Non venu", onclick: function () { if (confirm("Marquer « non venu » ?")) setStatus(b.id, "noshow").then(render); } }, ["✕"])
        ])
      ]);
    }
    function emptyRow(t) {
      return H("div", { class: "oc__row oc__row--empty" }, [
        H("b", { class: "oc__time" }, [t]),
        H("span", { class: "oc__free" }, ["libre"]),
        H("button", { class: "oc__pausebtn", onclick: function () { createBlocker(t).then(render); } }, ["+ Pause"])
      ]);
    }
    function pauseRow(b) {
      return H("div", { class: "oc__row oc__row--pause" }, [
        H("b", { class: "oc__time" }, [b.time]),
        H("span", { class: "oc__pausetag" }, ["⏸ Pause"]),
        H("button", { class: "oc__no", title: "Retirer la pause", onclick: function () { setStatus(b.id, "cancelled").then(render); } }, ["✕"])
      ]);
    }
  }

  // ---- Événements ----------------------------------------------------------
  function viewEvenements(v) {
    v.appendChild(H("h2", {}, ["Demandes de devis"]));
    var list = H("div", { style: "display:grid;gap:12px" }); v.appendChild(list);
    loadEvents().then(function (rows) {
      if (!rows.length) { list.appendChild(H("p", { class: "ad__muted" }, [MODE === "supabase" ? "Aucune demande pour l'instant." : "En mode démo, les demandes ne sont pas stockées."])); return; }
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
    ((config.menu || {}).products || []).forEach(function (p) {
      var name = H("input", { class: "ad__in", value: (p.name && (p.name.fr || p.name)) || "", placeholder: "Nom" });
      var price = H("input", { class: "ad__in ad__in--s", type: "number", step: "0.5", value: p.price != null ? p.price : "", placeholder: "Prix CHF" });
      function saveP() {
        var newName = name.value, newPrice = price.value === "" ? null : Number(price.value);
        if (MODE === "supabase") sb.from("products").update({ name_fr: newName, price: newPrice }).eq("id", p.id).then(function () { toast("Enregistré"); });
        else { if (p.name && typeof p.name === "object") p.name.fr = newName; else p.name = { fr: newName, de: newName }; p.price = newPrice; saveLocalConfig(); toast("Enregistré"); }
      }
      name.addEventListener("change", saveP); price.addEventListener("change", saveP);
      v.appendChild(H("div", { class: "ad__card" }, [H("div", { class: "ad__grid2" }, [name, price])]));
    });
  }

  // ---- Tournée -------------------------------------------------------------
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
        H("div", { class: "ad__cardbody" }, [l.place || ""]), inp
      ]));
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

  // ---- Réglages (Sessions & règles) ----------------------------------------
  function viewReglages(v) {
    var svc = (config.services || [{}])[0];
    var b = config.booking = config.booking || {};

    v.appendChild(H("h2", {}, ["Durée d'une session"]));
    v.appendChild(H("p", { class: "ad__muted" }, ["Temps pour préparer une commande. Les créneaux proposés au client sont espacés de : durée + transition."]));
    var dur = H("input", { class: "ad__in ad__in--s", type: "number", min: "1", value: svc.durationMinutes != null ? svc.durationMinutes : 10 });
    var tr = H("input", { class: "ad__in ad__in--s", type: "number", min: "0", value: svc.bufferAfterMinutes != null ? svc.bufferAfterMinutes : 5 });
    function saveSession() {
      var d = Number(dur.value) || 1, t = Number(tr.value) || 0;
      svc.durationMinutes = d; svc.bufferAfterMinutes = t; b.slotGranularityMinutes = d + t;
      if (MODE === "supabase") {
        sb.from("services").update({ duration_minutes: d, buffer_after_min: t }).eq("id", svc.id).then(function () {
          sb.from("settings").update({ booking: b }).eq("id", true).then(function () { toast("Enregistré"); });
        });
      } else { saveLocalConfig(); toast("Enregistré"); }
    }
    dur.addEventListener("change", saveSession); tr.addEventListener("change", saveSession);
    v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, ["Durée session (min)"]), dur]));
    v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, ["Transition (min)"]), tr]));

    v.appendChild(H("h2", { class: "ad__mt" }, ["Règles de commande"]));
    numRow("Délai mini avant retrait (min)", "leadTimeMinutes");
    numRow("Réserver jusqu'à (jours)", "bookingHorizonDays");

    function numRow(label, key) {
      var inp = H("input", { class: "ad__in ad__in--s", type: "number", value: b[key] != null ? b[key] : "" });
      inp.addEventListener("change", function () {
        b[key] = inp.value === "" ? 0 : Number(inp.value);
        if (MODE === "supabase") sb.from("settings").update({ booking: b }).eq("id", true).then(function () { toast("Enregistré"); });
        else { saveLocalConfig(); toast("Enregistré"); }
      });
      v.appendChild(H("label", { class: "ad__row" }, [H("span", { class: "ad__wd" }, [label]), inp]));
    }
  }

  // ---- Boot ----------------------------------------------------------------
  initMode();
  if (MODE === "supabase") { sb.auth.getSession().then(function (r) { if (r.data && r.data.session) start(); else gate(); }); }
  else { gate(); }
})();
