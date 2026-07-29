import webpush from "web-push";
import logger from "#config/logger.js";
import User from "#models/user.model.js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function sendPushToUser(userId, payload) {
  try {
    const user = await User.findByPk(userId);
    const sub = user?.push_subscription;
    if (!sub?.endpoint) return;

    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await User.update({ push_subscription: null }, { where: { id: userId } });
      logger.warn(`🔕 Push subscription expirée nettoyée pour user ${userId}`);
    } else {
      logger.error("❌ Erreur envoi push:", err.message);
    }
  }
}