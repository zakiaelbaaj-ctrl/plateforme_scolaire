// hash-password.js
import bcrypt from "bcryptjs";

async function main() {
  const pass = process.argv[2];
  if (!pass) {
    console.error("Usage: node hash-password.js <motdepasse>");
    process.exit(1);
  }
  const saltRounds = 10;
  const hash = await bcrypt.hash(pass, saltRounds);
  console.log(hash);
}

main().catch(e => { console.error(e); process.exit(1); });
