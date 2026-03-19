// resetAdminPassword.js
import bcrypt from "bcryptjs";
import pkg from "pg"; // PostgreSQL
const { Client } = pkg;

async function resetAdminPassword() {
  // 1️⃣ Nouveau mot de passe
  const plainPassword = "admin123";

  // 2️⃣ Générer le hash bcrypt
  const hash = await bcrypt.hash(plainPassword, 12);
  console.log("Nouveau hash généré :", hash);

  // 3️⃣ Configurer la connexion à ta base
  const client = new Client({
    user: "postgres",        // <-- remplace par ton utilisateur PostgreSQL
    host: "localhost",
    database: "plateforme_scolaire_db", // <-- nom de ta base
    password: "Zakia-Amine93",    // <-- mot de passe PostgreSQL
    port: 5432
  });

  await client.connect();

  // 4️⃣ Mettre à jour le mot de passe admin
  const res = await client.query(
    `UPDATE users SET password=$1 WHERE username='admin'`,
    [hash]
  );

  console.log("Mot de passe admin mis à jour !");
  await client.end();
}

resetAdminPassword().catch(err => console.error(err));
