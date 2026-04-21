// public/js/modules/ui/uiRenderers.js
// UI RENDERERS â€” REACTION ONLY (LISTEN TO APPSTATE)

import { AppState } from "/js/core/state.js";

/**
 * Initialise les branchements entre l'Ã©tat et le DOM.
 * Ã€ appeler une seule fois au dÃ©marrage (boot.js).
 */
export function initUIRenderers() {

    // --- DONNÃ‰ES ---
    AppState.on("professors:update", (profs) => renderProfessorsList(profs));
    AppState.on("chat:new",          (msg)   => renderChatMessage(msg));
    AppState.on("documents:new",     (doc)   => renderDocumentItem(doc));
    AppState.on("documents:clear",   ()      => clearDocumentsUI());

    // --- TIMER ---
    AppState.on("timer:update", (sec) => updateTimerUI(sec));
    AppState.on("timer:reset",  ()    => resetTimerUI());

    // --- FACTURATION ---
    AppState.on("invoice:show", (data) => renderInvoice(data));

    // --- Ã‰TAT APPEL (manquait dans l'original) ---
    AppState.on("callState:change", (state) => updateCallButtonState(state));
    // --- RESET GLOBAL ---
    AppState.on("app:reset", () => {
        clearChatUI();
        clearDocumentsUI();
        resetTimerUI();
        updateCallButtonState(null); // bouton remis Ã  "ready"
    });
}

/* ======================================================
   PROFESSORS
====================================================== */
function renderProfessorsList(profs = []) {
  const container = document.getElementById("prof-list");
  if (!container) return;

  container.innerHTML = "";

  if (!profs.length) {
    container.innerHTML = "<li class='empty'>Aucun professeur connectÃ©</li>";
    return;
  }

  profs.forEach((prof) => {
    const li = document.createElement("li");
    li.className = "prof-item";
    li.textContent = `${prof.prenom} ${prof.nom}`;
   li.onclick = () => {
      const state = AppState.callState;
      
      // 1. On affiche l'état actuel au moment du clic
      console.log(`[DEBUG] Clic sur ${prof.nom}. État de l'appel :`, state);

      if (state === "calling" || state === "inCall" || state === "incoming") {
        // 2. On crie si on est bloqué
        console.warn(`[DEBUG] ❌ Clic bloqué ! Le système pense que vous êtes déjà en état : ${state}`);
        return;
      }

      // 3. On confirme si ça passe
      console.log(`[DEBUG] ✅ Clic autorisé ! Lancement de l'appel vers ${prof.nom}...`);
      AppState.requestCall(prof);
    };

    container.appendChild(li); // âœ… en dehors du onclick
  });
}

/* ======================================================
   CHAT
====================================================== */
function renderChatMessage({ sender, text }) {
    const box = document.getElementById("chat-box");
    if (!box) return;

    const div = document.createElement("div");
    div.className = "chat-message";
    div.innerHTML = `<strong>${sender} :</strong> ${text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function clearChatUI() {
    const box = document.getElementById("chat-box");
    if (box) box.innerHTML = "";
}

/* ======================================================
   DOCUMENTS
====================================================== */
function renderDocumentItem({ fileName, fileData, sender }) {
    const list = document.getElementById("doc-list");
    if (!list) return;

    const a = document.createElement("a");
    a.href = fileData;
    a.className = "document-link";
    a.download = fileName;
    a.textContent = `ðŸ“„ ${fileName} (${sender})`;
    a.target = "_blank";
    list.appendChild(a);
}

function clearDocumentsUI() {
    const list = document.getElementById("doc-list");
    if (list) list.innerHTML = "";
}

/* ======================================================
   FACTURATION
====================================================== */
function renderInvoice({ amount, duration, sessionId }) {
    const box = document.getElementById("invoice-box");
    if (!box) return;

    box.innerHTML = `
        <div class="invoice-card">
            <h4>ðŸ’³ Facture</h4>
            <p>Session : ${sessionId}</p>
            <p>DurÃ©e : ${duration} min</p>
            <p><strong>Total : ${amount} â‚¬</strong></p>
        </div>
    `;
}

/* ======================================================
   TIMER
====================================================== */
function updateTimerUI(seconds) {
    const el = document.getElementById("call-time");
    if (!el) return;

    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
}

function resetTimerUI() {
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
        default: break; // null â†’ Ã©tat "ready", aucune classe
    }
}

