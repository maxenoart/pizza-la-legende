/*
 * availability.test.js — Prüft die kritische Überschneidungs-, Kapazitäts- und
 * Standortlogik. Ausführen: `node scripts/availability.test.js`.
 * Kein Test-Framework nötig, exit-code != 0 bei Fehler (CI-tauglich).
 *
 * Enthält die 19 Basisfälle der Engine PLUS die La-Légende-Erweiterungen
 * (Kapazität pro Slot, Standort-Öffnungszeiten, standort-getrennte Kapazität).
 */
const E = require("../assets/js/availability.js");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}
const starts = (slots) => slots.map((s) => s.start);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Testdatum + passende Öffnungszeiten (09–12 / 13–18) für dessen Wochentag.
const DATE = "2026-07-06";
const WD = E._util.weekdayOf(DATE);
const PAST = new Date("2020-01-01T00:00:00"); // "now" weit in der Vergangenheit → kein Vorlauf-Einfluss

function baseConfig(extra) {
  return Object.assign({
    features: { multiStaff: false },
    booking: { slotGranularityMinutes: 30 },
    hours: { [WD]: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "18:00" }] },
    services: [{ id: "cut", name: "Haarschnitt", durationMinutes: 60 }],
    closures: [],
  }, extra || {});
}

console.log("1) Grundraster (60-Min-Leistung, Raster 30, Mittagspause 12–13)");
{
  const s = starts(E.computeAvailableSlots(baseConfig(), { date: DATE, serviceId: "cut", now: PAST }));
  check("Morgens 09:00–11:00, letzter Slot 11:00 (endet 12:00)", eq(s.filter(x=>x<"12:00"), ["09:00","09:30","10:00","10:30","11:00"]));
  check("11:30 fehlt (würde 12:30 enden > 12:00)", !s.includes("11:30"));
  check("Mittagspause: kein Slot 12:00/12:30", !s.includes("12:00") && !s.includes("12:30"));
  check("Nachmittags letzter Slot 17:00 (endet 18:00)", s.includes("17:00") && !s.includes("17:30"));
}

console.log("2) Überschneidung mit bestehender Buchung 10:00–11:00");
{
  const bookings = [{ id: "b1", date: DATE, start: "10:00", serviceId: "cut", status: "confirmed" }];
  const s = starts(E.computeAvailableSlots(baseConfig(), { date: DATE, serviceId: "cut", existingBookings: bookings, now: PAST }));
  check("09:00 frei (endet exakt 10:00, keine Überlappung)", s.includes("09:00"));
  check("09:30 blockiert (09:30–10:30 überlappt)", !s.includes("09:30"));
  check("10:00 blockiert", !s.includes("10:00"));
  check("10:30 blockiert", !s.includes("10:30"));
  check("11:00 frei (beginnt exakt am Buchungsende)", s.includes("11:00"));
}

console.log("3) Vor-/Nachbereitungszeiten (Puffer) blocken Nachbarslots");
{
  const cfg = baseConfig({ services: [{ id: "cut", name: "Schnitt", durationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }] });
  const bookings = [{ id: "b1", date: DATE, start: "10:00", serviceId: "cut", status: "confirmed" }];
  const s = starts(E.computeAvailableSlots(cfg, { date: DATE, serviceId: "cut", existingBookings: bookings, now: PAST }));
  check("11:00 jetzt blockiert (Puffer: 10:45–12:00 überlappt 10:00–11:15)", !s.includes("11:00"));
  check("09:00 blockiert (Puffer 08:45–10:15 überlappt Buchung 09:45–11:15)", !s.includes("09:00"));
}

console.log("4) Buchungsvorlauf (leadTime 120 Min, 'jetzt' = heute 09:00)");
{
  const cfg = baseConfig({ booking: { slotGranularityMinutes: 30, leadTimeMinutes: 120 } });
  const now = new Date(DATE + "T09:00:00");
  const s = starts(E.computeAvailableSlots(cfg, { date: DATE, serviceId: "cut", now }));
  check("09:00/10:00/10:30 entfernt (unter 2h Vorlauf)", !s.includes("09:00") && !s.includes("10:30"));
  check("11:00 verfügbar (genau 2h Vorlauf)", s.includes("11:00"));
}

console.log("5) Ferien/Abwesenheit → Tag komplett geschlossen");
{
  const cfg = baseConfig({ closures: [{ start: "2026-07-01", end: "2026-07-14", reason: "Betriebsferien" }] });
  const s = E.computeAvailableSlots(cfg, { date: DATE, serviceId: "cut", now: PAST });
  check("Keine Slots während Ferien", s.length === 0);
}

