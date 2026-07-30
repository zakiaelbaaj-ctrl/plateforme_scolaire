import webpush from "web-push";
import User from "#models/user.model.js";

console.log("🔧 Chargement push.service.js");
console.log("🔧 VAPID_PUBLIC_KEY présent:", !!process.env.VAPID_PUBLIC_KEY);
console.log("🔧 VAPID_PRIVATE_KEY présent:", !!process.env.VAPID_PRIVATE_KEY);
console.log("🔧 VAPID_SUBJECT:", process.env.VAPID_SUBJECT);


webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
console.log("✅ webpush.setVapidDetails() OK");

export async function sendPushToUser(userId, payload) {
  console.log(`🔔 sendPushToUser appelé pour user ${userId}`);
  try {
    const user = await User.findByPk(userId);
    const sub = user?.push_subscription;
    console.log(`🔎 push_subscription pour ${userId}:`, sub ? "présente" : "absente");
    
    if (!sub?.endpoint)
       {
        console.log(`🔕 Pas de push_subscription valide pour user ${userId}`);
      return;
    }

    await webpush.sendNotification(sub, JSON.stringify(payload));
    console.log(`✅ Push envoyé avec succès à user ${userId}`);
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await User.update({ push_subscription: null }, { where: { id: userId } });
       console.log(`🔕 Push subscription expirée nettoyée pour user ${userId}`);
    } else {
      console.error("❌ Erreur envoi push:", err.message);
      console.error("❌ Détail complet:", JSON.stringify(err.body || err));
    }
  }
}