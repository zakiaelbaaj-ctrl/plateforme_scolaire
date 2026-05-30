// ======================================================
// WEBRTC CONFIG CENTRALISÉE
// STUN / TURN / policies / modes réseau
// ======================================================

import { Logger } from "/js/lib/logger.js";

// ======================================================
// CONFIG DE BASE (fallback STUN public)
// ======================================================

const BASE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  // Important pour NAT strict / mobile
  iceCandidatePoolSize: 10,

  // Permet fallback progressif si réseau instable
  iceTransportPolicy: "all",
};

// ======================================================
// CONFIG DYNAMIQUE (backend / Twilio / TURN premium)
// ======================================================

let cachedConfig = null;
// ✅ AJOUT : Fonction essentielle pour récupérer la configuration synchrone
export function getWebRTCConfig() {
  return cachedConfig || BASE_CONFIG;
}

// ======================================================
// FETCH CONFIG BACKEND (TURN SERVERS)
// ======================================================

export async function loadWebRTCConfig(token) {
  // ✅ SECURITE : Si aucun token n'est passé en paramètre, on le récupère nous-mêmes
  const actualToken = token || localStorage.getItem("token");

  if (!actualToken) {
      Logger.warn("⚠️ Pas de token trouvé pour la config WebRTC → fallback STUN");
      cachedConfig = BASE_CONFIG;
      return cachedConfig;
  }

  try {
    const res = await fetch("/api/v1/webrtc/config", {
      headers: {
        Authorization: `Bearer ${actualToken}`, // Utilisation du token sécurisé
      },
    });

    // ✅ AJOUT : Si le serveur répond 401 ou 403, on lève l'erreur proprement
    if (!res.ok) {
        throw new Error(`Le serveur a refusé l'accès (Code: ${res.status})`);
    }

    const data = await res.json();

    if (!data?.iceServers) {
      Logger.warn("⚠️ Config WebRTC invalide (pas de serveurs) → fallback STUN");
      cachedConfig = BASE_CONFIG;
      return cachedConfig;
    }

    cachedConfig = {
      iceServers: data.iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: "all",
    };

    Logger.log("✅ WebRTC config chargée (backend TURN)");
    return cachedConfig;

  } catch (err) {
    Logger.warn(`⚠️ Impossible de charger TURN (${err.message}) → fallback STUN`);
    cachedConfig = BASE_CONFIG;
    return cachedConfig;
  }
}
// ======================================================
// MODE ADAPTATIF RÉSEAU
// ======================================================

export function getAdaptiveConfig(networkType = "default") {

  const base = getWebRTCConfig();

  switch (networkType) {

    // ⚠️ réseau faible (mobile / 3G)
    case "low":
      return {
        ...base,
        iceCandidatePoolSize: 0,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      };

    // ⚡ réseau stable
    case "high":
      return {
        ...base,
        iceCandidatePoolSize: 10,
      };

    // default
    default:
      return base;
  }
}

// ======================================================
// DEBUG
// ======================================================

export function debugWebRTCConfig() {
  console.log("✅ WebRTC CONFIG :", cachedConfig || BASE_CONFIG);
}
