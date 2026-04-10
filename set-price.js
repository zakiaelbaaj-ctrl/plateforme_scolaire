import { pool } from './db.js';

async function updatePrice() {
    try {
        const profId = 18;
        const pricePerMin = 0.3333; // 20€ / 60 min

        console.log(`⚖️  Mise à jour du tarif pour Amine (ID ${profId})...`);
        
        await pool.query(
            "UPDATE users SET price_per_minute = $1 WHERE id = $2", 
            [pricePerMin, profId]
        );

        console.log("✅ Tarif mis à jour : ~0.33€/min (soit 20€/heure).");
    } finally {
        await pool.end();
        process.exit();
    }
}
updatePrice();