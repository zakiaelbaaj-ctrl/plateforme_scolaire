import jwt from "jsonwebtoken";

export default function authOptional(req, res, next) {
  // 🔹 Mode DEV → bypass JWT
  if (process.env.DISABLE_JWT === "true") {
    req.user = { id: 1, role: "professeur", email: "dev@example.com" };
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Token manquant" });
  }

  const parts = header.split(" ");
  if (parts.length !== 2) {
    return res.status(401).json({ success: false, message: "Format Authorization invalide" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.userId && !decoded.id) {
      return res.status(401).json({ success: false, message: "Payload JWT incomplet" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expiré" });
    }
    return res.status(401).json({ success: false, message: "Token invalide" });
  }
}
