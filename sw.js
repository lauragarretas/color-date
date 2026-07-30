const CACHE = "color-date-v2";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // deja pasar Supabase y CDNs sin tocar

  // Network-first: siempre intenta traer la versión más reciente del
  // servidor; solo recurre a la caché si no hay conexión. Así, un despliegue
  // nuevo (ej. una corrección en config.js) llega de inmediato en vez de
  // quedarse atascado en la copia cacheada de la primera visita.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
