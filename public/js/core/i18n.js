// Internationalisation de l'interface.
//
// Marquage dans le HTML :
//   <h1 data-i18n="accueil.titre">Urgence Scolaire</h1>
//   <input data-i18n-placeholder="form.email">
//   <button data-i18n-title="action.fermer">
//
// Le texte francais reste ecrit dans le HTML : si une traduction manque
// ou si le fichier ne se charge pas, la page reste lisible.

import { LANGUES, LANGUE_PAR_DEFAUT, langueParCode } from "/js/shared/langues.js";

const CLE_STOCKAGE = "langue";
let traductions = {};
let langueActive = LANGUE_PAR_DEFAUT;

function langueChoisie() {
  try {
    const memorisee = localStorage.getItem(CLE_STOCKAGE);
    if (memorisee && langueParCode(memorisee)) return memorisee;
  } catch (_) {
    // localStorage indisponible (navigation privee, cookies bloques)
  }
  const navigateur = (navigator.language || "").slice(0, 2).toLowerCase();
  return langueParCode(navigateur) ? navigateur : LANGUE_PAR_DEFAUT;
}

function valeur(cle) {
  return cle.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), traductions);
}

export function t(cle, secours = null) {
  return valeur(cle) ?? secours ?? cle;
}

export function appliquer(racine = document) {
  racine.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = valeur(el.dataset.i18n);
    if (v !== null) el.textContent = v;
  });
  racine.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const v = valeur(el.dataset.i18nPlaceholder);
    if (v !== null) el.placeholder = v;
  });
  racine.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const v = valeur(el.dataset.i18nTitle);
    if (v !== null) el.title = v;
  });
}

export async function definirLangue(code) {
  const langue = langueParCode(code) || langueParCode(LANGUE_PAR_DEFAUT);

  try {
    const reponse = await fetch(`/locales/${langue.code}.json`, { cache: "no-cache" });
    traductions = reponse.ok ? await reponse.json() : {};
  } catch (err) {
    console.warn("🌐 Traductions indisponibles :", err.message);
    traductions = {};
  }

  langueActive = langue.code;
  document.documentElement.lang = langue.code;
  document.documentElement.dir = langue.sens;

  try {
    localStorage.setItem(CLE_STOCKAGE, langue.code);
  } catch (_) {}

  appliquer();
  document.dispatchEvent(new CustomEvent("langue:changee", { detail: langue }));
  return langue;
}

export const langueCourante = () => langueActive;

export async function initI18n() {
  return definirLangue(langueChoisie());
}

export { LANGUES };
