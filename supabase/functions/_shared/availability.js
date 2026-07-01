/*
 * availability.js — Verfügbarkeits-Engine (Herzstück des Buchungssystems)
 * ---------------------------------------------------------------------------
 * Reine, framework-agnostische Logik OHNE Abhängigkeiten.
 * Läuft identisch im Browser (Widget), in Node (Tests) und in
 * Supabase Edge Functions (Deno) — dieselbe Berechnung an jeder Stelle,
 * damit Kunden-UI und Server nie unterschiedliche Verfügbarkeiten zeigen.
 *
 * Eine einzige Wahrheit: der `config`-Objektbaum. Alles was der Betreiber
 * im Admin einstellt (Öffnungszeiten, Pausen, Ferien, Dauer, Puffer,
 * Vorlauf, max/Tag …) landet in `config`. Die Engine liest nur, sie rät nie.
 *
 * Zeitarithmetik läuft in "Minuten seit Mitternacht" (Integer). Das ist
 * DST-sicher innerhalb eines Tages und macht die Überschneidungslogik
 * zu simplen Zahlenvergleichen — die häufigste Fehlerquelle in
 * Buchungssystemen verschwindet damit.
 *
 * ---------------------------------------------------------------------------
 * ERWEITERUNGEN für La Légende (Food Truck, Muster „Bestellung mit Zeitfenster"):
 *   1) STANDORT-ÖFFNUNGSZEITEN — jede Tournée-Station hat eigene Zeiten pro
 *      Wochentag (config.locations[i].hours[weekday]). Wird `locationId`
 *      übergeben, gelten diese statt der Betriebszeiten.
 *   2) KAPAZITÄT PRO SLOT — hat die Leistung `capacity > 1`, blockiert eine
 *      Buchung den Slot nicht sofort. Stattdessen: Summe der bestellten
 *      Mengen (partySize = Anzahl Pizzen) überlappender Buchungen + neue
 *      Menge ≤ capacity. So können pro Zeitfenster mehrere Bestellungen bis
 *      zur Ofen-Kapazität aufgegeben werden.
 * Beide Erweiterungen sind rückwärtskompatibel: ohne locationId / cap>1 /
 * partySize verhält sich die Engine exakt wie die getestete Basis.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api; // Node / Edge
  if (root) root.BookingEngine = api;                                        // Browser
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // --- Zeit-Helfer -----------------------------------------------------------
  const toMin = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const ymd = (d) => {
    if (typeof d === "string") return d.slice(0, 10);
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  // Wochentag 0=So … 6=Sa. Lokale Interpretation, konsistent für Templates.
  const weekdayOf = (dateStr) => new Date(dateStr + "T00:00:00").getDay();

  // Intervalle: subtrahiere `cuts` von `base` (beide [{s,e}] in Minuten).
  function subtract(base, cuts) {
    let out = base.map((iv) => ({ s: iv.s, e: iv.e }));
    for (const c of cuts) {
      const next = [];
      for (const iv of out) {
        if (c.e <= iv.s || c.s >= iv.e) { next.push(iv); continue; } // kein Overlap
        if (c.s > iv.s) next.push({ s: iv.s, e: Math.min(c.s, iv.e) });
        if (c.e < iv.e) next.push({ s: Math.max(c.e, iv.s), e: iv.e });
      }
      out = next.filter((iv) => iv.e > iv.s);
    }
    return out;
  }

  // --- Konfig-Zugriff --------------------------------------------------------
  const svcOf = (config, id) => (config.services || []).find((s) => s.id === id);
  const staffOf = (config, id) => (config.staff || []).find((s) => s.id === id);
  const locOf = (config, id) => (config.locations || []).find((l) => l.id === id);

  function closuresCover(config, dateStr, staffId, locationId) {
    const list = [];
    (config.closures || []).forEach((c) => list.push(c));
    if (staffId) {
      const st = staffOf(config, staffId);
      (st && st.closures || []).forEach((c) => list.push(c));
    }
    if (locationId) {
      const lo = locOf(config, locationId);
      (lo && lo.closures || []).forEach((c) => list.push(c));
    }
    return list.some((c) => {
      const from = c.start, to = c.end || c.start;      // inklusive Endtag
      return dateStr >= from && dateStr <= to &&
        (!c.scope || c.scope === "business" || c.scope === staffId || c.scope === locationId);
    });
  }

  // Arbeitsintervalle eines Tages (Minuten), nach Ferien/Pausen. [] = geschlossen.
  // Priorität der Basiszeiten: Datums-Override > Standort > Mitarbeiter > Betrieb.
  function workingIntervals(config, dateStr, staffId, locationId) {
    if (closuresCover(config, dateStr, staffId, locationId)) return [];

    const wd = weekdayOf(dateStr);
    const st = staffId ? staffOf(config, staffId) : null;
    const lo = locationId ? locOf(config, locationId) : null;
    let template =
      (config.dateOverrides && config.dateOverrides[dateStr]) ||
      (lo && lo.hours && lo.hours[wd]) ||
      (st && st.hours && st.hours[wd]) ||
      (config.hours && config.hours[wd]) ||
      [];
    let intervals = template.map((iv) => ({ s: toMin(iv.start), e: toMin(iv.end) }));
    if (!intervals.length) return []; // kein Arbeitstag

    // Pausen abziehen (Betrieb + Mitarbeiter + Standort), gültig für diesen Wochentag
    const breaks = [];
    (config.breaks || []).forEach((b) => {
      if (!b.days || b.days.includes(wd)) breaks.push({ s: toMin(b.start), e: toMin(b.end) });
    });
    (st && st.breaks || []).forEach((b) => {
      if (!b.days || b.days.includes(wd)) breaks.push({ s: toMin(b.start), e: toMin(b.end) });
    });
    (lo && lo.breaks || []).forEach((b) => {
      if (!b.days || b.days.includes(wd)) breaks.push({ s: toMin(b.start), e: toMin(b.end) });
    });
    return subtract(intervals, breaks);
  }

  // Belegte Spanne einer bestehenden Buchung inkl. Puffer (Minuten).
  function bookingSpan(config, b) {
    const svc = b.serviceId ? svcOf(config, b.serviceId) : null;
    const dur = b.durationMinutes || (svc && svc.durationMinutes) || (b.end ? toMin(b.end) - toMin(b.start) : 0);
    const bef = b.bufferBefore != null ? b.bufferBefore : (svc && svc.bufferBeforeMinutes) || 0;
    const aft = b.bufferAfter != null ? b.bufferAfter : (svc && svc.bufferAfterMinutes) || 0;
    const s = toMin(b.start);
    return { s: s - bef, e: s + dur + aft };
  }

  // Bestellte Menge einer Buchung (Kapazitäts-Modus). Default 1.
  const qtyOf = (b) => (b.partySize != null ? b.partySize : (b.party_size != null ? b.party_size : 1));

  // Zählt aktive Buchungen an einem Tag für die relevante Ressource/den Standort.
  function activeBookingsOnDate(config, bookings, dateStr, staffId, locationId) {
    const multiStaff = config.features && config.features.multiStaff;
    const multiLoc = config.features && config.features.multiLocation;
    return bookings.filter((b) => {
      if (b.date !== dateStr) return false;
      if (b.status === "cancelled" || b.status === "declined") return false;
      if (multiStaff && staffId && b.staffId && b.staffId !== staffId) return false;
      if (multiLoc && locationId && b.locationId && b.locationId !== locationId) return false;
      return true;
    });
  }

  // --- Hauptfunktion ---------------------------------------------------------
  /*
   * computeAvailableSlots(config, opts) -> [{ start, end, startISO, remaining? }]
   * opts: { date:'YYYY-MM-DD', serviceId, staffId?, locationId?, partySize?,
   *         existingBookings?:[], now?:Date }
   */
  function computeAvailableSlots(config, opts) {
    const o = opts || {};
    const dateStr = ymd(o.date);
    const now = o.now || new Date();
    const bk = o.existingBookings || [];
    const svc = svcOf(config, o.serviceId) || {};
    const b = config.booking || {};

    const duration = svc.durationMinutes || b.defaultDurationMinutes || 30;
    const bufBefore = svc.bufferBeforeMinutes || 0;
    const bufAfter = svc.bufferAfterMinutes || 0;
    const step = b.slotGranularityMinutes || 15;
    const capacity = svc.capacity || 1;
    const need = o.partySize != null ? o.partySize : 1;

    // Horizont: nicht weiter als N Tage im Voraus buchbar.
    if (b.bookingHorizonDays != null) {
      const horizon = new Date(now); horizon.setDate(horizon.getDate() + b.bookingHorizonDays);
      if (dateStr > ymd(horizon)) return [];
    }
    // Vergangenheit ausschließen.
    if (dateStr < ymd(now)) return [];

    // Vorlauf + kurzfristige Sperre = effektiver Mindestvorlauf (das Maximum beider).
    const minNotice = Math.max(b.leadTimeMinutes || 0, b.cutoffMinutesBeforeSlot || 0);
    const nowMinToday = now.getHours() * 60 + now.getMinutes();
    const isToday = dateStr === ymd(now);

    // Max. Buchungen pro Tag bereits erreicht? Dann ist der Tag zu.
    const activeToday = activeBookingsOnDate(config, bk, dateStr, o.staffId, o.locationId);
    if (b.maxBookingsPerDay != null && activeToday.length >= b.maxBookingsPerDay) return [];

    const intervals = workingIntervals(config, dateStr, o.staffId, o.locationId);
    if (!intervals.length) return [];

    // Belegte Spannen der bestehenden Buchungen einmal vorberechnen (index-gleich zu activeToday).
    const busy = activeToday.map((x) => bookingSpan(config, x));

    const slots = [];
    for (const iv of intervals) {
      // Nur Startzeiten, bei denen die Leistung KOMPLETT ins Intervall passt.
      for (let start = iv.s; start + duration <= iv.e; start += step) {
        const end = start + duration;
        const span = { s: start - bufBefore, e: end + bufAfter };

        // Mindestvorlauf (nur relevant für heute).
        if (isToday && start < nowMinToday + minNotice) continue;

        if (capacity > 1) {
          // Kapazitäts-Modus: Summe der Mengen überlappender Buchungen prüfen.
          let used = 0;
          for (let k = 0; k < busy.length; k++) {
            const z = busy[k];
            if (span.s < z.e && z.s < span.e) used += qtyOf(activeToday[k]);
          }
          if (used + need > capacity) continue;
          slots.push({ start: toHHMM(start), end: toHHMM(end), startISO: `${dateStr}T${toHHMM(start)}:00`, remaining: capacity - used });
        } else {
          // Einzelressource: jede Überschneidung blockiert.
          const clash = busy.some((z) => span.s < z.e && z.s < span.e);
          if (clash) continue;
          slots.push({ start: toHHMM(start), end: toHHMM(end), startISO: `${dateStr}T${toHHMM(start)}:00` });
        }
      }
    }
    return slots;
  }

  /*
   * isSlotAvailable — Einzelprüfung beim tatsächlichen Buchen (Race-Condition-
   * Schutz). Der Server ruft das VOR dem Insert erneut auf, weil zwischen
   * Anzeige und Klick ein anderer Kunde denselben Slot genommen haben kann.
   */
  function isSlotAvailable(config, opts) {
    const wanted = toHHMM(toMin(opts.start));
    return computeAvailableSlots(config, opts).some((s) => s.start === wanted);
  }

  // Nächste N Tage mit mindestens einem freien Slot (für Kalender-Punkte).
  function daysWithAvailability(config, opts) {
    const o = opts || {}, now = o.now || new Date();
    const out = [];
    const horizon = o.horizonDays || (config.booking && config.booking.bookingHorizonDays) || 30;
    for (let i = 0; i <= horizon; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const dateStr = ymd(d);
      const has = computeAvailableSlots(config, Object.assign({}, o, { date: dateStr })).length > 0;
      out.push({ date: dateStr, available: has });
    }
    return out;
  }

  return {
    computeAvailableSlots,
    isSlotAvailable,
    daysWithAvailability,
    workingIntervals,
    bookingSpan,
    _util: { toMin, toHHMM, ymd, weekdayOf, subtract, qtyOf },
    version: "1.1.0-legende",
  };
});
