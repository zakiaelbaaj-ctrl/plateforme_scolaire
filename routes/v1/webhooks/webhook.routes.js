import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { requireAuth } from "#middlewares/auth.middleware.js";

const router = express.Router();

router.use((req, res, next) => {
  console.log("🔥 WEBHOOK ROUTE HIT:", req.method, req.url);
  next();
});

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("🔔 WEBHOOK REÇU, type body:", Buffer.isBuffer(req.body) ? "Buffer ✅" : "PAS un Buffer ❌");
    console.log("🔔 Stripe-Signature:", req.headers["stripe-signature"] ? "✅ présente" : "❌ absente");

    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) return res.status(500).send("Webhook secret missing");

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      logger.error("❌ Webhook signature invalide", { message: err.message });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    logger.info("📩 Webhook Stripe reçu", { type: event.type, id: event.id });

    try {
      if (event.type === "checkout.session.completed") {
        await handleCheckoutSessionCompleted(event.data.object);
      } 
      else if (event.type === "payment_intent.succeeded") {
        await handlePaymentIntentSucceeded(event.data.object);
      }
      else if (event.type === "payment_intent.payment_failed") {
        await handlePaymentIntentFailed(event.data.object);
      }
      else if (event.type === "payment_intent.canceled") {
        await handlePaymentIntentCanceled(event.data.object);
      }
      else {
        logger.info("⏭️ Webhook non traité", { type: event.type });
      }

      res.status(200).send();
    } catch (err) {
      logger.error("❌ Webhook processing failed", { 
        type: event.type,
        message: err.message 
      });
      res.status(500).send();
    }
  }
);

/**
 * ✅ Gère les abonnements et l'enregistrement de carte bancaire
 */
