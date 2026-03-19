// services/queue.service.js
import logger from "../config/logger.js";
import * as webhookService from "./webhook.service.js";

/**
 * Simule une queue async
 */
export async function enqueue(queueName, payload) {
  logger.info("Enqueued job", { queueName, payload });

  if (queueName === "webhook:stripe") {
    const event = payload.event;
    const object = event.data.object;
    const metadata = object.metadata || {};

    // Abonnement Stripe
    if (metadata.planType && metadata.userId && !metadata.bookingId) {
      await webhookService.activateSubscription({
        userId: metadata.userId,
        planType: metadata.planType
      });
    }

    // Marketplace booking
    if (metadata.bookingId && object.payment_intent) {
      await webhookService.markBookingPaid({
        bookingId: metadata.bookingId,
        paymentIntent: object.payment_intent
      });
    }
  }

  // Tu peux brancher ici une vraie queue type BullMQ ou RabbitMQ
}