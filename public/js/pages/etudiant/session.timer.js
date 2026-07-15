// ======================================================
// ⏱️ SESSION TIMER
// ======================================================

let sessionTimer   = null;
let sessionSeconds = 0;

export function startSessionTimer() {
    // ⏱️ Ne redémarre pas si déjà en cours
    if (sessionTimer) return;
    sessionSeconds = 0;
    const display = document.getElementById('call-time');
    if (display) display.textContent = "00:00";

    sessionTimer = setInterval(() => {
        sessionSeconds++;
        const m = String(Math.floor(sessionSeconds / 60)).padStart(2, "0");
        const s = String(sessionSeconds % 60).padStart(2, "0");
        if (display) display.textContent = `${m}:${s}`;
    }, 1000);

    console.log("⏱️ Compteur démarré");
}

export function stopSessionTimer() {
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
    sessionSeconds = 0;
    const display = document.getElementById('call-time');
    if (display) display.textContent = "00:00";

    console.log("⏱️ Compteur arrêté");
}

// ======================================================
// 🟢 AJOUT — PAUSE / REPRISE (période de grâce reconnexion)
// Contrairement à stop/start, ne réinitialise PAS sessionSeconds :
// le compteur reprend exactement où il s'était arrêté.
// ======================================================

export function pauseSessionTimer() {
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
    console.log("⏸️ Compteur en pause à", sessionSeconds, "s");
}

export function resumeSessionTimer() {
    // ⏱️ Ne redémarre pas si déjà en cours (ex: double appel)
    if (sessionTimer) return;

    sessionTimer = setInterval(() => {
        sessionSeconds++;
        const m = String(Math.floor(sessionSeconds / 60)).padStart(2, "0");
        const s = String(sessionSeconds % 60).padStart(2, "0");
        const display = document.getElementById('call-time');
        if (display) display.textContent = `${m}:${s}`;
    }, 1000);

    console.log("▶️ Compteur repris à", sessionSeconds, "s");
}

export function getSessionDuration() {
    return sessionSeconds;
}