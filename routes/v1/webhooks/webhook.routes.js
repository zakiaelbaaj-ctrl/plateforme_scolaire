import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { requireAuth } from "#middlewares/auth.middleware.js";
const router = express.Router();

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
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
 * ✅ Gère les abonnements (Plans classiques ET Entraide Étudiante à 20€)
 */
async function handleCheckoutSessionCompleted(session) {

  const { userId, planType, type } = session.metadata || {};

  const sessionId = session.id;

  if (!userId) {
    logger.error("❌ Metadata userId manquante dans la session", { sessionId });
    return;
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

    return;
  }

  // ======================================================
  // 💳 ENREGISTREMENT CARTE (SETUP INTENT)
  // ======================================================
  if (session.mode === 'setup') {
    const customerId = session.customer;

    try {
      await sequelize.query(
        `UPDATE users SET has_payment_method = true WHERE stripe_customer_id = :customerId`,
        {
          replacements: { customerId }
        }
      );

      logger.info("💳 Carte enregistrée avec succès", { customerId });
      return;
    } catch (err) {
      logger.error("❌ Erreur mise à jour carte", {
        customerId,
        message: err.message
      });
      return;
    }
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
      success_url: `${process.env.CLIENT_URL}/pages/eleve/dashboard.html?setup=success`,
      cancel_url:  `${process.env.CLIENT_URL}/pages/eleve/dashboard.html?setup=cancel`,
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
        const [user] = await sequelize.query(
            `SELECT stripe_customer_id, email, prenom, nom, role, subscription_status
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!user) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }

        // Sécurité : seuls les élèves/étudiants peuvent s'abonner
        if (user.role === "prof" || user.role === "admin") {
            return res.status(403).json({ error: "Action non autorisée." });
        }

        // Déjà abonné et actif
        if (user.subscription_status === "active") {
            return res.status(409).json({ error: "Vous avez déjà un abonnement actif." });
        }

        let customerId = user.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name:  `${user.prenom} ${user.nom}`,
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

        const [user] = await sequelize.query(
            `SELECT subscription_status, plan_type, subscription_end_date, is_subscriber
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

        // Vérifier si l'abonnement a expiré en DB mais pas encore mis à jour
        const now = new Date();
        const isExpired = user.subscription_end_date && new Date(user.subscription_end_date) < now;

        if (isExpired && user.subscription_status === "active") {
            // Expiration automatique
            await sequelize.query(
                `UPDATE users 
                 SET subscription_status = 'expired', is_subscriber = false 
                 WHERE id = :userId`,
                { replacements: { userId } }
            );
            user.subscription_status = "expired";
            user.is_subscriber = false;
        }

        res.json({
            status:     user.subscription_status || "none",  // "active" | "expired" | "none"
            planType:   user.plan_type,
            endDate:    user.subscription_end_date,
            isSubscriber: user.is_subscriber ?? false,
        });

    } catch (err) {
        logger.error("❌ Erreur vérification abonnement", { message: err.message });
        res.status(500).json({ error: "Erreur serveur" });
    }
});
export default router;