console.log("6) Max. Buchungen pro Tag erreicht → Tag zu");
{
  const cfg = baseConfig({ booking: { slotGranularityMinutes: 30, maxBookingsPerDay: 2 } });
  const bookings = [
    { id: "b1", date: DATE, start: "09:00", serviceId: "cut", status: "confirmed" },
    { id: "b2", date: DATE, start: "13:00", serviceId: "cut", status: "pending" },
  ];
  const s = E.computeAvailableSlots(cfg, { date: DATE, serviceId: "cut", existingBookings: bookings, now: PAST });
  check("Keine Slots mehr bei erreichtem Tageslimit", s.length === 0);
}

console.log("7) Nicht-Arbeitstag (keine Öffnungszeiten hinterlegt)");
{
  const otherDay = "2026-07-07"; // anderer Wochentag ohne hours-Eintrag
  const s = E.computeAvailableSlots(baseConfig(), { date: otherDay, serviceId: "cut", now: PAST });
  check("Slots leer, wenn Wochentag kein Arbeitstag ist", s.length === 0 || E._util.weekdayOf(otherDay) === WD);
}

console.log("8) Datums-Override öffnet einen sonst geschlossenen Tag");
{
  const special = "2026-07-07";
  const cfg = baseConfig({ dateOverrides: { [special]: [{ start: "10:00", end: "12:00" }] } });
  const s = starts(E.computeAvailableSlots(cfg, { date: special, serviceId: "cut", now: PAST }));
  check("Sonderöffnung liefert 10:00/11:00", s.includes("10:00") && s.includes("11:00"));
}

console.log("9) Stornierte Buchung blockiert NICHT");
{
  const bookings = [{ id: "b1", date: DATE, start: "10:00", serviceId: "cut", status: "cancelled" }];
  const s = starts(E.computeAvailableSlots(baseConfig(), { date: DATE, serviceId: "cut", existingBookings: bookings, now: PAST }));
  check("10:00 wieder frei nach Stornierung", s.includes("10:00"));
}

console.log("10) isSlotAvailable Einzelprüfung (Race-Condition-Schutz)");
{
  const bookings = [{ id: "b1", date: DATE, start: "10:00", serviceId: "cut", status: "confirmed" }];
  const ok = E.isSlotAvailable(baseConfig(), { date: DATE, serviceId: "cut", start: "11:00", existingBookings: bookings, now: PAST });
  const no = E.isSlotAvailable(baseConfig(), { date: DATE, serviceId: "cut", start: "10:00", existingBookings: bookings, now: PAST });
  check("11:00 buchbar, 10:00 nicht", ok === true && no === false);
}

// ===========================================================================
// La-Légende-Erweiterungen
// ===========================================================================

// Für die Food-Truck-Fälle nehmen wir das reale Muster: Standorte mit eigenen
// Öffnungszeiten, eine „commande"-Leistung mit 15-Min-Fenstern und Ofen-Kapazität.
const MARDI = "2026-07-07"; // Dienstag → Wochentag 2
const LUNDI = "2026-07-06"; // Montag  → Wochentag 1
function truckConfig(extra) {
  return Object.assign({
    features: { multiLocation: true },
    booking: { slotGranularityMinutes: 15, leadTimeMinutes: 0 },
    services: [{ id: "commande", name: "Commande", durationMinutes: 15, capacity: 6 }],
    locations: [
      { id: "corgemont", name: "Corgémont", hours: { "2": [{ start: "18:15", end: "19:00" }] } },
      { id: "grandval",  name: "Grandval",  hours: { "3": [{ start: "18:15", end: "19:00" }] } },
    ],
    closures: [],
  }, extra || {});
}

console.log("11) Standort-Öffnungszeiten: nur der richtige Wochentag ist offen");
{
  const s = starts(E.computeAvailableSlots(truckConfig(), { date: MARDI, serviceId: "commande", locationId: "corgemont", now: PAST }));
  check("Corgémont am Dienstag: 18:15/18:30/18:45 (letzter 18:45→19:00)", eq(s, ["18:15", "18:30", "18:45"]));
  const off = E.computeAvailableSlots(truckConfig(), { date: LUNDI, serviceId: "commande", locationId: "corgemont", now: PAST });
  check("Corgémont am Montag: geschlossen (keine Slots)", off.length === 0);
}

