// ======================================================
// APP STATE — SINGLE SOURCE OF TRUTH (PROF + ELEVE)
// ======================================================

export const AppState = {

  // ==================================================
  // AUTH / USER
  // ==================================================
  token: null,

  currentUser: {
    id: null,
    role: null,        // "prof" | "eleve"
    prenom: null,
    nom: null,
    email: null,
    ville: null,
    pays: null,
    niveau: null
  },

  // ==================================================
  // WEBSOCKET
  // ==================================================
  ws: null,
  wsUrl: null,
  wsConnected: false,
  wsQueue: [],
  wsReconnectAttempts: 0,
  wsMaxReconnectAttempts: 5,
  wsExpectedClose: false,
  lastHeartbeat: null,
  latency: null,

  // ==================================================
  // PRESENCE / PROFESSORS (ELEVE)
  // ==================================================
  hasOnlineProfessors: false,

  professors: {
    list: [],

    setOnlineList: (profs = []) => {
      AppState.professors.list = profs;
      AppState.hasOnlineProfessors = profs.length > 0;
    },

    clear: () => {
      AppState.professors.list = [];
      AppState.hasOnlineProfessors = false;
    }
  },

  // ==================================================
  // CALL (ELEVE)
  // ==================================================
  call: {
    inProgress: false,
    professorId: null,
    startedAt: null,

    start: (professorId) => {
      AppState.call.inProgress = true;
      AppState.call.professorId = professorId;
      AppState.call.startedAt = Date.now();
    },

    end: () => {
      AppState.call.inProgress = false;
      AppState.call.professorId = null;
      AppState.call.startedAt = null;
    }
  },

  // ==================================================
  // SESSION / VISIO (PROF + ELEVE)
  // ==================================================
  sessionInProgress: false,
  selectedStudentId: null,
  currentRoomId: null,

  startSession({ roomId, studentId = null }) {
    this.sessionInProgress = true;
    this.currentRoomId = roomId ?? null;
    this.selectedStudentId = studentId;
  },

  resetSession() {
    this.sessionInProgress = false;
    this.selectedStudentId = null;
    this.currentRoomId = null;
    AppState.call.end();
    AppState.stopTimer();
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

    this.timerInterval = setInterval(() => {
      AppState.callSeconds++;
      AppState._notify("timer:update", AppState.callSeconds);
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.timerInterval = null;
    this.timerRunning = false;
    this.callSeconds = 0;

    AppState._notify("timer:reset");
  },

  // ==================================================
  // CHAT
  // ==================================================
  chat: {
  messages: [],
  _seenIds: new Set(),

  addMessage: ({ messageId, sender, text }) => {

    // 🔒 Anti-duplication
    if (messageId && AppState.chat._seenIds.has(messageId)) {
      return;
    }

    if (messageId) {
      AppState.chat._seenIds.add(messageId);
    }

    AppState.chat.messages.push({ messageId, sender, text });

    AppState._notify("chat:new", {
      messageId,
      sender,
      text
    });
  }
},

  // ==================================================
  // DOCUMENTS
  // ==================================================
 documents: {
  list: [],

  add: ({ fileName, fileData, sender, userName }) => {
    const finalSender = sender || userName || "Inconnu";

    AppState.documents.list.push({
      fileName,
      fileData,
      sender: finalSender
    });

    AppState._notify("documents:new", {
      fileName,
      fileData,
      sender: finalSender
    });
  },

  clear: () => {
    AppState.documents.list = [];
    AppState._notify("documents:clear");
  }
},

  // ==================================================
  // FACTURATION (PROF)
  // ==================================================
  invoice: {
    last: null,

    show: (data) => {
      AppState.invoice.last = data;
      AppState._notify("invoice:show", data);
    }
  },

  // ==================================================
  // GLOBAL RESET (LOGOUT / HARD RESET)
  // ==================================================
  resetAll() {
    this.resetSession();

    this.token = null;

    this.currentUser = {
      id: null,
      role: null,
      prenom: null,
      nom: null,
      email: null,
      ville: null,
      pays: null,
      niveau: null
    };

    this.professors.clear();
    this.chat.clear();
    this.documents.clear();

    this.wsQueue = [];
    this.wsConnected = false;
    this.wsReconnectAttempts = 0;
    this.wsExpectedClose = false;
    this.lastHeartbeat = null;
    this.latency = null;

    this.invoice.last = null;

    console.log("♻️ AppState réinitialisé");
  },

  // ==================================================
  // EVENT SYSTEM (UI LISTENERS)
  // ==================================================
  _listeners: {},

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  },

  _notify(event, payload = null) {
    const list = this._listeners[event];
    if (!list) return;
    list.forEach(cb => cb(payload));
  }
};
