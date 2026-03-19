// services/payment.service.js
import stripe from "../config/stripe.js";
import { db } from "../config/index.js";
import logger from "../config/logger.js";

const PRICES = {
  monthly: Number(process.env.PRICE_MONTHLY_CENTS) || 999,
  yearly: Number(process.env.PRICE_YEARLY_CENTS) || 9999,
};

function assertPlan(planType) {
  if (!["monthly", "yearly"].includes(planType)) {
    throw Object.assign(new Error("Invalid planType"), { code: "INVALID_PLAN" });
  }
}

// Création session checkout pour abonnement ou paiement cours
export async function createCheckoutSession({ userId, planType, profId = null, amount = null }) {
  assertPlan(planType);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lock user row
    const userRes = await client.query(
      `SELECT id, email, username, stripe_customer_id FROM users WHERE id=$1 FOR UPDATE`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) throw Object.assign(new Error("User not found"), { code: "USER_NOT_FOUND" });

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          name: user.username || undefined,
          metadata: { userId: String(userId) },
        },
        { idempotencyKey: `create-customer-${userId}` }
      );
      customerId = customer.id;
      await client.query(`UPDATE users SET stripe_customer_id=$1 WHERE id=$2`, [customerId, userId]);
      logger.info("Stripe customer created", { userId, customerId });
    }

    // Déterminer le montant
    const unitAmount = amount || PRICES[planType];

    const sessionParams = {
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: profId ? `Cours avec prof ${profId}` : `Abonnement ${planType}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONT_URL}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONT_URL}/pricing.html`,
      metadata: { userId: String(userId), planType, profId },
    };

    // Ajouter transfert si paiement cours marketplace
    if (profId) {
      const profRes = await client.query(`SELECT stripe_account_id FROM professors WHERE user_id=$1`, [profId]);
      const profAccountId = profRes.rows[0]?.stripe_account_id;
      if (!profAccountId) throw new Error("Prof stripe account not found");

      sessionParams.payment_intent_data = {
        transfer_data: { destination: profAccountId },
        application_fee_amount: Math.round(unitAmount * 0.20), // 20% plateforme
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    await client.query("COMMIT");
    return { id: session.id, url: session.url || null };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (rbErr) { logger.warn("Rollback failed", { message: rbErr.message }); }
    logger.error("createCheckoutSession failed", { name: err?.name, message: err?.message });
    throw err;
  } finally {
    client.release();
  }
}

// Activation abonnement après paiement (webhook)
export async function activateSubscription({ userId, planType }) {
  assertPlan(planType);
  const end = new Date();
  if (planType === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
  if (planType === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);

  await db.query(
    `UPDATE users
       SET subscription_status='active',
           plan_type=$1,
           subscription_end_date=$2
       WHERE id=$3`,
    [planType, end.toISOString(), userId]
  );
  logger.info("Subscription activated", { userId, planType, subscription_end_date: end.toISOString() });
  return end;
}