import pkg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
  ssl: { rejectUnauthorized: false },
});

async function testAllProfs() {
  try {
    // Récupérer tous les professeurs
    const result = await pool.query("SELECT id, prenom, nom, username, password FROM profs");
    
    if (result.rows.length === 0) {
      console.log("❌ Aucun professeur trouvé !");
      return;
    }

    for (const prof of result.rows) {
      // Ici, tu mets le mot de passe que tu veux tester
      // Si tous les profs ont le même mot de passe, tu peux le mettre directement
      const testPassword = "motdepasse123";

      const valide = await bcrypt.compare(testPassword, prof.password);
      if (valide) {
        console.log(`✅ Connexion réussie pour ${prof.prenom} ${prof.nom} (${prof.username})`);
      } else {
        console.log(`❌ Mot de passe incorrect pour ${prof.prenom} ${prof.nom} (${prof.username})`);
      }
    }
  } catch (err) {
    console.error("Erreur :", err);
  } finally {
    await pool.end();
  }
}

testAllProfs();
