import express from "express";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      profId,
      rating,
      comment
    } = req.body;

    if (!profId || !rating) {
      return res.status(400).json({
        message: "profId et rating obligatoires"
      });
    }

    // TODO : ici on enregistrera dans ta base de données

    console.log("Nouvelle notation :", {
      profId,
      rating,
      comment
    });

    return res.status(201).json({
      success: true,
      message: "Notation enregistrée"
    });

  } catch (error) {
    console.error("Erreur rating:", error);

    res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
});

export default router;