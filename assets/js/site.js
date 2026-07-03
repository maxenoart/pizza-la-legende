/*
 * site.js — La Légende: Navigation, Sprachumschalter (FR/DE), Scroll-Reveal,
 * dynamische Tournée- & Karten-Anzeige (aus config.js) und Widget-Mounting.
 * FR ist die Inline-Standardsprache; DE-Texte stehen in data-de-Attributen.
 */
(function () {
  "use strict";
  var CONFIG = window.LEGENDE_CONFIG || {};
  var LANG_KEY = "legende_lang";

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  // ---- Sprachumschalter ----------------------------------------------------
  function currentLang() { return localStorage.getItem(LANG_KEY) || "fr"; }

  function applyLang(lang) {
    var root = document.documentElement;
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    localStorage.setItem(LANG_KEY, lang);

    $all("[data-de]").forEach(function (el) {
      if (el.__fr === undefined) el.__fr = el.textContent;
      el.textContent = (lang === "de") ? el.getAttribute("data-de") : el.__fr;
    });
    $all("[data-de-html]").forEach(function (el) {
      if (el.__frh === undefined) el.__frh = el.innerHTML;
      el.innerHTML = (lang === "de") ? el.getAttribute("data-de-html") : el.__frh;
    });
    $all("[data-ph-de]").forEach(function (el) {
      if (el.__phfr === undefined) el.__phfr = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", (lang === "de") ? el.getAttribute("data-ph-de") : el.__phfr);
    });

    $all(".langsw button").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-lang") === lang); });

    renderTour(lang);
    renderMenu(lang);
    if (window.__mountBookingWidget) window.__mountBookingWidget(lang);
    document.dispatchEvent(new CustomEvent("legende:lang", { detail: { lang: lang } }));
  }

  function initLangSwitch() {
    $all(".langsw button").forEach(function (b) {
      b.addEventListener("click", function () { applyLang(b.getAttribute("data-lang")); });
    });
  }

  // ---- Navigation (mobil) --------------------------------------------------
  function initNav() {
    var burger = $(".nav__burger"), menu = $(".nav__mobile");
    if (!burger || !menu) return;
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    $all("a", menu).forEach(function (a) { a.addEventListener("click", function () { menu.classList.remove("is-open"); document.body.style.overflow = ""; }); });
  }

  // ---- Scroll-Reveal -------------------------------------------------------
  function initReveal() {
    var els = $all(".reveal");
    if (!("IntersectionObserver" in window) || !els.length) { els.forEach(function (e) { e.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
  }

  // ---- Tournée dynamisch ---------------------------------------------------
  function renderTour(lang) {
    var grid = $("#tour-grid"); if (!grid) return;
    var svcLabel = { midi: { fr: "midi", de: "Mittag" }, soir: { fr: "soir", de: "Abend" } };
    var locs = (CONFIG.locations || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    grid.innerHTML = "";
    locs.forEach(function (l) {
      var hrs = (l.hours[Object.keys(l.hours)[0]] || [{}])[0];
      var stop = document.createElement("a");
      stop.className = "tour__stop";
      stop.href = "commander.html";
      stop.innerHTML =
        '<span class="tour__stopL">' +
          '<span class="tour__day">' + (l.weekdayLabel[lang] || l.weekdayLabel.fr) + "</span>" +
          '<span class="tour__place">' + l.name + "</span>" +
          '<span class="tour__spot">' + l.place + "</span>" +
        "</span>" +
        '<span class="tour__stopR">' +
          '<span class="tour__time">' + (hrs ? hrs.start + "–" + hrs.end : "") + "</span>" +
          '<span class="tour__svc">' + (svcLabel[l.service] ? svcLabel[l.service][lang] : "") + "</span>" +
        "</span>";
      grid.appendChild(stop);
    });
  }

  // ---- Karte dynamisch (Seite carte.html) ----------------------------------
  function renderMenu(lang) {
    var rootEl = $("#menu-root"); if (!rootEl || !CONFIG.menu) return;
    var tag = { vegan: { fr: "vegan", de: "vegan" }, veggie: { fr: "végé", de: "veggie" }, signature: { fr: "signature", de: "Signature" }, new: { fr: "nouveau", de: "neu" } };
    var priceFromLbl = { fr: "dès CHF " + CONFIG.menu.priceFrom + ".–", de: "ab CHF " + CONFIG.menu.priceFrom + ".–" };
    rootEl.innerHTML = "";
    (CONFIG.menu.categories || []).forEach(function (cat) {
      var prods = (CONFIG.menu.products || []).filter(function (p) { return p.cat === cat.id; });
      if (!prods.length) return;
      var wrap = document.createElement("div");
      wrap.className = "menu-cat reveal";
      var meta = (cat.id === "signature" || cat.id === "classiques" || cat.id === "rotation" || cat.id === "vegan")
        ? '<span class="menu-cat__meta">' + priceFromLbl[lang] + "</span>" : "";
      var items = prods.map(function (p) {
        var chips = (p.tags || []).filter(function (x) { return tag[x]; }).map(function (x) {
          return '<span class="chip chip--' + x + '">' + tag[x][lang] + "</span>";
        }).join("");
        var desc = (p.desc && (p.desc[lang] || p.desc.fr)) ? '<p class="menu-item__desc">' + (p.desc[lang] || p.desc.fr) + "</p>" : "";
        var allerg = (p.allergens && p.allergens.length) ? '<p class="menu-item__allerg">' + (lang === "de" ? "Allergene: " : "Allergènes : ") + p.allergens.join(", ") + "</p>" : "";
        var price = (p.price != null && p.price !== "") ? '<span class="menu-item__price">CHF ' + p.price + "</span>" : "";
        return '<div class="menu-item"><div class="menu-item__name">' + (p.name[lang] || p.name.fr) + chips + price + "</div>" + desc + allerg + "</div>";
      }).join("");
      wrap.innerHTML =
        '<div class="menu-cat__head"><span class="menu-cat__title">' + (cat.name[lang] || cat.name.fr) + "</span>" + meta + "</div>" +
        '<div class="menu-items">' + items + "</div>";
      rootEl.appendChild(wrap);
    });
    initReveal();
  }

  // ---- Footer Jahr ---------------------------------------------------------
  function initYear() { $all("[data-year]").forEach(function (e) { e.textContent = new Date().getFullYear(); }); }

  // ---- Sticky Mobile-CTA (nicht auf der Bestellseite) ----------------------
  function initStickyCta() {
    if (document.getElementById("book-widget") || !$(".nav") || $(".stickycta")) return;
    var bar = document.createElement("div"); bar.className = "stickycta";
    var a = document.createElement("a"); a.href = "commander.html";
    a.setAttribute("data-de", "Commander maintenant"); a.textContent = "Commander maintenant";
    bar.appendChild(a); document.body.appendChild(bar);
  }

  ready(function () {
    initNav();
    initLangSwitch();
    initYear();
    initStickyCta();
    applyLang(currentLang());   // rendert Tournée/Karte + setzt Sprache
    initReveal();
  });
})();
