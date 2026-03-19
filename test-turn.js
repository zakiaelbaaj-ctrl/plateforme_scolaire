import "dotenv/config";
import twilio from "twilio";

console.log("SID =", process.env.TWILIO_ACCOUNT_SID);
console.log("TOKEN =", process.env.TWILIO_AUTH_TOKEN ? "OK" : "MANQUANT");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

try {
  const token = await client.tokens.create();
  console.log("✅ TURN OK");
  console.log(token.iceServers);
} catch (err) {
  console.error("❌ TWILIO ERROR");
  console.error(err.message);
}
