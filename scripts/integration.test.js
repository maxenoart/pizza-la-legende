/* integration.test.js — ECHTE La-Légende-Config gegen die Engine,
 * Slot-pro-Pizza mit Produktion (8) + Vorbereitung (1) = 9 Min/Pizza. */
const path = require('path');
const CONFIG = require(path.join(__dirname, '..', 'assets', 'js', 'config.js'));
const E = require(path.join(__dirname, '..', 'assets', 'js', 'availability.js'));

function nextWeekday(from, wd){ const d=new Date(from); for(let i=0;i<14;i++){ if(d.getDay()===wd) return d.toISOString().slice(0,10); d.setDate(d.getDate()+1);} }
const now = new Date('2026-07-01T09:00:00');
const tue = nextWeekday(now, 2), mon = nextWeekday(now, 1), wed = nextWeekday(now, 3);

let fail=0; const ok=(n,c)=>{ console.log((c?'  ✓ ':'  ✗ FAIL: ')+n); if(!c)fail++; };
const starts = (a)=>a.map(s=>s.start);

const s1 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:[], now}));
ok('Corgémont Di: 18:15 puis 18:24 (créneau de 9 min)', s1[0]==='18:15' && s1[1]==='18:24');
ok('Corgémont Di: dernier créneau 19:45 (finit 19:54)', s1[s1.length-1]==='19:45');

ok('Corgémont Lu: fermé', E.computeAvailableSlots(CONFIG, {date:mon, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:[], now}).length===0);

const s3 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'bienne', partySize:1, existingBookings:[], now}));
ok('Bienne Di midi: 11:30 → 12:33', s3[0]==='11:30' && s3[s3.length-1]==='12:33');

// 3 pizzas @18:15 → 3 créneaux consécutifs (18:15/18:24/18:33), libre dès 18:42
const busy=[{date:tue,start:'18:15',serviceId:'commande',locationId:'corgemont',partySize:3,status:'confirmed'}];
const s4 = starts(E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:busy, now}));
ok('3 pizzas @18:15 bloquent 18:15/18:24/18:33', !s4.includes('18:15') && !s4.includes('18:24') && !s4.includes('18:33'));
ok('Libre à 18:42', s4.includes('18:42'));

const busyW=[{date:wed,start:'18:15',serviceId:'commande',locationId:'corgemont',partySize:5,status:'confirmed'}];
ok('Grandval libre malgré Corgémont (Me)', starts(E.computeAvailableSlots(CONFIG, {date:wed, serviceId:'commande', locationId:'grandval', partySize:1, existingBookings:busyW, now})).includes('18:15'));

ok('daySlots Corgémont Di dès 18:15', E.daySlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont'})[0].start==='18:15');
ok('slotPerItem actif', CONFIG.booking.slotPerItem===true);
ok('créneau = production + prépa', (CONFIG.booking.productionMin + CONFIG.booking.prepMin) === CONFIG.services[0].durationMinutes);
ok('8 étapes de tournée', (CONFIG.locations||[]).length===8);
ok('20 produits', (CONFIG.menu.products||[]).length===20);

console.log('\nIntegration: '+(fail?('FEHLER '+fail):'alles grün'));
process.exit(fail?1:0);
