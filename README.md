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
| Bestell-Widget | `assets/js/booking-widget.js` + `assets/css/booking-widget.css` |
| Konfiguration (Single Source) | `assets/js/config.js` |
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

**c) Registrierung deaktivieren** (nur der Betreiber soll Admin sein):
Authentication → Providers → Email → **„Allow new users to sign up" ausschalten**.
Dann unter Authentication → Users den Betreiber-Account (E-Mail + Passwort) manuell anlegen.

**d) Edge Functions deployen** (Supabase CLI):
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
Verwaltet: Bestellungen (bestätigen/ablehnen/stornieren), Event-Anfragen, Karte &
Preise, Tournée-Zeiten, Ofen-Kapazität, Module.

---

## Buchungslogik in Kürze

Muster „Bestellung mit Zeitfenster". Der Kunde wählt **Standort → Bestellung →
Tag → Abholfenster**. Jede Tournée-Station hat eigene Öffnungszeiten; pro
15-Min-Fenster gilt eine **Ofen-Kapazität** (Pizzen). Verfügbarkeit wird nie
gespeichert, sondern live berechnet und vor jedem Insert serverseitig
re-validiert (Race-Condition-Schutz). Standorte am selben Abend (Péry/Grandval)
haben getrennte Kapazität. Bezahlt wird vor Ort (cash/TWINT) — kein Online-Payment.

---

## Noch zu ergänzen (Kunde)

1. **Einzelpreise** der Karte — nur „dès CHF 13.–" bekannt. Im Admin → „Carte" nachtragen.
2. **Impressum-Adresse & Rechtsform** — in `mentions-legales.html` (aktuell markiert).
3. **Eigene Fotos** self-hosten — siehe `assets/img/README.md`.
4. **Lizenzschriften** Messina Sans / Calm Serif — siehe `assets/fonts/README.md`
   (bis dahin sauberer Google-Fonts-Fallback).

---

Realisiert von **eno studio**.
