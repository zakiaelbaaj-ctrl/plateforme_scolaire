// Référence unique des matières.
// Importée par le formulaire du professeur et par celui de l'élève,
// pour que les deux listes ne puissent plus diverger.
// Circuit élève ↔ professeur uniquement : le rôle étudiant a sa propre liste.

export const MATIERES = {
  "Général": [
    "Mathématiques",
    "Français",
    "Anglais",
    "Histoire-Géographie",
    "Philosophie",
    "Économie",
    "Finance",
    "Droit",
  ],
  "Sciences": [
    "Physique-Chimie",
    "SVT",
    "Biologie",
    "Chimie",
    "Médecine",
  ],
  "Techniques & Informatique": [
    "Modélisation 3D",
    "Architecture",
    "Informatique",
    "Informatique - Programmation",
    "Réseaux & Systèmes",
  ],
  "Religion": [
    "Religion Islamique",
    "Lecture Coranique",
    "Religion Catholique",
    "Religion Protestante",
    "Religion Juive",
  ],
  "Commerce & Gestion": [
    "Économie-Gestion",
    "Comptabilité",
    "Marketing",
    "Sciences Politiques",
  ],
  "Gastronomie": [
    "Patisserie",
    "Biscuiterie",
    "Cuisine",
  ],
  "Arts": [
    "Musique",
    "Arts plastiques",
  ],
  "Orientation et carrière": [
    "Orientation scolaire et professionnelle",
    "Conseil en carrière",
    "Préparation aux entretiens",
    "Rédaction de CV et lettre de motivation",
    "Développement personnel",
    "Prise de parole en public",
  ],
  "Autres": [
    "Formation professionnelle",
  ],
};
