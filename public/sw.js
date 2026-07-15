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

// ---------------------------------------------------------
// INSTALL → Mise en cache des fichiers statiques
// ---------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );

  // Permet au nouveau SW de s'activer immédiatement
  self.skipWaiting();
});

// ---------------------------------------------------------
// FETCH → Cache-first sauf pour les fichiers JS (network-first)
// ---------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppJs = event.request.url.includes("/js/");
   // 🔒 Ne jamais intercepter la page WebRTC Étudiant
  if (url.pathname.includes("/pages/etudiant/dashboard.html")) {
    // On laisse le navigateur gérer cette requête normalement
    return;
  }
  if (isAppJs) {
    // JS toujours pris depuis le réseau → évite les vieilles versions
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first pour le reste
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).catch((err) => {
        console.warn("Fetch échoué :", event.request.url, err.message);
        return new Response("", { status: 504, statusText: "Fetch failed" });
      });
    })
  );
});

// ---------------------------------------------------------
// ACTIVATE → Suppression des anciens caches
// ---------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🗑 Suppression ancien cache :", key);
            return caches.delete(key);
          }
        })
      )
    )
  );

  // Le SW prend immédiatement le contrôle des pages ouvertes
  self.clients.claim();
});
