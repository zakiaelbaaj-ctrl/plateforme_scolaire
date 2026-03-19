// =======================================================
// WS/AUTH/INIT.JS (v3)
// Initialise le domaine Auth pour les WebSockets
// Ultra-flexible : logger injectable, config externalisée, optimisée
// =======================================================

import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { DEFAULT_CONFIG, resolveConfig, validateConfig } from "./config.js";
import { defaultLogger } from "./logger.js";

// =====================================================
// HELPERS FACTORISÉS
// =====================================================

/**
 * Exécuter une étape de validation avec gestion d'erreur centralisée
 * @param {function} validateFn - Fonction de validation
 * @param {string} stepName - Nom de l'étape
 * @param {object} context - Contexte { logger, config, initId }
 * @throws {Error} Si la validation échoue
 */
async function executeValidationStep(validateFn, stepName, context) {
  const { logger, config, initId } = context;

  try {
    await validateFn();
  } catch (error) {
    const errorEvent = `${stepName}_failed`;

    const errorData = {
      initId,
      error: error.message,
      errorType: error.constructor.name
    };

    // Ajouter stacktrace si debug mode
    if (config.debugMode) {
      errorData.debug = error.stack;
    }

    // Ajouter originalError si c'est une erreur encapsulée
    if (error.originalError) {
      errorData.originalError = config.debugMode ? error.originalError.stack : undefined;
    }

    await logger.error(errorEvent, errorData);
    throw error;
  }
}

/**
 * Helper pour vérifier un constructeur
 * Mode "relaxed" : warnings au lieu d'erreurs pour les cas mineurs
 */
function validateConstructor(importedClass, className, config, logger) {
  // Vérification 1 : est-ce une fonction ?
  if (typeof importedClass !== "function") {
    throw new TypeError(
      `${className} n'est pas un constructeur valide. ` +
      `Export : export class ${className} { } ou export function ${className}() { }`
    );
  }

  // Vérification 2 : a-t-il un prototype ?
  if (config.validatePrototype && !importedClass.prototype) {
    throw new TypeError(
      `${className} est probablement une arrow function. ` +
      `Les arrow functions ne peuvent pas être des constructeurs. ` +
      `Utilisez : export class ${className} { } ou export function ${className}() { }`
    );
  }

  // Vérification 3 : le prototype a-t-il des propriétés ? (warn si vide)
  if (config.validatePrototypeMethods && config.warnEmptyConstructor) {
    const prototypeKeys = Object.getOwnPropertyNames(importedClass.prototype);
    if (prototypeKeys.length <= 1) { // Juste 'constructor'
      const message = `${className} a un prototype vide (minimaliste). ` +
        `C'est valide mais suspect. Assurez-vous que ce n'est pas une erreur d'export.`;

      // En mode "relaxed", avertir seulement
      if (config.mode === "relaxed") {
        logger.warn("empty_constructor", {
          className,
          message,
          note: "Non-bloquant en mode relaxed"
        });
      } else {
        // En mode "strict", lever un avertissement mais continuer
        logger.warn("empty_constructor", {
          className,
          message,
          note: "Avertissement en mode strict"
        });
      }
    }
  }
}

/**
 * Helper pour vérifier l'arité d'une méthode
 */
function validateMethodSignature(object, methodName, minArity, config) {
  if (typeof object[methodName] !== "function") {
    throw new TypeError(`${methodName} n'est pas une fonction`);
  }

  const actualArity = object[methodName].length;

  if (config.validateMethodArity && actualArity < minArity) {
    throw new TypeError(
      `${methodName} accepte ${actualArity} paramètre(s), ` +
      `mais au minimum ${minArity} est/sont attendu(s). ` +
      `Signature attendue : ${methodName}(${Array(minArity).fill("arg").map((_, i) => `arg${i}`).join(", ")})`
    );
  }
}

/**
 * Helper pour instancier une classe avec validation
 * Réutilise l'instance si config.reuseTestedInstance === true
 */
