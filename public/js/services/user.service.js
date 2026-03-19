export async function getUserProfile() {

  try {

    const token = localStorage.getItem("token");

    const resp = await fetch("/api/v1/users/profile/me", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      throw new Error("Erreur récupération utilisateur");
    }

    return await resp.json();

  } catch (err) {

    console.error("getUserProfile failed", err);
    throw err;

  }

}