// controllers/registerController.js
import logger from "#config/logger.js";
import * as usersService from "#services/usersService.js";
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// Liste des rôles autorisés
const ALLOWED_ROLES = ["etudiant", "eleve", "prof", "admin"];

export async function registerController(req, res) {
  try {
    const {
      username,
      prenom,
      nom,
      email,
      telephone,
      ville,
      pays,
      password,
      role,
      matiere,
      niveau
    } = req.body || {};

    // ------------------------------
    // 1. VALIDATION STRICTE
    // ------------------------------
    if (!email || !password || !prenom || !nom) {
      return res.status(400).json({
        success: false,
        message: "Champs obligatoires manquants (email, password, nom, prenom)"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caractères"
      });
    }

    // ------------------------------
    // 2. NORMALISATION (Ce qui manquait)
    // ------------------------------
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username ? username.trim() : null;

    // ------------------------------
    // 3. VÉRIFICATION DOUBLON
    // ------------------------------
    const existing = await usersService.findByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Un compte existe déjà avec cet email"
      });
    }

    // ------------------------------
    // 4. LOGIQUE RÔLE, STATUT ET IS_ACTIVE
    // ------------------------------
    let finalRole = role || "eleve";
    if (!ALLOWED_ROLES.includes(finalRole)) {
      finalRole = "eleve";
    }

    // Logique métier synchronisée :
    // - Élèves/Étudiants : Actifs tout de suite
    // - Profs : En attente (is_active = false)
    const isStudent = (finalRole === "eleve" || finalRole === "etudiant");
    const finalStatus = isStudent ? "active" : "pending";
    const finalIsActive = isStudent; 
    // ------------------------------
    // 4.5 CRÉATION DU COMPTE STRIPE (Brique manquante)
    // ------------------------------
    let stripeCustomerId = null;
    if (isStudent) {
      try {
        const customer = await stripe.customers.create({
          email: cleanEmail,
          name: `${prenom.trim()} ${nom.trim()}`,
          metadata: { role: finalRole }
        });
        stripeCustomerId = customer.id;
      } catch (stripeErr) {
        logger.error("❌ Stripe Customer Creation Error", stripeErr);
      }
    }
    // ------------------------------
    // 5. CRÉATION VIA LE SERVICE
    // ------------------------------
    const newUser = await usersService.createUser({
      username: cleanUsername,
      prenom: prenom.trim(),
      nom: nom.trim(),
      email: cleanEmail,
      telephone: telephone || null,
      ville: ville || null,
      pays: pays || "France",
      password: password, // Le hachage se fait dans le service
      role: finalRole,
      statut: finalStatus,
      is_active: finalIsActive, 
      stripe_customer_id: stripeCustomerId,
      has_payment_method: false,
      matiere: matiere || null,
      niveau: niveau || null
    });

    // ------------------------------
    // 6. RÉPONSE SÉCURISÉE (Nettoyage complet)
    // ------------------------------
    // On s'assure de ne jamais renvoyer le password même haché
    const safeUser = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        statut: newUser.statut,
        is_active: newUser.is_active,
        has_payment_method: newUser.has_payment_method,
        stripe_customer_id: newUser.stripe_customer_id,
        date_inscription: newUser.date_inscription
    };

    return res.status(201).json({
      success: true,
      message: finalStatus === "pending" 
        ? "Inscription réussie ! Votre profil est en cours d'examen par nos équipes."
        : "Inscription réussie ! Bienvenue sur UrgenceScolaire.",
      data: safeUser
    });

  } catch (err) {
    logger.error("❌ Register Error:", err.message);

    // Gestion des erreurs de base de données (Unique Constraint)
    if (err.message?.includes("déjà existant") || err.message?.includes("déjà pris")) {
      return res.status(409).json({ success: false, message: err.message });
    }

    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la création de votre compte."
    });
  }
}