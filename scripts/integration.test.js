/* integration.test.js — prüft die ECHTE La-Légende-Config gegen die Engine. */
const path = require('path');
const CONFIG = require(path.join(__dirname, '..', 'assets', 'js', 'config.js'));
const E = require(path.join(__dirname, '..', 'assets', 'js', 'availability.js'));

function nextWeekday(from, wd){ const d=new Date(from); for(let i=0;i<14;i++){ if(d.getDay()===wd) return d.toISOString().slice(0,10); d.setDate(d.getDate()+1);} }
const now = new Date('2026-07-01T09:00:00');
const tue = nextWeekday(now, 2);
const mon = nextWeekday(now, 1);

let fail=0; const ok=(n,c)=>{ console.log((c?'  ✓ ':'  ✗ FAIL: ')+n); if(!c)fail++; };

const s1 = E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:2, existingBookings:[], now});
ok('Corgémont Di: '+s1.length+' Slots, 1.='+(s1[0]&&s1[0].start), s1.length>0 && s1[0].start==='18:15');
ok('Corgémont Di: letzter Slot 19:45', s1[s1.length-1].start==='19:45');

const s2 = E.computeAvailableSlots(CONFIG, {date:mon, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:[], now});
ok('Corgémont Mo: geschlossen', s2.length===0);

const s3 = E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'bienne', partySize:1, existingBookings:[], now});
ok('Bienne Di midi: 11:30 → 12:30', s3[0].start==='11:30' && s3[s3.length-1].start==='12:30');

const busy=[{date:tue,start:'18:15',serviceId:'commande',locationId:'corgemont',partySize:8,status:'confirmed'}];
const s4 = E.computeAvailableSlots(CONFIG, {date:tue, serviceId:'commande', locationId:'corgemont', partySize:1, existingBookings:busy, now});
ok('Kapazität voll: 18:15 weg, 18:30 frei', !s4.some(x=>x.start==='18:15') && s4.some(x=>x.start==='18:30'));

const days = E.daysWithAvailability(CONFIG, {serviceId:'commande', locationId:'corgemont', partySize:2, existingBookings:[], horizonDays:14, now});
ok('daysWithAvailability: mind. 1 Tag frei', days.some(d=>d.available));

ok('8 Standorte konfiguriert', (CONFIG.locations||[]).length===8);
ok('20 Produkte in der Karte', (CONFIG.menu.products||[]).length===20);

console.log('\nIntegration: '+(fail?('FEHLER '+fail):'alles grün'));
process.exit(fail?1:0);
