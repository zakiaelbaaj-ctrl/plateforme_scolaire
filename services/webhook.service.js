// services/webhook.service.js
import { db } from "../config/index.js";
import logger from "../config/logger.js";

/**
 * Vérifie si un event a déjà été traité (idempotence)
 */

export async function isProcessed(provider, eventId) {
  // 🔍 Log factuel pour tracer l'idempotence
  console.log("Vérification idempotence:", { provider, eventId });

  try {
    const res = await db.query(
      `SELECT id FROM stripe_events WHERE event_id=$1`,
      [eventId]
    );
    return res.rows.length > 0;
  } catch (err) {
    logger.error("isProcessed failed", { provider, eventId, message: err.message });
    throw err;
  }
}

/**
 * Marque un event comme traité
 */
export async function markProcessed(provider, eventId) {
  try {
    await db.query(
      `INSERT INTO stripe_events(event_id) VALUES($1) ON CONFLICT (event_id) DO NOTHING`,
      [eventId]
    );
    logger.info("Event marked processed", { provider, eventId });
  } catch (err) {
    logger.error("markProcessed failed", { provider, eventId, message: err.message });
    throw err;
  }
}

/**
 * Active un abonnement pour un utilisateur
 */
export async function activateSubscription({ userId, planType }) {
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

/**
 * Marque un booking comme payé pour la marketplace
 */
export async function markBookingPaid({ bookingId, paymentIntent }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(`SELECT status FROM bookings WHERE id=$1 FOR UPDATE`, [bookingId]);
    const status = res.rows[0]?.status;
    if (status === "paid") {
      logger.info("Booking already paid, skipping", { bookingId });
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `UPDATE bookings
         SET status='paid',
             stripe_payment_intent=$1
       WHERE id=$2`,
      [paymentIntent, bookingId]
    );

    await client.query("COMMIT");
    logger.info("Booking marked as paid", { bookingId, paymentIntent });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    logger.error("markBookingPaid failed", { bookingId, paymentIntent, message: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Simple ping pour health check
 */
export async function ping() {
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}