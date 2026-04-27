import stripe from "../config/stripe.js";
import { db } from "../config/index.js";
import logger from "../config/logger.js";
import { QueryTypes } from "sequelize";
import { pool } from "../config/db.js";
import * as mailService from "./mail.service.js"; // Ou le chemin vers ton service d'envoi de mail
const PRICES = {
  monthly: Number(process.env.PRICE_MONTHLY_CENTS) || 999,
  yearly: Number(process.env.PRICE_YEARLY_CENTS) || 9999,
};

function assertPlan(planType) {
  if (!["monthly", "yearly"].includes(planType)) {
    throw Object.assign(new Error("Invalid planType"), { code: "INVALID_PLAN" });
  }
}

/**
 * 1. Création session checkout (Abonnements classiques)
 */
export async function createCheckoutSession({ userId, planType, profId = null, amount = null }) {
  assertPlan(planType);
  try {
    const [user] = await db.query(
      `SELECT id, email, username, stripe_customer_id FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    
    if (!user) throw new Error("User not found");

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
      if (!profRows?.stripe_account_id) throw new Error("Prof stripe account not found");
      
      sessionParams.payment_intent_data = {
        transfer_data: { destination: profRows.stripe_account_id },
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

/**
 * 2. Setup Intent (Enregistrement de carte)
 */
export async function createSetupIntent(userId) {
  const [userRows] = await db.query(
    "SELECT stripe_customer_id FROM users WHERE id = :userId",
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  
  if (!userRows?.stripe_customer_id) throw new Error("Customer Stripe introuvable.");

  const setupIntent = await stripe.setupIntents.create({
    customer: userRows.stripe_customer_id,
    payment_method_types: ['card'],
    usage: 'off_session', 
    metadata: { userId: String(userId) }
  });
  return { clientSecret: setupIntent.client_secret };
}

/**
 * 3. FACTURATION DIRECTE (En fin de cours)
 */
export async function processSessionPayment(roomId) {
  let eleveId, profId, duration; // Déclarés ici pour être accessibles dans le catch
  try {
    console.log(`🔍 [SYNCHRO] Lecture directe via Pool pour : ${roomId}`);

    let sessionData = null;
    let attempts = 0;

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
      await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    if (!sessionData) return null;

    duration = Math.ceil(sessionData.duration_seconds / 60);
    eleveId = sessionData.user_id;
    profId = sessionData.professor_id;

    // Récupération des infos Stripe et tarifs
    const users = await db.query(
      `SELECT id, email, username, role, stripe_customer_id, stripe_account_id, currency, is_university_prof, is_subscriber 
       FROM users WHERE id IN ($1, $2)`,
      { bind: [profId, eleveId], type: QueryTypes.SELECT }
    );

    const prof = users.find(u => u.id == profId);
    const eleve = users.find(u => u.id == eleveId);

    if (!eleve || !prof) throw new Error("Participants introuvables.");

    // CAS : Communication entre étudiants (20€/mois déjà payés)
    if (eleve.role === 'eleve' && prof.role === 'eleve') {
      if (!eleve.is_subscriber) throw new Error("Abonnement entraide requis.");
      return { status: 'covered_by_subscription' };
    }

    // Calcul du montant selon le grade (40€ ou 20€)
    const hourlyRate = prof.is_university_prof ? 40 : 20;
    const pricePerMinEUR = hourlyRate / 60;
    const totalAmountEUR = Math.round(duration * pricePerMinEUR * 100);

    // Sécurité minimum Stripe (50 cents)
    if (totalAmountEUR < 50) {
      console.log(`⚠️ Montant ${totalAmountEUR}cts trop bas. Ignoré.`);
      return { status: 'skipped', reason: 'amount_too_low' };
    }

    const feeAmountEUR = Math.round(totalAmountEUR * 0.26);
    const studentCurrency = eleve.currency?.toLowerCase() || 'eur';

    // Prélèvement automatique
    const customer = await stripe.customers.retrieve(eleve.stripe_customer_id);
    const paymentMethodId = customer.invoice_settings.default_payment_method;

    if (!paymentMethodId) throw new Error("Moyen de paiement par défaut manquant.");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountEUR,
      currency: 'eur', 
      customer: eleve.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true, 
      confirm: true,
      application_fee_amount: feeAmountEUR,
      transfer_data: { destination: prof.stripe_account_id },
      description: `Session visio ${duration} min avec ${prof.is_university_prof ? 'Prof Universitaire' : 'Prof Standard'}`,
      metadata: { roomId, profId, eleveId, studentCurrency }
    });
    
    console.log(`✅ [STRIPE] Prélèvement réussi : ${totalAmountEUR/100}€`);

    // 👉 La génération du PDF
    const { generateInvoicePdf } = await import("./invoicePdf.js"); // Adaptez le chemin
    const invoiceNumber = `VID-${profId}-${eleveId}-${Date.now()}`;
    const { fileName } = await generateInvoicePdf({
        userId: eleveId,
        planType: `Cours vidéo (${duration} min)`,
        amount: totalAmountEUR,
        invoiceNumber,
        date: new Date()
    });

// ✅ AJOUT : Envoi de la facture par email
// ✅ Email à l'élève
await mailService.sendInvoiceEmail(eleve.email, {
    invoiceNumber,
    amount: totalAmountEUR / 100,
    duration,
    fileName,
    displayName: eleve.username || eleve.email
});
// ✅ AJOUT : Email au prof
await mailService.sendProfPaymentEmail(prof.email, {
  invoiceNumber,
  amount: (totalAmountEUR - feeAmountEUR) / 100, // montant après commission
  duration,
  displayName: prof.username || prof.email
})

return { 
    status: 'succeeded', 
    amount: totalAmountEUR, 
    duration: duration, 
    url: `/invoices/${fileName}` 
};

  } catch (err) {
    // Gestion du cas SCA (Authentification requise)
    if (err.raw && err.raw.code === 'authentication_required') {
      // On récupère à nouveau les objets pour être sûr
      const users = await db.query(`SELECT * FROM users WHERE id IN ($1, $2)`, { bind: [profId, eleveId], type: QueryTypes.SELECT });
      const prof = users.find(u => u.id == profId);
      const eleve = users.find(u => u.id == eleveId);
      
      const invoiceUrl = await handleAuthenticationRequired(eleve, prof, duration, roomId);
      return { status: 'requires_action', checkout_url: invoiceUrl };
    }
    logger.error("❌ Erreur processSessionPayment:", err.message);
    throw err;
  }
}

/**
 * 4. GESTION SCA : Facture manuelle si le prélèvement automatique échoue
 */
async function handleAuthenticationRequired(eleve, prof, duration, roomId) {
  try {
    const hourlyRate = prof.is_university_prof ? 40 : 20;
    const totalAmount = Math.round(duration * (hourlyRate / 60) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: eleve.stripe_customer_id,
      line_items: [{
        price_data: {
          currency: eleve.currency?.toLowerCase() || 'eur',
          product_data: {
            name: `Régularisation cours (${duration} min)`,
            description: `Session avec ${prof.username || 'votre professeur'}`,
          },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONT_URL}/payment-recovery-success?room=${roomId}`,
      cancel_url: `${process.env.FRONT_URL}/dashboard`,
      payment_intent_data: {
        transfer_data: { destination: prof.stripe_account_id },
        application_fee_amount: Math.round(totalAmount * 0.26),
      },
      metadata: { roomId, type: 'recovery_payment', userId: eleve.id }
    });
    await mailService.sendPaymentActionRequiredEmail(eleve.email, {
  amount: totalAmount / 100,
  paymentUrl: session.url,
  duration: duration
});
    return session.url;
  } catch (error) {
    logger.error("❌ Erreur handleAuthenticationRequired:", error.message);
    throw error;
  }
}

/**
 * 5. ABONNEMENT ÉTUDIANT (Entraide 20€/mois)
 */
export async function createStudentSubscription(userId) {
  try {
    const [user] = await db.query(`SELECT email, stripe_customer_id, currency FROM users WHERE id = $1`, { bind: [userId], type: QueryTypes.SELECT });
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: user.stripe_customer_id,
      line_items: [{
        price_data: {
          currency: user.currency?.toLowerCase() || 'eur',
          unit_amount: 2000, // 20.00€
          recurring: { interval: 'month' },
          product_data: { name: "Abonnement Entraide", description: "Appels illimités entre étudiants" },
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONT_URL}/dashboard?sub_success=true`,
      cancel_url: `${process.env.FRONT_URL}/pricing`,
      metadata: { userId, type: 'student_subscription' }
    });

    return session.url;
  } catch (err) {
    logger.error("createStudentSubscription failed", { message: err.message });
    throw err;
  }
}