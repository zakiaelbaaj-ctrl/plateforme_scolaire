// controllers/helpers/controller.helper.js
// --------------------------------------------------
// Helpers for controllers - senior+++
// Responsibility: small, well-tested utilities used by controllers
// - wrapAsync: avoid repetitive try/catch in controllers
// - sendSuccess / sendError: consistent HTTP JSON responses
// - parsePagination: normalize pagination query params
// - pick: safe pick of allowed fields from payload
// - handleValidationResult: adapter for express-validator (optional)
// --------------------------------------------------

import logger from "#config/logger.js";

/**
 * Wrap an async controller to forward errors to next()
 * Usage: export const myHandler = wrapAsync(async (req, res) => { ... });
 * @param {Function} fn async function (req, res, next)
 * @returns {Function} (req, res, next)
 */
export function wrapAsync(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Standard success response
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.status=200]
 * @param {any} [options.data]
 * @param {string} [options.message]
 */
export function sendSuccess(res, { status = 200, data = null, message = null } = {}) {
  const payload = { ok: true };
  if (message) payload.message = message;
  if (data !== null) payload.data = data;
  return res.status(status).json(payload);
}

/**
 * Standard error response
 * Logs error details (non-sensitive) and returns a safe message to client.
 * @param {import('express').Response} res
 * @param {Error|string|object} err
 * @param {number} [status=500]
 * @param {string} [clientMessage] optional override for client
 */
export function sendError(res, err, status = 500, clientMessage = null) {
  // Log full error for server-side debugging
  try {
    if (err instanceof Error) {
      logger.error("Controller error", { name: err.name, message: err.message, stack: err.stack });
    } else {
      logger.error("Controller error", { err });
    }
  } catch (logErr) {
    // never throw from logger
    // eslint-disable-next-line no-console
    console.error("Failed to log error in controller.helper", logErr);
  }

  const message =
    clientMessage ||
    (process.env.NODE_ENV === "production" ? "Erreur serveur" : (err && err.message) || String(err) || "Erreur interne");

  return res.status(status).json({ ok: false, message });
}

/**
 * Parse pagination query params with sane defaults and limits
 * @param {import('express').Request} req
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit=50]
 * @param {number} [opts.maxLimit=200]
 * @returns {{ limit: number, offset: number, page: number }}
 */
export function parsePagination(req, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  let limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  const offset = Math.max(0, Number(req.query.offset) || (page - 1) * limit);
  return { limit, offset, page };
}

/**
 * Pick allowed fields from an object (shallow)
 * Useful to whitelist updatable fields from req.body
 * @param {object} source
 * @param {string[]} allowed
 * @returns {object}
 */
export function pick(source = {}, allowed = []) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Adapter for express-validator result handling.
 * If you use express-validator, call handleValidationResult(req, res) at the top of controller.
 * Returns true if validation passed, otherwise sends 400 and returns false.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} resultFn function from express-validator: validationResult
 * @returns {boolean}
 */
export function handleValidationResult(req, res, resultFn) {
  if (typeof resultFn !== "function") {
    // nothing to validate
    return true;
  }
  const result = resultFn(req);
  if (result.isEmpty && result.isEmpty()) return true;

  const errors = result.array ? result.array() : [{ msg: "Validation failed" }];
  const message = errors.map(e => e.msg || e.message || JSON.stringify(e)).join("; ");
  sendError(res, message, 400, message);
  return false;
}