function testInstantiation(ConstructorClass, className, args, config, logger) {
  try {
    const instance = new ConstructorClass(...args);

    if (!(instance instanceof ConstructorClass)) {
      throw new TypeError(
        `${className} instancié mais pas une instance de ${className}`
      );
    }

    logger.info("constructor_instantiation_ok", {
      className,
      argsCount: args.length
    });

    return instance;
  } catch (error) {
    throw new TypeError(
      `${className} ne peut pas être instancié : ${error.message}`
    );
  }
}

// =====================================================
// VALIDATEURS PRINCIPAUX
// =====================================================

/**
 * Valider que wsContext.users est exploitable
 */
function validateUsersStore(users, config) {
  if (!users || typeof users !== "object") {
    throw new TypeError(
      "wsContext.users doit être un objet (Map, store, ou similaire)"
    );
  }

  const missingMethods = config.requiredUsersMethods.filter(
    method => typeof users[method] !== "function"
  );

  if (missingMethods.length > 0) {
    throw new TypeError(
      `wsContext.users manque les méthodes : ${missingMethods.join(", ")}. ` +
      `Doit être compatible avec Map ou avoir ${config.requiredUsersMethods.join(", ")}()`
    );
  }
}

/**
 * Valider que wsContext contient les propriétés et méthodes nécessaires
 */
function validateWsContext(wsContext, config, logger) {
  if (!wsContext || typeof wsContext !== "object") {
    throw new TypeError("wsContext doit être un objet non-null");
  }

  const missingKeys = config.requiredWsContextKeys.filter(
    key => !(key in wsContext)
  );

  if (missingKeys.length > 0) {
    throw new TypeError(
      `wsContext manque les clés requises : ${missingKeys.join(", ")}. ` +
      `Structure attendue : { ${config.requiredWsContextKeys.join(", ")} }`
    );
  }

  // Valider les signatures des méthodes
  Object.entries(config.requiredMethodArity).forEach(([method, minArity]) => {
    validateMethodSignature(wsContext, method, minArity, config);
  });

  // Vérifier connections
  if (!wsContext.connections || typeof wsContext.connections !== "object") {
    throw new TypeError(
      "wsContext.connections doit être un objet (Map, Set, ou similaire)"
    );
  }

  logger.info("wscontext_validated", {
    hasKeys: config.requiredWsContextKeys.length,
    broadcastArity: wsContext.broadcast.length,
    sendToArity: wsContext.sendTo.length,
    connectionsType: wsContext.connections.constructor.name
  });
}

// =====================================================
// FONCTION PRINCIPALE
// =====================================================

/**
 * Initialise le domaine Auth pour les WebSockets
 * Ultra-flexible : logger injectable, config externalisée, optimisée
 *
 * @param {object} wsContext - Contexte WebSocket
 * @param {object} options - Options d'initialisation
 * @param {object} options.logger - Logger injectable (défaut: ConsoleJsonLogger)
 * @param {string|object} options.config - Config profile ou objet personnalisé
 *
 * @returns {object} {service, controller, initialized, duration, initId, metadata}
 * @throws {Error} Si les validations échouent
 *
 * @example
 * // Utilisation simple (défauts)
 * const authDomain = await initAuthDomain(wsContext);
 *
 * // Avec logger personnalisé
 * const logger = new FileJsonLogger("/var/log/auth.log");
 * const authDomain = await initAuthDomain(wsContext, { logger });
 *
 * // Avec profil de config
 * const authDomain = await initAuthDomain(wsContext, { config: "production" });
 *
 * // Avec config personnalisée
 * const authDomain = await initAuthDomain(wsContext, {
 *   config: {
 *     mode: "relaxed",
 *     validatePrototype: false
 *   }
 * });
 */
