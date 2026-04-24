// routes/v1/stripeConnect.routes.js
import express from "express";
import { db } from "../../config/index.js";
import auth from "../../middlewares/auth.middleware.js";
import logger from "../../config/logger.js";

  import Stripe from "stripe";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
 import {
  createStripeAccount,
  createOnboardingLink,
  checkAccountReady
} from "../../services/stripeConnect.service.js";
  const router = express.Router();
  router.post("/onboarding", auth, async (req, res) => {
  try {
    // ✅ Mapping user depuis JWT
    const { userId, email, role } = req.user;
    console.log("DEBUG USER:", req.user);

    // ✅ Validation des données de session
    if (!userId || !email || !role) {
      return res.status(400).json({ error: "Données utilisateur manquantes" });
    }

    // ✅ SÉCURITÉ : Valeur par défaut si FRONTEND_URL est absent sur Render
    // Cela évite l'erreur 500 que tu avais précédemment.
    const frontendUrl = process.env.FRONTEND_URL || "https://plateforme-scolaire-1.onrender.com";

    // ✅ Récupération utilisateur depuis DB via Sequelize
    const userRecords = await db.query(
      `SELECT stripe_account_id, stripe_onboarding_complete 
       FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: db.QueryTypes.SELECT
      }
    );

    const user = userRecords[0];
    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // ✅ Détermination du rôle et dashboard URL (utilisant frontendUrl)
    const isProfesseur = role === "professeur" || role === "prof";
    let dashboardUrl;

    if (isProfesseur) {
      dashboardUrl = `${frontendUrl}/pages/professeur/dashboard.html`;
    } else if (role === "etudiant") {
      dashboardUrl = `${frontendUrl}/pages/etudiant/dashboard.html`;
    } else if (role === "eleve") {
      dashboardUrl = `${frontendUrl}/pages/eleve/dashboard.html`;
    } else {
      logger.warn("⚠️ Rôle utilisateur inconnu", { userId, role });
      return res.status(400).json({ error: "Rôle utilisateur inconnu" });
    }

    let accountId = user.stripe_account_id;
    let isNewAccount = false;
    let stripeLink = null;

    // ✅ LOGIQUE STRIPE POUR LES PROFESSEURS
    if (isProfesseur) {
      // 1. Créer le compte s'il n'existe pas
      if (!accountId) {
        logger.info("📝 Création nouveau compte Stripe Connect", { userId, email });
        accountId = await createStripeAccount(userId, email);
        isNewAccount = true;
      }

      if (!accountId) {
        throw new Error("Impossible de générer un ID de compte Stripe");
      }

      // 2. Générer le lien d'onboarding (on passe dashboardUrl pour le retour)
      // Note: Assure-toi que ton service 'createOnboardingLink' accepte ce 2ème paramètre
      stripeLink = await createOnboardingLink(accountId, dashboardUrl);

      // 3. Vérification si le compte est déjà prêt (cas où le lien est re-cliqué)
      if (!isNewAccount && user.stripe_onboarding_complete === false) {
        try {
          const isReady = await checkAccountReady(accountId);
          if (isReady) {
            await db.query(
              `UPDATE users SET stripe_onboarding_complete = true WHERE id = :userId`,
              { replacements: { userId } }
            );
            logger.info("✅ Statut mis à jour : Onboarding complété", { userId });
          }
        } catch (errCheck) {
          logger.info(`Onboarding toujours incomplet pour ${userId}`);
        }
      }
    }

    // ✅ RÉPONSE FINALE
    res.json({
      success: true,
      userId,
      role,
      accountId,
      onboardingRequired: isProfesseur,
      isNewAccount,
      stripeLink, // Contient l'URL de redirection Stripe
      dashboardUrl
    });

  } catch (err) {
    console.error("❌ ONBOARDING ERROR:", err);
    logger.error("❌ Erreur Stripe onboarding", {
      userId: req.user?.userId,
      message: err.message
    });

    // Gestion spécifique des erreurs Stripe communes
    if (err.message.includes("authentication")) {
      return res.status(401).json({ error: "Clé API Stripe manquante ou invalide sur Render" });
    }

    res.status(500).json({ 
      error: "Erreur lors de la configuration du compte de paiement",
      details: err.message 
    });
  }
});
// ✅ Route pour que l'élève enregistre sa carte
router.post("/create-setup-session", auth, async (req, res) => {
  console.log("📩 BODY:", req.body);
  console.log("👤 USER:", req.user);
  console.log("🔥 STRIPE ROUTE HIT");
  try {
    const { userId, email } = req.user;

    // 1. Récupérer l'utilisateur
    const [user] = await db.query(
      "SELECT stripe_customer_id, email, prenom, nom FROM users WHERE id = :userId",
      { replacements: { userId }, type: db.QueryTypes.SELECT }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    let customerId = user.stripe_customer_id;

    // 2. Créer le customer Stripe s'il n'existe pas encore
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || email,
        name: `${user.prenom || ""} ${user.nom || ""}`.trim(),
        metadata: { userId: String(userId) },
      });

      customerId = customer.id;

      await db.query(
        "UPDATE users SET stripe_customer_id = :customerId WHERE id = :userId",
        { replacements: { customerId, userId } }
      );

      logger.info("✅ Customer Stripe créé", { userId, customerId });
    }

    // 3. Créer la Checkout Session en mode setup
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "setup",
      customer: customerId,
      success_url: `${process.env.FRONTEND_URL}/pages/eleve/dashboard.html?stripe=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/pages/eleve/dashboard.html?stripe=cancel`,
    });

    res.json({ success: true, url: session.url });

  } catch (err) {
    logger.error("❌ Erreur Setup Session", { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// =======================================================
// PRE-AUTH (EMPREINTE BANCAIRE)
// =======================================================
router.post("/pre-auth", auth, async (req, res) => {
  console.log("🔥 PRE-AUTH ROUTE HIT");

  try {
    const eleveId = req.user.userId ?? req.user.id;
    console.log("🔍 eleveId extrait:", eleveId);
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Montant invalide." });
    }

    const [eleve] = await db.query(
      `SELECT stripe_customer_id, has_payment_method
       FROM users
       WHERE id = :eleveId`,
      {
        replacements: { eleveId },
        type: db.QueryTypes.SELECT
      }
    );
    console.log("🔍 ELEVE DATA:", eleve);

    if (!eleve || !eleve.stripe_customer_id || !eleve.has_payment_method) {
      return res.status(400).json({ message: "Aucune carte enregistrée." });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: eleve.stripe_customer_id,
      type: "card"
    });

    if (paymentMethods.data.length === 0) {
      return res.status(400).json({ message: "Carte introuvable." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      customer: eleve.stripe_customer_id,
      payment_method: paymentMethods.data[0].id,
      off_session: true,
      confirm: true,
      capture_method: "manual",
      metadata: {
        eleveId: String(eleveId)
      }
    });

    logger.info("💳 PRE-AUTH OK", {
      eleveId,
      intentId: paymentIntent.id
    });

    res.json({
      paymentIntentId: paymentIntent.id
    });

  } catch (err) {
    console.error("❌ PRE-AUTH ERROR:", err.message);

    res.status(500).json({
      message: "Erreur Stripe pre-auth"
    });
  }
});
export default router;