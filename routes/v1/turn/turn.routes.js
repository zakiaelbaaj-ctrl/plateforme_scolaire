import express from "express";
import twilio from "twilio";

const router = express.Router();

router.get("/credentials", async (req, res) => {
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const token = await client.tokens.create();
    res.json(token.iceServers);
  } catch (err) {
    console.error("❌ TURN error:", err.message);
    res.status(500).json({ message: "TURN unavailable" });
  }
});

export default router;
