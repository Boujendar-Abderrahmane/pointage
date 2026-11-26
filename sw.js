/* Service worker: keeps the app on the phone so it opens with no internet.
   Change V (pointages-v8 -> v8 ...) every time you change any file, so phones refresh their copy. */
var V = "pointages-v8";
var CORE = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
var LIBS = ["lib/xlsx.full.min.js", "lib/jspdf.umd.min.js", "lib/jspdf.plugin.autotable.min.js"];

/* Install: save each file on its own. One missing file no longer breaks the whole offline copy. */
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(V).then(function (c) {
      return Promise.all(
        CORE.concat(LIBS).map(function (u) {
          return c.add(new Request(u, { cache: "reload" })).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Activate: delete older cached versions. */
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Fetch: answer from the saved copy first; if it is not saved, ask the network and save the answer.
   If the network is down and the page itself was asked for, show the saved home page. */
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(r).then(function (res) {
        if (res && res.ok && new URL(r.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(V).then(function (c) { c.put(r, copy); });
        }
        return res;
      }).catch(function () {
        return r.mode === "navigate" ? caches.match("index.html") : Response.error();
      });
    })
  );
});
