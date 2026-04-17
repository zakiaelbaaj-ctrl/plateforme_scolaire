// public/js/modules/ui/uiRenderers.js
// UI RENDERERS — REACTION ONLY (LISTEN TO APPSTATE)

import { AppState } from "/js/core/state.js";

/**
 * Initialise les branchements entre l'état et le DOM.
 * À appeler une seule fois au démarrage (boot.js).
 */
export function initUIRenderers() {

    // --- DONNÉES ---
    AppState.on("professors:update", (profs) => renderProfessorsList(profs));
    AppState.on("chat:new",          (msg)   => renderChatMessage(msg));
    AppState.on("documents:new",     (doc)   => renderDocumentItem(doc));
    AppState.on("documents:clear",   ()      => clearDocumentsUI());

    // --- TIMER ---
    AppState.on("timer:update", (sec) => updateTimerUI(sec));
    AppState.on("timer:reset",  ()    => resetTimerUI());

    // --- FACTURATION ---
    AppState.on("invoice:show", (data) => renderInvoice(data));

    // --- ÉTAT APPEL (manquait dans l'original) ---
    AppState.on("callState:change", (state) => updateCallButtonState(state));
    // --- NOUVEAU (CALL INCOMING UI EVENT) ---
    AppState.on("call:incoming", (data) => {
        updateCallButtonState("incoming");
    });

    // --- RESET GLOBAL ---
    AppState.on("app:reset", () => {
        clearChatUI();
        clearDocumentsUI();
        resetTimerUI();
        updateCallButtonState(null); // bouton remis à "ready"
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
    container.innerHTML = "<li class='empty'>Aucun professeur connecté</li>";
    return;
  }

  profs.forEach((prof) => {
    const li = document.createElement("li");
    li.className = "prof-item";
    li.textContent = `${prof.prenom} ${prof.nom}`;
   li.onclick = () => {
  const state = AppState.getCallState();
  if (state === "calling" || state === "inCall" || state === "incoming") return;

  AppState.requestCall(prof);
};

    container.appendChild(li); // ✅ en dehors du onclick
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
    a.textContent = `📄 ${fileName} (${sender})`;
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
            <h4>💳 Facture</h4>
            <p>Session : ${sessionId}</p>
            <p>Durée : ${duration} min</p>
            <p><strong>Total : ${amount} €</strong></p>
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
        default: break; // null → état "ready", aucune classe
    }
}
