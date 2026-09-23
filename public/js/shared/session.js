// =========================================================
// Nettoyage de la session locale.
//
// localStorage.clear() efface tout, y compris la langue choisie :
// un eleve arabophone se reconnectait et retrouvait l interface en
// francais. La langue n est pas une donnee de session, c est une
// preference d affichage — elle doit survivre a la deconnexion.
// =========================================================

const CLES_PRESERVEES = ["langue"];

export function viderSession() {
  const gardees = {};
  try {
    for (const cle of CLES_PRESERVEES) {
      const v = localStorage.getItem(cle);
      if (v !== null) gardees[cle] = v;
    }
  } catch (_) {
    // localStorage indisponible : rien a preserver
  }

  try {
    localStorage.clear();
    for (const [cle, v] of Object.entries(gardees)) localStorage.setItem(cle, v);
  } catch (_) {
    // navigation privee ou stockage bloque : on ne peut rien faire de plus
  }
}
