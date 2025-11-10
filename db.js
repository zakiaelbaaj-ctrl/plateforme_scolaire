// db.js
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: "postgres",         // ton utilisateur PostgreSQL
  host: "localhost",        // l'hôte
  database: "plateforme_db", // ta base PostgreSQL
  password: "Zakia-Amine93", // 
  port: 5432,               // port par défaut
});

export default pool;

