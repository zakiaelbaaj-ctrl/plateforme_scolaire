export async function getUserProfile() {
  try {
    const token = localStorage.getItem("token");

    // 1. Si pas de token, on ne tente mÃÂªme pas l'appel
    if (!token) {
      console.warn("Ã¢Å¡Â Ã¯Â¸Â Aucun token trouvÃÂ© dans le localStorage");
      return null;
    }

    // 2. DÃÂ©tection dynamique de l'URL (Local vs Production)
    const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:4000" 
      : "https://plateforme-scolaire-1.onrender.com";

    // 3. Appel avec l'URL complÃÂ¨te
    const resp = await fetch(`${API_URL}/api/v1/users/profile/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      // Si le token est invalide ou expirÃÂ© (401/403)
      if (resp.status === 401 || resp.status === 403) {
        localStorage.removeItem("token"); // Nettoyage
      }
      throw new Error("Session expirÃÂ©e ou invalide");
    }

    const data = await resp.json();
    
    // Si votre backend renvoie { user: {...} }, retournez data.user
    return data.user || data; 

  } catch (err) {
    console.error("Ã¢ÂÅ getUserProfile failed:", err.message);
    return null; // On retourne null pour que le Dashboard puisse rediriger vers le login
  }
}

