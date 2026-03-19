// ======================================================
// UI RENDERERS — DOM ONLY
// ======================================================

import { AppState } from "/js/core/state.js";
import { SocketService } from "/js/core/socket.service.js";
// ---------- PROFESSORS ----------
export function renderProfessorsList(profs = []) {
  console.log("🎨 renderProfessorsList appelée avec :", profs);

  const container = document.getElementById("prof-list");
  if (!container) {
    console.error("❌ #profList introuvable");
    return;
  }

  // 🔥 Toujours nettoyer avant de rerender
  container.innerHTML = "";

  // ✅ Aucun prof connecté
  if (!profs.length) {
    container.innerHTML =
      "<li class='empty'>Aucun professeur connecté</li>";
    return;
  }

  // ✅ Rendu des profs
  profs.forEach((prof) => {
    const li = document.createElement("li");
    li.className = "prof-item";

    li.dataset.profId = prof.id;
    li.textContent = `${prof.prenom} ${prof.nom}`;

   li.onclick = () => {

  if (AppState.callState === "calling" || AppState.callState === "inCall") {
    return; // 🛑 Empêche double appel
  }

  console.log("📞 PROF CLIQUÉ :", prof);

  AppState.currentProf = prof;
  AppState.callState = "calling";

  SocketService.send({
    type: "callProfessor",
    profId: prof.id
  });
};
    container.appendChild(li);
  });
}

// ---------- CHAT ----------
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

// ---------- DOCUMENTS ----------
export function renderDocumentItem({ fileName, fileData, sender }) {
  const list = document.getElementById("doc-list");
  if (!list) return;

  const a = document.createElement("a");
  a.href = fileData;
  a.download = fileName;
  a.textContent = `📄 ${fileName} (${sender})`;
  a.target = "_blank";

  list.appendChild(a);
}

export function clearDocumentsUI() {
  const list = document.getElementById("doc-list");
  if (list) list.innerHTML = "";
}

// ---------- FACTURATION ----------
export function renderInvoice({ amount, duration, sessionId }) {
  const box = document.getElementById("invoice-box");
  if (!box) return;

  box.innerHTML = `
    <h4>💳 Facture</h4>
    <p>Session : ${sessionId}</p>
    <p>Durée : ${duration} min</p>
    <p><strong>Total : ${amount} €</strong></p>
  `;
}

// ---------- TIMER ----------
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

// ------------------------------------------------------
// CALL BUTTON STATE
// ------------------------------------------------------
export function updateCallButtonState(state) {
  console.log("updateCallButtonState:", state);

  const btn = document.getElementById("callButton");
  if (!btn) return;

  if (state === "calling") {
    btn.classList.add("active");
  } else if (state === "inCall") {
    btn.classList.add("in-call");
    btn.classList.remove("active");
  } else if (state === "disabled") {
    btn.classList.add("disabled");
    btn.classList.remove("active", "in-call");
  } else {
    // "ready" ou fallback
    btn.classList.remove("active", "in-call", "disabled");
  }
}
