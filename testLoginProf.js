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

async function loginProfesseur(username, motDePasse) {
  try {
    const result = await pool.query(
      "SELECT * FROM profs WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      console.log("❌ Professeur non trouvé !");
      return;
    }

    const prof = result.rows[0];
    const valide = await bcrypt.compare(motDePasse, prof.password);

    if (valide) {
      console.log(`✅ Connexion réussie pour ${prof.prenom} ${prof.nom} !`);
    } else {
      console.log("❌ Mot de passe incorrect !");
    }
  } catch (err) {
    console.error("Erreur :", err);
  } finally {
    await pool.end();
  }
}

// Test avec les identifiants d'un professeur existant
loginProfesseur("prof_Alice_nd", "motdepasse123");
