import { socketHandlerEleve } from "./core/socket.handler.eleve.js";

if (!window.__WS_ELEVE_INITIALIZED__) {
    window.__WS_ELEVE_INITIALIZED__ = true;
    socketHandlerEleve.init();
}
