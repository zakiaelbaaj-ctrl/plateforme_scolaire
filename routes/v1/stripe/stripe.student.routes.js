// ============================================================
// routes/v1/stripe/stripe.student.routes.js
// Routes Stripe dédiées au système étudiant-étudiant
// ✅ Abonnement mensuel (10€) et annuel (96€)
// ✅ Vérification statut abonnement
// ❌ Ne touche pas aux routes prof-élève (pre-auth, capture, setup)
// ============================================================

import express from "express";
import { sequelize } from "#config/db.js";
import stripe from "#config/stripe.js";
import logger from "#config/logger.js";
import { requireAuth } from "#middlewares/auth.middleware.js";
const router = express.Router();

// ============================================================
// POST /api/v1/stripe-student/subscribe
// Crée une Checkout Session Stripe pour l'abonnement étudiant
// Body : { planType: "monthly" | "yearly" }
// ============================================================
router.post("/subscribe", requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;

        // 1. Récupérer l'utilisateur avec ses informations d'essai
        const [user] = await sequelize.query(
            `SELECT stripe_customer_id, email, prenom, nom, role, subscription_status, free_trial_end
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

        // Sécurité : Vérifier s'il a déjà consommé sa semaine gratuite ou s'il est actif
        if (user.subscription_status === "active") {
            return res.status(409).json({ error: "Vous avez déjà un abonnement actif." });
        }
        if (user.free_trial_end && new Date(user.free_trial_end) > new Date()) {
            return res.status(400).json({ error: "Vous bénéficiez déjà d'une période d'essai active." });
        }

        // 2. Récupérer ou créer le customer Stripe
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

        // 3. Créer la session Stripe Checkout en mode "setup" (Prend la carte sans débiter)
        const session = await stripe.checkout.sessions.create({
            mode: "setup", 
            customer: customerId,
            payment_method_types: ["card"],
            success_url: `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html?subscription=success`,
            cancel_url:  `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html?subscription=cancel`,
            metadata: {
                userId: String(userId),
                type: "student_free_trial_setup" // Identifiant pour ton webhook
            },
        });

        logger.info("💳 Session d'enregistrement de carte créée pour essai gratuit", { userId });
        res.json({ url: session.url });

    } catch (err) {
        logger.error("❌ Erreur création essai gratuit étudiant", { message: err.message });
        res.status(500).json({ error: "Erreur serveur Stripe" });
    }
});

// ============================================================
// GET /api/v1/stripe-student/status
// Retourne le statut d'abonnement de l'étudiant connecté
// Utilisé par :
//   - Le frontend (dashboard étudiant) pour afficher l'état
//   - Le server.js WS pour peupler ws.subscriptionStatus à la connexion
// ============================================================
router.get("/status", requireAuth, async (req, res) => {
    try {
       const userId = req.user.userId || req.user.id;
        const [statusUser] = await sequelize.query(
           `SELECT is_subscriber, subscription_status, subscription_end_date, plan_type, free_trial_end FROM users WHERE id = :userId`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!statusUser) return res.status(404).json({success: false, message: "Utilisateur non trouvé" });
        // Gestion propre de l'expiration avec garde-fou
    let currentStatus = statusUser.subscription_status || "none";
    let isSubscriber = statusUser.is_subscriber ?? false;

    const now = new Date();
    const isSubscriptionExpired =
        statusUser.subscription_end_date &&
        new Date(statusUser.subscription_end_date) < now;
    const isTrialExpired =
        statusUser.subscription_status === "trial" &&
        statusUser.free_trial_end &&
        new Date(statusUser.free_trial_end) < now;

    if ((isSubscriptionExpired || isTrialExpired) &&
        (statusUser.subscription_status === "active" || statusUser.subscription_status === "trial")) {
        await sequelize.query(
            `UPDATE users
             SET subscription_status = 'expired', is_subscriber = false
             WHERE id = :userId`,
            { replacements: { userId } }
        );
        currentStatus = "expired";
        isSubscriber = false;
    }
            return res.json({
            status:       currentStatus, 
        planType:     statusUser.plan_type || "none",
        endDate:      statusUser.subscription_end_date || null,
        isSubscriber: isSubscriber,
        });

   } catch (err) {
    if (logger && logger.error) {
      logger.error("❌ Erreur sur la route Stripe status:", err.message);
    } else {
      console.error("❌ Erreur sur la route Stripe status:", err.message);
    }
    return res.status(500).json({ error: "Erreur serveur statut abonnement" });
  }
});
  // ============================================================
// POST /api/v1/stripe-student/subscribe-student
// Crée une Checkout Session pour l'abonnement étudiant payant
// Plans disponibles : mensuel (10€) ou annuel (96€)
// Body attendu : { planType: "monthly" | "yearly" }
// ============================================================
router.post("/subscribe-student", requireAuth, async (req, res) => {
    try {
        const userId  = req.user.userId;
        const { planType } = req.body;

        if (!["monthly", "yearly"].includes(planType)) {
            return res.status(400).json({ error: "planType doit être 'monthly' ou 'yearly'" });
        }

        const [subStudent] = await sequelize.query(
            `SELECT stripe_customer_id, email, prenom, nom, role, subscription_status
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!subStudent) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }

        if (subStudent.role === "prof" || subStudent.role === "admin") {
            return res.status(403).json({ error: "Action non autorisée." });
        }

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

        const plans = {
            monthly: { amount: 1000, label: "Abonnement Entraide Étudiante — Mensuel" },
            yearly:  { amount: 9600, label: "Abonnement Entraide Étudiante — Annuel" },
        };

        const plan = plans[planType];

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
            success_url: `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html?subscription=success`,
            cancel_url:  `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html?subscription=cancel`,
            metadata: {
                userId:   String(userId),
                planType,
                type:     "student_subscription",
            },
        });

        logger.info("💳 Checkout Session abonnement étudiant créée", { userId, planType });
        res.json({ url: session.url });

    } catch (err) {
        logger.error("❌ Erreur création abonnement étudiant", { message: err.message });
        res.status(500).json({ error: "Erreur serveur Stripe" });
    }
});
export default router;
