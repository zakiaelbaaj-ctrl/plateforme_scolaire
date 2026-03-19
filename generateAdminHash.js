import bcrypt from "bcryptjs";

async function generate() {
  const password = "admin123";
  const hash = await bcrypt.hash(password, 12);
  console.log("NOUVEAU HASH =", hash);
}

generate();
