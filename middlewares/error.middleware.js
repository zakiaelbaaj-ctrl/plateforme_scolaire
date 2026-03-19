// middleware/error.middleware.js
import logger from "#config/logger.js";

export default function errorMiddleware(err, req, res, next) {
  // Sécurité : fallback si err est null/undefined
  const error = err || new Error("Unknown error");

  // Log structuré + masquage automatique via ton logger
  logger.error("Unhandled error", {
    method: req.method,
    url: req.originalUrl,
    status: error.status || 500,
    message: error.message,
    stack: error.stack
  });

  // Si les headers sont déjà envoyés, on laisse Express gérer
  if (res.headersSent) {
    return next(error);
  }

  let status = error.status || 500;

// JWT expiré
if (error.name === "TokenExpiredError") {
  status = 401;
}

// JWT invalide
if (error.name === "JsonWebTokenError") {
  status = 401;
}
// Réponse API standardisée
res.status(status).json({
  ok: false,
  error: {
    message:
      status === 500
        ? "Erreur interne du serveur"
        : status === 401
          ? "Token expiré ou invalide"
          : error.message,
    code: status
  }
});
}

