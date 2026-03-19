// controllers/helpers/validation.helper.js
// --------------------------------------------------
// Validation helpers – senior+++
// Small, focused utilities and middlewares to validate and sanitize
// request data in controllers. Supports both Joi schemas and
// express-validator chains. Designed to be composable and testable.
// --------------------------------------------------

import Joi from "joi";
import { validationResult } from "express-validator";
import logger from "#config/logger.js";
import { sendError } from "./controller.helper.js";

/**
 * Middleware factory: validate request using a Joi schema.
 * The schema can contain keys: body, query, params (each a Joi schema).
 *
 * Usage:
 *   app.post("/x", validateJoi({ body: Joi.object({ name: Joi.string().required() }) }), handler)
 *
 * @param {{ body?: Joi.Schema, query?: Joi.Schema, params?: Joi.Schema }} schemas
 * @param {{ abortEarly?: boolean, allowUnknown?: boolean }} [options]
 * @returns {import('express').RequestHandler}
 */
export function validateJoi(schemas = {}, options = {}) {
  const { abortEarly = false, allowUnknown = false } = options;

  return async function (req, res, next) {
    try {
      // Validate body
      if (schemas.body) {
        const value = await schemas.body.validateAsync(req.body, { abortEarly, allowUnknown });
        req.body = value;
      }

      // Validate query
      if (schemas.query) {
        const value = await schemas.query.validateAsync(req.query, { abortEarly, allowUnknown });
        req.query = value;
      }

      // Validate params
      if (schemas.params) {
        const value = await schemas.params.validateAsync(req.params, { abortEarly, allowUnknown });
        req.params = value;
      }

      return next();
    } catch (err) {
      // Joi error: format messages for client but avoid leaking internals
      const details = err && err.details ? err.details.map(d => d.message) : [err.message || "Validation error"];
      logger.warn("Validation failed (Joi)", { messages: details });
      return sendError(res, { message: details.join("; "), details }, 400, details.join("; "));
    }
  };
}

/**
 * Adapter for express-validator chains.
 * Accepts an array of validation middlewares (from express-validator) and
 * appends a final middleware that checks validationResult and returns 400 if invalid.
 *
 * Usage:
 *   import { body } from "express-validator";
 *   router.post("/", ...expressValidator([
 *     body("email").isEmail(),
 *     body("name").isString().notEmpty()
 *   ]), handler);
 *
 * @param {import('express').RequestHandler[]} validations
 * @returns {import('express').RequestHandler[]}
 */
export function expressValidator(validations = []) {
  return [
    ...validations,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) return next();

      const errors = result.array().map(e => ({ field: e.param, msg: e.msg }));
      const message = errors.map(e => `${e.field}: ${e.msg}`).join("; ");
      logger.warn("Validation failed (express-validator)", { errors });
      return sendError(res, { message, errors }, 400, message);
    }
  ];
}

/**
 * Pick allowed fields from an object (shallow) and optionally coerce types.
 * Useful to whitelist updatable fields from req.body before passing to service.
 *
 * @param {object} source
 * @param {string[]} allowed
 * @returns {object}
 */
export function pickAllowed(source = {}, allowed = []) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Middleware factory: sanitize request body by keeping only allowed fields.
 * Mutates req.body to contain only whitelisted keys.
 *
 * Usage:
 *   router.put("/:id", sanitizeBody(["prenom","nom","email"]), controller.update)
 *
 * @param {string[]} allowedFields
 * @returns {import('express').RequestHandler}
 */
export function sanitizeBody(allowedFields = []) {
  return (req, res, next) => {
    try {
      req.body = pickAllowed(req.body || {}, allowedFields);
      return next();
    } catch (err) {
      logger.error("sanitizeBody error", err);
      return sendError(res, err, 500);
    }
  };
}

/**
 * Convenience: build a Joi schema object from a simple descriptor.
 * Descriptor example:
 *   { name: "string.required", age: "number.min:0" }
 * This helper is intentionally small and optional; prefer explicit Joi schemas.
 *
 * @param {Record<string,string>} descriptor
 * @returns {Joi.ObjectSchema}
 */
export function buildJoiFromDescriptor(descriptor = {}) {
  const schemaMap = {};
  for (const [key, desc] of Object.entries(descriptor)) {
    // desc format: "type.rule1:arg.rule2" e.g. "string.required.email"
    const parts = String(desc).split(".");
    let s;
    const type = parts.shift();
    switch (type) {
      case "string":
        s = Joi.string();
        break;
      case "number":
        s = Joi.number();
        break;
      case "boolean":
        s = Joi.boolean();
        break;
      case "array":
        s = Joi.array();
        break;
      case "object":
        s = Joi.object();
        break;
      default:
        s = Joi.any();
    }

    for (const p of parts) {
      if (!p) continue;
      const [rule, arg] = p.split(":");
      if (typeof s[rule] === "function") {
        if (arg !== undefined) {
          // try to coerce numeric arg
          const maybeNum = Number(arg);
          s = s[isNaN(maybeNum) ? rule : rule].call(s, isNaN(maybeNum) ? arg : maybeNum);
        } else {
          s = s[rule]();
        }
      }
    }
    schemaMap[key] = s;
  }
  return Joi.object(schemaMap);
}

/**
 * Helper to validate and coerce pagination params (page/limit/offset).
 * Returns normalized object { limit, offset, page }.
 *
 * @param {import('express').Request} req
 * @param {{ defaultLimit?: number, maxLimit?: number }} opts
 * @returns {{ limit: number, offset: number, page: number }}
 */
export function normalizePagination(req, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  let limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  const offset = Math.max(0, Number(req.query.offset) || (page - 1) * limit);
  return { limit, offset, page };
}

export default {
  validateJoi,
  expressValidator,
  pickAllowed,
  sanitizeBody,
  buildJoiFromDescriptor,
  normalizePagination
};
