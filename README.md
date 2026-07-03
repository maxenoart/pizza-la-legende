# La Légende — Website & Bestellsystem

Produktionsreife Website für den Food Truck **La Légende** (Pizzeria itinérante,
Jura bernois) mit Online-Vorbestellung (Abholung am Truck), Event-Vermietungs-
anfrage, zweisprachig **FR/DE**. Statisches Frontend (GitHub Pages) + optionales
Supabase-Backend (Stufe 2) für echte Bestellungen, Verfügbarkeit & E-Mails.

> Redesign der bestehenden Wix-Seite. Grundsatz: **neues Design, gleicher Inhalt.**
> Nichts erfunden — offene Inhaltslücken siehe unten (Preise, Adresse, Fotos, Fonts).

---

## Was drin ist

| Bereich | Datei(en) |
|---|---|
| Seiten | `index.html`, `carte.html`, `commander.html`, `louer.html`, `mentions-legales.html`, `confidentialite.html`, `404.html` |
| Design-System | `assets/css/site.css` |
| Buchungs-Engine (getestet) | `assets/js/availability.js` + `scripts/availability.test.js` |
| Datenschicht (Supabase/Demo, Realtime) | `assets/js/adapters.js` (`window.LegendeData`) |
| Bestell-Widget (reine UI) | `assets/js/booking-widget.js` + `assets/css/booking-widget.css` |
| Konfiguration (Single Source) | `assets/js/config.js` |

**Architektur:** `config.js` (Daten) → `availability.js` (Engine, 0 Deps) → `adapters.js`
(kapselt WO die Daten liegen) → `booking-widget.js` / `admin/admin.js` (reine UI).
Widget und Admin kennen kein Supabase — sie sprechen nur mit `window.LegendeData`.
| Admin-Panel | `admin/index.html`, `admin/admin.js`, `admin/admin.css` |
| Backend | `supabase/schema.sql`, `supabase/seed.sql`, `supabase/functions/*` |
| SEO/PWA | `sitemap.xml`, `robots.txt`, `site.webmanifest`, `assets/img/favicon.svg` |

**Zwei Betriebsmodi**, automatisch gewählt:
- **Demo** (ohne `assets/js/env.js`): alles läuft rein im Browser (localStorage).
  Vorbestellung & Admin sind sofort ausprobierbar — Bestellungen werden aber nicht
  echt gespeichert. Perfekt zum Zeigen und für GitHub Pages ohne Backend.
- **Live** (mit `env.js` + Supabase): echte Bestellungen, Doppelbuchungs-/Kapazitäts-
  schutz serverseitig, Bestätigungs- & Erinnerungs-Mails, Admin mit Login.

---

## Lokal ansehen

```bash
cd 01_Website
python3 -m http.server 8000    # dann http://localhost:8000
```
(Ein einfacher Server ist nötig, da die Skripte relative Pfade laden.)

Engine-Tests:
```bash
node scripts/availability.test.js   # muss "0 fehlgeschlagen" zeigen
```

---

## 1) Auf GitHub veröffentlichen (Demo-Modus, sofort live)

1. Neues GitHub-Repo anlegen, den **Inhalt von `01_Website/`** ins Repo-Root pushen
   (nicht den Ordner `01_Website` selbst verschachteln).
2. Repo → **Settings → Pages** → Source: `Deploy from a branch`, Branch `main` / `/root`.
3. Nach ~1 Min ist die Seite unter `https://<user>.github.io/<repo>/` erreichbar.
4. Eigene Domain (`pizzalegende.ch`): unter Pages → Custom domain eintragen, beim
   Registrar CNAME/A-Records setzen. Danach in `sitemap.xml`, `robots.txt` und den
   `canonical`-Tags die Domain prüfen.

Die Vorbestellung funktioniert dann bereits (Demo). Für echte Bestellungen → Schritt 2.

---

## 2) Supabase aktivieren (Stufe 2 — echter Betrieb)

**a) Projekt** auf supabase.com anlegen — **Region: EU (Frankfurt)** (Personendaten!).

**b) Datenbank aufsetzen** — SQL Editor öffnen und nacheinander ausführen:
```
supabase/schema.sql
supabase/seed.sql
```
> **Schon früher aufgesetzte DB?** Dann einmalig **`supabase/migrate-existing-db.sql`**
> ausführen — dieses eine File bringt eine bestehende Datenbank idempotent auf den
> aktuellen Stand (Zeitmodell, Warteliste, Allergene, Realtime, Idempotenz …).
> Die Einzel-Migrationen (`migration-sessions/-ui-v2/-v3/-v4.sql`) bleiben als
> Historie erhalten, werden aber nicht mehr einzeln gebraucht.

**Realtime (Live-Zeitfenster + Admin-Ton):** `schema.sql` richtet `slot_events`
(PII-frei, fürs Kunden-Widget) und die Realtime-Publication für `bookings` ein.
Das Widget aktualisiert freie Zeiten automatisch, wenn parallel jemand bestellt;
das Admin gibt bei jeder neuen Bestellung einen Ton. Anonyme sehen dank RLS nie
fremde Buchungsdaten.

**Edge Functions (optional, nur mit CLI/Deploy):** `book` (server-autoritativ +
Bestätigungs-Mail — das Widget nutzt sie automatisch, wenn deployt, sonst
Direct-Insert), `send-reminder` (E-Mail 10 Min vor Abholung), `event-request`,
`cancel`, `purge-old` (löscht Daten > 12 Monate, Datenschutz). Ohne Deploy läuft
alles trotzdem (nur ohne automatische Mails).

