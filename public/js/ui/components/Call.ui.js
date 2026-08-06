// ======================================================
// 📞 CALL UI — Composant autonome (modales d'appel direct)
// Sur le même modèle que ScreenShareOverlay : dashboard.js
// se contente d'appeler ces méthodes, sans connaître le DOM interne.
// ======================================================

function injectStyles() {
    if (document.getElementById("call-ui-styles")) return;
    const style = document.createElement("style");
    style.id = "call-ui-styles";
    style.textContent = `
        .call-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.55);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
        }
        .call-box {
            background: #fff; border-radius: 14px; padding: 28px;
            max-width: 360px; width: 90%; text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.25);
            font-family: inherit;
        }
        .call-box__avatar { font-size: 48px; margin-bottom: 8px; }
        .call-box__name { font-size: 1.2rem; font-weight: 700; margin: 4px 0; }
        .call-box__meta { color: #666; font-size: 0.9rem; margin-bottom: 20px; }
        .call-box__actions { display: flex; gap: 12px; justify-content: center; }
        .call-btn {
            padding: 12px 20px; border: none; border-radius: 999px;
            font-size: 1rem; font-weight: 600; cursor: pointer;
            min-width: 110px;
        }
        .call-btn--accept { background: #4CAF50; color: #fff; }
        .call-btn--decline { background: #f44336; color: #fff; }
        .call-btn--cancel { background: #9e9e9e; color: #fff; }
        .call-box__ringing {
            display: inline-block; width: 12px; height: 12px; border-radius: 50%;
            background: #4CAF50; margin-right: 6px; animation: call-pulse 1s infinite;
        }
        @keyframes call-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .call-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            color: white; padding: 12px 24px; border-radius: 8px; z-index: 9999;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .etudiant-list__call-btn {
            margin-left: auto; padding: 4px 10px; border: none; border-radius: 999px;
            background: #1976d2; color: #fff; font-size: 0.8rem; cursor: pointer;
        }
        .etudiant-list__call-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

function toast(text, color = "#333") {
    injectStyles();
    const el = document.createElement("div");
    el.className = "call-toast";
    el.style.background = color;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

export const CallUI = {

    _sound: new Audio("/assets/sounds/call.mp3"),

    _playSound() {
        this._sound.currentTime = 0;
        this._sound.play().catch(() => {});
    },

    hide() {
        document.getElementById("call-overlay")?.remove();
    },

    /**
     * Affiche la modale d'appel entrant.
     * @param {{callId, fromName, fromMatiere, fromNiveau}} data
     * @param {{onAccept: Function, onDecline: Function}} handlers
     */
    showIncoming(data, { onAccept, onDecline }) {
        injectStyles();
        this.hide();
        this._playSound();

        const meta = [data.fromMatiere, data.fromNiveau].filter(Boolean).join(" · ");

        const overlay = document.createElement("div");
        overlay.id = "call-overlay";
        overlay.className = "call-overlay";
        overlay.innerHTML = `
            <div class="call-box">
                <div class="call-box__avatar">👤</div>
                <div class="call-box__name">${data.fromName}</div>
                <div class="call-box__meta">${meta || "vous appelle"}</div>
                <div class="call-box__actions">
                    <button type="button" class="call-btn call-btn--decline" id="call-decline-btn">Refuser</button>
                    <button type="button" class="call-btn call-btn--accept" id="call-accept-btn">Accepter</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById("call-accept-btn").addEventListener("click", () => {
            onAccept?.();
            this.hide();
        });
        document.getElementById("call-decline-btn").addEventListener("click", () => {
            onDecline?.();
            this.hide();
        });
    },

    /**
     * Affiche la modale "Appel en cours" (côté appelant, en attente de réponse).
     * @param {{toName}} data
     * @param {{onCancel: Function}} handlers
     */
    showOutgoing(data, { onCancel }) {
        injectStyles();
        this.hide();

        const overlay = document.createElement("div");
        overlay.id = "call-overlay";
        overlay.className = "call-overlay";
        overlay.innerHTML = `
            <div class="call-box">
                <div class="call-box__avatar">📞</div>
                <div class="call-box__name">${data.toName}</div>
                <div class="call-box__meta"><span class="call-box__ringing"></span>Appel en cours...</div>
                <div class="call-box__actions">
                    <button type="button" class="call-btn call-btn--cancel" id="call-cancel-btn">Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById("call-cancel-btn").addEventListener("click", () => {
            onCancel?.();
            this.hide();
        });
    },

    declined(data) {
        this.hide();
        toast(`🚫 ${data.toName} a refusé l'appel.`, "#f44336");
    },

    cancelled(data) {
        this.hide();
        if (data.reason === "timeout") {
            toast(`⏱️ ${data.fromName || "L'appel"} n'a pas répondu.`, "#FF9800");
        } else {
            toast(`🚫 Appel annulé.`, "#9e9e9e");
        }
    },

    timeout(data) {
        this.hide();
        toast(`⏱️ ${data.toName} n'a pas répondu.`, "#FF9800");
    },

    error(data) {
        this.hide();
        toast(`⚠️ ${data.message || "Impossible d'effectuer l'appel."}`, "#f44336");
    },

    injectListButtonStyles() {
        injectStyles();
    },
};