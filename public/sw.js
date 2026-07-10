const CACHE_NAME = "urgencescolaire-v4"; // ⚠️ Incrémenté pour forcer la mise à jour
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/assets/icons/icones.png",
  "/pages/eleve/login.html",
  "/pages/professeur/login.html",
  "/css/base.css",
  "/css/dashboard_eleve.css",
  "/css/components/rating.modal.css",
  // FONTS
  "/assets/fonts/DMSans-300.woff2",
  "/assets/fonts/DMSans-400.woff2",
  "/assets/fonts/DMSans-500.woff2",
  "/assets/fonts/DMSans-600.woff2",
  "/assets/fonts/DMSans-700.woff2",
  "/assets/fonts/IndieFlower-Regular.woff2",
  "/assets/fonts/Pacifico-Regular.woff2"
];

// Install SW → mise en cache des fichiers statiques
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
   self.skipWaiting();

});

// Fetch → sert les fichiers depuis le cache si disponibles
self.addEventListener("fetch", (event) => {
  const isAppJs = event.request.url.includes("/js/");

  if (isAppJs) {
    // Network-first : le code applicatif est toujours pris depuis le réseau en priorité,
    // pour que les mises à jour de code soient visibles sans attendre un changement de CACHE_NAME.
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first pour le reste (fonts, CSS, images, pages statiques)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).catch((err) => {
        console.warn("Fetch échoué (réseau/CSP), ignoré :", event.request.url, err.message);
        return new Response("", { status: 504, statusText: "Fetch failed" });
      });
    })
  );
});

// Activate → nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    
  
  ).then(() => self.clients.claim())
  // self.clients.claim(); // ❌ désactivé pour éviter les reloads
);
});