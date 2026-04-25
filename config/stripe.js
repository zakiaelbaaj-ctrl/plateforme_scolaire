// config/stripe.js
import Stripe from "stripe";
import logger from "./logger.js";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ STRIPE_SECRET_KEY manquant dans .env");
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error("❌ STRIPE_WEBHOOK_SECRET manquant dans .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-11-17.clover",
  timeout: 10000,
});
logger.info("✅ Stripe instance created");

// Vérifie Stripe au démarrage
export async function verifyStripe() {
  try {
    await stripe.balance.retrieve();
    logger.info("✅ Stripe ready");
    return true;
  } catch (err) {
    logger.error("❌ Stripe verification failed", { name: err.name, message: err.message });
    throw err;
  }
}

// Vérification webhook
export function constructWebhookEvent(rawBody, signature) {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn("⚠️ Webhook verification failed", { message: err.message });
    throw err;
  }
}

export default stripe;