async function handleCheckoutSessionCompleted(session) {
  const { userId, planType, type } = session.metadata || {};
  const customerId = session.customer;
  const sessionId = session.id;

  logger.info("📩 Traitement Checkout Session", { sessionId, mode: session.mode, userId });

  // ======================================================
  // 💳 CAS 1 : ENREGISTREMENT CARTE SEULE (MODE SETUP)
  // ======================================================
  // ✅ APRÈS — met à jour has_payment_method + is_subscriber + subscription_status
if (session.mode === 'setup') {
    if (!customerId) {
      logger.error("❌ CustomerId manquant pour le mode setup", { sessionId });
      return;
    }

    try {
      // Récupérer le rôle pour ne pas affecter prof/eleve
      const [userRecord] = await sequelize.query(
        `SELECT role FROM users WHERE stripe_customer_id = :customerId`,
        { replacements: { customerId }, type: sequelize.QueryTypes.SELECT }
      );

      if (userRecord?.role === 'etudiant') {
        // Étudiant : carte + accès matching activé
        await sequelize.query(
          `UPDATE users 
           SET has_payment_method = true,
               is_subscriber = true,
               subscription_status = 'active'
           WHERE stripe_customer_id = :customerId`,
          { replacements: { customerId } }
        );
        logger.info("💳 Carte étudiant enregistrée + accès activé", { customerId });
      } else {
        // Élève / Prof : uniquement has_payment_method
        await sequelize.query(
          `UPDATE users SET has_payment_method = true WHERE stripe_customer_id = :customerId`,
          { replacements: { customerId } }
        );
        logger.info("💳 Carte enregistrée (Mode Setup)", { customerId });
      }
      return;
    } catch (err) {
      logger.error("❌ Erreur DB lors du setup carte", { customerId, message: err.message });
      return;
    }
  }

  // ======================================================
  // 🛡️ SÉCURITÉ POUR LES PAIEMENTS (MODE PAYMENT)
  // ======================================================
  if (!userId) {
    logger.error("❌ Metadata userId manquante pour paiement", { sessionId });
    return;
  }

  // 🔒 Définir la carte utilisée comme carte par défaut (si paiement immédiat)
  if (session.payment_intent) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = paymentIntent.payment_method;

      if (paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
        logger.info("💳 Carte définie comme défaut", { customerId, paymentMethodId });
      }
    } catch (err) {
      logger.warn("⚠️ Impossible de définir la carte par défaut", { message: err.message });
    }
  }

  // ======================================================
  // 🎓 ABONNEMENT ÉTUDIANTS (NOUVEAU SYSTÈME)
  // ======================================================
  if (type === "student_subscription") {
    await sequelize.query(
      `UPDATE users 
       SET is_subscriber = true,
           subscription_status = 'active',
           plan_type = :planType,
           subscription_end_date = 
             CASE 
               WHEN :planType = 'monthly' THEN NOW() + INTERVAL '1 month'
               WHEN :planType = 'yearly' THEN NOW() + INTERVAL '1 year'
             END
       WHERE id = :userId`,
      {
        replacements: {
          userId,
          planType
        }
      }
    );

    logger.info("🎓 Abonnement étudiant activé", {
      userId,
      planType
    });
    logger.info("Données Webhook", { 
   sessionCustomer: session.customer, 
   metadataUserId: session.metadata?.userId 
});
    return;
  }
  
  // ======================================================
  // 💰 ANCIEN SYSTÈME (ABONNEMENTS / PAIEMENTS EXISTANTS)
  // ======================================================
  let invoiceNumber;

  await sequelize.transaction(async (t) => {

    // ── Idempotence : éviter double traitement Stripe ──────────────────────
    const existing = await sequelize.query(
      `SELECT 1 FROM payments WHERE stripe_session_id = :sessionId LIMIT 1`,
      {
        replacements: { sessionId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );
    if (existing.length > 0) {
      logger.warn("⚠️ Webhook déjà traité, skip", { sessionId });
      return;
    }

    // ── Calcul date expiration ─────────────────────────────────────────────
    const PLAN_INTERVALS = {
      monthly: (d) => d.setUTCMonth(d.getUTCMonth() + 1),
      yearly:  (d) => d.setUTCFullYear(d.getUTCFullYear() + 1),
    };

    const end = new Date();
    const resolvedPlanType = planType || "student_entraide";

    if (PLAN_INTERVALS[resolvedPlanType]) {
      PLAN_INTERVALS[resolvedPlanType](end);
    } else {
      logger.warn("⚠️ planType inconnu, subscription_end_date non calculée", { resolvedPlanType });
    }

    // ── Mise à jour utilisateur ────────────────────────────────────────────
    const [, userMeta] = await sequelize.query(
      `UPDATE users
       SET subscription_status    = 'active',
           is_subscriber          = true,
           plan_type              = :planType,
           subscription_end_date  = :end,
           updated_at             = NOW()
       WHERE id = :userId
       RETURNING id`,
      {
        replacements: { userId, planType: resolvedPlanType, end: end.toISOString() },
        transaction: t
      }
    );

    if (!userMeta?.rowCount) {
      throw new Error(`User ${userId} introuvable — UPDATE sans effet`);
    }

    // ── Insertion paiement avec invoice_number atomique ────────────────────
    invoiceNumber = `INV-${userId}-${Date.now()}`;

    await sequelize.query(
      `INSERT INTO payments
         (user_id, amount, currency, status, stripe_session_id, type, invoice_number, created_at)
       VALUES
         (:userId, :amount, :currency, 'succeeded', :sessionId, :type, :invoiceNumber, NOW())`,
      {
        replacements: {
          userId,
          amount:        session.amount_total,
          currency:      session.currency,
          sessionId,
          type:          type || "subscription",
          invoiceNumber, // ← lié atomiquement au paiement
        },
        transaction: t
      }
    );

    logger.info("💰 Paiement enregistré", { userId, sessionId, invoiceNumber, planType: resolvedPlanType });
  }); // ← commit atomique : user + payment + invoiceNumber

  // ── Génération PDF hors transaction (I/O lent, non rollbackable) ─────────
  // Le numéro de facture est déjà persisté en DB → récupérable si le PDF plante
  if (invoiceNumber) {
    try {
      await generateInvoicePdf({
        userId,
        planType:      planType || "Entraide Étudiante",
        amount:        session.amount_total,
        invoiceNumber,
        date:          new Date(),
      });
      logger.info("🧾 Facture PDF générée", { userId, invoiceNumber });
    } catch (pdfErr) {
      // Paiement safe en DB — on log avec invoiceNumber pour régénération ultérieure
      logger.error("❌ Échec génération PDF — régénérable via invoice_number", {
        userId,
        invoiceNumber,
        message: pdfErr.message,
      });
    }
  }
} // ← ferme handleCheckoutSessionCompleted
/**
 * ✅ Gère le succès des paiements d'appels vidéo (20€ ou 40€/h)
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const raw = paymentIntent.metadata || {};

  const roomId  = typeof raw.roomId === "string" ? raw.roomId : null;
  const eleveId = Number.isInteger(Number(raw.eleveId)) ? Number(raw.eleveId) : null;
  const profId  = Number.isInteger(Number(raw.profId)) ? Number(raw.profId) : null;

  const intentId = paymentIntent.id;

  if (!roomId || !eleveId || !profId) {
    logger.error("❌ Invalid metadata in payment intent", { raw, intentId });
    return;
  }

  if (!paymentIntent.amount || paymentIntent.amount <= 0) {
    logger.error("❌ Invalid amount in payment intent", { intentId });
    return;
  }

  await sequelize.transaction(async (t) => {

    // 🔒 LOCK visio session (anti race condition)
    const lockResult = await sequelize.query(
      `SELECT is_paid 
       FROM visio_sessions 
       WHERE room_id = :roomId 
       FOR UPDATE`,
      {
        replacements: { roomId },
        transaction: t
      }
    );

    const visio = lockResult?.[0]?.[0];

    if (!visio) {
      throw new Error(`Visio session not found: ${roomId}`);
    }

    // 🚫 déjà payé → stop idempotent Stripe
    if (visio.is_paid === true) {
      logger.warn("Duplicate visio payment blocked", { roomId, intentId });
      return;
    }

    // 💰 INSERT paiement (idempotent Stripe safe)
    await sequelize.query(
      `INSERT INTO payments 
        (user_id, amount, currency, status, stripe_session_id, type)
       VALUES 
        (:eleveId, :amount, :currency, 'succeeded', :intentId, 'visio_call')
       ON CONFLICT (stripe_session_id) 
       DO UPDATE SET status = 'succeeded'`,
      {
        replacements: {
          eleveId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency || "eur",
          intentId
        },
        transaction: t
      }
    );

    // ✅ mark session paid (après insert pour éviter incohérence métier)
    await sequelize.query(
      `UPDATE visio_sessions 
       SET is_paid = true 
       WHERE room_id = :roomId`,
      {
        replacements: { roomId },
        transaction: t
      }
    );

    logger.info("✅ Paiement visio confirmé", {
      roomId,
      eleveId,
      profId,
      amount: paymentIntent.amount
    });
  });
}

/**
 * ❌ Gère l'échec du paiement
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const intentId = paymentIntent.id;
  await sequelize.query(
    `UPDATE payments SET status = 'failed' WHERE stripe_session_id = :intentId`,
    { replacements: { intentId } }
  );
  logger.warn("❌ Paiement échoué", { intentId, reason: paymentIntent.last_payment_error?.message });
}

/**
 * 🚫 Gère l'annulation
 */
async function handlePaymentIntentCanceled(paymentIntent) {
  const intentId = paymentIntent.id;
  await sequelize.query(
    `UPDATE payments SET status = 'canceled' WHERE stripe_session_id = :intentId`,
    { replacements: { intentId } }
  );
}
// ✅ Crée une session Stripe pour enregistrer une carte (Setup Intent)
router.post("/create-setup-session", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId; // ✅ correct avec requireAuth

    // 1. Récupérer ou créer le customer Stripe de l'élève
    const [users] = await sequelize.query(
      `SELECT stripe_customer_id, email, prenom, nom FROM users WHERE id = :userId`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!users) return res.status(404).json({ error: "Utilisateur introuvable" });

    let customerId = users.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: users.email,
        name: `${users.prenom} ${users.nom}`,
        metadata: { userId: String(userId) },
      });
      customerId = customer.id;

      await sequelize.query(
        `UPDATE users SET stripe_customer_id = :customerId WHERE id = :userId`,
        { replacements: { customerId, userId } }
      );
    }

    // 2. Créer la Checkout Session en mode "setup"
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      currency: "eur",
      payment_method_types: ["card"],
      success_url: `${process.env.CLIENT_URL}/pages/eleve/dashboard.html?stripe=success`,
      cancel_url:  `${process.env.CLIENT_URL}/pages/eleve/dashboard.html?stripe=cancel`,
      metadata: { userId: String(userId) },
    });

    res.json({ url: session.url });

  } catch (err) {
    logger.error("❌ Erreur création setup session", { message: err.message });
    res.status(500).json({ error: "Erreur serveur Stripe" });
  }
});
/**
 * ✅ 1. PRE-AUTH: Bloque les fonds avant le début du cours vidéo
 * Appelé par le frontend de l'élève juste avant d'ouvrir la salle.
 */
  router.post("/pre-auth", requireAuth, async (req, res) => {
    // ✅ Vérification rôle
  if (req.user.role !== "eleve") {
    return res.status(403).json({ message: "Accès réservé aux élèves." });
  }
    console.log("🔥 ROUTE PRE-AUTH HIT");
    try {
    const eleveId = req.user.userId;
    const { amount } = req.body; // Montant max à bloquer en centimes (ex: 3000 pour 30€)

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Montant invalide." });
    }

    // 1. Récupérer le Customer Stripe de l'élève
    const [eleve] = await sequelize.query(
      `SELECT stripe_customer_id, has_payment_method FROM users WHERE id = :eleveId`,
      { replacements: { eleveId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!eleve || !eleve.stripe_customer_id || !eleve.has_payment_method) {
      return res.status(400).json({ message: "Aucune carte enregistrée." });
    }

    // 2. Récupérer la méthode de paiement par défaut du client
const paymentMethods = await stripe.paymentMethods.list({
  customer: eleve.stripe_customer_id,
  type: 'card',
});

if (paymentMethods.data.length === 0) {
  return res.status(400).json({ message: "Carte bancaire introuvable sur Stripe." });
}

// ✅ Définir la carte comme défaut pour les paiements off_session
await stripe.customers.update(eleve.stripe_customer_id, {
  invoice_settings: {
    default_payment_method: paymentMethods.data[0].id,
  },
});

    // 3. Créer le PaymentIntent avec capture_method: 'manual'
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'eur',
      customer: eleve.stripe_customer_id,
      payment_method: paymentMethods.data[0].id,
      off_session: true, // Le paiement se fait en arrière-plan
      confirm: true, // Valide l'empreinte immédiatement
      capture_method: 'manual', // 🔥 BLOQUE SANS DÉBITER
      metadata: { eleveId: String(eleveId) } // On garde l'ID de l'élève pour le suivi
    });

    logger.info("💳 Empreinte bancaire réussie", { eleveId, intentId: paymentIntent.id });
    
    // On renvoie l'ID au frontend pour qu'il l'envoie au WebRTC/WebSocket
    res.status(200).json({ paymentIntentId: paymentIntent.id });

  } catch (err) {
    logger.error("❌ Erreur Pre-Auth Stripe", { message: err.message, eleveId: req.user?.userId });
    
    // Gestion spécifique des refus de carte
    if (err.code === 'authentication_required' || err.type === 'StripeCardError') {
      return res.status(402).json({ message: "La carte a été refusée ou nécessite une authentification." });
    }
    
    res.status(500).json({ message: "Erreur serveur lors de la pré-autorisation." });
  }
});
/**
 * ✅ 2. CAPTURE: Prélève le montant exact à la fin du cours
 * Appelé par le backend (ton WebSocket ou un service) quand le timer s'arrête.
 */
