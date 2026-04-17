// ======================================================
// APP STATE — SINGLE SOURCE OF TRUTH (CLEAN VERSION)
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
    this.currentUser = { ...this.currentUser, ...user };
    this._notify("user:update", this.currentUser);
  },

  // ==================================================
  // WEBSOCKET
  // ==================================================
  wsConnected: false,
  wsReady: false,

  setWsConnected(value) {
    this.wsConnected = value;
    this._notify("ws:connected", value);
  },

  setWsReady(value) {
    this.wsReady = value;
    this._notify("ws:ready", value);
  },

  // ==================================================
  // PRESENCE
  // ==================================================
  onlineProfessors: [],

  get hasOnlineProfessors() {
  return this.onlineProfessors.length > 0;
},

  setOnlineProfessors(profs = []) {
    this.onlineProfessors = profs;
    this._notify("professors:update", profs);
  },

 // ======================================================
// CALL STATE
// ======================================================
_callState: null,

setCallState(state) {
  this._callState = state;
  this._notify("callState:change", state);
},

getCallState() {
  return this._callState;
},
 requestCall(prof) {
  this._notify("ui:requestCall", prof);
},
  currentIncomingCallEleveId: null,

  setIncomingCallEleveId(id) {
    this.currentIncomingCallEleveId = id;
    this._notify("call:incomingId", id);
  },

  // ==================================================
  // SESSION / VISIO
  // ==================================================
  sessionInProgress: false,
  currentRoomId: null,
  selectedStudentId: null,

  startSession({ roomId, studentId = null }) {
    this.sessionInProgress = true;
    this.currentRoomId = roomId ?? null;
    this.selectedStudentId = studentId;

    this._notify("session:start", {
      roomId: this.currentRoomId,
      studentId: this.selectedStudentId
    });
  },

  endSession() {
    this.sessionInProgress = false;
    this.currentRoomId = null;
    this.selectedStudentId = null;

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

  addChatMessage({ messageId, sender, text }) {
    if (messageId && this._seenMessageIds.has(messageId)) return;

    if (messageId) {
      this._seenMessageIds.add(messageId);
    }

    const msg = { messageId, sender, text };

    this.chatMessages.push(msg);
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

  addDocument({ fileName, fileData, sender }) {
    const doc = {
      fileName,
      fileData,
      sender: sender || "Inconnu"
    };

    this.documents.push(doc);
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


    this._notify("app:reset");

    console.log("♻️ AppState réinitialisé");
  },

  // ==================================================
  // EVENT SYSTEM (REACTIF)
  // ==================================================
  _listeners: {},

  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }

    this._listeners[event].push(callback);

    // ✅ unsubscribe propre
    return () => {
      this._listeners[event] =
        this._listeners[event].filter(cb => cb !== callback);
    };
  },

  _notify(event, payload = null) {
    const list = this._listeners[event];
    if (!list) return;

    list.forEach(cb => {
      try {
        cb(payload);
      } catch (e) {
        console.error(`Listener error (${event})`, e);
      }
    });
  }
};
// ======================================================
// 🔥 BRIDGE CALL STATE MACHINE → APPSTATE
// ======================================================
import { CallStateMachine } from "../domains/call/call.state.machine.js";

CallStateMachine.onChange((state) => {
  AppState.setCallState(state);
});