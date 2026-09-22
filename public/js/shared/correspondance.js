// =========================================================
// Règle unique de correspondance élève ↔ professeur.
// Utilisée par l'affichage (navigateur) et par le serveur,
// pour qu'un professeur visible soit toujours appelable.
// =========================================================

function enTableau(valeur) {
  if (Array.isArray(valeur)) return valeur;
  return valeur ? [valeur] : [];
}

export function professeurCorrespond(prof, eleve) {
  const eleveMatiere = enTableau(eleve?.matiere)[0];
  const eleveNiveau  = enTableau(eleve?.niveau)[0];
  const eleveClasse  = enTableau(eleve?.classe)[0];

  // Profil incomplet : on ne propose rien plutôt que de tout proposer.
  if (!eleveMatiere || !eleveNiveau) return false;

  const profMatieres = enTableau(prof?.matiere);
  const profNiveaux  = enTableau(prof?.niveau);
  const profClasses  = enTableau(prof?.classes);

  if (!profMatieres.includes(eleveMatiere)) return false;
  if (!profNiveaux.includes(eleveNiveau))   return false;

  // Professeur sans classe précisée : il couvre tout son niveau.
  if (profClasses.length === 0) return true;

  // Élève sans classe précisée : on ne le bloque pas.
  if (!eleveClasse) return true;

  return profClasses.includes(eleveClasse);
}
