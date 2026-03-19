// services/stripeConnect.service.js
import stripe from "../config/stripe.js";
import { db } from "../config/index.js";
import logger from "../config/logger.js";

// Créer un compte Stripe Connect Express pour un prof
export async function createStripeAccount(profId, email) {
  try {
    if (!profId || !email) {
      throw new Error("profId ou email manquant");
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: "FR",
      email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { profId: String(profId) },
    });

    await db.query(
      `UPDATE users SET stripe_account_id = $1 WHERE id = $2`,
      [account.id, profId]
    );

    logger.info("Stripe account created", { profId, accountId: account.id });

    return account.id;
  } catch (err) {
    logger.error("createStripeAccount error", { error: err.message });
    throw err;
  }
}
// Générer lien onboarding Express
export async function createOnboardingLink(accountId) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    // FIX 2 : uniformisé sur FRONTEND_URL (cohérent avec le router)
    refresh_url: `${process.env.FRONTEND_URL}/stripe/refresh`,
    return_url: `${process.env.FRONTEND_URL}/stripe/success`,
  });

  return link.url;
}

// FIX 3 : Vérification cohérente — details_submitted ET charges_enabled
// details_submitted = formulaire rempli / charges_enabled = compte actif
export async function checkAccountReady(accountId) {
  const account = await stripe.accounts.retrieve(accountId);

  if (!account.details_submitted) {
    throw new Error("Onboarding Stripe incomplet : formulaire non soumis");
  }
  if (!account.charges_enabled) {
    throw new Error("Onboarding Stripe incomplet : paiements non activés");
  }

  return true;
}