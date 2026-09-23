// services/pricing.util.js
// Barème HT selon le niveau de l'élève (aligné marché français 2026)

export const TARIFS_PAR_NIVEAU = {
  "primaire":  20,
  "collège":   24,
  "lycée":     30,
  "supérieur": 40
};

export const TARIF_PAR_DEFAUT = 24; // collège, si niveau absent ou inconnu

/**
 * Retire accents, casse et espaces superflus d'une valeur de niveau.
 */
function sansAccents(valeur) {
  return (valeur ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Barème réindexé sur des clés sans accents.
 *
 * Le barème ci-dessus garde son orthographe française, lisible ;
 * la recherche, elle, se fait sur des clés normalisées. Sans cette
 * table, getNiveauEleve transformait "Lycée" en "lycee" et n'allait
 * jamais retrouver la clé "lycée" : trois niveaux sur quatre
 * retombaient silencieusement sur le tarif par défaut.
 */
const TARIFS_NORMALISES = Object.fromEntries(
  Object.entries(TARIFS_PAR_NIVEAU).map(([cle, tarif]) => [sansAccents(cle), tarif])
);

/**
 * Normalise une valeur de niveau (accents, casse, tableau JSON) vers une clé
 * comparable au barème.
 */
export function getNiveauEleve(niveauRaw) {
  const arr = Array.isArray(niveauRaw) ? niveauRaw : [niveauRaw];
  return sansAccents(arr[0]);
}

/**
 * Retourne le tarif horaire HT (en euros) pour un niveau donné.
 */
export function getTarifHoraireHT(niveauRaw) {
  return TARIFS_NORMALISES[getNiveauEleve(niveauRaw)] || TARIF_PAR_DEFAUT;
}
