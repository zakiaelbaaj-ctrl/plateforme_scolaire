import { updatePassword } from "../services/usersService.js";

const userId = 37; // Sasy26
const newPassword = "Demo1234!";

await updatePassword(userId, newPassword);
console.log(`✅ Mot de passe réinitialisé pour user ${userId}`);
process.exit(0);