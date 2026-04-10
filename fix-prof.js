import { pool } from './db.js';

async function updateProfStripeId() {
    try {
        const stripeId = 'acct_1TJcOfHp09NVCmoJ'; // L'ID que vous avez créé sur Stripe
        const userId = 18; // L'ID d'Amine

        console.log(`🔗 Injection de l'ID Stripe ${stripeId} pour le Professeur ${userId}...`);
        
        const res = await pool.query(
            "UPDATE users SET stripe_account_id = $1 WHERE id = $2", 
            [stripeId, userId]
        );

        if (res.rowCount > 0) {
            console.log("✅ SUCCÈS : Le Professeur 18 est maintenant lié à Stripe !");
        } else {
            console.log("⚠️ ERREUR : Aucun utilisateur trouvé avec l'ID 18.");
        }
    } catch (err) {
        console.error("❌ Erreur SQL :", err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}
updateProfStripeId();