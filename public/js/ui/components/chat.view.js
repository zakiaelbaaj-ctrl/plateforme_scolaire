// ============================================================
// CHAT VIEW (UI UNIQUEMENT)
// ============================================================

// âœ… RÃ©solution DOM lazy â€” au moment de l'appel, pas du chargement
function getChatBox() {
  return document.getElementById("chat-box");
}

export function appendMessage(sender, text, isSelf = false) {
  const box = getChatBox();
  if (!box) return;

  const div    = document.createElement("div");
  div.className = "chat-message" + (isSelf ? " self" : "");

  const strong = document.createElement("strong");
  strong.textContent = sender + " :";

  const span = document.createElement("span");
  span.textContent = " " + text;

  div.appendChild(strong);
  div.appendChild(span);

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

export function resetChat() {
  const box = getChatBox();
  if (box) box.innerHTML = "";
}