console.log("12) Kapazität pro Slot: 6 Pizzen, füllt sich schrittweise");
{
  const bookings = [
    { id: "o1", date: MARDI, start: "18:15", serviceId: "commande", locationId: "corgemont", partySize: 4, status: "confirmed" },
  ];
  // Bestellung über 2 Pizzen → 4+2=6 ≤ 6 → 18:15 noch frei
  const okSlots = E.computeAvailableSlots(truckConfig(), { date: MARDI, serviceId: "commande", locationId: "corgemont", partySize: 2, existingBookings: bookings, now: PAST });
  check("18:15 frei bei 2 Pizzen (4+2=6 = Kapazität)", starts(okSlots).includes("18:15"));
  const slot1815 = okSlots.find((x) => x.start === "18:15");
  check("remaining an 18:15 = 2 (6−4)", slot1815 && slot1815.remaining === 2);
  // Bestellung über 3 Pizzen → 4+3=7 > 6 → 18:15 weg, 18:30 frei
  const bigSlots = starts(E.computeAvailableSlots(truckConfig(), { date: MARDI, serviceId: "commande", locationId: "corgemont", partySize: 3, existingBookings: bookings, now: PAST }));
  check("18:15 blockiert bei 3 Pizzen (4+3=7 > 6)", !bigSlots.includes("18:15"));
  check("18:30 frei bei 3 Pizzen (leeres Fenster)", bigSlots.includes("18:30"));
}

console.log("13) Kapazität ist STANDORT-getrennt (Péry/Grandval = eigene Öfen)");
{
  // Grandval ist mittwochs offen; Corgémont-Bestellungen dürfen Grandval NICHT belegen.
  const MERCREDI = "2026-07-08"; // Mittwoch → Wochentag 3
  const bookings = [
    { id: "o1", date: MERCREDI, start: "18:15", serviceId: "commande", locationId: "corgemont", partySize: 6, status: "confirmed" },
  ];
  const grandval = starts(E.computeAvailableSlots(truckConfig(), { date: MERCREDI, serviceId: "commande", locationId: "grandval", partySize: 6, existingBookings: bookings, now: PAST }));
  check("Grandval 18:15 frei trotz voller Corgémont-Buchung", grandval.includes("18:15"));
}

console.log("14) Kapazität voll → Slot komplett belegt");
{
  const bookings = [
    { id: "o1", date: MARDI, start: "18:15", serviceId: "commande", locationId: "corgemont", partySize: 6, status: "confirmed" },
  ];
  const s = starts(E.computeAvailableSlots(truckConfig(), { date: MARDI, serviceId: "commande", locationId: "corgemont", partySize: 1, existingBookings: bookings, now: PAST }));
  check("18:15 weg (voll), 18:30 noch frei", !s.includes("18:15") && s.includes("18:30"));
}

console.log("15) slotPerItem: eine Bestellung belegt (Pizzen × Dauer) Folge-Slots");
{
  function pi() {
    return { features: { multiLocation: false }, booking: { slotGranularityMinutes: 10, slotPerItem: true, leadTimeMinutes: 0 },
      hours: { [WD]: [{ start: "18:00", end: "19:00" }] }, services: [{ id: "cmd", name: "Cmd", durationMinutes: 10 }], closures: [] };
  }
  const base = starts(E.computeAvailableSlots(pi(), { date: DATE, serviceId: "cmd", partySize: 1, now: PAST }));
  check("1-Pizza-Raster 18:00–18:50 (6 Slots)", eq(base, ["18:00", "18:10", "18:20", "18:30", "18:40", "18:50"]));
  const bk = [{ id: "o1", date: DATE, start: "18:10", serviceId: "cmd", partySize: 2, status: "confirmed" }];
  const one = starts(E.computeAvailableSlots(pi(), { date: DATE, serviceId: "cmd", partySize: 1, existingBookings: bk, now: PAST }));
  check("2-Pizza-Buchung 18:10 blockt 18:10 & 18:20", !one.includes("18:10") && !one.includes("18:20"));
  check("18:00 und 18:30 bleiben frei", one.includes("18:00") && one.includes("18:30"));
  const three = starts(E.computeAvailableSlots(pi(), { date: DATE, serviceId: "cmd", partySize: 3, existingBookings: bk, now: PAST }));
  check("3-Pizza-Bestellung passt nur ab 18:30", eq(three, ["18:30"]));
}

console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail === 0 ? 0 : 1);
