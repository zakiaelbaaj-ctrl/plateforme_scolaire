import stripe from "#config/stripe.js";
import { db } from "#config/index.js";
import logger from "#config/logger.js";

/**
 * Crée un compte Stripe Express pour un professeur
 */
export async function createStripeAccount(userId, email) {
  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "FR",
      email,
      capabilities: { transfers: { requested: true } },
      metadata: { userId: String(userId) },
    });

    if (!account?.id) {
      throw new Error("Stripe account creation failed: missing account ID");
    }

    // Sauvegarde Stripe account ID dans la table users
    await db.query(
      `UPDATE users SET stripe_account_id = :accountId WHERE id = :userId`,
      {
        replacements: { accountId: account.id, userId }
      }
    );

    logger.info("✅ Stripe account created", { userId, accountId: account.id });
    return account.id;
  } catch (err) {
    logger.error("createStripeAccount error", { userId, email, error: err.message });
    throw err;
  }
}

/**
 * Crée un lien onboarding pour le dashboard du professeur
 */
export async function createOnboardingLink(accountId) {
  try {
    const refreshUrl = `${process.env.FRONTEND_URL}/pages/professeur/dashboard.html?refresh=1`;
    const returnUrl = `${process.env.FRONTEND_URL}/pages/professeur/dashboard.html`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding"
    });

    if (!link?.url) {
      throw new Error("Stripe onboarding link creation failed: missing URL");
    }

    logger.info("✅ Stripe onboarding link created", { accountId, url: link.url });
    return link.url;
  } catch (err) {
    logger.error("createOnboardingLink error", { accountId, message: err.message });
    throw err;
  }
}

/**
 * Vérifie si un compte Stripe est prêt à accepter des paiements
 */
export async function checkAccountReady(accountId) {
  try {
    const account = await stripe.accounts.retrieve(accountId);

    const isReady =
      account?.charges_enabled === true &&
      account?.details_submitted === true;

    logger.info("Stripe account readiness check", { accountId, isReady });
    return isReady;
  } catch (err) {
    logger.error("checkAccountReady error", { accountId, message: err.message });
    throw err;
  }
}