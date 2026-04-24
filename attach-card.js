import dotenv from "dotenv";
dotenv.config();

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const pm = await stripe.paymentMethods.attach("pm_card_visa", {
  customer: "cus_TwLoPufRfcCNVz"
});

console.log("✅ Carte attachée:", pm.id);