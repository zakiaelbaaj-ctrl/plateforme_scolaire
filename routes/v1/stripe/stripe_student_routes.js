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
        const { planType } = req.body;

        if (!["monthly", "yearly"].includes(planType)) {
            return res.status(400).json({ error: "planType doit être 'monthly' ou 'yearly'" });
        }

        // 1. Récupérer l'utilisateur
        const [user] = await sequelize.query(
            `SELECT stripe_customer_id, email, prenom, nom, role, subscription_status
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!user) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }

        // Sécurité : seuls élèves/étudiants peuvent s'abonner
        if (user.role === "prof" || user.role === "admin") {
            return res.status(403).json({ error: "Action non autorisée." });
        }

        // Déjà abonné et actif → pas de double abonnement
        if (user.subscription_status === "active") {
            return res.status(409).json({ error: "Vous avez déjà un abonnement actif." });
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

        // 3. Montants selon le plan
        const plans = {
            monthly: { amount: 1000, label: "Abonnement Entraide Étudiante — Mensuel (10€/mois)" },
            yearly:  { amount: 9600, label: "Abonnement Entraide Étudiante — Annuel (96€/an)"   },
        };

        const plan = plans[planType];

        // 4. Créer la Checkout Session
        // Mode "payment" one-time — le renouvellement est géré via subscription_end_date en DB
        // Le webhook handleCheckoutSessionCompleted traite déjà :
        //   type === 'student_subscription' → is_subscriber = true
        //   planType === "monthly"          → +1 mois
        //   planType === "yearly"           → +1 an
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
                planType,                     // lu par le webhook → calcul date de fin
                type:     "student_subscription", // lu par le webhook → active is_subscriber
            },
        });

        logger.info("💳 Checkout Session abonnement étudiant créée", { userId, planType });
        res.json({ url: session.url });

    } catch (err) {
        logger.error("❌ Erreur création abonnement étudiant", { message: err.message });
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
        const userId = req.user.userId;

        const [user] = await sequelize.query(
            `SELECT subscription_status, plan_type, subscription_end_date, is_subscriber
             FROM users WHERE id = :userId`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

        // Expiration automatique si la date est dépassée mais le statut pas encore mis à jour
        const isExpired =
            user.subscription_end_date &&
            new Date(user.subscription_end_date) < new Date();

        if (isExpired && user.subscription_status === "active") {
            await sequelize.query(
                `UPDATE users
                 SET subscription_status = 'expired', is_subscriber = false
                 WHERE id = :userId`,
                { replacements: { userId } }
            );
            user.subscription_status = "expired";
            user.is_subscriber        = false;
        }

        res.json({
            status:       user.subscription_status || "none", // "active" | "expired" | "none"
            planType:     user.plan_type,
            endDate:      user.subscription_end_date,
            isSubscriber: user.is_subscriber ?? false,
        });

    } catch (err) {
        logger.error("❌ Erreur vérification abonnement", { message: err.message });
        res.status(500).json({ error: "Erreur serveur" });
    }
});

export default router;