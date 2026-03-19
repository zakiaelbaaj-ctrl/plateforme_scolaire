// =======================================================
// WS/AUTH/AUTH.SERVICE.JS — LOGIQUE MÉTIER PURE (ASYNC & COHÉRENTE)
// =======================================================

export class AuthService {
  /**
   * @param {Map<string, Object>} usersState - state en mémoire pour dev / tests
   */
  constructor(usersState) {
    this.usersState = usersState;
  }

  // -----------------------------------------------------
  // IDENTIFY — mise à jour profil
  // -----------------------------------------------------
  async identify(userId, prenom, nom, ville = null, pays = null) {
    if (!userId || typeof prenom !== "string" || typeof nom !== "string") {
      throw new Error("Paramètres invalides");
    }

    const user = this.usersState.get(userId);
    if (!user) throw new Error("Utilisateur introuvable");

    // Mise à jour mutable (OK en mémoire)
    user.prenom = prenom;
    user.nom = nom;
    user.ville = ville;
    user.pays = pays;

    return user;
  }

  // -----------------------------------------------------
  // LOGIN — authentification simple
  // -----------------------------------------------------
  async login(email, password) {
    if (!email || !password) throw new Error("Email et mot de passe requis");

    const user = [...this.usersState.values()].find(u => u.email === email);
    if (!user || user.password !== password) throw new Error("Email ou mot de passe incorrect");

    return user;
  }

  // -----------------------------------------------------
  // LOGOUT — supprime / invalide userId
  // -----------------------------------------------------
  async logout(userId) {
    const user = this.usersState.get(userId);
    if (!user) throw new Error("Utilisateur introuvable");

    // Ici on pourrait révoquer un token ou nettoyer session
    return { message: "Déconnexion réussie" };
  }

  // -----------------------------------------------------
  // VERIFY TOKEN — vérification basique
  // -----------------------------------------------------
  async verifyToken(token) {
    if (!token || typeof token !== "string") throw new Error("Token requis");

    const user = [...this.usersState.values()].find(u => u.token === token);
    if (!user) throw new Error("Token invalide");

    return user;
  }

  // -----------------------------------------------------
  // GET ME — récupère user par ID
  // -----------------------------------------------------
  async getMe(userId) {
    const user = this.usersState.get(userId);
    if (!user) throw new Error("Utilisateur non authentifié");

    return user;
  }
}
