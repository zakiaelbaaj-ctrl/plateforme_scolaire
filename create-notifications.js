import dotenv from "dotenv";
dotenv.config();
import { db } from "./config/index.js";

await db.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

console.log("✅ Table notifications créée");
process.exit(0);