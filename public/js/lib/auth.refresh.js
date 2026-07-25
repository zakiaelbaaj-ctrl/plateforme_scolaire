// public/js/lib/auth.refresh.js
// Rafraîchit le token JWT via le refresh token stocké en localStorage.
// Utilisé à la fois par http.js (401 sur requêtes REST) et socket.service.js (WS fermé code 1008).
let refreshInFlight = null;

export async function refreshAccessToken() {
     if (refreshInFlight) {
        // Un refresh est déjà en cours : on attend son résultat au lieu d'en lancer un second
        return refreshInFlight;
    }
    refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return false;

    try {
        const res = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) return false;

        const data = await res.json();
        if (!data.success || !data.accessToken) return false;

        localStorage.setItem("token", data.accessToken);
        if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
        }
        return true;
    } catch {
     return false;
        } finally {
            refreshInFlight = null; // ✅ libère la garde une fois terminé
        }
    })();
    return refreshInFlight;
}