**Qualität:** `npm test` (27 Engine-Fälle + Integration) läuft bei jedem Push via
GitHub Actions (`.github/workflows/ci.yml`); ein Playwright-Smoke-Test (`npm run e2e`)
prüft den Bestellflow.

**c) Registrierung deaktivieren** (nur der Betreiber soll Admin sein):
Authentication → Providers → Email → **„Allow new users to sign up" ausschalten**.
Dann unter Authentication → Users den Betreiber-Account (E-Mail + Passwort) manuell anlegen.

**d) Edge Functions deployen — OPTIONAL** (nur für automatische E-Mails; für die
reine Bestellannahme nicht nötig, siehe „Buchungslogik"). Supabase CLI:
```bash
supabase functions deploy book --no-verify-jwt
supabase functions deploy event-request --no-verify-jwt
supabase functions deploy send-reminder --no-verify-jwt
supabase functions deploy cancel --no-verify-jwt
```
`supabase/functions/_shared/availability.js` wird von `book` mitgenutzt (identische
Engine wie im Frontend — keine doppelte Logik).

**e) Secrets setzen** (Project Settings → Edge Functions → Secrets):
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (automatisch vorhanden)
RESEND_API_KEY   = dein Resend-Key
BUSINESS_EMAIL   = info@pizzalegende.ch   (Kopie jeder Bestellung/Anfrage)
MAIL_FROM        = "La Légende <commande@pizzalegende.ch>"  (verifizierte Domain in Resend)
```
Ohne verifizierte Domain nutzt Resend nur die Sandbox-Adresse `onboarding@resend.dev`.

**f) Erinnerungen planen** (optional): Supabase → Edge Functions → `send-reminder`
→ Schedule (z. B. stündlich). Idempotent über die Tabelle `notifications`.

**g) Frontend verbinden:** `assets/js/env.example.js` → **`assets/js/env.js`** kopieren
und `supabaseUrl`, `supabaseAnonKey`, `functionsUrl` eintragen. `env.js` ist per
`.gitignore` ausgenommen (enthält nur die öffentliche anon-Key — **nie** die
service_role ins Frontend!).

Ab jetzt laufen Vorbestellung, Kapazitätsprüfung, E-Mails und der Admin-Login live.

---

## Admin

`/admin/` — **Demo-Passwort:** `legende` · **Live:** Supabase-Login des Betreibers.

- **Commandes** — kompakte Session-Liste des Tages/Standorts (Kopf zeigt Tag/Ort/
  Service, midi/soir je nach Uhrzeit). Jede Zeile: Foto der 1. Pizza, Name,
  Telefon, Bestellung und Abholzeit; rechts **✓ Terminée** und **✕ Non venu**.
  Freie Sessions sind sichtbar und lassen sich als **Pause** blockieren. Unten die
  letzten 3 erledigten Bestellungen.
- **Événements** — Devis-Anfragen. **Carte** — Preise/Namen. **Tournée** — Zeiten
  je Standort. **Réglages** — Session-Dauer, Übergangszeit, Vorlauf, Horizont.

---

## Buchungslogik in Kürze

Muster „Bestellung mit Zeitfenster", **Session-Modell**. Der Kunde wählt
**Standort → Bestellung → Tag → Abholzeit**. Jede Bestellung belegt eine
**Session** (Dauer + kurze Übergangszeit, im Admin einstellbar); die angebotenen
Abholzeiten sind genau in diesem Abstand gelistet. Verfügbarkeit wird nie
gespeichert, sondern live aus Öffnungszeiten minus belegte Sessions berechnet.
Standorte am selben Abend (Péry/Grandval) sind getrennt. Bezahlt wird vor Ort
(cash/TWINT) — kein Online-Payment.

Bestellungen werden im aktuellen Setup **direkt in Supabase** gespeichert
(publishable Key + RLS `public insert`), mit Re-Validierung im Browser. Edge
Functions sind dafür **nicht nötig** — sie sind optional und nur für automatische
Bestätigungs-/Erinnerungs-E-Mails (Resend) gedacht.

---

## Noch zu ergänzen (Inhalt vom Kunden)

1. **Einzelpreise + Allergene** der Karte — im Admin → „Carte" pro Artikel eintragen (erscheinen dann auf der Karte, im Bestell-Widget und rechtlich sauber).
2. **Impressum-Adresse & Rechtsform** — in `mentions-legales.html` (aktuell markiert).
3. **Eigene Fotos** self-hosten — siehe `assets/img/README.md`.
4. **Lizenzschriften** Messina Sans / Calm Serif — siehe `assets/fonts/README.md` (bis dahin Google-Fonts-Fallback).

## Optional / extern (braucht Konto oder Deploy)

- **Automatische E-Mails/Erinnerungen** → Edge Functions `book` + `send-reminder` deployen + Resend-Key.
- **Datenschutz-Löschjob** → `purge-old` deployen + als Scheduled Function (monatlich).
- **Zahlung (Stripe/TWINT), Analytics (Plausible), Fehler-Monitoring (Sentry), Google Business** → jeweils Konto/Key nötig; die Hooks/Struktur sind vorbereitet.

---

Realisiert von **eno studio**.
