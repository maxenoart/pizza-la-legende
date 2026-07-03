/* sw.js — minimaler Service Worker für das Admin (installierbar + Offline-Shell).
   Cacht NUR gleiche-Herkunft-App-Dateien. Live-Daten (Supabase, CDN) gehen
   immer ans Netz — kein Caching fremder Herkunft, damit nichts veraltet. */
var CACHE = "legende-admin-v1";
var ASSETS = [
  "./index.html", "./admin.js", "./admin.css",
  "../assets/js/config.js", "../assets/js/availability.js", "../assets/js/adapters.js",
  "../assets/img/favicon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // nur App-Shell
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (res) {
        var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }).catch(function () {});
        return res;
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
