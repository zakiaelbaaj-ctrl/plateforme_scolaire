// services/pricing.util.js
// Barème HT selon le niveau de l'élève (aligné marché français 2026)

export const TARIFS_PAR_NIVEAU = {
  "primaire":  20,
  "collège":   24,
  "lycée":     30,
  "supérieur": 40
};

export const TARIF_PAR_DEFAUT = 24; // collège, si niveau absent/inconnu

/**
 * Normalise une valeur de niveau (accents, casse, tableau JSON) vers une clé
 * comparable au barème TARIFS_PAR_NIVEAU.
 */
export function getNiveauEleve(niveauRaw) {
  const arr = Array.isArray(niveauRaw) ? niveauRaw : [niveauRaw];
  const first = (arr[0] || "").toString();
  return first
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Retourne le tarif horaire HT (en euros) pour un niveau donné.
 */
export function getTarifHoraireHT(niveauRaw) {
  const niveau = getNiveauEleve(niveauRaw);
  return TARIFS_PAR_NIVEAU[niveau] || TARIF_PAR_DEFAUT;
}