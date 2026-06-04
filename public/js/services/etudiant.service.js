// ======================================================
// SERVICE ÉTUDIANT (API REST)
// ======================================================

import { http, setAuthProvider } from "/js/lib/http.js";
import { AppState }              from "/js/core/state.js";
import { Logger }                from "/js/lib/logger.js";

// ======================================================
// // INITIALISATION DU PROVIDER D'AUTH
// À appeler UNE FOIS au démarrage (depuis dashboard.js ou ici)
// ======================================================


const API_BASE = "v1/etudiant";

export const EtudiantService = {

    async getProfile() {
    try {
        const res = await http.get("/v1/etudiant/me");
        console.log("DEBUG RES COMPLET =", JSON.stringify(res));
        const userData = res.user || res.data || res;
        console.log("DEBUG USER DATA =", JSON.stringify(userData));
       AppState.setCurrentUser(userData); // ✅ merge + notify
Logger.log("👤 Profil étudiant chargé");
return userData;
} catch (error) {
Logger.error("❌ Erreur lors de la récupération du profil", error);
throw error;
    }
},

    async updateProfile(payload) {
        try {
            // Utilise API_BASE (v1/etudiant) + /me -> v1/etudiant/me
            // Le helper http injectera automatiquement le /api au début
            const res = await http.put(`${API_BASE}/me`, payload);
            
            // On gère la récupération des données qu'elles soient dans res.data ou res
            const updatedData = res.user || res.data || res;
            AppState.currentUser = updatedData;
            
            Logger.log("✅ Profil mis à jour");
            return updatedData;
        } catch (err) {
            Logger.error("❌ Erreur mise à jour profil :", err.message);
            throw err;
        }
    },

   async subscribe(plan = "monthly") {
        try {
            // Correction : "v1/..." au lieu de "/api/v1/..."
            const res = await http.post("v1/stripe-student/checkout", { plan });
            
            if (res.url) {
                Logger.log("✅ Redirection paiement...");
                window.location.href = res.url;
            }
        } catch (err) {
            Logger.error("❌ Échec paiement :", err.message);
            throw err;
        }
    },

   async getSubscriptionStatus() {
    try {
        // 1. On appelle ton API (qui interroge PostgreSQL)
        const res = await http.get("v1/stripe-student/status");
        
        // 2. On met à jour l'état global dynamiquement avec la VRAIE réponse du serveur
        AppState.isSubscribed = res.isSubscriber; 
        
        // 3. On renvoie les vraies données (status: "active", "inactive", "none", etc.)
        return { 
            isSubscriber: res.isSubscriber, 
            status: res.status,
            endDate: res.endDate,
            planType: res.planType
        };
    } catch (err) {
        // En cas d'erreur réseau, on passe l'état à faux par sécurité
        AppState.isSubscribed = false;
        Logger.error("❌ Impossible de récupérer le statut de l'abonnement:", err.message);
        return { isSubscriber: false, status: "none" }; 
    }
},
    async getOnlineCount() {
        try {
            const res = await http.get(`${API_BASE}/online-count`);
            return res.data?.count ?? res.count ?? 0;
        } catch (err) {
            Logger.error("❌ Erreur getOnlineCount :", err.message);
            return 0;
        }
    },

    async getSessionHistory() {
        try {
            const res = await http.get(`${API_BASE}/history`);
            return res.data || res;
        } catch (err) {
            Logger.error("❌ Erreur historique :", err.message);
            return [];
        }
    }
};