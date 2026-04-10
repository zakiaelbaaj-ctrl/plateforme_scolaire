// services/payment.service.js
import stripe from "../config/stripe.js";
import { db } from "../config/index.js";
import logger from "../config/logger.js";
import { QueryTypes } from "sequelize"; // Utile pour préciser le type de requête
import { pool } from "../config/db.js"; // 👈 On utilise le pool pg direct pour la synchro
const PRICES = {
  monthly: Number(process.env.PRICE_MONTHLY_CENTS) || 999,
  yearly: Number(process.env.PRICE_YEARLY_CENTS) || 9999,
};

function assertPlan(planType) {
  if (!["monthly", "yearly"].includes(planType)) {
    throw Object.assign(new Error("Invalid planType"), { code: "INVALID_PLAN" });
  }
}

// 1. Création session checkout (Abonnements)
export async function createCheckoutSession({ userId, planType, profId = null, amount = null }) {
  assertPlan(planType);

  try {
    // Lecture utilisateur avec Sequelize
    const [userRows] = await db.query(
      `SELECT id, email, username, stripe_customer_id FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    
    const user = userRows; 
    if (!user) throw Object.assign(new Error("User not found"), { code: "USER_NOT_FOUND" });

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username || undefined,
        metadata: { userId: String(userId) },
      });
      customerId = customer.id;
      await db.query(
        `UPDATE users SET stripe_customer_id = :customerId WHERE id = :userId`,
        { replacements: { customerId, userId } }
      );
    }

    const unitAmount = amount || PRICES[planType];
    const sessionParams = {
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: profId ? `Cours avec prof ${profId}` : `Abonnement ${planType}` },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.FRONT_URL}/pages/eleve/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONT_URL}/pages/eleve/payment-cancel.html`,
      metadata: { userId: String(userId), planType, profId },
    };

    if (profId) {
      const [profRows] = await db.query(
        `SELECT stripe_account_id FROM users WHERE id = :profId`,
        { replacements: { profId }, type: QueryTypes.SELECT }
      );
      const profAccountId = profRows?.stripe_account_id;
      
      if (!profAccountId) throw new Error("Prof stripe account not found");
      
      sessionParams.payment_intent_data = {
        transfer_data: { destination: profAccountId },
        application_fee_amount: Math.round(unitAmount * 0.20),
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { id: session.id, url: session.url || null };
  } catch (err) {
    logger.error("createCheckoutSession failed", { message: err.message });
    throw err;
  }
}

// 2. Setup Intent (Pour enregistrer la carte avant le cours)
export async function createSetupIntent(userId) {
  const [userRows] = await db.query(
    "SELECT stripe_customer_id FROM users WHERE id = :userId",
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  
  const customerId = userRows?.stripe_customer_id;
  if (!customerId) throw new Error("Customer Stripe introuvable.");

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session', 
    metadata: { userId: String(userId) }
  });
  return { clientSecret: setupIntent.client_secret };
}

// 3. FACTURATION DIRECTE (En fin de cours)
export async function processSessionPayment(roomId) {
  try {
    console.log(`🔍 [SYNCHRO] Lecture directe via Pool pour : ${roomId}`);

    let sessionData = null;
    let attempts = 0;

    // --- ÉTAPE 1 : RÉCUPÉRATION DURÉE (SYNCHRONISÉE VIA POOL) ---
    while (attempts < 3) {
      const result = await pool.query(
        `SELECT duration_seconds, user_id, professor_id 
         FROM visio_sessions 
         WHERE room_id = $1 AND duration_seconds > 0
         ORDER BY created_at DESC LIMIT 1`,
        [roomId]
      );

      if (result.rows.length > 0) {
        sessionData = result.rows[0];
        break;
      }
      
      attempts++;
      console.log(`⏳ DB pas encore à jour (tentative ${attempts}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    if (!sessionData) {
      console.error(`❌ Aucune donnée trouvée pour ${roomId} après 3 tentatives.`);
      return null;
    }

    const rawSeconds = sessionData.duration_seconds;
    const duration = Math.ceil(rawSeconds / 60);
    const eleveId = sessionData.user_id; // On récupère l'ID direct de la DB
    const profId = sessionData.professor_id; // On récupère l'ID direct de la DB

    console.log(`📊 Facturation confirmée : ${duration} min (${rawSeconds}s) pour Éleve:${eleveId}`);

// --- ÉTAPE 2 : RÉCUPÉRATION INFOS STRIPE (Tout est dans la table users) ---
const userRows = await db.query(
  `SELECT id, stripe_customer_id, stripe_account_id, price_per_minute 
   FROM users 
   WHERE id IN (:profId, :eleveId)`,
  { replacements: { profId, eleveId }, type: QueryTypes.SELECT }
);

const prof = userRows.find(u => u.id == profId);
const eleve = userRows.find(u => u.id == eleveId);

if (!eleve) throw new Error("Élève introuvable en base.");
if (!prof) throw new Error("Professeur introuvable en base.");

if (!eleve.stripe_customer_id) {
    throw new Error(`L'élève (ID: ${eleveId}) n'a pas de stripe_customer_id.`);
}
    // --- ÉTAPE 3 : PAIEMENT STRIPE ---
    const customer = await stripe.customers.retrieve(eleve.stripe_customer_id);
    const paymentMethodId = customer.invoice_settings.default_payment_method;

    if (!paymentMethodId) throw new Error("Moyen de paiement par défaut manquant.");

    const pricePerMin = prof?.price_per_minute || 0.33; 
    const totalAmount = Math.round(duration * pricePerMin * 100);
    const feeAmount = Math.round(totalAmount * 0.26);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "eur",
      customer: eleve.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true, 
      confirm: true,
      application_fee_amount: feeAmount,
      transfer_data: {
        destination: prof?.stripe_account_id || 'acct_1TJcOfHp09NVCmoJ',
      },
      description: `Session visio ${duration} min`,
      metadata: { roomId, profId, eleveId }
    });

    console.log(`✅ [STRIPE] Prélèvement réussi : ${totalAmount/100}€ (ID: ${paymentIntent.id})`);
    return paymentIntent;

  } catch (err) {
    console.error("❌ Erreur processSessionPayment:", err.message);
    throw err;
  }
}