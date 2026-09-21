// Référence unique des langues de l'interface.
// `sens` vaut "rtl" pour les écritures de droite à gauche.

export const LANGUES = [
  { code: "fr", nom: "Français", nomNatif: "Français", sens: "ltr" },
  { code: "en", nom: "Anglais",  nomNatif: "English",  sens: "ltr" },
  { code: "ar", nom: "Arabe",    nomNatif: "العربية",  sens: "rtl" },
  { code: "es", nom: "Espagnol", nomNatif: "Español",  sens: "ltr" },
];

export const LANGUE_PAR_DEFAUT = "fr";

export const langueParCode = (code) =>
  LANGUES.find((l) => l.code === code) || null;
