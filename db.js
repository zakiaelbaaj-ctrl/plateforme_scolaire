// config/db.js
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  user: "postgres",         
  host: "localhost",        
  database: "plateforme_scolaire_db",
  password: "Zakia-Amine93",
  port: 5432,
});
