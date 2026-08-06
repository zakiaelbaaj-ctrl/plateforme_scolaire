// ws/matieres/init.js
// Gestion des matières : groupes logiques, nettoyage, comptage des demandes et tri.
//
// Messages gérés (JSON):
// - { type: "getMatieres" } => { type: "listeMatieres", groups: { ... } }
// - { type: "incrementDemande", matiere: "<key>" } => incrémente le compteur et renvoie la liste mise à jour
//
// Si deps.db est fourni et expose getMatieresDemandes() et saveMatiereDemande(key, count),
// la persistance sera utilisée ; sinon on utilise un cache en mémoire.

import { safeSend } from "../utils.js";

export default function initMatieresWS(wss, deps = {}) {
  // Métadonnées des matières : key unique, name affiché, group logique, level (1=primaire,2=secondaire,3=supérieur)
  const MATIERES_META = [
    // Langues
    { key: "francais", name: "Français", group: "Langues", level: 2 },
    { key: "anglais", name: "Anglais", group: "Langues", level: 2 },
    { key: "espagnol", name: "Espagnol", group: "Langues", level: 2 },
    { key: "allemand", name: "Allemand", group: "Langues", level: 2 },
    { key: "italien", name: "Italien", group: "Langues", level: 2 },
    { key: "arabe", name: "Arabe", group: "Langues", level: 2 },
    { key: "chinois", name: "Chinois", group: "Langues", level: 2 },
    { key: "portugais", name: "Portugais", group: "Langues", level: 2 },
    { key: "russe", name: "Russe", group: "Langues", level: 2 },
    { key: "polonais", name: "Polonais", group: "Langues", level: 2 },
    { key: "hebreu", name: "Hébreu", group: "Langues", level: 2 },
    { key: "latin", name: "Latin", group: "Langues", level: 2 },
    { key: "grec", name: "Grec", group: "Langues", level: 2 },
    { key: "berbere", name: "Berbère", group: "Langues", level: 2 },
    { key: "turc", name: "Turc", group: "Langues", level: 2 },

    // Primaire
    { key: "numeration", name: "Numération / Calcul (Primaire)", group: "Primaire", level: 1 },
    { key: "lecture", name: "Lecture / Français (Primaire)", group: "Primaire", level: 1 },
    { key: "decouverte_monde", name: "Découverte du monde (Primaire)", group: "Primaire", level: 1 },

    // Secondaire
    { key: "mathematiques", name: "Mathématiques", group: "Secondaire", level: 2 },
    { key: "physique", name: "Physique", group: "Secondaire", level: 2 },
    { key: "chimie", name: "Chimie", group: "Secondaire", level: 2 },
    { key: "biochimie", name: "Biochimie", group: "Secondaire", level: 2 },
    { key: "svt", name: "SVT", group: "Secondaire", level: 2 },
    { key: "histoire", name: "Histoire", group: "Secondaire", level: 2 },
    { key: "geographie", name: "Géographie", group: "Secondaire", level: 2 },
    { key: "litterature", name: "Littérature", group: "Secondaire", level: 2 },

    // Arts
    { key: "musique", name: "Musique", group: "Arts", level: 2 },
    { key: "arts_plastiques", name: "Arts plastiques", group: "Arts", level: 2 },
    { key: "theatre", name: "Théâtre", group: "Arts", level: 2 },
    { key: "cinema", name: "Cinéma", group: "Arts", level: 2 },
    { key: "danse", name: "Danse", group: "Arts", level: 2 },
    { key: "cuisine", name: "Cuisine", group: "Arts", level: 2 },

    // Supérieur et spécialisées
    { key: "informatique", name: "Informatique", group: "Supérieur", level: 3 },
    { key: "technologie", name: "Technologie", group: "Supérieur", level: 3 },
    { key: "economie", name: "Économie", group: "Supérieur", level: 3 },
    { key: "sciences_economiques", name: "Sciences économiques", group: "Supérieur", level: 3 },
    { key: "sciences_sociales", name: "Sciences sociales", group: "Supérieur", level: 3 },
    { key: "sciences_politiques", name: "Sciences politiques", group: "Supérieur", level: 3 },
    { key: "droit", name: "Droit", group: "Supérieur", level: 3 },
    { key: "comptabilite", name: "Comptabilité", group: "Supérieur", level: 3 },
    { key: "gestion", name: "Gestion", group: "Supérieur", level: 3 },
    { key: "marketing", name: "Marketing", group: "Supérieur", level: 3 },
    { key: "medecine", name: "Médecine", group: "Supérieur", level: 3 },
    { key: "pharmacie", name: "Pharmacie", group: "Supérieur", level: 3 },
    { key: "soins_infirmiers", name: "Soins infirmiers", group: "Supérieur", level: 3 },
    { key: "architecture", name: "Architecture", group: "Supérieur", level: 3 },
    { key: "design", name: "Design", group: "Supérieur", level: 3 },
    { key: "mode", name: "Mode", group: "Supérieur", level: 3 },
    { key: "biologie", name: "Biologie", group: "Supérieur", level: 3 },
    { key: "geologie", name: "Géologie", group: "Supérieur", level: 3 },
    { key: "microbiologie", name: "Microbiologie", group: "Supérieur", level: 3 },
    { key: "astronomie", name: "Astronomie", group: "Supérieur", level: 3 },
    { key: "ecologie", name: "Écologie", group: "Supérieur", level: 3 },
    { key: "sciences_ingenieur", name: "Sciences de l'ingénieur", group: "Supérieur", level: 3 },
    { key: "sciences_sanitaires_sociales", name: "Sciences sanitaires et sociales", group: "Supérieur", level: 3 },

    // Autres
    { key: "education_civique", name: "Éducation civique", group: "Autres", level: 2 },
    { key: "education_musicale", name: "Éducation musicale", group: "Autres", level: 2 },
    { key: "religion", name: "Religion", group: "Autres", level: 2 },
    { key: "eps", name: "EPS", group: "Autres", level: 2 }
  ];

  // Ordre des groupes renvoyés
  const GROUP_ORDER = ["Langues", "Primaire", "Secondaire", "Arts", "Supérieur", "Autres"];

  // Compteurs en mémoire (clé -> count). Si deps.db fourni, on tentera de charger depuis la DB.
  const counts = new Map();

  async function loadCountsFromDb() {
    if (deps.db && typeof deps.db.getMatieresDemandes === "function") {
      try {
        const rows = await deps.db.getMatieresDemandes(); // attendu: [{ key, count }, ...]
        rows.forEach(r => counts.set(r.key, Number(r.count) || 0));
        return;
      } catch (err) {
        console.error("matieres: erreur lecture counts depuis db", err);
      }
    }
    // initialiser à 0 si absent
    MATIERES_META.forEach(m => {
      if (!counts.has(m.key)) counts.set(m.key, 0);
    });
  }

  async function persistCount(key, next) {
    if (deps.db && typeof deps.db.saveMatiereDemande === "function") {
      try {
        await deps.db.saveMatiereDemande(key, next);
      } catch (err) {
        console.error("matieres: erreur saveMatiereDemande", err);
      }
    }
  }

  // Construire la structure groupée et triée
  function buildGrouped() {
    const groups = new Map();
    MATIERES_META.forEach(m => {
      const count = counts.get(m.key) || 0;
      if (!groups.has(m.group)) groups.set(m.group, []);
      groups.get(m.group).push({ key: m.key, name: m.name, level: m.level, count });
    });

    const result = {};
    GROUP_ORDER.forEach(groupName => {
      const arr = groups.get(groupName) || [];
      arr.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count; // plus demandé d'abord
        return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      });
      result[groupName] = arr;
    });

    // Ajouter les groupes restants non listés dans GROUP_ORDER (par sécurité)
    groups.forEach((arr, groupName) => {
      if (!result[groupName]) {
        arr.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
        });
        result[groupName] = arr;
      }
    });

    return result;
  }

  // Chargement initial des compteurs (non bloquant)
  loadCountsFromDb().catch(err => {
    console.error("matieres: loadCountsFromDb failed", err);
  });

  // Écouteur global des messages WS (le router émet 'ws:message')
  wss.on("ws:message", async (ws, msg) => {
    try {
      if (!msg || !msg.type) return;

      // Renvoi de la liste groupée triée
      if (msg.type === "getMatieres") {
        const grouped = buildGrouped();
        safeSend(ws, { type: "listeMatieres", groups: grouped });
        return;
      }

      // Incrémenter la demande pour une matière (ex: quand l'élève choisit une matière)
      if (msg.type === "incrementDemande" && typeof msg.matiere === "string") {
        const key = msg.matiere;
        const meta = MATIERES_META.find(m => m.key === key);
        if (!meta) {
          safeSend(ws, { type: "error", message: "Matière inconnue", matiere: key });
          return;
        }
        const prev = counts.get(key) || 0;
        const next = prev + 1;
        counts.set(key, next);
        await persistCount(key, next);
        // Renvoyer la liste mise à jour (optionnel)
        const grouped = buildGrouped();
        safeSend(ws, { type: "listeMatieres", groups: grouped });
        return;
      }

      // Autres messages ignorés ici
    } catch (err) {
      console.error("matieres: erreur traitement message", err);
      safeSend(ws, { type: "error", message: "Erreur interne matieres" });
    }
  });
}
