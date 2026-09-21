// Référence unique des pays desservis.
//
// `versement` indique comment un PROFESSEUR résidant dans ce pays est payé :
//   "stripe" → compte Stripe Connect, versement automatique
//   "manuel" → Stripe n'opère pas dans ce pays, versement traité à la main
//
// ⚠️ La disponibilité de Stripe évolue. Vérifier sur https://stripe.com/global
//    avant toute mise en production, et corriger ce fichier le cas échéant.
//
// L'ENCAISSEMENT n'est pas concerné : un élève paie par carte depuis n'importe
// quel pays, y compris ceux marqués "manuel".

export const VERSEMENT = {
  STRIPE: "stripe",
  MANUEL: "manuel",
};

export const PAYS = [
  // --- Europe ---
  { code: "FR", nom: "France",               devise: "EUR", versement: "stripe" },
  { code: "BE", nom: "Belgique",             devise: "EUR", versement: "stripe" },
  { code: "CH", nom: "Suisse",               devise: "CHF", versement: "stripe" },
  { code: "LU", nom: "Luxembourg",           devise: "EUR", versement: "stripe" },

  // --- Amériques ---
  { code: "CA", nom: "Canada",               devise: "CAD", versement: "stripe" },
  { code: "US", nom: "États-Unis",           devise: "USD", versement: "stripe" },
  { code: "MX", nom: "Mexique",              devise: "MXN", versement: "stripe" },
  { code: "BR", nom: "Brésil",               devise: "BRL", versement: "stripe" },

  // --- Golfe ---
  { code: "AE", nom: "Émirats arabes unis",  devise: "AED", versement: "stripe" },
  { code: "SA", nom: "Arabie saoudite",      devise: "SAR", versement: "manuel" },
  { code: "QA", nom: "Qatar",                devise: "QAR", versement: "manuel" },
  { code: "KW", nom: "Koweït",               devise: "KWD", versement: "manuel" },
  { code: "BH", nom: "Bahreïn",              devise: "BHD", versement: "manuel" },
  { code: "OM", nom: "Oman",                 devise: "OMR", versement: "manuel" },

  // --- Maghreb ---
  { code: "MA", nom: "Maroc",                devise: "MAD", versement: "manuel" },
  { code: "TN", nom: "Tunisie",              devise: "TND", versement: "manuel" },
  { code: "DZ", nom: "Algérie",              devise: "DZD", versement: "manuel" },

  // --- Afrique francophone ---
  { code: "SN", nom: "Sénégal",              devise: "XOF", versement: "manuel" },
  { code: "CI", nom: "Côte d'Ivoire",        devise: "XOF", versement: "manuel" },
  { code: "CM", nom: "Cameroun",             devise: "XAF", versement: "manuel" },
];

export const paysParCode = (code) => PAYS.find((p) => p.code === code) || null;
