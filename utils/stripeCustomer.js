// utils/stripeCustomer.js
import stripe from "#config/stripe.js";
import pool from "#config/db.js"; // ton pool PostgreSQL

/**
 * Vérifie si un élève a un stripe_customer_id
 * Sinon le crée et met à jour la DB
 */
export async function ensureStripeCustomer(userId) {
  try {
    // 1️⃣ Récupérer l'élève
    const { rows } = await pool.query(
      "SELECT id, email, stripe_customer_id FROM users WHERE id = $1",
      [userId]
    );

    if (!rows[0]) throw new Error("Utilisateur introuvable");

    const user = rows[0];

    // 2️⃣ Si déjà existant, retourne l'ID
    if (user.stripe_customer_id) return user.stripe_customer_id;

    // 3️⃣ Sinon, créer un customer Stripe
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.username,
      metadata: { userId: user.id },
    });

    // 4️⃣ Mettre à jour la DB
    await pool.query(
      "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
      [customer.id, user.id]
    );

    console.log("✅ Stripe Customer créé :", customer.id);
    return customer.id;
  } catch (err) {
    console.error("❌ Erreur Stripe / DB :", err);
    throw err;
  }
}
