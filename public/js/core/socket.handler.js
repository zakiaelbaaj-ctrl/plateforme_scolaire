import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { WSLogger } from "./ws.logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { CallService } from "../domains/call/call.service.js";
import { SessionService } from "../domains/session/session.service.js";
class SocketHandlerProf {
  constructor() {
    this._unsubscribeSocket = socketService.onMessage((data) => this.handle(data));
    this._unsubscribeCall = AppState.on("ui:requestCall", (prof) => this.handleOutgoingCall(prof));
  }

  handle(data) {
    if (!data || !data.type) return;
    WSLogger.debug("🔥 PROF RAW SOCKET:", data);
    WSLogger.debug("HANDLER PROF RECEIVE:", data.type);

    switch (data.type) {
    case "TRANSPORT_OPEN": 
        this.onTransportOpen(); 
        break;
     case "document":
     case "documentReceived":
     case "newDocument": {
     console.log("📥 document reçu PROF:", data);
     const raw = data.document ?? data;

const normalizedDoc = {
  fileName: raw.fileName ?? raw.name ?? "unknown",
  fileData: raw.fileData ?? raw.data ?? null,
  sender: raw.userName ?? raw.sender ?? "Inconnu"
};

     console.log("📦 doc normalisé PROF:", normalizedDoc);
      AppState.addDocument(normalizedDoc);
      break;
      }
      case "callSent":
case "incomingCall":
case "callAccepted":
case "callRejected":
case "twilioToken":
  CallService.handleEvent(data);
  break;

case "callEnded":
case "session:stop":
  SessionService._handleWs(data);
  break;

      case "startSession": 
  this.handleStartSession(data); 
  break;

// ✅ joinedRoom : ne reappelle PAS startSession, démarre juste le timer
case "joinedRoom": {
  console.log("✅ joinedRoom reçu côté prof", data);
  const roomId = data.roomId ?? data.room;
  if (!roomId) {
  console.warn("⚠️ joinedRoom sans roomId", data);
  break;
}

// ✅ PAS de startSession ici (déjà fait dans handleStartSession)
// ✅ PAS de setCallState ici (CallService.handleEvent("startSession") le fait)

// ✅ Timer démarré ici, une seule fois
AppState.startTimer();
break;
}

case "chatMessage":
  AppState.addChatMessage({
    sender: data.sender ?? "élève",
    text: data.text ?? ""
  });
  break;
  case "ws:status":
  AppState._notify("ws:status", data);
  break;

      case "tableauStroke":
      case "tableauSync":
      case "tableauClear":
      case "tableauUndo":
      case "tableauRedo":    
        WhiteboardService.handleEvent(data);
        break;
      case "screenShareStarted":
  // L'overlay est géré par Twilio directement via attachTrack
      console.log("📺 Partage d'écran démarré par", data.userName);
      break;

      case "screenShareStopped": {
    import("/js/ui/components/screen.share.overlay.js").then(({ ScreenShareOverlay }) => {
    ScreenShareOverlay.hide();
  });
     const btn = document.getElementById("screen-share-btn");
        if (btn) { 
          btn.classList.remove("active"); // 🛑 Éteint proprement le halo bleu lumineux
          btn.title = "Partager l'écran"; 
        }
        break;
      }

      case "userJoined":
      case "userLeft":
        break;
        
        case "invoice:ready":
        
        // 1. Log d'information discret (utile pour le monitoring)
        console.info(`[PAIE] Session payée : ${data.montant}€`);
        
        // 2. Déclencher une notification non-bloquante dans l'UI
        AppState._notify("ui:notification", {
            type: "success",
            title: "Paiement reçu",
            message: `Gain de la session : ${data.montant}€ (${data.dureeMinutes} min)`
        });

        // 3. Mettre à jour le solde du prof s'il est affiché sur son tableau de bord
        AppState._notify("wallet:update", data.montant); 
        
        break;
        // Dans SocketHandlerProf.handle(), avant default:
      case "TRANSPORT_CLOSED":
       // ✅ Silencieux — la reconnexion est gérée par socket.service.js
       break;
        case "error":
       WSLogger.warn(`Erreur serveur [${data.code ?? "?"}] :`, data.message ?? "");
       if (data.message) {
       const el = document.getElementById("call-status");
       if (el) el.textContent = `⚠️ ${data.message}`;
      }
       break;
     // 🟢 Ajout du succès de démarrage du partage d'écran
       case 'screenShareStartSuccess':
       console.log("🖥️ [WS] Le serveur a validé le début du partage d'écran.");
        // Optionnel : tu peux forcer un état ici si nécessaire
        break;

      // 🟢 Ajout du succès d'arrêt du partage d'écran
        case 'screenShareStopSuccess':
        console.log("🖥️ [WS] Le serveur a validé l'arrêt du partage d'écran.");
        break;

       // Ton cas par défaut qui générait le warning :
        default:
        WSLogger.warn("Type WS non géré (prof) :", data.type);
        }
         }
      onTransportOpen() {
      AppState.setWsConnected(true);
       if (AppState.currentUser?.id) {
      socketService.send({
        type: "identify",
        ...AppState.currentUser,
        tabId: sessionStorage.getItem("tabId")
      });
    }
  }

 handleStartSession(data) {
  const roomId = data.roomId ?? data.room;
  if (!roomId) return;
  AppState.startSession({ roomId }); // ✅ une seule fois
  socketService.send({ type: "joinRoom", roomId });
  // ✅ Timer démarré dans joinedRoom, pas ici
}

  handleOutgoingCall(prof) {
    if (!prof?.id) return;
    CallService.callProfessor(prof.id);
  }

  destroy() {
    this._unsubscribeSocket();
    if (this._unsubscribeCall) this._unsubscribeCall();
  }
}

export const socketHandlerProf = new SocketHandlerProf();
