import jwt from "jsonwebtoken";

/**
 * Génère accessToken + refreshToken
 */
export async function generateTokens({ userId, email, role }) {
  if (!userId || !role) {
    throw new Error("Données manquantes pour générer le token");
  }

  // 🔐 Token principal (utilisé partout)
  const token = jwt.sign(
    {
      userId,
      email,
      role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d" // 1 mois
    }
  );

  // 🔁 Refresh token
  const refreshToken = jwt.sign(
    {
      userId
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "90d"
    }
  );

  return {
    token,
    refreshToken
  };
}
