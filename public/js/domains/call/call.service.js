// ======================================================
// CALL DOMAIN SERVICE — ARCHITECTURE CLEAN (STATE MACHINE)
// ======================================================

import { AppState } from "../../core/state.js";
import { socketService } from "../../core/socket.service.js";
import { VideoService } from "./video.service.js";
import { CallStateMachine } from "../../core/call.state.machine.js";

export const CallService = {

  /* ======================================================
     EVENT INBOUND (WS → STATE MACHINE)
  ====================================================== */
  handleEvent(data) {
    if (!data || !data.type) return;

    switch (data.type) {

      /* ---------------------------
         PRESENCE
      --------------------------- */
      case "professorsList":
        if (Array.isArray(data.professors)) {
          AppState.setOnlineProfessors(data.professors);
        }
        break;

      /* ---------------------------
         CALL FLOW
      --------------------------- */
      case "callSent":
        CallStateMachine.setState(CallStateMachine.STATES.CALLING);
        break;

      case "callAccepted":
        CallStateMachine.setState(CallStateMachine.STATES.IN_CALL);

        AppState.startTimer?.();

        if (data.professorId) {
          AppState.call = AppState.call || {};
          AppState.call.professorId = data.professorId;
        }
        break;

      case "callRejected":
        CallStateMachine.setState(CallStateMachine.STATES.IDLE);
        break;

      case "incomingCall":
        AppState.setIncomingCallEleveId?.(data.eleveId);

        CallStateMachine.setState(CallStateMachine.STATES.RINGING);

        AppState._notify("call:incoming", {
          eleveId: data.eleveId,
          eleveName: data.eleveName || data.userName || "Élève",
          eleveVille: data.eleveVille || "",
          elevePays: data.elevePays || ""
        });
        break;

      /* ---------------------------
         SESSION
      --------------------------- */
      case "twilioToken":
        if (data.token && data.roomName) {
          this.connectToTwilioRoom(data.token, data.roomName)
            .catch(err => console.error("❌ Twilio error:", err));
        }
        break;

      case "callEnded":
      case "session:stop":
        this.handleSessionEnded();
        break;

      /* ---------------------------
         VIDEO SIGNALING
      --------------------------- */
      case "twilioLocalTrack":
        AppState._notify("video:localTrack", data.track);
        break;

      case "twilioRemoteTracks":
        AppState._notify("video:remoteTracks", data.tracks);
        break;
    }
  },

  /* ======================================================
     SESSION END
  ====================================================== */
  handleSessionEnded() {
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);

    AppState.stopTimer?.();
    AppState.endSession?.();

    VideoService.disconnect?.();

    AppState._notify("ui:closeCallOverlay");
  },

  /* ======================================================
     OUTGOING CALL
  ====================================================== */
  callProfessor(profId) {
    if (!profId) return;

    const state = CallStateMachine.getState?.();

    if (
      state === CallStateMachine.STATES.CALLING ||
      state === CallStateMachine.STATES.IN_CALL
    ) {
      console.warn("⚠️ Call already active");
      return;
    }

    CallStateMachine.setState(CallStateMachine.STATES.CALLING);

    socketService.send({
      type: "callProfessor",
      profId
    });
  },

  /* ======================================================
     END CALL
  ====================================================== */
  endCall() {
    const duration = AppState.callSeconds || 0;

    if (duration > 0) {
      socketService.send({
        type: "visioDuration",
        roomId: AppState.currentRoomId,
        duration,
        matiere: AppState.currentUser?.matiere || null
      });
    }

    socketService.send({ type: "endSession" });

    this.handleSessionEnded();
  },

  /* ======================================================
     TWILIO / VIDEO
  ====================================================== */
  async connectToTwilioRoom(token, roomName) {

    VideoService.onLocalTrack(track =>
      AppState._notify("video:localTrack", track)
    );

    VideoService.onRemoteTracks(tracks =>
      AppState._notify("video:remoteTracks", tracks)
    );

    VideoService.onDisconnected(() => {
      this.handleSessionEnded();
    });

    const room = await VideoService.connect(token, roomName);

    if (room) {
      CallStateMachine.setState(CallStateMachine.STATES.IN_CALL);

      AppState._notify("video:connected", {
        roomName: room.name
      });
    }

    return room;
  },

  disconnectTwilio() {
    VideoService.disconnect?.();
  }
};
