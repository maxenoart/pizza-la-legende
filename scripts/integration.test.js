/* integration.test.js — prüft die ECHTE La-Légende-Config gegen die Engine
 * im Slot-pro-Pizza-Modell (5 Min/Pizza). */
const path = require('path');
const CONFIG = require(path.join(__dirname, '..', 'assets', 'js', 'config.js'));
const E = require(path.join(__dirname, '..', 'assets', 'js', 'availability.js'));

function nextWeekday(from, wd){ const d=new Date(from); for(let i=0;i<14;i++){ if(d.getDay()===wd) return d.toISOString().slice(0,10); d.setDate(d.getDate()+1);} }
const now = new Date('2026-07-01T09:00:00');
const tue = nextWeekday(now, 2);   // corgemont soir / bienne midi
const mon = nextWeekday(now, 1);   // tramelan

let fail=0; const ok=(n,c)=>{ console.log((c?'  ✓ ':'  ✗ FAIL: ')+n); if(!c)fail++; };
const starts = (a)=>a.map(s=>s.start);

// 1 Pizza in Corgémont (Di soir 18:15–20:00), 5 Min/Pizza → saubere 5er-Zeiten
const s1 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:[], now}));
ok('Corgémont Di: 1. Slot 18:15, 2. Slot 18:20 (5-Min-Raster)', s1[0]==='18:15' && s1[1]==='18:20');
ok('Corgémont Di: letzter Slot 19:55 (endet 20:00)', s1[s1.length-1]==='19:55');

// Corgémont montags geschlossen
ok('Corgémont Mo: geschlossen', E.computeAvailableSlots(CONFIG, {date:mon, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:[], now}).length===0);

// Bienne midi (11:30–12:45)
const s3 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'bienne', partySize:1, existingBookings:[], now}));
ok('Bienne Di midi: 11:30 → 12:40 (letzter, endet 12:45)', s3[0]==='11:30' && s3[s3.length-1]==='12:40');

// Slot-pro-Pizza: eine 3-Pizza-Bestellung um 18:15 belegt 18:15/18:20/18:25
const busy=[{date:tue,start:'18:15',serviceId:'commande',locationId:'corgemont',partySize:3,status:'confirmed'}];
const s4 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:busy, now}));
ok('3-Pizza-Bestellung 18:15 blockt 18:15/18:20/18:25', !s4.includes('18:15') && !s4.includes('18:20') && !s4.includes('18:25'));
ok('18:30 danach wieder frei', s4.includes('18:30'));

// Standort-getrennt: Corgémont-Buchung blockt Grandval nicht
const wed = nextWeekday(now, 3);
const busyW=[{date:wed,start:'18:15',serviceId:'commande',locationId:'corgemont',partySize:5,status:'confirmed'}];
ok('Grandval frei trotz Corgémont-Buchung (Mi)', starts(E.computeAvailableSlots(CONFIG, {date:wed, serviceId:'commande', locationId:'grandval', partySize:1, existingBookings:busyW, now})).includes('18:15'));

// daySlots (Betreiber-Raster) liefert das volle Raster
ok('daySlots Corgémont Di: volles Raster ab 18:15', E.daySlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont'})[0].start==='18:15');

// Config-Sanity
ok('slotPerItem aktiv', CONFIG.booking.slotPerItem===true);
ok('8 Standorte konfiguriert', (CONFIG.locations||[]).length===8);
ok('20 Produkte in der Karte', (CONFIG.menu.products||[]).length===20);

console.log('\nIntegration: '+(fail?('FEHLER '+fail):'alles grün'));
process.exit(fail?1:0);
