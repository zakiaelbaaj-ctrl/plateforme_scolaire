// ============================================
// controllers/payment.controller.js
// ============================================

import * as paymentService from "#services/payment.service.js";

export async function createCheckout(req, res, next) {
  try {
    const { planType } = req.body;
    const userId = req.user.id;

    const session = await paymentService.createCheckoutSession(userId, planType);

    res.json({ success: true, checkout_url: session.url });
  } catch (err) {
    next(err);
  }
}

export async function confirmPayment(req, res, next) {
  try {
    const { sessionId, planType } = req.body;
    const userId = req.user.id;

    const endDate = await paymentService.confirmPayment(sessionId, planType, userId);

    if (!endDate) {
      return res.status(400).json({ success: false, message: "Paiement non confirmé" });
    }

    res.json({
      success: true,
      message: "Paiement confirmé",
      subscription_end_date: endDate
    });
  } catch (err) {
    next(err);
  }
}
