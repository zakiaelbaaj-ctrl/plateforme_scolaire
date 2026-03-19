/**
 * Normalise un email pour stockage/recherche (niveau senior+++)
 * - trim
 * - lowercase
 * - suppression espaces invisibles
 * - normalisation Unicode
 * - retourne null si email invalide
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== "string") return null;

  // Supprime les espaces invisibles (BOM, NBSP, etc.)
  const cleaned = email
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .normalize("NFKC")                     // normalisation Unicode
    .trim()
    .toLowerCase();

  return cleaned || null;
}
