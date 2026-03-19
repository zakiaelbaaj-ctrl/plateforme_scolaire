import bcrypt from "bcryptjs";

const password = "password123";

const hash = await bcrypt.hash(password, 10);
console.log("Mot de passe hashé :", hash);
