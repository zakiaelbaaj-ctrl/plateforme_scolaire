import { pool } from './db.js'; 

async function verifyTableStructure() {
    try {
        console.log("🔍 Analyse de la table 'users'...");
        
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);

        const columns = res.rows.map(row => row.column_name);
        
        console.log("--- Colonnes trouvées dans 'users' ---");
        console.log(columns.length > 0 ? columns.join(' | ') : "⚠️ Aucune colonne trouvée !");
        console.log("---------------------------------------");

        if (columns.includes('stripe_customer_id')) {
            console.log("✅ SUCCÈS : La colonne 'stripe_customer_id' existe bien localement.");
        } else {
            console.log("❌ MANQUANT : La colonne 'stripe_customer_id' n'existe pas dans 'users'.");
            console.log("👉 Action : Relancez 'node update-db.js'.");
        }

    } catch (err) {
        console.error("❌ Erreur de vérification :", err.message);
    } finally {
        await pool.end();
    }
}

verifyTableStructure();