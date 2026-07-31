// controllers/push.controller.js
import logger from "#config/logger.js";
import User from "#models/user.model.js";

// ------------------------------------------------------
// GET /api/v1/push/vapid-public-key
// Clé publique, non secrète — safe à exposer au frontend
// ------------------------------------------------------
export function getVapidPublicKey(req, res) {
  return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}

// ------------------------------------------------------
// POST /api/v1/push/subscribe
// Body attendu (format standard PushSubscription du navigateur) :
// { endpoint, keys: { p256dh, auth } }
// ------------------------------------------------------
export async function subscribePush(req, res) {
  try {
    const subscription = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ success: false, message: "Abonnement push invalide" });
    }

    await User.update(
      { push_subscription: subscription },
      { where: { id: req.user.id } }
    );

    logger.info("✅ Abonnement push enregistré", { userId: req.user.id });
    return res.status(200).json({ success: true });

  } catch (err) {
    logger.error("subscribePush error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ------------------------------------------------------
// POST /api/v1/push/unsubscribe
// (utile si l'utilisateur désactive les notifications)
// ------------------------------------------------------
export async function unsubscribePush(req, res) {
  try {
    await User.update(
      { push_subscription: null },
      { where: { id: req.user.id } }
    );

    logger.info("🔕 Abonnement push supprimé", { userId: req.user.id });
    return res.status(200).json({ success: true });

  } catch (err) {
    logger.error("unsubscribePush error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}