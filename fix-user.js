import { pool } from './db.js';

async function linkMalakeToStripe() {
    try {
        const stripeId = 'cus_TwLoPufRfcCNVz'; // Votre ID client récupéré
        const userId = 32; // L'ID de Malake dans votre table users

        console.log(`🔗 Tentative de liaison : User ${userId} <-> Stripe ${stripeId}`);
        
        const res = await pool.query(
            "UPDATE users SET stripe_customer_id = $1 WHERE id = $2", 
            [stripeId, userId]
        );

        if (res.rowCount > 0) {
            console.log("✅ SUCCÈS : Malake est désormais prête pour la facturation automatique !");
        } else {
            console.log("⚠️ ERREUR : L'utilisateur avec l'ID 32 n'a pas été trouvé dans la table 'users'.");
        }
    } catch (err) {
        console.error("❌ ERREUR SQL :", err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}

linkMalakeToStripe();