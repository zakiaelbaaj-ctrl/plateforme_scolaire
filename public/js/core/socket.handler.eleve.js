import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { WSLogger } from "./ws.logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { CallStateMachine } from "../domains/call/call.state.machine.js";
import { CallService } from "../domains/call/call.service.js";

class SocketHandlerEleve {
  constructor() {
    this._unsubscribeSocket = socketService.onMessage((data) => this.handle(data));
    this._unsubscribeCall = AppState.on("ui:requestCall", (prof) => this.handleOutgoingCall(prof));
  }

  handle(data) {
    if (!data || !data.type) return;
    WSLogger.debug("FULL DATA:", data);
    WSLogger.debug("HANDLER ELEVE RECEIVE:", data.type);

    switch (data.type) {
      case "TRANSPORT_OPEN": this.onTransportOpen(); break;
      case "onlineProfessors":
      case "professorsList":
        AppState.setOnlineProfessors(data.profs ?? data.professors ?? []);
        break;
       case "document":
       case "documentReceived":
       case "newDocument": {
      console.log("📥 document reçu socket:", data);

      const raw = data.document ?? data;

      const normalizedDoc = {
      fileName: raw.fileName ?? raw.name,
      fileData: raw.fileData ?? raw.data,
      sender: raw.userName ?? raw.sender   // ✅ FIX ICI
      };

      console.log("📦 doc normalisé:", normalizedDoc);

      AppState.addDocument(normalizedDoc);
      break;
    }
    case "callSent":
  CallService.handleEvent(data);
  break;

case "twilioToken":
  AppState.startTimer(); // ✅ Timer démarre uniquement quand Twilio confirme
  CallService.handleEvent(data);
  break;

case "incomingCall":
case "callAccepted":
case "callRejected":
case "twilioLocalTrack":
case "twilioRemoteTracks":
  CallService.handleEvent(data);
  break;
      case "invoice:ready": {
  console.log("🧾 Facture disponible:", data.url);
  
  // Afficher notification avec lien de téléchargement
  const container = document.getElementById("invoice-container") 
                 ?? document.getElementById("stripe-status-message");
  
  if (container) {
    container.innerHTML = `
      <div class="invoice-box">
        <p>🧾 <strong>Cours terminé</strong></p>
        <p>Durée : ${data.dureeMinutes} min | Montant : ${data.montant}€</p>
        <a href="${data.url}" target="_blank" class="btn-primary">
          📥 Télécharger ma facture
        </a>
      </div>
    `;
  }
  break;
}
  // ✅ Ces events terminent la session ET stoppent le timer
      case "callEnded":
      case "session:stop":
      case "endSession":
        console.log("🛑 [Élève] Session terminée par le prof");
       AppState.stopTimer();
       AppState.endSession();
       CallService.handleEvent(data);
       break;
       
       case "startSession":
       this.handleStartSession(data);
       break;

       case "joinedRoom": {
  console.log("✅ [Élève] Room rejointe !");
  const roomId = data.roomId ?? data.room;
  if (roomId) AppState.currentRoomId = roomId;
  break;
}
      case "chatMessage":
        AppState.addChatMessage({ sender: data.sender, text: data.text });
        break;

      case "tableauStroke":
      case "tableauSync":
        WhiteboardService.handleEvent(data);
        break;
        case "userJoined":
        case "userLeft":
     // ✅ ignoré silencieusement (pas d'action requise)
        break;
         
      // 👉 Gestion de la facture pour l'élève
     case "invoice:ready":
        console.info(`[FACTURE] Document disponible : ${data.url}`);
        
        // 1. Création de la carte de notification
        const toast = document.createElement("div");
        toast.innerHTML = `
          <div style="margin-bottom: 12px; font-size: 14px;">
            ✅ <strong>Paiement réussi (${data.montant}€)</strong><br>
            <span style="font-size: 12px; opacity: 0.9;">Merci pour cette session de ${data.dureeMinutes} min.</span>
          </div>
          <button id="download-invoice-btn" style="width: 100%; background: white; color: #4CAF50; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">
            📥 Télécharger ma facture
          </button>
        `;
        
        // 2. Style (Flottant, non-bloquant)
        toast.style.cssText = `
          position: fixed; bottom: 20px; right: 20px; z-index: 9999;
          background: #4CAF50; color: white; padding: 16px;
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-family: system-ui, sans-serif; transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // 3. Action : Ouverture du PDF au clic
        document.getElementById("download-invoice-btn").onclick = () => {
            window.open(data.url, '_blank');
            toast.remove();
        };
        
        // 4. Nettoyage automatique (disparaît si ignoré pendant 20s)
        setTimeout(() => {
            if (document.body.contains(toast)) {
                toast.style.opacity = "0";
                setTimeout(() => toast.remove(), 300); // Laisse l'animation se terminer
            }
        }, 20000);
        
        break;
      default:
        WSLogger.warn("Type non géré:", data.type);
    }
  }

  onTransportOpen() {
    AppState.setWsConnected(true);
    if (AppState.currentUser?.id) {
      socketService.send({ type: "identify", ...AppState.currentUser });
    }
  }

  handleStartSession(data) {
    const roomId = data.roomId ?? data.room;
    if (!roomId) return;
    AppState.startSession({ roomId });
    socketService.send({ type: "joinRoom", roomId });
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

let instance = null;

export const socketHandlerEleve = {
  init() {
    if (!instance) {
      instance = new SocketHandlerEleve();
    }
  },
  destroy() {
    instance?.destroy();
    instance = null;
  }
};
