// ======================================================
// SESSION SERVICE ÉTUDIANT — SYSTÈME PEER ÉTUDIANT-ÉTUDIANT
// ✅ Fichier séparé — ne touche pas session.service.js (prof-élève)
// ✅ Imports minimaux : AppState + socketService uniquement
// ======================================================

import { AppState }      from "/js/core/state.js";
import { socketService } from "/js/core/socket.service.js";

export const SessionServiceEtudiant = {

  // --------------------------------------------------
  // SYSTÈME D'ABONNEMENT INTERNE
  // --------------------------------------------------
  _listeners: [],

  init(callback) {
    if (typeof callback === "function") {
      this._listeners.push(callback);
    }
  },

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  },

  // --------------------------------------------------
  // ROUTAGE DES EVENTS WS
  // Ne traite QUE les types préfixés "student:"
  // --------------------------------------------------
  _handleWs(data) {
    if (!data?.type) return;
    if (!data.type.startsWith("student:") && data.type !== "error") return;

    switch (data.type) {
      case "student:onlineStudents": {
        this._notify({
          type:     "onlineStudents",
          students: data.students ?? []
        });
        break;
      }

      case "student:queued": {
        this._notify({
          type:    "studentQueued",
          message: data.message,
          matiere: data.matiere,
          niveau:  data.niveau
        });
        break;
      }

      case "student:matchFound": {
        AppState.currentStudentRoomId = data.roomId;
        this._notify({
          type:        "studentMatchFound",
          roomId:      data.roomId,
          partnerName: data.partnerName
        });
        socketService.send({ type: "student:joinRoom", roomId: data.roomId });
        break;
      }

      case "student:joinedRoom": {
        this._notify({ type: "studentJoinedRoom", roomId: data.roomId });
        break;
      }

      case "student:userJoined": {
        this._notify({
          type:     "studentUserJoined",
          userId:   data.userId,
          userName: data.userName
        });
        break;
      }

      case "student:userLeft": {
        this._notify({
          type:     "studentUserLeft",
          userId:   data.userId,
          userName: data.userName
        });
        break;
      }

      case "student:sessionReady": {
        this._notify({
          type:      "studentSessionReady",
          roomId:    data.roomId,
          initiator: data.initiator
        });
        break;
      }

      case "student:signal": {
        this._notify({
          type:   "studentSignal",
          from:   data.from,
          signal: data.signal
        });
        break;
      }

      case "student:chatMessage": {
        this._notify({
          type:      "studentChatMessage",
          userId:    data.userId,
          sender:    data.sender,
          text:      data.text,
          timestamp: data.timestamp
        });
        break;
      }

      case "student:document": {
        this._notify({
          type:      "studentDocument",
          userId:    data.userId,
          userName:  data.userName,
          fileName:  data.fileName,
          fileData:  data.fileData,
          timestamp: data.timestamp
        });
        break;
      }

      case "error": {
        if (data.code === "NO_SUBSCRIPTION") {
          this._notify({ type: "noSubscription" });
        }
        break;
      }
    }
  },

  // --------------------------------------------------
  // ACTIONS SORTANTES
  // --------------------------------------------------

  enqueue(matiere, sujet = "") {
    if (!matiere) return;
    socketService.send({
      type:   "student:enqueue",
      matiere,
      sujet,
      niveau: AppState.currentUser?.niveau || ""
    });
  },

  dequeue() {
    socketService.send({ type: "student:dequeue" });
  },

  leaveRoom() {
    const roomId = AppState.currentStudentRoomId;
    if (!roomId) return;
    socketService.send({ type: "student:leaveRoom", roomId });
    AppState.currentStudentRoomId = null;
  },

  sendSignal(signal) {
    const roomId = AppState.currentStudentRoomId;
    if (!roomId || !signal) return;
    socketService.send({ type: "student:signal", roomId, signal });
  },

  sendChat(text) {
    const roomId = AppState.currentStudentRoomId;
    if (!roomId || !text) return;
    socketService.send({
      type:   "student:chatMessage",
      roomId,
      text:   text.trim().substring(0, 2000)
    });
  },

  sendDocument(fileName, fileData) {
    const roomId = AppState.currentStudentRoomId;
    if (!roomId || !fileData) return;
    socketService.send({
      type:     "student:documentShare",
      roomId,
      fileName: fileName || "document",
      fileData
    });
  },

  async checkSubscription(token) {
    try {
      const res = await fetch("/api/v1/stripe-student/status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      console.error("❌ Erreur vérification abonnement:", err);
      return { status: "none" };
    }
  },

  async subscribe(token, planType = "monthly") {
    try {
      const res  = await fetch("/api/v1/stripe-student/subscribe", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ planType })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      return data;
    } catch (err) {
      console.error("❌ Erreur abonnement:", err);
      return null;
    }
  },

  cleanup() {
    this.leaveRoom();
    this._listeners = [];
  }
};