// ======================================================
// PEER CONNECTION (WEBRTC CORE)
// Gestion pure de RTCPeerConnection
// ======================================================

import { Logger } from "/js/lib/logger.js";
import { AppState } from "/js/core/state.js";

// ======================================================
// CONFIG WEBRTC
// ======================================================

const DEFAULT_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ======================================================
// PEER CONNECTION CLASS
// ======================================================

export class PeerConnection {

  constructor({ config = DEFAULT_CONFIG } = {}) {
    this.config = config;

    this.pc = null;

    this.onTrackCallback = null;
    this.onIceCallback   = null;
    this.onStateCallback = null;

    this.iceQueue = [];
  }

  // ====================================================
  // INIT CONNECTION
  // ====================================================

  create() {
    this.destroy();

    this.pc = new RTCPeerConnection(this.config);

   Logger.log("🧠 PeerConnection créé");

    // ---------------------------
    // TRACKS (stream distant)
    // ---------------------------

    this.pc.ontrack = (event) => {
  Logger.log("📡 Remote stream reçu");
  if (this.onTrackCallback) {
    this.onTrackCallback(event.streams[0], event.track); // ✅ track en 2e argument
  }
};

    // ---------------------------
    // ICE CANDIDATES
    // ---------------------------

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCallback) {
        this.onIceCallback(event.candidate);
      }
    };

    // ---------------------------
    // CONNECTION STATE
    // ---------------------------

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;

      Logger.log("📶 WebRTC state:", state);

      if (this.onStateCallback) {
        this.onStateCallback(state);
      }
    };

    return this.pc;
  }

  // ====================================================
  // LOCAL STREAM
  // ====================================================

  addLocalStream(stream) {
    if (!this.pc) return;

    stream.getTracks().forEach(track => {
      this.pc.addTrack(track, stream);
    });

    Logger.log("📤 Stream local ajouté");
  }

  // ====================================================
  // OFFER / ANSWER
  // ====================================================

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    Logger.log("📥 Offer créée");

    return offer;
  }

  async createAnswer() {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    Logger.log("📥 Answer créée");

    return answer;
  }

  async setRemoteDescription(desc) {
    await this.pc.setRemoteDescription(desc);

    Logger.log("📡 RemoteDescription défini");

    // flush ICE queue
    for (const c of this.iceQueue) {
      await this.addIceCandidate(c);
    }

    this.iceQueue = [];
  }

  // ====================================================
  // ICE CANDIDATES
  // ====================================================

  async addIceCandidate(candidate) {
    if (!this.pc.remoteDescription) {
      this.iceQueue.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      Logger.error("❌ ICE error :", err);
    }
  }

  // ====================================================
  // DATA CHANNELS
  // ====================================================

  createDataChannel(label, options = {}) {
    if (!this.pc) return null;

    const channel = this.pc.createDataChannel(label, options);

    Logger.log("📡 DataChannel créé :", label);
    return channel;
  }

  setDataChannelHandler(callback) {
    this.pc.ondatachannel = (event) => {
      Logger.log("📥 DataChannel reçu :", event.channel.label);
      callback?.(event.channel);
    };
  }

  // ====================================================
  // CALLBACKS
  // ====================================================

  onTrack(cb) {
    this.onTrackCallback = cb;
  }

  onIceCandidate(cb) {
    this.onIceCallback = cb;
  }

  onStateChange(cb) {
    this.onStateCallback = cb;
  }

  // ====================================================
  // UTIL
  // ====================================================

  getState() {
    return this.pc?.connectionState || "new";
  }

  getPC() {
    return this.pc;
  }

  // ====================================================
  // CLEANUP
  // ====================================================

  destroy() {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.ondatachannel = null;

      this.pc.close();
      this.pc = null;

      Logger.log("🧹 PeerConnection détruit");
    }

    this.iceQueue = [];
  }
}
