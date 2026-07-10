import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { generateInvoicePdf } from "../../../services/invoicePdf.js";
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

  if (session.mode === 'setup') {
    if (!customerId) {
      logger.error("❌ CustomerId manquant pour le mode setup", { sessionId });
      return;
    }

    try {
      const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
      const paymentMethodId = setupIntent.payment_method;

      if (paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
        logger.info("💳 Carte définie comme défaut sur Stripe", { customerId, paymentMethodId });
      }

      const userIdFromMeta = session.metadata?.userId;
      const setupType = session.metadata?.type;

      if (setupType === "student_free_trial_setup" && userIdFromMeta) {
        await sequelize.query(
          `UPDATE users 
           SET has_payment_method = true,
               stripe_customer_id = :customerId,
               is_subscriber = true,
               subscription_status = 'trial',
               free_trial_end = NOW() + INTERVAL '7 days'
           WHERE id = :userIdFromMeta`,
          { replacements: { customerId, userIdFromMeta: Number(userIdFromMeta) } }
        );
        logger.info("🎓 Période d'essai gratuite activée", {
          userId: userIdFromMeta,
          customerId
        });
        return;
      }
      if (userIdFromMeta) {
        await sequelize.query(
          `UPDATE users 
           SET has_payment_method = true, stripe_customer_id = :customerId
           WHERE id = :userIdFromMeta`,
          { replacements: { customerId, userIdFromMeta: Number(userIdFromMeta) } }
        );
      } else {
        await sequelize.query(
          `UPDATE users SET has_payment_method = true WHERE stripe_customer_id = :customerId`,
          { replacements: { customerId } }
        );
      }
      
      logger.info("💳 Base de données synchronisée pour le moyen de paiement", { customerId });
      return;
    } catch (err) {
      logger.error("❌ Erreur lors du setup carte", { customerId, message: err.message });
      return;
    }
  }

  if (!userId) {
    logger.error("❌ Metadata userId manquante pour paiement", { sessionId });
    return;
  }

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
  
  let invoiceNumber;

  await sequelize.transaction(async (t) => {

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
          invoiceNumber,
        },
        transaction: t
      }
    );

    logger.info("💰 Paiement enregistré", { userId, sessionId, invoiceNumber, planType: resolvedPlanType });
  });

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
      logger.error("❌ Échec génération PDF — régénérable via invoice_number", {
        userId,
        invoiceNumber,
        message: pdfErr.message,
      });
    }
  }
}

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

    if (visio.is_paid === true) {
      logger.warn("Duplicate visio payment blocked", { roomId, intentId });
      return;
    }

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
          intentId,
        },
        transaction: t
      }
    );

    await sequelize.query(
      `UPDATE visio_sessions 
       SET is_paid = true 
       WHERE room_id = :roomId`,
      {
        replacements: { roomId },
        transaction: t
      }
    );

    logger.info("✅ Paiement visio confirmé et facture créée", {
      roomId,
      eleveId,
      profId,
      amount: paymentIntent.amount,
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

export default router;