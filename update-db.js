import { pool } from './db.js';

async function updateTable() {
    try {
        console.log("🛠️ Tentative d'ajout de 'stripe_customer_id' à la table 'users'...");
        
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
        `);

        console.log("✅ SUCCÈS : La colonne a été ajoutée à la table 'users'.");

    } catch (err) {
        console.error("❌ ERREUR lors de la modification :", err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}

updateTable();