router.post("/capture-payment", requireAuth, async (req, res) => {
  try {
    const { paymentIntentId, startTime, profId, roomId } = req.body;
    const eleveId = req.user.userId;

    if (!paymentIntentId || !startTime) {
      return res.status(400).json({ message: "Données manquantes." });
    }

    // 1. Calculer la durée et le prix
    const endTime = Date.now();
    const dureeMinutes = Math.ceil((endTime - startTime) / 60000);
    
    // Exemple : 50 centimes la minute (ajuste selon ton modèle)
    const prixParMinuteCents = 50; 
    const montantFinal = dureeMinutes * prixParMinuteCents;

    // 2. Si l'appel a duré 0 min (bug ou annulation immédiate)
    if (montantFinal === 0) {
      await stripe.paymentIntents.cancel(paymentIntentId);
      logger.info("⏳ Session de 0 min, empreinte annulée.", { roomId });
      return res.status(200).json({ status: "canceled", message: "Aucun prélèvement." });
    }

    // 3. Mettre à jour les metadata de l'intent pour le Webhook
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        roomId: String(roomId),
        eleveId: String(eleveId),
        profId: String(profId),
        duree: String(dureeMinutes)
      }
    });

    // 4. Capturer le montant exact
    const intentCapture = await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: montantFinal,
    });

    logger.info("✅ Paiement final capturé", { roomId, montant: montantFinal / 100 });
    res.status(200).json({ status: "success", data: intentCapture });

  } catch (err) {
    logger.error("❌ Erreur Capture Payment", { intentId: req.body.paymentIntentId, message: err.message });
    res.status(500).json({ message: "Erreur lors de la capture du paiement." });
  }
});
// ============================================================
// À AJOUTER dans ton fichier routes/stripe.js (ou payment.js)
// Juste avant la ligne : export default router;
// ============================================================

