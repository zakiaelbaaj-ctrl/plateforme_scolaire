// ws/etudiant/video.js
// ✅ Signalisation WebRTC peer-to-peer entre étudiants
// Le serveur est un simple relais : il ne traite pas le contenu des signaux
// La connexion vidéo réelle est établie directement entre les deux navigateurs

import { relaySignal } from "./rooms.js";

// =======================================================
// RELAY SIGNAL
// Reçoit offer / answer / ice-candidate depuis un client
// et le retransmet à l'autre pair via rooms.js
// =======================================================
export function handleSignal(ws, { roomId, signal }) {
    if (!roomId || !signal) return;

    relaySignal(ws, { roomId, signal });
}

// =======================================================
// SCHÉMA DE NÉGOCIATION WebRTC côté client (rappel)
//
// Étudiant A (initiator: true)          Étudiant B (initiator: false)
//      |                                      |
//      |── createOffer()                      |
//      |── setLocalDescription(offer)         |
//      |── WS: { type:"offer", sdp }  ──────►|
//      |                                      |── setRemoteDescription(offer)
//      |                                      |── createAnswer()
//      |                                      |── setLocalDescription(answer)
//      |◄─────── WS: { type:"answer", sdp } ─|
//      |── setRemoteDescription(answer)       |
//      |                                      |
//      |◄──── WS: { type:"ice-candidate" } ──►| (échange bidirectionnel)
//      |                                      |
//      |========= connexion P2P établie ==========|
// =======================================================