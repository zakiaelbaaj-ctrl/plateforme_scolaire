import { pool } from './db.js';

async function verifyProf18() {
    try {
        console.log("🔍 DIAGNOSTIC FINANCIER : Professeur 18 (Amine)");
        console.log("--------------------------------------------------");

        const res = await pool.query(`
            SELECT id, email, username, stripe_account_id, role, price_per_minute 
            FROM users 
            WHERE id = 18;
        `);

        if (res.rows.length === 0) {
            console.log("❌ ERREUR : L'utilisateur avec l'ID 18 n'existe pas dans la table 'users'.");
            return;
        }

        const prof = res.rows[0];
        const stripeId = prof.stripe_account_id;
        const rate = prof.price_per_minute || '0.50 (Défaut)';

        console.log(`👤 Nom d'utilisateur : ${prof.username}`);
        console.log(`📧 Email            : ${prof.email}`);
        console.log(`🏷️  Rôle             : ${prof.role}`);
        console.log(`💰 Tarif Paramétré  : ${rate} €/min`);
        console.log(`🏦 Stripe Account   : ${stripeId || '⚠️ VIDE (Manquant)'}`);
        console.log("--------------------------------------------------");

        // VÉRIFICATION DE L'ID STRIPE CONNECT SPÉCIFIQUE
        if (stripeId === 'acct_1TJcOfHp09NVCmoJ') {
            console.log("✅ PARFAIT : L'ID Stripe Connect est correct.");
            console.log("🚀 Prêt pour la répartition : 26% Plateforme / 74% Professeur.");
        } 
        else if (stripeId && stripeId.startsWith('acct_')) {
            console.log("⚠️ ATTENTION : Un ID Stripe existe mais ce n'est pas 'acct_1TJcOfHp09NVCmoJ'.");
            console.log(`👉 ID actuel en base : ${stripeId}`);
        } 
        else {
            console.log("❌ ERREUR CRITIQUE : Stripe Account ID absent.");
            console.log("👉 Action : Exécutez 'node fix-prof.js' avec l'ID acct_1TJcOfHp09NVCmoJ.");
        }

    } catch (err) {
        console.error("❌ ERREUR SQL lors du diagnostic :", err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}

verifyProf18();