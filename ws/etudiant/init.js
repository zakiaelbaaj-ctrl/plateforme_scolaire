// ws/etudiant/init.js
// Branchement du système étudiant-étudiant sur le WS bootstrap
// Pattern identique aux autres domaines (chat, signaling, etc.)

import { handleStudentMessage, handleStudentDisconnect } from "./index.js";

const STUDENT_TYPES = new Set([
    "student:enqueue",
    "student:dequeue",
    "student:joinRoom",
    "student:leaveRoom",
    "student:signal",
    "student:chatMessage",
    "student:documentShare"
]);

export default function initStudentWS(wss, deps = {}) {

    wss.on("ws:message", async (ws, msg) => {
        if (!STUDENT_TYPES.has(msg.type)) return;

        // Sécurité : seuls les élèves et étudiants peuvent accéder
        if (ws.role === "prof" || ws.role === "admin") return;

        await handleStudentMessage(ws, msg);
    });

    wss.on("ws:disconnect", async (ws) => {
        await handleStudentDisconnect(ws);
    });
}