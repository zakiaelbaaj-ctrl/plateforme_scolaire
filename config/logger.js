// config/logger.js
import util from "util";

const SENSITIVE_KEYS = [
  "password",
  "pass",
  "token",
  "secret",
  "api_key",
  "apikey",
  "db_pass",
  "database_url",
  "jwt_secret",
  "stripe_secret_key",
  "email_pass",
];

function maskValue(value) {
  if (typeof value === "string") {
    // Masque mot de passe dans URL Postgres
    value = value.replace(
      /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/,
      "$1***$3"
    );

    // Masque clés Stripe
    value = value.replace(/(sk_live_|sk_test_)[a-zA-Z0-9]+/g, "$1***");
    value = value.replace(/(pk_live_|pk_test_)[a-zA-Z0-9]+/g, "$1***");

    return value;
  }

  return value;
}

function deepMask(obj) {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(deepMask);
  }

  const clone = {};
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();

    if (SENSITIVE_KEYS.some(s => lower.includes(s))) {
      clone[key] = "***";
    } else {
      clone[key] = deepMask(obj[key]);
    }
  }

  return clone;
}

function serialize(arg) {
  if (arg && typeof arg === "object") {
    // Cas spécial : process.env → jamais loggé
    if ("PATH" in arg && "NODE_ENV" in arg) {
      return "[ENV REDACTED]";
    }

    try {
      const masked = deepMask(arg);
      return JSON.stringify(masked);
    } catch {
      return util.inspect(arg, { depth: 3, colors: false });
    }
  }

  if (typeof arg === "string") {
    return maskValue(arg);
  }

  return String(arg);
}

function formatArgs(args) {
  return args.map(serialize);
}

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(...args) {
    console.log(`[INFO] ${timestamp()}`, ...formatArgs(args));
  },
  warn(...args) {
    console.warn(`[WARN] ${timestamp()}`, ...formatArgs(args));
  },
  error(...args) {
    console.error(`[ERROR] ${timestamp()}`, ...formatArgs(args));
  },
  debug(...args) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${timestamp()}`, ...formatArgs(args));
    }
  },
};

export default logger;
