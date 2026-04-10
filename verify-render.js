import { pool } from './db.js';

async function checkRemoteData() {
    try {
        console.log("🌐 Connexion à la base de données distante...");
        const res = await pool.query("SELECT username, price_per_minute, stripe_account_id FROM users WHERE id = 18");
        
        if (res.rows.length > 0) {
            const prof = res.rows[0];
            console.log(`✅ NOM      : ${prof.username}`);
            console.log(`✅ TARIF    : ${prof.price_per_minute} €/min (Cible: 0.33)`);
            console.log(`✅ STRIPE   : ${prof.stripe_account_id}`);
        } else {
            console.log("❌ Professeur 18 non trouvé.");
        }
    } catch (err) {
        console.error("❌ Erreur de connexion :", err.message);
    } finally {
        await pool.end();
    }
}
checkRemoteData();