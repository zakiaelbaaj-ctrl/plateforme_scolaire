// controllers/webhook.controller.js
import logger from "#config/logger.js";
import * as webhookService from "#services/webhook.service.js";
import * as queueService from "#services/queue.service.js";
import { constructEventFromRaw } from "#services/stripe.service.js";
import { activateSubscription } from "#services/payment.service.js";
import { db } from "#config/index.js";
import { generateInvoicePdf } from "#services/invoicePdf.js";
import { stripe } from "#services/stripe.service.js";
/**
 * Safe JSON parse pour webhooks génériques
 */
function safeParse(body) {
  try {
    if (!body) return null;
    if (Buffer.isBuffer(body)) body = body.toString("utf8");
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch (err) {
    logger.warn("safeParse failed", { message: err?.message });
    return null;
  }
}

/**
 * Main webhook handler
 * Middleware requis: express.raw({ type: 'application/json' })
 */
export async function handleWebhook(req, res) {
  try {
    const providerHeader = req.headers["x-webhook-provider"] || "";
    const provider = providerHeader.toLowerCase() || req.path.toLowerCase();
    const isStripe = Boolean(req.headers["stripe-signature"]) || provider.includes("stripe");

    // -----------------------------
    // STRIPE WEBHOOK
    // -----------------------------
     if (isStripe) {
      console.log("🔥 STRIPE WEBHOOK HIT");
  const rawBody = req.body;
  const sigHeader = req.headers["stripe-signature"];

  if (!sigHeader) {
    logger.warn("Stripe webhook received without signature header");
    return res.status(400).json({ ok: false, message: "Missing stripe signature" });
  }
   console.log("IS BUFFER:", Buffer.isBuffer(req.body));
   console.log("BODY:", req.body);
  let event;
  try {
    event = constructEventFromRaw(rawBody, sigHeader);
  } catch (err) {
    logger.warn("Stripe signature verification failed", { message: err?.message });
    return res.status(400).json({ ok: false, message: "Invalid stripe signature" });
  }

  // ✅ Répondre IMMÉDIATEMENT à Stripe pour éviter le timeout
  res.status(200).json({ ok: true });

  // ✅ Traiter APRÈS la réponse
  setImmediate(async () => {
    try {
      const eventId = event?.id;
      if (!eventId) {
        logger.warn("Stripe event sans id", { event });
        return;
      }

      const processed = await webhookService.markIfNotProcessed("stripe", eventId);
      if (!processed) {
        logger.info("Stripe webhook already processed, skipping", {
          eventId,
          type: event.type,
        });
        return;
      }

      const obj = event.data.object;
       console.log("🔥 SETUP INTENT RECEIVED:", event.type);
       console.log("CUSTOMER:", obj.customer);
      switch (event.type) {
        case "checkout.session.completed": {
          const metadata = obj?.metadata || {};

          if (!metadata.userId || !metadata.planType) {
            logger.warn("Stripe checkout.session.completed missing metadata", { metadata, eventId });
            break;
          }

          const userId = metadata.userId;
          const planType = metadata.planType;
          if (userId && planType) {
            await activateSubscription({ userId, planType });
            try {
              await generateInvoicePdf({
                userId,
                planType,
                amount: obj.amount_total || 0,
                invoiceNumber: `INV-${userId}-${obj.id}`,
                date: new Date(),
              });
              logger.info("🧾 Facture PDF générée (abonnement)", { userId, planType });
            } catch (pdfErr) {
              logger.error("❌ Erreur génération facture PDF (abonnement)", { userId, message: pdfErr.message });
            }
          }
          break;
        }

       case "setup_intent.succeeded": {
  const customerId = obj.customer;
  const paymentMethodId = obj.payment_method;

  if (!customerId || !paymentMethodId) {
    logger.warn("setup_intent.succeeded: données manquantes", {
      customerId,
      paymentMethodId,
    });
    break;
  }

  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const result = await db.query(
      `UPDATE users
       SET has_payment_method = true
       WHERE stripe_customer_id = $1`,
      [customerId]
    );

    logger.info("✅ Carte enregistrée", {
      customerId,
      paymentMethodId,
      updatedRows: result.rowCount,
    });
    if (result.rowCount === 0) {
  logger.warn("⚠️ Aucun utilisateur trouvé pour ce customer Stripe", {
    customerId,
  });
}

  } catch (err) {
    logger.error("❌ setup_intent.succeeded failed", {
      message: err.message,
      customerId,
    });
  }

  break;
}
        case "payment_intent.succeeded": {
          const profId = obj.metadata?.profId;
          const bookingId = obj.metadata?.bookingId;
          if (profId && bookingId) {
            await db.query(
              `UPDATE bookings SET status='paid', stripe_payment_intent=$1 WHERE id=$2`,
              [obj.id, bookingId]
            );
            logger.info("💰 Paiement cours payé", { profId, bookingId, paymentIntent: obj.id });
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const bookingId = obj.metadata?.bookingId;
          if (bookingId) {
            await db.query(
              `UPDATE bookings SET status='failed' WHERE id=$1`,
              [bookingId]
            );
            logger.warn("❌ Paiement échoué", { bookingId, reason: obj.last_payment_error?.message });
          }
          break;
        }

        case "payment_intent.canceled": {
          const bookingId = obj.metadata?.bookingId;
          if (bookingId) {
            await db.query(
              `UPDATE bookings SET status='canceled' WHERE id=$1`,
              [bookingId]
            );
            logger.info("🚫 Paiement annulé", { bookingId });
          }
          break;
        }

        default:
          logger.info("⏭️ Stripe event non traité", { type: event.type });
      }

      await queueService.enqueue("stripe:webhook", { event });

    } catch (err) {
      logger.error("❌ Stripe webhook processing failed async", { message: err.message });
    }
  });

  return;
}
    // -----------------------------
    // WEBHOOKS GÉNÉRIQUES
    // -----------------------------
    const payload = safeParse(req.body || req.rawBody || req.bodyRaw || req.bodyString || req.body);
    if (!payload) {
      logger.warn("Webhook received with invalid JSON payload", { path: req.path });
      return res.status(400).json({ ok: false, message: "Invalid JSON payload" });
    }

    const eventId = webhookService.extractEventId(payload) || `${req.headers["x-request-id"] || ""}`.trim();
    if (eventId) {
      const processed = await webhookService.markIfNotProcessed("generic", eventId);
      if (!processed) {
        logger.info("Generic webhook already processed, skipping", { eventId, path: req.path });
        return res.status(200).json({ ok: true, message: "Already processed" });
      }
    }

    try {
      await queueService.enqueue("webhook:generic", {
        provider: "generic",
        payload,
        headers: req.headers,
        path: req.path,
      });
      if (eventId) await webhookService.markProcessed("generic", eventId);
      logger.info("Generic webhook enqueued", { path: req.path, eventId: eventId || null });
      return res.status(200).json({ ok: true });
    } catch (queueErr) {
      logger.error("Generic webhook enqueue failed", { eventId, path: req.path, message: queueErr.message });
      return res.status(500).json({ ok: false, message: "Webhook enqueue failed" });
    }

  } catch (err) {
    logger.error("handleWebhook unexpected error", { message: err?.message, stack: err?.stack });
    return res.status(500).json({
      ok: false,
      message: process.env.NODE_ENV === "production" ? "Erreur serveur" : err?.message || "Erreur interne",
    });
  }
}

/**
 * Healthcheck endpoint
 * GET /webhooks/health
 */
export async function webhookHealth(req, res) {
  try {
    // On lance les pings en parallèle pour gagner du temps
    const [dbOk, queueOk] = await Promise.all([
      webhookService.dbPing().catch(() => false),
      webhookService.queuePing().catch(() => false)
    ]);

    const status = {
      status: dbOk && queueOk ? "UP" : "DOWN",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "OK" : "FAIL",
        queue: queueOk ? "OK" : "FAIL"
      }
    };

    return res.status(dbOk && queueOk ? 200 : 503).json(status);
  } catch (err) {
    logger.warn("webhookHealth check failed", { message: err?.message });
    return res.status(503).json({ status: "DOWN", error: err.message });
  }
}
