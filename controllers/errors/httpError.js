// controllers/errors/httpError.js
// --------------------------------------------------
// HTTP Error classes – senior+++
// Small hierarchy of typed HTTP errors with helpers for controllers/services.
// Designed to be serializable, testable and safe for logging/response.
// --------------------------------------------------

import logger from "#config/logger.js";

/**
 * Base HTTP error
 * @extends Error
 */
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code] machine readable code (ex: USER_NOT_FOUND)
   * @param {any} [opts.details] additional details (validation errors, etc.)
   */
  constructor(statusCode = 500, message = "Erreur serveur", opts = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = Number(statusCode) || 500;
    this.code = opts.code || null;
    this.details = opts.details || null;

    // capture stack but remove constructor frame for clarity
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Minimal serializable representation safe to send to clients.
   * Avoid leaking internal details in production.
   * @param {boolean} [includeDetails=false]
   */
  toJSON(includeDetails = false) {
    const base = {
      ok: false,
      message: this.message || "Erreur",
      statusCode: this.statusCode,
      code: this.code || undefined
    };
    if (includeDetails && this.details) base.details = this.details;
    return base;
  }

  /**
   * Convenience: send this error via an Express response object.
   * In production, avoid sending details unless explicitly allowed.
   * @param {import('express').Response} res
   * @param {object} [opts]
   * @param {boolean} [opts.includeDetails=false]
   */
  send(res, { includeDetails = false } = {}) {
    try {
      return res.status(this.statusCode).json(this.toJSON(includeDetails));
    } catch (err) {
      // Fallback: log and send minimal response
      logger.error("HttpError.send failed", { err: err?.message || err });
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  }
}

/* Common HTTP errors with sensible defaults */

export class BadRequest extends HttpError {
  constructor(message = "Requête invalide", opts = {}) {
    super(400, message, opts);
  }
}

export class Unauthorized extends HttpError {
  constructor(message = "Non authentifié", opts = {}) {
    super(401, message, opts);
  }
}

export class Forbidden extends HttpError {
  constructor(message = "Accès refusé", opts = {}) {
    super(403, message, opts);
  }
}

export class NotFound extends HttpError {
  constructor(message = "Ressource non trouvée", opts = {}) {
    super(404, message, opts);
  }
}

export class Conflict extends HttpError {
  constructor(message = "Conflit", opts = {}) {
    super(409, message, opts);
  }
}

export class UnprocessableEntity extends HttpError {
  constructor(message = "Entité non traitable", opts = {}) {
    super(422, message, opts);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = "Erreur serveur", opts = {}) {
    super(500, message, opts);
  }
}

/* Helpers */

/**
 * Create an HttpError (factory)
 * @param {number} status
 * @param {string} message
 * @param {object} [opts]
 * @returns {HttpError}
 */
export function createHttpError(status = 500, message = "Erreur serveur", opts = {}) {
  switch (Number(status)) {
    case 400:
      return new BadRequest(message, opts);
    case 401:
      return new Unauthorized(message, opts);
    case 403:
      return new Forbidden(message, opts);
    case 404:
      return new NotFound(message, opts);
    case 409:
      return new Conflict(message, opts);
    case 422:
      return new UnprocessableEntity(message, opts);
    case 500:
    default:
      return new InternalServerError(message, opts);
  }
}

/**
 * Normalize any error into an HttpError instance.
 * If err is already an HttpError, returns it.
 * If err has status/statusCode, maps to appropriate HttpError preserving message/details.
 * Otherwise returns InternalServerError.
 * @param {any} err
 * @returns {HttpError}
 */
export function normalizeToHttpError(err) {
  if (!err) return new InternalServerError();

  if (err instanceof HttpError) return err;

  const status = err.statusCode || err.status || null;
  const message = err.message || String(err);
  const details = err.details || null;
  const code = err.code || null;

  if (status) {
    return createHttpError(status, message, { details, code });
  }

  // Unknown error -> wrap
  return new InternalServerError(message, { details, code });
}

/**
 * Type guard
 * @param {any} err
 * @returns {boolean}
 */
export function isHttpError(err) {
  return err instanceof HttpError || (err && typeof err.statusCode === "number" && typeof err.message === "string");
}

/* Export default convenience object */
export default {
  HttpError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  UnprocessableEntity,
  InternalServerError,
  createHttpError,
  normalizeToHttpError,
  isHttpError
};