/**
 * ✅ Crée une Checkout Session pour l'abonnement étudiant
 * Plans disponibles : mensuel (10€) ou annuel (96€ = 8€/mois)
 * 
 * Body attendu : { planType: "monthly" | "yearly" }
 * 
 * Le webhook handleCheckoutSessionCompleted gère déjà ces deux cas :
 *   - type === 'student_subscription' → is_subscriber = true
 *   - planType === "monthly"          → +1 mois
 *   - planType === "yearly"           → +1 an
 */
router.post("/subscribe-student", requireAuth, async (req, res) => {
    try {
        const userId  = req.user.userId;
        const { planType } = req.body;

        if (!["monthly", "yearly"].includes(planType)) {
            return res.status(400).json({ error: "planType doit être 'monthly' ou 'yearly'" });
        }

        // 1. Récupérer ou créer le customer Stripe de l'étudiant
        const [subStudent] = await sequelize.query(
    `SELECT stripe_customer_id, email, prenom, nom, role, subscription_status
     FROM users WHERE id = :userId`,
    { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
);

        if (!subStudent) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }

        // Sécurité : seuls les élèves/étudiants peuvent s'abonner
        if (subStudent.role === "prof" || subStudent.role === "admin") {
            return res.status(403).json({ error: "Action non autorisée." });
        }

        // Déjà abonné et actif
        if (subStudent.subscription_status === "active") {
            return res.status(409).json({ error: "Vous avez déjà un abonnement actif." });
        }

        let customerId = subStudent.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: subStudent.email,
                name:  `${subStudent.prenom} ${subStudent.nom}`,
                metadata: { userId: String(userId) },
            });
            customerId = customer.id;

            await sequelize.query(
                `UPDATE users SET stripe_customer_id = :customerId WHERE id = :userId`,
                { replacements: { customerId, userId } }
            );
        }

        // 2. Montant selon le plan
        const plans = {
            monthly: { amount: 1000, label: "Abonnement Entraide Étudiante — Mensuel" },  // 10€
            yearly:  { amount: 9600, label: "Abonnement Entraide Étudiante — Annuel" },   // 96€
        };

        const plan = plans[planType];

        // 3. Créer la Checkout Session en mode "payment" one-time
        // (pas mode "subscription" Stripe → tu gères toi-même le renouvellement
        //  via subscription_end_date, cohérent avec ton webhook existant)
        const session = await stripe.checkout.sessions.create({
            mode:                 "payment",
            customer:             customerId,
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency:     "eur",
                    unit_amount:  plan.amount,
                    product_data: { name: plan.label },
                },
                quantity: 1,
            }],
            success_url: `${process.env.CLIENT_URL}/pages/etudiant/dashboard.html?subscription=success`,
            cancel_url:  `${process.env.CLIENT_URL}/pages/etudiant/dashboard.html?subscription=cancel`,
            metadata: {
                userId:   String(userId),
                planType,                    // "monthly" | "yearly" → lu par le webhook
                type:     "student_subscription", // → active is_subscriber dans le webhook
            },
        });

        logger.info("💳 Checkout Session abonnement étudiant créée", { userId, planType });
        res.json({ url: session.url });

    } catch (err) {
        logger.error("❌ Erreur création abonnement étudiant", { message: err.message });
        res.status(500).json({ error: "Erreur serveur Stripe" });
    }
});

