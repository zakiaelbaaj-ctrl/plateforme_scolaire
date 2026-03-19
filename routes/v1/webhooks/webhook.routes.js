import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { generateInvoicePdf } from "../../../services/invoicePdf.js";

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
      // ✅ FLUX 1 : ABONNEMENTS (checkout.session.completed)
      if (event.type === "checkout.session.completed") {
        await handleCheckoutSessionCompleted(event.data.object);
      }

      // ✅ FLUX 2 : APPELS VIDÉO (payment_intent.succeeded)
      else if (event.type === "payment_intent.succeeded") {
        await handlePaymentIntentSucceeded(event.data.object);
      }

      // ✅ FLUX 2 : APPELS VIDÉO (payment_intent.payment_failed)
      else if (event.type === "payment_intent.payment_failed") {
        await handlePaymentIntentFailed(event.data.object);
      }

      // ✅ FLUX 2 : APPELS VIDÉO (payment_intent.canceled)
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
        message: err.message, 
        stack: err.stack 
      });
      res.status(500).send();
    }
  }
);

/**
 * ✅ FLUX 1 : Gère les abonnements (checkout.session.completed)
 */
async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType;
  const sessionId = session.id;

  await sequelize.transaction(async (t) => {
    // Vérifier si déjà traité
    const existing = await sequelize.query(
      `SELECT 1 FROM payments WHERE stripe_session_id = :sessionId LIMIT 1`,
      { replacements: { sessionId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    if (existing.length > 0) {
      logger.info("💡 Webhook déjà traité", { sessionId });
      return;
    }

    const [user] = await sequelize.query(
      `SELECT subscription_status, subscription_end_date
       FROM users WHERE id = :userId FOR UPDATE`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    if (!user) {
      logger.error("❌ Utilisateur non trouvé", { userId });
      return;
    }

    // Calcul date fin
    const end = new Date();
    if (planType === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
    if (planType === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);

    // Mettre à jour l'utilisateur
    await sequelize.query(
      `UPDATE users 
       SET subscription_status = 'active', 
           plan_type = :planType, 
           subscription_end_date = :end 
       WHERE id = :userId`,
      { replacements: { planType, end: end.toISOString(), userId }, transaction: t }
    );

    // Mettre à jour le paiement (si créé via billCall)
    await sequelize.query(
      `UPDATE payments SET status = 'succeeded' WHERE stripe_session_id = :sessionId`,
      { replacements: { sessionId }, transaction: t }
    );

    // Génération de la facture PDF
    try {
      const invoiceNumber = `INV-${userId}-${sessionId}`;
      const pdfBuffer = await generateInvoicePdf({
        userId,
        planType,
        amount: session.amount_total,
        invoiceNumber,
        date: new Date(),
      });
      logger.info("🧾 Facture PDF générée (abonnement)", { userId, planType });
    } catch (pdfErr) {
      logger.error("❌ Erreur génération facture PDF", { userId, message: pdfErr.message });
    }

    logger.info("✅ Webhook: abonnement activé", { userId, planType, sessionId });
  });
}

/**
 * ✅ FLUX 2 : Gère le succès des paiements d'appels vidéo
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const intentId = paymentIntent.id;
  const studentId = paymentIntent.metadata?.studentId;

  await sequelize.transaction(async (t) => {
    // Vérifier si déjà traité (simple vérification)
    const existing = await sequelize.query(
      `SELECT 1 FROM payments WHERE stripe_session_id = :intentId LIMIT 1`,
      { replacements: { intentId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    if (existing.length === 0) {
      logger.error("❌ Paiement non trouvé en base", { intentId });
      return;
    }

    const [payment] = await sequelize.query(
      `SELECT id, user_id, amount, currency
       FROM payments
       WHERE stripe_session_id = :intentId
       LIMIT 1`,
      { replacements: { intentId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    if (!payment) {
      logger.error("❌ Paiement non trouvé", { intentId });
      return;
    }

    // Mettre à jour le statut
    await sequelize.query(
      `UPDATE payments SET status = 'succeeded' WHERE stripe_session_id = :intentId`,
      { replacements: { intentId }, transaction: t }
    );

    // Récupérer les infos de l'élève
    const [student] = await sequelize.query(
      `SELECT id, email, username FROM users WHERE id = :studentId`,
      { replacements: { studentId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    // Générer facture PDF (hors transaction)
    if (student) {
      try {
        const invoiceNumber = `VID-${studentId}-${payment.id}`;
        await generateInvoicePdf({
          paymentId: payment.id,
          student,
          amountCents: payment.amount,
          currency: payment.currency,
          invoiceNumber,
          createdAt: new Date()
        });
        logger.info("🧾 Facture PDF générée (appel vidéo)", {
          studentId,
          paymentId: payment.id,
          amount: payment.amount
        });
      } catch (pdfErr) {
        logger.error("❌ Erreur génération facture PDF", {
          studentId,
          paymentId: payment.id,
          message: pdfErr.message
        });
      }
    }

    logger.info("✅ Paiement appel vidéo confirmé", {
      studentId,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency
    });
  });
}

/**
 * ❌ FLUX 2 : Gère l'échec du paiement
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const intentId = paymentIntent.id;
  const studentId = paymentIntent.metadata?.studentId;

  await sequelize.transaction(async (t) => {
    // Mettre à jour le statut
    await sequelize.query(
      `UPDATE payments SET status = 'failed' WHERE stripe_session_id = :intentId`,
      { replacements: { intentId }, transaction: t }
    );

    logger.warn("❌ Paiement appel vidéo échoué", {
      studentId,
      intentId,
      reason: paymentIntent.last_payment_error?.message
    });
  });
}

/**
 * 🚫 FLUX 2 : Gère l'annulation du paiement
 */
async function handlePaymentIntentCanceled(paymentIntent) {
  const intentId = paymentIntent.id;

  await sequelize.transaction(async (t) => {
    // Mettre à jour le statut
    await sequelize.query(
      `UPDATE payments SET status = 'canceled' WHERE stripe_session_id = :intentId`,
      { replacements: { intentId }, transaction: t }
    );

    logger.info("🚫 Paiement appel vidéo annulé", { intentId });
  });
}

export default router;