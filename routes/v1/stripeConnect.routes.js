// C:\Users\zakia\Home\plateforme_scolaire\routes\v1\stripeConnect.routes.js
import express from "express";
import { db } from "../../config/index.js";
import auth from "../../middlewares/auth.middleware.js";
import logger from "../../config/logger.js";
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

    // ✅ Validation
    if (!userId || !email || !role) {
      return res.status(400).json({ error: "Données utilisateur manquantes" });
    }

    if (!process.env.FRONTEND_URL) {
      throw new Error("FRONTEND_URL non défini");
    }

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
      throw new Error("Utilisateur introuvable");
    }

    // ✅ Détermination du rôle et dashboard URL
    const isProfesseur = role === "professeur" || role === "prof";
    let dashboardUrl;

    if (isProfesseur) {
      dashboardUrl = `${process.env.FRONTEND_URL}/pages/professeur/dashboard.html`;
    } else if (role === "etudiant") {
      dashboardUrl = `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html`;
    } else if (role === "eleve") {
      dashboardUrl = `${process.env.FRONTEND_URL}/pages/eleve/dashboard.html`;
    } else {
      logger.warn("⚠️ Rôle utilisateur inconnu", { userId, role });
      return res.status(400).json({ error: "Rôle utilisateur inconnu" });
    }

    let accountId = user.stripe_account_id;
    let isNewAccount = false;
    let stripeLink = null;

    // ✅ Logique Stripe pour les professeurs
    if (isProfesseur) {
      if (!accountId) {
        logger.info("📝 Création nouveau compte Stripe", { userId, email });
        accountId = await createStripeAccount(userId, email);
        isNewAccount = true;
      }

      if (!accountId) throw new Error("Impossible de créer le compte Stripe");

      stripeLink = await createOnboardingLink(accountId);

      if (!isNewAccount && user.stripe_onboarding_complete === false) {
        try {
          const isReady = await checkAccountReady(accountId);
          if (isReady) {
            await db.query(
              `UPDATE users SET stripe_onboarding_complete = true WHERE id = :userId`,
              { replacements: { userId } }
            );
            logger.info("✅ Onboarding Stripe complété", { userId, accountId });
          }
        } catch (errCheck) {
          logger.info(`Onboarding en cours pour ${userId}: ${errCheck.message}`);
        }
      }

      logger.info("✅ Lien onboarding Stripe créé", { userId, accountId, isNewAccount });
    }

    // ✅ Réponse finale
    res.json({
      userId,
      role,
      accountId,
      onboardingRequired: isProfesseur,
      isNewAccount,
      stripeLink,
      dashboardUrl
    });

  } catch (err) {
    logger.error("❌ Erreur Stripe onboarding", {
      userId: req.user?.userId,
      message: err.message,
      stack: err.stack
    });

    if (err.code === "account_invalid") {
      return res.status(400).json({ error: "Compte Stripe invalide" });
    }
    if (err.code === "authentication_error") {
      return res.status(401).json({ error: "Clé Stripe invalide" });
    }

    res.status(500).json({ error: err.message || "Erreur lors de la création du lien d'onboarding" });
  }
});

export default router;