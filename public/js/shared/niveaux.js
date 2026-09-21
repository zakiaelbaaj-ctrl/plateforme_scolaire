// Référence unique des niveaux et des classes.
// Importée par le formulaire élève et par celui du professeur,
// pour que les deux listes ne puissent plus diverger.

export const NIVEAUX = [
  "Primaire",
  "Collège",
  "Lycée",
  "Supérieur",
  "Formation professionnelle",
];

export const CLASSES_PAR_NIVEAU = {
  "Primaire": ["CP", "CE1", "CE2", "CM1", "CM2"],
  "Collège":  ["6ème", "5ème", "4ème", "3ème"],
  "Lycée":    ["Seconde", "Première", "Terminale"],
  "Supérieur": [
    "BTS 1", "BTS 2",
    "BUT 1", "BUT 2", "BUT 3",
    "Prépa 1", "Prépa 2",
    "Licence 1", "Licence 2", "Licence 3",
    "Master 1", "Master 2",
    "Doctorat",
  ],
  "Formation professionnelle": [],
};
