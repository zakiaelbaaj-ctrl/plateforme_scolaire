// ============================================
// ws/files/handlers.js
// ============================================

import { safeSend } from "../utils.js";
import { canUpload } from "./permissions.js";

export function handle(ws, data) {
  switch (data.type) {
    case "file:upload":
      if (!canUpload(ws)) {
        return safeSend(ws, { type: "file:error", message: "Accès refusé" });
      }

      // Ici tu mettras ta logique d’upload
      return safeSend(ws, { type: "file:uploaded" });

    default:
      safeSend(ws, { type: "file:error", message: "Event inconnu" });
  }
}
