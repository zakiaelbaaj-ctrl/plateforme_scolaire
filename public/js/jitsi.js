/* ============================================================
   JITSI MEET
============================================================ */
let jitsiApi = null;

function startJitsi() {
  const user = JSON.parse(localStorage.getItem("user_data"));
  const domain = "meet.jit.si";
  const options = {
    roomName: `Salle_${user.id}`,
    parentNode: document.getElementById("jitsiContainer"),
    width: "100%",
    height: 500,
    userInfo: {
      displayName: `${user.prenom} ${user.nom}`,
    },
    configOverwrite: {
      enableWelcomePage: false,
      prejoinPageEnabled: false,
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      TOOLBAR_BUTTONS: [
        "microphone", "camera", "desktop", "hangup", "chat", "raisehand"
      ],
    },
  };

  jitsiApi = new JitsiMeetExternalAPI(domain, options);
}
