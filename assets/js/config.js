/*
 * config.js — Einzige Wahrheit für Buchungssystem, Karte & Medien von La Légende.
 * ---------------------------------------------------------------------------
 * Wird sowohl vom Buchungs-Widget (Demo/LocalAdapter) als auch von den
 * Seiten (Tournée-Anzeige, Karte) gelesen. Im Echtbetrieb liefert Supabase
 * (get_booking_config) die Buchungs-Config; dieses Objekt bleibt die Referenz
 * und der Fallback für die statische GitHub-Pages-Demo.
 *
 * Muster: „Bestellung mit Zeitfenster" (Food Truck). Der Kunde wählt einen
 * Tournée-Standort → Tag → Abholfenster → Pizzen → Kontakt. Bezahlt wird vor
 * Ort (cash / TWINT). Kapazität = Pizzen, die der Ofen pro Fenster schafft.
 *
 * Weekdays: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
 */
(function () {
  "use strict";

  var ENV = (typeof window !== "undefined" && window.LEGENDE_ENV) || {};

  var CONFIG = {
    businessName: "La Légende",
    tagline: { fr: "Food Truck · Pizzeria itinérante", de: "Food Truck · Mobile Pizzeria" },
    since: 2019,
    locale: "fr-CH",
    timezone: "Europe/Zurich",

    contact: {
      phone: "079 369 10 36",
      phoneGrandval: "079 828 10 36",
      email: "info@pizzalegende.ch",
      whatsapp: "41793691036",
      instagram: "https://www.instagram.com/lalegende_foodtruck/",
      facebook: "https://m.facebook.com/foodtruckpizzalalegende/",
      linkedin: "https://www.linkedin.com/company/85852818/",
      payment: { fr: "Paiement cash favorisé · TWINT disponible", de: "Barzahlung bevorzugt · TWINT möglich" }
    },

    // Supabase-Anbindung (Stufe 2). Wird aus assets/js/env.js (gitignored) gesetzt.
    supabase: {
      url: ENV.supabaseUrl || "",
      anonKey: ENV.supabaseAnonKey || "",
      functionsUrl: ENV.functionsUrl || ""
    },

    // --- Buchungssystem ------------------------------------------------------
    features: {
      multiService: false,        // nur eine „Leistung": die Abholbestellung
      multiStaff: false,
      multiLocation: true,        // Kunde wählt zuerst den Tournée-Standort
      emailNotifications: true,
      smsNotifications: false,
      reminders: true,
      cancellation: true,
      waitlist: false,
      customerAccounts: false,
      onlinePayment: false,       // bewusst aus — bezahlt wird vor Ort (cash/TWINT)
      customForms: false
    },
    // Slot-pro-Pizza-Modell: ein Slot = eine Pizza. Eine Bestellung mit N Pizzen
    // belegt N aufeinanderfolgende Slots. Abholzeiten werden von jetzt an gelistet
    // (frei = wählbar, belegt = ausgegraut).
    booking: {
      slotPerItem: true,          // eine Pizza pro Slot, Mehrfachbestellung = Folge-Slots
      sameDayOnly: false,         // true = Kunde bestellt nur für heute (kein Tag-Schritt)
      transitionMin: 1,           // NUR Anzeige im Admin zwischen den Karten ("1 MIN")
      slotGranularityMinutes: 5,  // = Dauer pro Pizza (auto im Admin)
      leadTimeMinutes: 45,        // frühestens 45 Min im Voraus (Vorbereitung)
      bookingHorizonDays: 14,     // bis 2 Wochen im Voraus vorbestellbar
      cutoffMinutesBeforeSlot: 0,
      maxBookingsPerDay: null,
      autoConfirm: true
    },

    // Eine Leistung: die Bestellung zur Abholung.
    //   durationMinutes    = Dauer pro Pizza (ein Slot)
    //   bufferAfterMinutes = Übergangs-/Aufräumzeit am Ende einer Bestellung
    // Beide im Admin unter „Réglages" einstellbar.
    services: [
      { id: "commande", name: "Commande à retirer", durationMinutes: 5, bufferAfterMinutes: 0, capacity: 1, price: null }
    ],

    // --- La tournée : Standorte mit eigenen Öffnungszeiten -------------------
    // service: "midi" (11h30–12h45) oder "soir" (18h15–20h00)
    locations: [
      { id: "tramelan", name: "Tramelan",  place: "Fabien Bike Sàrl",            weekdayLabel: { fr: "Lundi",    de: "Montag" },     service: "soir", phone: "079 369 10 36", hours: { "1": [{ start: "18:15", end: "20:00" }] }, sort: 1 },
      { id: "bienne",   name: "Bienne",    place: "Swatch SA (devant le musée)", weekdayLabel: { fr: "Mardi",    de: "Dienstag" },   service: "midi", phone: "079 369 10 36", hours: { "2": [{ start: "11:30", end: "12:45" }] }, sort: 2 },
      { id: "corgemont",name: "Corgémont", place: "Place communale",             weekdayLabel: { fr: "Mardi",    de: "Dienstag" },   service: "soir", phone: "079 369 10 36", hours: { "2": [{ start: "18:15", end: "20:00" }] }, sort: 3 },
      { id: "sonceboz", name: "Sonceboz",  place: "Shop du Pierre-Pertuis",      weekdayLabel: { fr: "Mercredi", de: "Mittwoch" },   service: "midi", phone: "079 369 10 36", hours: { "3": [{ start: "11:30", end: "12:45" }] }, sort: 4 },
      { id: "pery",     name: "Péry",      place: "Place communale",             weekdayLabel: { fr: "Mercredi", de: "Mittwoch" },   service: "soir", phone: "079 369 10 36", hours: { "3": [{ start: "18:15", end: "20:00" }] }, sort: 5 },
      { id: "grandval", name: "Grandval",  place: "Fromagerie Au P'tit lait",    weekdayLabel: { fr: "Mercredi", de: "Mittwoch" },   service: "soir", phone: "079 828 10 36", hours: { "3": [{ start: "18:15", end: "20:00" }] }, sort: 6 },
      { id: "court",    name: "Court",     place: "Devant l'Ultra",              weekdayLabel: { fr: "Jeudi",    de: "Donnerstag" }, service: "soir", phone: "079 369 10 36", hours: { "4": [{ start: "18:15", end: "20:00" }] }, sort: 7 },
      { id: "preles",   name: "Prêles",    place: "Milieu du village",           weekdayLabel: { fr: "Vendredi", de: "Freitag" },    service: "soir", phone: "079 369 10 36", hours: { "5": [{ start: "18:15", end: "20:00" }] }, sort: 8 }
    ],
    weekendNote: { fr: "Week-end sur réservation", de: "Wochenende auf Reservation" },

    // --- La carte : produits -------------------------------------------------
    // Prix par article NON publiés (seul « dès CHF 13.– » est connu) → price:null,
    // à compléter dans l'admin. oven:true = compte dans la capacité du four.
    menu: {
      priceFrom: 13,
      categories: [
        { id: "signature",  name: { fr: "Les signatures",        de: "Signature-Pizzen" } },
        { id: "classiques", name: { fr: "Les classiques",        de: "Klassiker" } },
        { id: "rotation",   name: { fr: "En rotation",           de: "Wechselnd" } },
        { id: "vegan",      name: { fr: "Végétarien & vegan",    de: "Vegetarisch & vegan" } },
        { id: "autres",     name: { fr: "Calzone & petites faims",de: "Calzone & Kleines" } },
        { id: "apero",      name: { fr: "L'apéro à l'italienne", de: "Apéro auf Italienisch" } },
        { id: "desserts",   name: { fr: "Desserts maison",       de: "Hausgemachte Desserts" } },
        { id: "boissons",   name: { fr: "Boissons",              de: "Getränke" } }
      ],
      products: [
        { id: "p_legende",   cat: "signature", oven: true,  price: null, tags: ["signature"],
          name: { fr: "La Légende", de: "La Légende" },
          desc: { fr: "Sauce tomate, mozzarella, origan, roquette, tomates cerises, Grana Padano et jambon cru.",
                  de: "Tomatensauce, Mozzarella, Oregano, Rucola, Kirschtomaten, Grana Padano und Rohschinken." } },
        { id: "p_botanica",  cat: "signature", oven: true,  price: null, tags: ["vegan", "veggie"],
          name: { fr: "La Botanica", de: "La Botanica" },
          desc: { fr: "Notre signature végétale — fromage végan / sans lactose. Sublime avec un peu de roquette.",
                  de: "Unsere pflanzliche Signature — veganer / laktosefreier Käse. Grossartig mit etwas Rucola." } },

        { id: "p_margherita",cat: "classiques", oven: true, price: null, tags: ["veggie"],
          name: { fr: "Margherita", de: "Margherita" },
          desc: { fr: "Sauce tomate, mozzarella, basilic frais.", de: "Tomatensauce, Mozzarella, frisches Basilikum." } },
        { id: "p_marinara",  cat: "classiques", oven: true, price: null, tags: ["vegan", "veggie"],
          name: { fr: "Marinara", de: "Marinara" },
          desc: { fr: "Sauce tomate, ail, origan — la napolitaine originelle.", de: "Tomatensauce, Knoblauch, Oregano — die neapolitanische Urform." } },
        { id: "p_prosciutto",cat: "classiques", oven: true, price: null, tags: [],
          name: { fr: "Prosciutto", de: "Prosciutto" },
          desc: { fr: "Sauce tomate, mozzarella, jambon.", de: "Tomatensauce, Mozzarella, Schinken." } },
        { id: "p_hawaii",    cat: "classiques", oven: true, price: null, tags: [],
          name: { fr: "Hawaii", de: "Hawaii" },
          desc: { fr: "Sauce tomate, mozzarella, jambon, ananas.", de: "Tomatensauce, Mozzarella, Schinken, Ananas." } },

        { id: "p_delmomento",cat: "rotation", oven: true, price: null, tags: ["new"],
          name: { fr: "Del Momento", de: "Del Momento" },
          desc: { fr: "La création du moment du pizzaïolo. Demandez-la au camion !", de: "Die aktuelle Kreation des Pizzaiolo. Fragt am Truck danach!" } },
        { id: "p_saison",    cat: "rotation", oven: true, price: null, tags: ["new"],
          name: { fr: "De Saison", de: "Saisonal" },
          desc: { fr: "Ingrédients de saison choisis avec soin — truffe, asperges ou raclette selon le moment.", de: "Sorgfältig gewählte Saison-Zutaten — Trüffel, Spargel oder Raclette je nach Zeit." } },

        { id: "p_veggie",    cat: "vegan", oven: true, price: null, tags: ["veggie"],
          name: { fr: "Pizzas végétariennes", de: "Vegetarische Pizzen" },
          desc: { fr: "Légumes grillés, champignons, épinards, artichauts — au choix.", de: "Grillgemüse, Champignons, Spinat, Artischocken — nach Wahl." } },
        { id: "p_vegan",     cat: "vegan", oven: true, price: null, tags: ["vegan"],
          name: { fr: "Option vegan / sans lactose", de: "Vegan / laktosefrei" },
          desc: { fr: "La plupart de nos pizzas se déclinent avec un fromage végan / sans lactose.", de: "Die meisten Pizzen gibt es mit veganem / laktosefreiem Käse." } },

        { id: "p_calzone",   cat: "autres", oven: true, price: null, tags: [],
          name: { fr: "Calzone", de: "Calzone" },
          desc: { fr: "Pizza pliée cuite au feu de bois, garnie selon votre choix.", de: "Gefaltete Pizza aus dem Holzofen, nach Wahl gefüllt." } },
        { id: "p_mini",      cat: "autres", oven: true, price: null, tags: [],
          name: { fr: "Mini pizzas", de: "Mini-Pizzen" },
          desc: { fr: "Pour les enfants — ou pour goûter plusieurs saveurs.", de: "Für Kinder — oder um mehrere Sorten zu probieren." } },
        { id: "p_sucree",    cat: "autres", oven: true, price: null, tags: [],
          name: { fr: "Pizzas sucrées", de: "Süsse Pizzen" },
          desc: { fr: "Nutella ou caramel — la touche gourmande.", de: "Nutella oder Karamell — der süsse Abschluss." } },

        { id: "p_planche",   cat: "apero", oven: false, price: null, tags: [],
          name: { fr: "Planche apéro italienne", de: "Italienische Apéro-Platte" },
          desc: { fr: "Planche 100 % italienne à partager.", de: "100 % italienische Platte zum Teilen." } },
        { id: "p_bruschetta",cat: "apero", oven: true, price: null, tags: [],
          name: { fr: "Bruschettas maison", de: "Hausgemachte Bruschette" },
          desc: { fr: "Préparées par nos soins.", de: "Von uns frisch zubereitet." } },
        { id: "p_focaccia",  cat: "apero", oven: true, price: null, tags: [],
          name: { fr: "Focaccias maison", de: "Hausgemachte Focaccia" },
          desc: { fr: "Moelleuse, cuite au feu de bois.", de: "Fluffig, aus dem Holzofen." } },

        { id: "p_tira_classic", cat: "desserts", oven: false, price: null, tags: [],
          name: { fr: "Tiramisu classique", de: "Tiramisu klassisch" }, desc: { fr: "", de: "" } },
        { id: "p_tira_choco",   cat: "desserts", oven: false, price: null, tags: [],
          name: { fr: "Tiramisu chocolat", de: "Tiramisu Schokolade" }, desc: { fr: "", de: "" } },
        { id: "p_tira_pist",    cat: "desserts", oven: false, price: null, tags: [],
          name: { fr: "Tiramisu pistache", de: "Tiramisu Pistazie" }, desc: { fr: "", de: "" } },

        { id: "p_boissons", cat: "boissons", oven: false, price: null, tags: [],
          name: { fr: "Boissons & softs", de: "Getränke & Softdrinks" },
          desc: { fr: "Une sélection de boissons pour accompagner votre pizza.", de: "Eine Auswahl an Getränken zur Pizza." } }
      ]
    },

    // Références (événements) — logos = marques déposées, affichés en texte.
    references: ["Swatch", "Motorex", "Longines", "Breitling", "Bien-Air Dental", "Richard Mille", "Courvoisier Gassmann", "AS Ascenseurs", "Nivarox", "Générale Ressorts", "Swiss Timing"],

    // Médias — URLs d'origine (Wix, propriété du client). Remplacer par des
    // fichiers locaux dans assets/img/ (voir README). Fallback géré via onerror.
    media: {
      logo:        "https://static.wixstatic.com/media/9e0c2f_ec050c5e3be448278dd8dce628fa94fc~mv2.png/v1/fill/w_242,h_202,al_c,q_85,enc_auto/Logo%20La%20L%C3%A9gende.png",
      hero:        "https://static.wixstatic.com/media/9e0c2f_9978d2f153c34378adcb52f3c7b7288f~mv2.png/v1/fit/w_2500,h_1330,al_c/9e0c2f_9978d2f153c34378adcb52f3c7b7288f~mv2.png",
      truck:       "https://static.wixstatic.com/media/f68fd8_9d52cda48f534ef385d7d3ef9a1c264a~mv2.png/v1/fill/w_980,h_980,al_c,q_85,enc_auto/Foodtruck%20La%20L%C3%A9gende.png",
      pizzaLegende:"https://static.wixstatic.com/media/9e0c2f_6045acc255214ea2a86519e60260952a~mv2.jpeg/v1/fill/w_980,h_980,al_c,q_85,enc_auto/Pizza%20La%20L%C3%A9gende.jpeg",
      pizzaBotanica:"https://static.wixstatic.com/media/9e0c2f_719deb05388344c78350dae7e3b53c05~mv2.jpeg/v1/fill/w_980,h_980,al_c,q_85,enc_auto/Pizza%20Botanica.jpeg",
      photo1:      "https://static.wixstatic.com/media/f68fd8_6709432b060c40f18251230e36bf3039~mv2.jpeg/v1/fill/w_1200,h_890,al_c,q_85,enc_auto/f68fd8_6709432b060c40f18251230e36bf3039~mv2.jpeg",
      photo2:      "https://static.wixstatic.com/media/f68fd8_ad0e8f71c5254fa69013a355ff5f6a04~mv2.jpeg/v1/fill/w_1200,h_890,al_c,q_85,enc_auto/f68fd8_ad0e8f71c5254fa69013a355ff5f6a04~mv2.jpeg",
      camions:     "https://static.wixstatic.com/media/f68fd8_4381c0bd29ae4e17b0e329fecc29a3d5~mv2.jpg/v1/fill/w_1100,h_435,al_c,q_85,enc_auto/Camions%20-%20La%20L%C3%A9gende.jpg",
      tiramisu:    "https://static.wixstatic.com/media/f68fd8_a487b4e249b64a28919fd7ea8cfe90c4~mv2.png/v1/fill/w_600,h_600,al_c,q_85,enc_auto/Tiramisu%20La%20L%C3%A9gende.png"
    }
  };

  if (typeof window !== "undefined") window.LEGENDE_CONFIG = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
})();
