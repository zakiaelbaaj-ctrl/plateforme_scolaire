import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS langue_matiere VARCHAR(50);`);
console.log('✅ Colonne ajoutée !');
await client.end();