export async function initAuthDomain(wsContext, options = {}) {
  const startTime = Date.now();
  const initId = `init-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // =====================================================
  // 1. SETUP LOGGER & CONFIG
  // =====================================================

  const logger = options.logger || defaultLogger;
  const config = resolveConfig(options.config || "production");

  // Valider la config
  try {
    validateConfig(config);
  } catch (error) {
    await logger.error("config_invalid", {
      initId,
      error: error.message
    });
    throw error;
  }

  const context = { logger, config, initId };

  try {
    await logger.info("auth_domain_init_start", { initId, config: config.mode });

    // =====================================================
    // 2. VALIDER LES IMPORTS
    // =====================================================

    if (config.validateConstructors) {
      await executeValidationStep(
        () => {
          validateConstructor(AuthService, "AuthService", config, logger);
          validateConstructor(AuthController, "AuthController", config, logger);
        },
        "constructor_validation",
        context
      );
    }

    // =====================================================
    // 3. VALIDER WSCONTEXT
    // =====================================================

    await executeValidationStep(
      () => validateWsContext(wsContext, config, logger),
      "wscontext_validation",
      context
    );

    // =====================================================
    // 4. VALIDER WSCONTEXT.USERS
    // =====================================================

    await executeValidationStep(
      () => validateUsersStore(wsContext.users, config),
      "users_store_validation",
      context
    );

    // =====================================================
    // 5. INSTANCIER AUTHSERVICE (avec test optionnel)
    // =====================================================

    let authService;

    if (config.testInstantiation) {
      await executeValidationStep(
        () => {
          authService = testInstantiation(
            AuthService,
            "AuthService",
            [wsContext.users],
            config,
            logger
          );
        },
        "authservice_instantiation",
        context
      );
    } else {
      // Sans test, juste instancier
      authService = new AuthService(wsContext.users);
    }

    // =====================================================
    // 6. INSTANCIER AUTHCONTROLLER
    // =====================================================

    let authController;

    // OPTIMISATION : Réutiliser l'instance testée si disponible
    if (config.reuseTestedInstance && authService instanceof AuthService) {
      authController = new AuthController(authService, wsContext);
    } else {
      if (config.testInstantiation) {
        await executeValidationStep(
          () => {
            authController = testInstantiation(
              AuthController,
              "AuthController",
              [authService, wsContext],
              config,
              logger
            );
          },
          "authcontroller_instantiation",
          context
        );
      } else {
        authController = new AuthController(authService, wsContext);
      }
    }

    // =====================================================
    // 7. VALIDATION POST-INSTANCIATION
    // =====================================================

    if (!(authService instanceof AuthService)) {
      throw new TypeError("AuthService n'a pas été instancié correctement");
    }

    if (!(authController instanceof AuthController)) {
      throw new TypeError("AuthController n'a pas été instancié correctement");
    }

    // =====================================================
    // 8. PRÉPARER LE RÉSULTAT
    // =====================================================

    const duration = config.measureDuration ? (Date.now() - startTime) : 0;

    const metadata = {
      initialized: new Date().toISOString(),
      duration,
      initId,
      config: config.mode
    };

    // Ajouter les infos de contexte si activé
    if (config.includeContextMetadata) {
      metadata.wsContextInfo = {
        usersSize: wsContext.users.size || "unknown",
        connectionsSize: wsContext.connections.size || "unknown"
      };
    }

    const result = Object.freeze({
      service: authService,
      controller: authController,
      ...metadata
    });

    // =====================================================
    // 9. LOG DE SUCCÈS
    // =====================================================

    await logger.info("auth_domain_init_success", {
      initId,
      duration: `${duration}ms`,
      metadata
    });

    return result;

  } catch (error) {
    // =====================================================
    // 10. GESTION D'ERREUR GLOBALE
    // =====================================================

    const duration = config.measureDuration ? (Date.now() - startTime) : 0;

    const errorLog = {
      initId,
      duration: `${duration}ms`,
      error: error.message,
      errorType: error.constructor.name
    };

    if (config.debugMode) {
      errorLog.debug = error.stack;
    }

    await logger.error("auth_domain_init_failed", errorLog);

    // Enrichir l'erreur avec contexte
    const enrichedError = new Error(
      `Impossible d'initialiser AuthDomain: ${error.message}`
    );
    enrichedError.initId = initId;
    enrichedError.originalError = config.debugMode ? error : null;

    throw enrichedError;
  }
}

// =====================================================
// EXPORTS
// =====================================================

export {
  executeValidationStep,
  validateConstructor,
  validateMethodSignature,
  testInstantiation,
  validateUsersStore,
  validateWsContext
};
