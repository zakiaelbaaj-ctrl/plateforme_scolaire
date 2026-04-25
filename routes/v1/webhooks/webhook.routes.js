import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { generateInvoicePdf } from "../../../services/invoicePdf.js";
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
      event = stripe.webhooks.constructEvent(req.body, sig, secret, undefined, {
  clockSkewInSeconds: 300
});
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
  if (session.mode === 'setup') {
    const customerId = session.customer;
    try {
      await sequelize.query(
        `UPDATE users SET has_payment_method = true WHERE stripe_customer_id = :customerId`,
        { replacements: { customerId } }
      );
      logger.info("💳 Carte enregistrée avec succès pour l'élève", { customerId });
      return; // On s'arrête là pour un setup
    } catch (err) {
      logger.error("❌ Erreur mise à jour has_payment_method", { customerId, message: err.message });
      return;
    }
  }
  const { userId, planType, type } = session.metadata || {};
  const sessionId = session.id;

  if (!userId) {
    logger.error("❌ Metadata userId manquante dans la session", { sessionId });
    return;
  }

  await sequelize.transaction(async (t) => {
    // 1. Vérifier si déjà traité
    const existing = await sequelize.query(
      `SELECT 1 FROM payments WHERE stripe_session_id = :sessionId LIMIT 1`,
      { replacements: { sessionId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );

    if (existing.length > 0) return;

    // 2. Calcul de la date de fin (1 mois pour l'entraide ou selon planType)
    const end = new Date();
    if (type === 'student_subscription' || planType === "monthly") {
      end.setUTCMonth(end.getUTCMonth() + 1);
    } else if (planType === "yearly") {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    }

    // 3. Mise à jour de l'utilisateur (Gestion is_subscriber pour l'entraide)
    await sequelize.query(
      `UPDATE users 
       SET subscription_status = 'active', 
           is_subscriber = :isSub,
           plan_type = :plan, 
           subscription_end_date = :end 
       WHERE id = :userId`,
      { 
        replacements: { 
          plan: planType || 'student_entraide', 
          isSub: type === 'student_subscription', // Active l'entraide si c'est le type
          end: end.toISOString(), 
          userId 
        }, 
        transaction: t 
      }
    );

    // 4. Enregistrement du paiement
    const [paymentResult] = await sequelize.query(
      `INSERT INTO payments (user_id, amount, currency, status, stripe_session_id, type)
       VALUES (:userId, :amount, :currency, 'succeeded', :sessionId, :type)
       RETURNING id`,
      { 
        replacements: { 
          userId, 
          amount: session.amount_total, 
          currency: session.currency, 
          sessionId,
          type: type || 'subscription'
        }, 
        transaction: t 
      }
    );

    // 5. Génération facture PDF
    try {
      const invoiceNumber = `INV-${userId}-${Date.now()}`;
      await generateInvoicePdf({
        userId,
        planType: planType || 'Entraide Étudiante',
        amount: session.amount_total,
        invoiceNumber,
        date: new Date(),
      });
      logger.info("🧾 Facture PDF générée", { userId });
    } catch (pdfErr) {
      logger.error("❌ Erreur PDF", { userId, message: pdfErr.message });
    }
  });
}

/**
 * ✅ Gère le succès des paiements d'appels vidéo (20€ ou 40€/h)
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const { roomId, eleveId, profId } = paymentIntent.metadata;
  const intentId = paymentIntent.id;

  await sequelize.transaction(async (t) => {
    // 1. Mettre à jour la session visio
    await sequelize.query(
      `UPDATE visio_sessions SET is_paid = true WHERE room_id = :roomId`,
      { replacements: { roomId }, transaction: t }
    );

    // 2. Créer ou mettre à jour le paiement
    const [payment] = await sequelize.query(
      `INSERT INTO payments (user_id, amount, currency, status, stripe_session_id, type)
       VALUES (:eleveId, :amount, :currency, 'succeeded', :intentId, 'visio_call')
       ON CONFLICT (stripe_session_id) DO UPDATE SET status = 'succeeded'
       RETURNING id`,
      { 
        replacements: { 
          eleveId, 
          amount: paymentIntent.amount, 
          currency: paymentIntent.currency, 
          intentId 
        }, 
        transaction: t 
      }
    );

    // 3. Facture PDF pour l'appel
    try {
      const [student] = await sequelize.query(
        `SELECT id, email, username FROM users WHERE id = :eleveId`,
        { replacements: { eleveId }, type: sequelize.QueryTypes.SELECT, transaction: t }
      );

      if (student) {
        await generateInvoicePdf({
          paymentId: payment[0].id,
          student,
          amountCents: paymentIntent.amount,
          currency: paymentIntent.currency,
          invoiceNumber: `VID-${roomId}`,
          createdAt: new Date()
        });
      }
    } catch (pdfErr) {
      logger.error("❌ Erreur PDF Visio", { roomId, message: pdfErr.message });
    }

    logger.info("✅ Paiement visio confirmé et session marquée payée", { roomId });
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
export default router;