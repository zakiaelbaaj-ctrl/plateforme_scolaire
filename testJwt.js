import jwt from "jsonwebtoken";

const token = jwt.sign({ userId: 1, role: "prof" }, "MonSuperSecretJWT2025", { expiresIn: "1h" });
console.log("Token généré :", token);

const decoded = jwt.verify(token, "MonSuperSecretJWT2025");
console.log("Décodé :", decoded);
