// ======================================================
// IMPORTS (✅ CORRIGÉ)
// ======================================================
import { CallStateMachine } from "../domains/call/call.state.machine.js";

// ======================================================
// APP STATE — SINGLE SOURCE OF TRUTH (IMPROVED)
// ======================================================
export const AppState = {

  // ==================================================
  // AUTH / USER
  // ==================================================
  token: null,

  currentUser: {
    id: null,
    role: null,
    prenom: null,
    nom: null,
    email: null,
    ville: null,
    pays: null,
    niveau: null
  },

  setCurrentUser(user = {}) {
    if (!user || typeof user !== "object") return;

    this.currentUser = { ...this.currentUser, ...user };
    this._notify("user:update", this.currentUser);
  },
  // ==================================================
  // ÉTUDIANTS EN LIGNE (PEER-TO-PEER)
  // ==================================================
  onlineStudents: [],

  setOnlineStudents(students) {
    this.onlineStudents = Array.isArray(students) ? students : [];
    this._notify("students:update", this.onlineStudents);
  },

  // ==================================================
  // WEBSOCKET
  // ==================================================
  wsConnected: false,
  wsReady: false,

  setWsConnected(value) {
    this.wsConnected = !!value;
    this._notify("ws:connected", this.wsConnected);
  },

  setWsReady(value) {
    this.wsReady = !!value;
    this._notify("ws:ready", this.wsReady);
  },

  // ==================================================
  // PRESENCE
  // ==================================================
  onlineProfessors: [],

  get hasOnlineProfessors() {
    return this.onlineProfessors.length > 0;
  },

  setOnlineProfessors(profs = []) {
    if (!Array.isArray(profs)) return;

    this.onlineProfessors = [...profs]; // ✅ immutabilité
    this._notify("professors:update", this.onlineProfessors);
  },

  // ==================================================
  // CALL STATE
  // ==================================================
  _callState: null,

  get callState() {
    return this._callState;
  },

  getCallState() {
    return this._callState;
  },

  setCallState(state) {
    if (this._callState === state) return; // ✅ évite spam

    this._callState = state;
    this._notify("callState:change", state);
  },

  requestCall(prof) {
    if (!prof) return;
    this._notify("ui:requestCall", prof);
  },

  currentIncomingCallEleveId: null,

  setIncomingCallEleveId(id) {
    this.currentIncomingCallEleveId = id ?? null;
    this._notify("call:incomingId", this.currentIncomingCallEleveId);
  },

  // ==================================================
  // SESSION / VISIO
  // ==================================================
  sessionInProgress: false,
  currentRoomId: null,
  selectedStudentId: null,

  startSession({ roomId, studentId = null } = {}) {
    if (!roomId) return;
   // ✅ PROTECTION CONTRE LES BOUCLES INFINIES
    if (this.sessionInProgress && this.currentRoomId === roomId) {
      console.warn("⚠️ Session déjà en cours pour cette room, ignore le startSession");
      return; 
    }
    // ✅ Si on change de room, on reset proprement l'ancienne session
  if (this.sessionInProgress && this.currentRoomId !== roomId) {
    console.warn("⚠️ Nouvelle room détectée, reset de l'ancienne session");
    this.endSession();
  }
    this.sessionInProgress = true;
    this.currentRoomId = roomId;
    this.selectedStudentId = studentId;

    this._notify("session:start", {
      roomId,
      studentId
    });
  },

  endSession() {
  this.sessionInProgress = false;
  this.currentRoomId = null;
  this.selectedStudentId = null;

  CallStateMachine.reset(); // ✅ remet la machine à idle proprement

  this._notify("session:end");
},

  // ==================================================
  // TIMER
  // ==================================================
  timerRunning: false,
  callSeconds: 0,
  timerInterval: null,

  startTimer() {
    if (this.timerRunning) return;

    this.timerRunning = true;
    this.callSeconds = 0;

    this._notify("timer:start");

    this.timerInterval = setInterval(() => {
      this.callSeconds++;
      this._notify("timer:update", this.callSeconds);
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = null;
    this.timerRunning = false;
    this.callSeconds = 0;

    this._notify("timer:reset");
  },

  // ==================================================
  // CHAT
  // ==================================================
  chatMessages: [],
  _seenMessageIds: new Set(),

  addChatMessage({ messageId, sender, text } = {}) {
    if (!text) return;

    if (messageId && this._seenMessageIds.has(messageId)) return;

    if (messageId) {
      this._seenMessageIds.add(messageId);
    }

    const msg = { messageId, sender, text };

    this.chatMessages = [...this.chatMessages, msg]; // ✅ immutabilité
    this._notify("chat:new", msg);
  },

  clearChat() {
    this.chatMessages = [];
    this._seenMessageIds.clear();
    this._notify("chat:clear");
  },

  // ==================================================
  // DOCUMENTS
  // ==================================================
  documents: [],

  addDocument({ fileName, fileData, sender } = {}) {
    if (!fileName || !fileData) {
      console.warn("⚠️ Document invalide ignoré", { fileName, fileData });
      return;
    }

    const doc = {
      fileName,
      fileData,
      sender: sender || "Inconnu"
    };

    console.log("🔥 AppState.addDocument EXECUTÉ:", doc);

    this.documents = [...this.documents, doc]; // ✅ immutabilité
    this._notify("documents:new", doc);
  },

  clearDocuments() {
    this.documents = [];
    this._notify("documents:clear");
  },

  // ==================================================
  // FACTURATION
  // ==================================================
  invoice: null,

  showInvoice(data) {
    if (!data) return;

    this.invoice = data;
    this._notify("invoice:show", data);
  },

  // ==================================================
  // RESET GLOBAL
  // ==================================================
  resetAll() {
    this.token = null;

    this.setCurrentUser({
      id: null,
      role: null,
      prenom: null,
      nom: null,
      email: null,
      ville: null,
      pays: null,
      niveau: null
    });

    this.setWsConnected(false);
    this.setWsReady(false);
    this.setOnlineProfessors([]);

    this.setCallState(null);
    this.setIncomingCallEleveId(null);

    this.endSession();
    this.stopTimer();

    this.clearChat();
    this.clearDocuments();

    this.invoice = null;
    this._notify("invoice:clear");

    // ✅ reset listeners (important)
    this._listeners = {};

    this._notify("app:reset");

    console.log("♻️ AppState réinitialisé");
  },

  // ==================================================
  // EVENT SYSTEM (ROBUSTE)
  // ==================================================
  _listeners: {},

  on(event, callback) {
    if (!event || typeof callback !== "function") return () => {};

    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }

    this._listeners[event].push(callback);

    return () => {
      const arr = this._listeners[event];
      if (!arr) return;

      this._listeners[event] = arr.filter(cb => cb !== callback);
    };
  },

  _notify(event, payload = null) {
    const list = this._listeners[event];
    if (!list || list.length === 0) return;

    const listenersCopy = [...list]; // ✅ safe dispatch

    console.log("📡 _notify:", event, payload);

    for (const cb of listenersCopy) {
      try {
        cb(payload);
      } catch (e) {
        console.error(`Listener error (${event})`, e);
      }
    }
  }
};

// ======================================================
// BRIDGE CALL STATE MACHINE → APPSTATE
// ======================================================
CallStateMachine.onChange((state) => {
  AppState.setCallState(state);
});

// ======================================================
// DEBUG SAFE (PAS GLOBAL SALE)
// ======================================================
if (typeof window !== "undefined") {
  window.__APP_STATE__ = AppState; // debug uniquement
}