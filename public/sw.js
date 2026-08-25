const CACHE_NAME = "urgencescolaire-v9"; // ⚠️ Incrémenté pour forcer la mise à jour (fix bouton whiteboard iPad)
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

  // 🔒 Ne jamais intercepter les dashboards WebRTC (Étudiant & Élève)
  if (
    url.pathname.includes("/pages/etudiant/dashboard.html") ||
    url.pathname.includes("/pages/eleve/dashboard.html")
  ) {
    return;
  }

  // 🔄 Fichiers JS : Réseau d'abord, secours en cache
  if (isAppJs) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // 📦 Cache-first pour le reste
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
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

  self.clients.claim();
});

// ---------------------------------------------------------
// PUSH → Réception d'une notification push / Appel entrant
// ---------------------------------------------------------
self.addEventListener("push", (event) => {
  let payload = { title: "Urgence Scolaire", body: "Notification reçue", url: "/" };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch (e) {
    payload.body = event.data ? event.data.text() : "";
  }

  if (payload.type === "call_cancelled") {
    event.waitUntil(
      self.registration.getNotifications({ tag: payload.tag || "incoming-call" }).then((notifications) => {
        notifications.forEach((n) => n.close());
      })
    );
    return;
  }

  const isCall = payload.type === "incoming_call" || payload.tag === "incoming-call";
  const dashboardByRole = {
    professeur: "/pages/professeur/dashboard.html",
    eleve: "/pages/eleve/dashboard.html",
    etudiant: "/pages/etudiant/dashboard.html"
  };
  const fallbackUrl = dashboardByRole[payload.recipientRole] || "/";
  const options = {
    body: payload.body || "",
    icon: "/assets/icons/icones.png",
    badge: "/assets/icons/icones.png",
    tag: payload.tag || "default",
    renotify: true,
    requireInteraction: true,
    vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    data: {
      url: payload.url || fallbackUrl,
      roomUrl: payload.roomUrl || null
    },
    actions: isCall ? [
      { action: "accept", title: "📞 Décrocher" },
      { action: "reject", title: "✕ Refuser" }
    ] : []
  };

  event.waitUntil(
    (async () => {
      // ✅ NOUVEAU — ferme explicitement toute notification existante avec ce tag
      // avant d'en afficher une nouvelle, pour éviter les doublons si le SW a
      // redémarré entre deux envois (cas d'un appareil qui s'est mis en veille)
      if (isCall) {
        const existing = await self.registration.getNotifications({ tag: options.tag });
        existing.forEach((n) => n.close());
      }
      await self.registration.showNotification(payload.title || "Urgence Scolaire", options);
    })()
  );
});

// ---------------------------------------------------------
// NOTIFICATIONCLICK → Gestion des clics et des boutons d'appel
// ---------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Si le professeur clique sur "Refuser"
  if (event.action === "reject") {
    return;
  }

  // Traitement si clic sur la notification ou "Décrocher"
  const targetUrl = event.notification.data?.url || "/";
  const roomUrl = event.notification.data?.roomUrl;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 1. Si la PWA est déjà ouverte, la ramener au premier plan
      for (const client of clientList) {
  if (client.url.includes(targetUrl) && "focus" in client) {
    client.postMessage({ type: "INCOMING_CALL_ACCEPTED", roomUrl }); // ✅ à ajouter
    return client.focus();
  }
}
      // 2. Sinon, ouvrir une nouvelle fenêtre PWA vers le tableau de bord
      if (self.clients.openWindow) {
        return self.clients.openWindow(roomUrl || targetUrl);
      }
    })
  );
});