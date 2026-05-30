// public/js/modules/ui/uiRenderers.js
// UI RENDERERS ÃÂ¢Ã¢ÂÂ¬Ã¢ÂÂ REACTION ONLY (LISTEN TO APPSTATE)

import { AppState } from "/js/core/state.js";

/**
 * Initialise les branchements entre l'ÃÂÃÂ©tat et le DOM.
 * ÃÂÃ¢ÂÂ¬ appeler une seule fois au dÃÂÃÂ©marrage (boot.js).
 */
export function initUIRenderers() {

    // --- DONNÃÂÃ¢ÂÂ°ES ---
    AppState.on("professors:update", (profs) => renderProfessorsList(profs));
    AppState.on("chat:new",          (msg)   => renderChatMessage(msg));
    AppState.on("documents:new",     (doc)   => renderDocumentItem(doc));
    AppState.on("documents:clear",   ()      => clearDocumentsUI());

    // --- TIMER ---
    AppState.on("timer:update", (sec) => updateTimerUI(sec));
    AppState.on("timer:reset",  ()    => resetTimerUI());

    // --- FACTURATION ---
    AppState.on("invoice:show", (data) => renderInvoice(data));

    // --- ÃÂÃ¢ÂÂ°TAT APPEL (manquait dans l'original) ---
    AppState.on("callState:change", (state) => updateCallButtonState(state));
    // --- RESET GLOBAL ---
    AppState.on("app:reset", () => {
        clearChatUI();
        clearDocumentsUI();
        resetTimerUI();
        updateCallButtonState(null); // bouton remis ÃÂÃÂ  "ready"
    });
}

/* ======================================================
   PROFESSORS
====================================================== */
    export function renderProfessorsList(profs = []) {
    const container = document.getElementById("prof-list");
     if (!container) return;

     container.innerHTML = "";

  if (!profs.length) {
    container.innerHTML = "<li class='empty'>Aucun professeur connectÃÂÃÂ©</li>";
    return;
  }

  profs.forEach((prof) => {
    const li = document.createElement("li");
    li.className = "prof-item";
    li.textContent = `${prof.prenom} ${prof.nom}`;
   li.onclick = () => {
      const state = AppState.callState;
      
      // 1. On affiche l'ÃÂ©tat actuel au moment du clic
      console.log(`[DEBUG] Clic sur ${prof.nom}. ÃÂtat de l'appel :`, state);

      if (state === "calling" || state === "inCall" || state === "incoming") {
        // 2. On crie si on est bloquÃÂ©
        console.warn(`[DEBUG] Ã¢ÂÂ Clic bloquÃÂ© ! Le systÃÂ¨me pense que vous ÃÂªtes dÃÂ©jÃÂ  en ÃÂ©tat : ${state}`);
        return;
      }

      // 3. On confirme si ÃÂ§a passe
      console.log(`[DEBUG] Ã¢ÂÂ Clic autorisÃÂ© ! Lancement de l'appel vers ${prof.nom}...`);
      AppState.requestCall(prof);
    };

    container.appendChild(li); // ÃÂ¢ÃÂÃ¢ÂÂ¦ en dehors du onclick
  });
}

/* ======================================================
   CHAT
====================================================== */
 export function renderChatMessage({ sender, text }) {
    const box = document.getElementById("chat-box");
    if (!box) return;

    const div = document.createElement("div");
    div.className = "chat-message";
    div.innerHTML = `<strong>${sender} :</strong> ${text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

export function clearChatUI() {
    const box = document.getElementById("chat-box");
    if (box) box.innerHTML = "";
}
/* ======================================================
   DOCUMENTS
====================================================== */
export function renderDocumentItem({ fileName, fileData, sender }) {
    const list = document.getElementById("doc-list");
    if (!list) return;

    const a = document.createElement("a");
    a.href = fileData;
    a.className = "document-link";
    a.download = fileName;
    a.textContent = `ÃÂ°ÃÂ¸Ã¢ÂÂÃ¢ÂÂ ${fileName} (${sender})`;
    a.target = "_blank";
    list.appendChild(a);
}

export function clearDocumentsUI() {
    const list = document.getElementById("doc-list");
    if (list) list.innerHTML = "";
}

/* ======================================================
   FACTURATION
====================================================== */
     export function renderInvoice({ amount, duration, sessionId }) {
    const box = document.getElementById("invoice-box");
    if (!box) return;

    box.innerHTML = `
        <div class="invoice-card">
            <h4>ÃÂ°ÃÂ¸Ã¢ÂÂÃÂ³ Facture</h4>
            <p>Session : ${sessionId}</p>
            <p>DurÃÂÃÂ©e : ${duration} min</p>
            <p><strong>Total : ${amount} ÃÂ¢Ã¢ÂÂÃÂ¬</strong></p>
        </div>
    `;
}

/* ======================================================
   TIMER
====================================================== */
      export function updateTimerUI(seconds) {
    const el = document.getElementById("call-time");
    if (!el) return;

    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
}

export function resetTimerUI() {
    const el = document.getElementById("call-time");
    if (el) el.textContent = "00:00";
}

/* ======================================================
   BOUTON D'APPEL
====================================================== */
export function updateCallButtonState(state) {
    const btn = document.getElementById("callButton");
    if (!btn) return;

    btn.classList.remove("active", "in-call", "disabled");

    switch (state) {
        case "calling":  btn.classList.add("active");   break;
        case "inCall":   btn.classList.add("in-call");  break;
        case "incoming": btn.classList.add("disabled"); break;
        default: break; // null ÃÂ¢Ã¢ÂÂ Ã¢ÂÂ ÃÂÃÂ©tat "ready", aucune classe
    }
}

