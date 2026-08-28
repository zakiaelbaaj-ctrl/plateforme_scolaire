import stripe from "../config/stripe.js";
import { db } from "../config/index.js";
import logger from "../config/logger.js";
import { QueryTypes } from "sequelize";
import { pool } from "../config/db.js";
import * as mailService from "./mail.service.js"; // Ou le chemin vers ton service d'envoi de mail
import { getTarifHoraireHT } from "./pricing.util.js";
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
 * 1. CrÃ©ation session checkout (Abonnements classiques)
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
export async function processSessionPayment(roomId, sessionId = null) {
  let eleveId, profId, duration;
  try {
    let sessionData = null;

    if (sessionId) {
      const result = await pool.query(
        `SELECT id, duration_seconds, user_id, professor_id, payment_status 
         FROM visio_sessions WHERE id = $1`,
        [sessionId]
      );
      sessionData = result.rows[0] || null;
    } else {
      let attempts = 0;
      while (attempts < 3) {
        const result = await pool.query(
          `SELECT id, duration_seconds, user_id, professor_id, payment_status 
           FROM visio_sessions 
           WHERE room_id = $1 AND duration_seconds > 0
           ORDER BY created_at DESC LIMIT 1`,
          [roomId]
        );
        if (result.rows.length > 0) { sessionData = result.rows[0]; break; }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!sessionData) return null;

    const ALREADY_PROCESSED_STATUSES = ['succeeded', 'skipped_low_amount', 'requires_action'];
    if (ALREADY_PROCESSED_STATUSES.includes(sessionData.payment_status)) {
      logger.warn("🚫 Duplicate visio payment blocked", {
        roomId, sessionId: sessionData.id, payment_status: sessionData.payment_status,
      });
      return { status: 'duplicate_blocked', payment_status: sessionData.payment_status };
    }
        duration = Math.ceil(sessionData.duration_seconds / 60);
    eleveId = sessionData.user_id;
    profId = sessionData.professor_id;
    const resolvedSessionId = sessionData.id;  // ✅ renommé, plus de conflit

    const users = await db.query(
      `SELECT id, email, username, role, stripe_customer_id, stripe_account_id, currency, is_university_prof, is_subscriber 
       FROM users WHERE id IN (:profId, :eleveId)`,
      { replacements: { profId, eleveId }, type: QueryTypes.SELECT }
    );

    const prof = users.find(u => u.id == profId);
    const eleve = users.find(u => u.id == eleveId);

    if (!eleve || !prof) throw new Error("Participants introuvables.");

    const hourlyRateHT = getTarifHoraireHT(eleve.niveau);

   // ✅ MISE DE SERVICE — montant plancher dû dès que la communication a eu
// lieu (duration > 0), pour couvrir les frais Stripe (2,5% + 0,25€) même
// sur une session très courte. Ne s'ajoute PAS au montant au prorata :
// c'est un plancher, pas un supplément — on facture le plus élevé des deux.
const MISE_DE_SERVICE_CENTS = 200; // 2€

const pricePerMinHT = hourlyRateHT / 60;
const amountHT = Math.round(duration * pricePerMinHT * 100);
const amountTVA = Math.round(amountHT * 0.20);
const montantProrata = amountHT + amountTVA;

const totalAmountEUR = duration > 0
  ? Math.max(montantProrata, MISE_DE_SERVICE_CENTS)
  : 0;

const billedDuration = duration; // conservé pour affichage/logs/facture

if (totalAmountEUR < 50) {
  // Filet de sécurité — ne devrait plus se déclencher en pratique
  // puisque MISE_DE_SERVICE_CENTS (200) > 50, sauf si duration === 0.
  logger.warn("Paiement ignoré : montant sous le seuil Stripe", {
    resolvedSessionId, roomId, profId, eleveId, duration, billedDuration, totalAmountEUR,
  });
  await pool.query(
    `UPDATE visio_sessions SET payment_status = 'skipped_low_amount', amount = $1 WHERE id = $2`,
    [totalAmountEUR / 100, resolvedSessionId]
  );
  try {
    await mailService.sendSessionTooShortEmail(prof.email, {
      duration, studentName: eleve.username || eleve.email, displayName: prof.username || prof.email,
    });
  } catch (emailErr) {
    logger.error("⚠️ Échec envoi email session trop courte (non bloquant):", { message: emailErr.message });
  }
  return { status: 'skipped', reason: 'amount_too_low', amount: totalAmountEUR };
}

   // ✅ RÉPARTITION 50/50 sur le TTC : la plateforme retient application_fee_amount
    // (couvre taxe + charges + urgence scolaire), le solde part au prof via transfer_data.
    const feeAmountEUR = Math.round(totalAmountEUR * 0.5);
    const studentCurrency = eleve.currency?.toLowerCase() || 'eur';

    // ✅ Prélèvement automatique
    const customer = await stripe.customers.retrieve(eleve.stripe_customer_id);
    let paymentMethodId = customer.invoice_settings?.default_payment_method;
    // ✅ FIX : Si pas de moyen de paiement "par défaut", on liste et on prend la première carte active
    if (!paymentMethodId) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: eleve.stripe_customer_id,
        type: 'card',
        limit: 1
      });
      if (paymentMethods.data.length > 0) {
        paymentMethodId = paymentMethods.data[0].id;
        // On en profite pour la lier par dÃ©faut pour Ã©viter le prochain fallback
        await stripe.customers.update(eleve.stripe_customer_id, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
      }
    }
    if (!paymentMethodId) throw new Error("Moyen de paiement par dÃ©faut manquant.");

        const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountEUR,
      currency: 'eur',
      customer: eleve.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Session visio ${duration} min (facturée ${billedDuration} min) — niveau ${eleve.niveau ? (Array.isArray(eleve.niveau) ? eleve.niveau[0] : eleve.niveau) : "non précisé"}`,
      metadata: { roomId, profId, eleveId, studentCurrency, realDuration: String(duration), billedDuration: String(billedDuration) },
      ...(prof.stripe_account_id?.trim() && {
        transfer_data: { destination: prof.stripe_account_id },
        application_fee_amount: feeAmountEUR,
      }),
    }, {
      idempotencyKey: `session_payment_${sessionData.id}`  // ✅ seule transition }, { — deux arguments au total
    });

    console.log(`✅ [STRIPE] Prélèvement réussi : ${totalAmountEUR / 100} €`);

        await pool.query(
      `UPDATE visio_sessions 
   SET payment_status = 'succeeded', payment_intent_id = $1, amount = $2, is_paid = true
   WHERE id = $3`,
      [paymentIntent.id, totalAmountEUR / 100, resolvedSessionId]
    );
    // ✅ La génération du PDF
    const { generateInvoicePdf } = await import("./invoicePdf.js"); // Adaptez le chemin
    const invoiceNumber = `VID-${profId}-${eleveId}-${Date.now()}`;
    const { fileName } = await generateInvoicePdf({
      userId: eleveId,
      planType: `Cours vidéo (${billedDuration} min)`,
      amount: totalAmountEUR,
      invoiceNumber,
      date: new Date()
    });
    // ✅ Emails isolés — un échec d'envoi ne doit JAMAIS empêcher
// le retour du succès du paiement

    try {
      await mailService.sendInvoiceEmail(eleve.email, {
        invoiceNumber,
        amount: totalAmountEUR / 100,
        duration: billedDuration,
        fileName,
        displayName: eleve.username || eleve.email
      });
    } catch (emailErr) {
      logger.error("⚠️ Échec envoi email facture élève (non bloquant):", { message: emailErr.message });
   }
   try {
      await mailService.sendProfPaymentEmail(prof.email, {
        invoiceNumber,
        amount: (totalAmountEUR - feeAmountEUR) / 100, // montant après commission
        duration: billedDuration,
        displayName: prof.username || prof.email
      })
    } catch (emailErr) {
      logger.error("⚠️ Échec envoi email paiement prof (non bloquant):", { message: emailErr.message });
    }

    return {
      status: 'succeeded',
      amount: totalAmountEUR,
      feeAmountEUR, // Montant retenu par la plateforme
      duration: billedDuration,
      url: `/invoices/${fileName}`
    };

    } catch (err) {
    if (err.raw && err.raw.code === 'authentication_required') {
      const users = await db.query(
        `SELECT * FROM users WHERE id IN (:profId, :eleveId)`,
        { replacements: { profId, eleveId }, type: QueryTypes.SELECT }
      );
      const prof = users.find(u => u.id == profId);
      const eleve = users.find(u => u.id == eleveId);

      // ✅ FIX : isolé dans son propre try/catch — si handleAuthenticationRequired
      // échoue à son tour (ex: Stripe indisponible), on ne laisse plus l'exception
      // remonter silencieusement hors de processSessionPayment. On retourne un
      // statut exploitable ('requires_action' quand même, sans checkout_url) pour
      // que ws/calls.js puisse notifier les deux parties malgré tout, et on marque
      // la session en base pour permettre une reprise/investigation ultérieure.
      let invoiceUrl = null;
      try {
        invoiceUrl = await handleAuthenticationRequired(eleve, prof, duration, roomId);
      } catch (recoveryErr) {
        logger.error("❌ Échec handleAuthenticationRequired (paiement en attente, sans lien de régularisation)", {
          roomId, profId, eleveId, message: recoveryErr.message,
        });
      }

      await pool.query(
        `UPDATE visio_sessions SET payment_status = 'requires_action' WHERE room_id = $1 AND payment_status = 'pending'`,
        [roomId]
      ).catch(e => logger.error("Échec mise à jour payment_status='requires_action'", { message: e.message }));

      return { status: 'requires_action', checkout_url: invoiceUrl };
    }

    logger.error("❌ Erreur processSessionPayment:", err.message);

    await pool.query(
      `UPDATE visio_sessions SET payment_status = 'failed' WHERE room_id = $1 AND payment_status = 'pending'`,
      [roomId]
    ).catch(e => logger.error("Échec mise à jour payment_status='failed'", { message: e.message }));

    throw err;
  }
}

/**
 * 4. GESTION SCA : Facture manuelle si le prélèvement automatique échoue
 */
async function handleAuthenticationRequired(eleve, prof, duration, roomId) {
  try {
    const hourlyRateHT = getTarifHoraireHT(eleve.niveau);
    const MISE_DE_SERVICE_CENTS = 200; // 2€

    const amountHT = Math.round(duration * (hourlyRateHT / 60) * 100);
    const amountTVA = Math.round(amountHT * 0.20);
    const montantProrata = amountHT + amountTVA;
    const totalAmount = duration > 0
      ? Math.max(montantProrata, MISE_DE_SERVICE_CENTS)
      : 0;
    const billedDuration = duration;

    const feeAmountEUR = Math.round(totalAmount * 0.5);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: eleve.stripe_customer_id,
      line_items: [{
        price_data: {
          currency: eleve.currency?.toLowerCase() || 'eur',
          product_data: {
            name: `Régularisation cours (${billedDuration} min)`,
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
        ...(prof.stripe_account_id?.trim() ? {
          transfer_data: { destination: prof.stripe_account_id.trim() },
          application_fee_amount: feeAmountEUR,

        } : {}),
      },

      metadata: { roomId, type: 'recovery_payment', userId: eleve.id, billedDuration: String(billedDuration) }
    });
    // ✅ Email isolé — un échec d'envoi ne doit pas empêcher le retour de l'URL de paiement
    try {
      await mailService.sendPaymentActionRequiredEmail(eleve.email, {
        amount: totalAmount / 100,
        paymentUrl: session.url,
        duration: billedDuration
      });
    } catch (emailErr) {
      logger.error("⚠️ Échec envoi email régularisation (non bloquant):", { message: emailErr.message });
    }
    return session.url;
  } catch (error) {
    logger.error("⚠️ Erreur handleAuthenticationRequired:", error.message);
    throw error;
  }
}

/**
 * // ✅ ABONNEMENT ÉTUDIANT (Entraide 20€/heure)
 */
export async function createStudentSubscription(userId) {
  try {
    const [user] = await db.query(
      `SELECT email, stripe_customer_id, currency FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (!user) throw new Error("User not found");
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: user.stripe_customer_id,
      line_items: [{
        price_data: {
          currency: user.currency?.toLowerCase() || 'eur',
          unit_amount: 2000, // ✅ 20.00€
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
