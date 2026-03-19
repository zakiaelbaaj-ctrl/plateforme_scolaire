// ============================================
// ws/auth/middleware.js
// ============================================

import jwt from "jsonwebtoken";

export function verifyWsAuth(ws, data) {
  const token = data.token;

  if (!token) {
    ws.send(JSON.stringify({ type: "auth:error", message: "Token manquant" }));
    return false;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    ws.user = decoded;
    return true;
  } catch {
    ws.send(JSON.stringify({ type: "auth:error", message: "Token invalide" }));
    return false;
  }
}
