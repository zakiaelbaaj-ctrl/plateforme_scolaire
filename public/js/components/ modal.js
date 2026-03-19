// public/js/components/modal.js
// Small modal component: open/close, set content, confirm callback.
// Works with the markup in admin.html.

export default function Modal({ modalId = "confirmModal" } = {}) {
  const root = document.getElementById(modalId);
  if (!root) throw new Error("Modal root not found: " + modalId);

  const titleEl = root.querySelector("#modalTitle");
  const messageEl = root.querySelector("#modalMessage");
  const cancelBtn = root.querySelector("#modalCancel");
  const confirmBtn = root.querySelector("#modalConfirm");

  let onConfirm = null;

  function open({ title = "Confirmer", message = "", confirmText = "Confirmer", onConfirmCallback = null } = {}) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    onConfirm = onConfirmCallback;
    root.setAttribute("aria-hidden", "false");
    confirmBtn.focus();
  }

  function close() {
    onConfirm = null;
    root.setAttribute("aria-hidden", "true");
  }

  cancelBtn.addEventListener("click", () => close());
  confirmBtn.addEventListener("click", async () => {
    try {
      if (typeof onConfirm === "function") await onConfirm();
    } finally {
      close();
    }
  });

  // close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.getAttribute("aria-hidden") === "false") close();
  });

  return { open, close };
}
