import stripe from "../config/stripe.js";
import { pool } from "../config/db.js";
import logger from "../config/logger.js";

export async function billCall({
  studentId,
  amountEuros,
  description,
  callId,
  maxRetries = 3
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 Verrouille l'utilisateur pour éviter race condition sur customerId
    const userRes = await client.query(
      `SELECT stripe_customer_id, email, username
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [studentId]
    );

    const student = userRes.rows[0];
    if (!student) throw new Error("Utilisateur non trouvé");

    let customerId = student.stripe_customer_id;

    // 🧾 Création customer Stripe si nécessaire
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: student.email,
        name: student.username,
        metadata: { userId: String(studentId) }
      });

      customerId = customer.id;

      await client.query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, studentId]
      );

      logger.info("✅ Stripe customer créé automatiquement", { studentId, customerId });
    }

    // 🔁 Retry Stripe si indisponible
    async function createPaymentIntent(retriesLeft) {
      try {
        return await stripe.paymentIntents.create({
          amount: Math.round(amountEuros * 100),
          currency: "eur",
          customer: customerId,
          description,
          metadata: { callId, studentId: String(studentId) }
        });
      } catch (err) {
        const retryable =
          ["StripeAPIError", "StripeConnectionError", "StripeRateLimitError"].includes(err.type);

        if (retriesLeft > 0 && retryable) {
          logger.warn("⚠️ Stripe indisponible, retry...", {
            studentId,
            callId,
            retriesLeft,
            message: err.message
          });

          await new Promise(r => setTimeout(r, 1000));
          return createPaymentIntent(retriesLeft - 1);
        }

        throw err;
      }
    }

    const intent = await createPaymentIntent(maxRetries);
    const amountCents = Math.round(amountEuros * 100);

    // 💾 INSERT INTO payments (colonnes existantes uniquement)
    const insertRes = await client.query(
      `INSERT INTO payments(user_id, stripe_session_id, amount, currency, status, created_at)
       VALUES($1, $2, $3, $4, $5, NOW())
       RETURNING id, created_at`,
      [studentId, intent.id, amountCents, "eur", "requires_payment"]
    );

    const paymentRow = insertRes.rows[0];

    await client.query("COMMIT");

    logger.info("💳 PaymentIntent créé, en attente de confirmation client", {
      studentId,
      callId,
      amountEuros,
      paymentIntentId: intent.id,
      paymentId: paymentRow.id,
      status: "requires_payment"
    });

    return {
      status: "requires_payment",
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      paymentId: paymentRow.id,
      amount: amountCents,
      currency: "eur"
    };

  } catch (err) {
    await client.query("ROLLBACK");

    logger.error("❌ billCall failed", {
      studentId,
      callId,
      message: err.message,
      stack: err.stack
    });

    return { status: "failed", error: err.message };
  } finally {
    client.release();
  }
}