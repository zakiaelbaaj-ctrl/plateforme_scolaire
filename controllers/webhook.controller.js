// controllers/webhook.controller.js
import logger from "#config/logger.js";
import * as webhookService from "#services/webhook.service.js";
import * as queueService from "#services/queue.service.js";
import { constructEventFromRaw } from "#services/stripe.service.js";
import { activateSubscription } from "#services/payment.service.js";
import { db } from "#config/index.js";
import { generateInvoicePdf } from "#services/invoicePdf.js";

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
      const rawBody = req.body;
      const sigHeader = req.headers["stripe-signature"];

      if (!sigHeader) {
        logger.warn("Stripe webhook received without signature header");
        return res.status(400).json({ ok: false, message: "Missing stripe signature" });
      }

      let event;
      try {
        event = constructEventFromRaw(rawBody, sigHeader);
      } catch (err) {
        logger.warn("Stripe signature verification failed", { message: err?.message });
        return res.status(400).json({ ok: false, message: "Invalid stripe signature" });
      }

      // ================================
// Fichier: controllers/webhook.controller.js
// Emplacement: handleWebhook -> juste après constructEventFromRaw
// ================================

const eventId = event?.id;
if (!eventId) {
  logger.warn("Stripe event sans id", { event });
  return res.status(400).json({
    ok: false,
    message: "Payload Stripe invalide",
    debug: {
      rawBodyLength: rawBody?.length,
      sigHeader: sigHeader,
      eventKeys: Object.keys(event || {}),
      eventType: event?.type || null,
    },
  });
}
      // Idempotence atomique
      const processed = await webhookService.markIfNotProcessed("stripe", eventId);
      if (!processed) {
        logger.info("Stripe webhook already processed, skipping", {
          eventId,
          type: event.type,
          userId: event.data?.object?.metadata?.userId,
          planType: event.data?.object?.metadata?.planType,
          bookingId: event.data?.object?.metadata?.bookingId,
        });
        return res.status(200).json({ ok: true, message: "Already processed" });
      }

      // Traitement selon type d'événement
      const obj = event.data.object;
      try {
        switch (event.type) {
          case "checkout.session.completed": {
       const metadata = obj?.metadata || {};
       // 1. CAS ENREGISTREMENT DE CARTE (Mode setup pour Élève)
  // On vérifie si la session est en mode 'setup'
  if (obj.mode === 'setup') {
    const customerId = obj.customer;
    try {
      await db.query(
        "UPDATE users SET has_payment_method = true WHERE stripe_customer_id = $1",
        [customerId]
      );
      logger.info("💳 Carte enregistrée avec succès (Webhook)", { customerId });
      return res.status(200).json({ ok: true }); // On termine ici pour ce cas
    } catch (dbErr) {
      logger.error("❌ Erreur DB Webhook (Setup)", { message: dbErr.message, customerId });
      return res.status(500).json({ ok: false, message: "Erreur DB lors du setup" });
    }
  }

  // 2. CAS ABONNEMENT (Ton code actuel, légèrement ajusté)
  // On ne fait cette validation que si ce n'est pas un setup
  if (!metadata.userId || !metadata.planType) {
    logger.warn("Stripe checkout.session.completed missing metadata", {
      metadata,
      eventId: eventId,
      objKeys: Object.keys(obj || {}),
    });
    return res.status(400).json({
      ok: false,
      message: "Metadata Stripe manquante",
      debug: { metadata, obj }
    });
  }

const userId = metadata.userId;
const planType = metadata.planType;
            if (userId && planType) {
              await activateSubscription({ userId, planType });
              try {
                await generateInvoicePdf({
                  userId,
                  planType,
                  amount: obj.amount_total,
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

        // Enqueue traitement asynchrone si nécessaire
        await queueService.enqueue("stripe:webhook", { event });

      } catch (err) {
        logger.error("❌ Stripe webhook processing failed", { message: err.message, eventId: event.id });
        await webhookService.markFailed("stripe", eventId, err.message);
        return res.status(500).json({ ok: false, message: "Webhook processing error" });
      }

      return res.status(200).json({ ok: true });
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
    const dbOk = await webhookService.dbPing();
    const queueOk = await webhookService.queuePing();
    const ok = dbOk && queueOk;
    return res.status(ok ? 200 : 503).json({ ok });
  } catch (err) {
    logger.warn("webhookHealth check failed", { message: err?.message });
    return res.status(503).json({ ok: false });
  }
}