/**
 * ✅ Vérifie le statut d'abonnement de l'étudiant connecté
 * Utilisé par le frontend pour afficher le bon état (abonné / expiré / aucun)
 * ET par le middleware WS (ws.subscriptionStatus) au moment de la connexion
 */
router.get("/subscription-status", requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;

        const [subUser] = await sequelize.query(
            `SELECT subscription_status, plan_type, subscription_end_date, is_subscriber
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!subUser) return res.status(404).json({ error: "Utilisateur introuvable" });

        const now = new Date();
        const isExpired = subUser.subscription_end_date && new Date(subUser.subscription_end_date) < now;

        if (isExpired && subUser.subscription_status === "active") {
            await sequelize.query(
                `UPDATE users 
                 SET subscription_status = 'expired', is_subscriber = false 
                 WHERE id = :userId`,
                { replacements: { userId } }
            );
            subUser.subscription_status = "expired";
            subUser.is_subscriber = false;
        }

        res.json({
            status:     subUser.subscription_status || "none",
            planType:   subUser.plan_type,
            endDate:    subUser.subscription_end_date,
            isSubscriber: subUser.is_subscriber ?? false,
        });

    } catch (err) {
        logger.error("❌ Erreur vérification abonnement", { message: err.message });
        res.status(500).json({ error: "Erreur serveur" });
    }
});
router.get("/session/:roomId", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;

    const [session] = await sequelize.query(
      `SELECT v.payment_status as status, 
              v.amount,
              v.duration_seconds,
              p.invoice_number
       FROM visio_sessions v
       LEFT JOIN payments p ON p.stripe_session_id = v.payment_intent_id
       WHERE v.room_id = :roomId
       ORDER BY v.created_at DESC
       LIMIT 1`,
      { replacements: { roomId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    res.json({
      status:        session.status,
      amount:        session.amount,
      dureeMinutes:  session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : null,
      invoiceNumber: session.invoice_number
    });

  } catch (err) {
    logger.error("❌ Erreur récupération session paiement", { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});
export default router;