// check-stripe-payment.js
import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function main() {
  const customerId = 'cus_UURhfAhHVqfyFF';

  const customer = await stripe.customers.retrieve(customerId);
  console.log("Customer:", JSON.stringify({
    id: customer.id,
    email: customer.email,
    default_source: customer.default_source,
    invoice_settings: customer.invoice_settings
  }, null, 2));

  const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  console.log("Payment methods (card):", JSON.stringify(methods.data.map(m => ({
    id: m.id,
    brand: m.card?.brand,
    last4: m.card?.last4,
    created: new Date(m.created * 1000).toISOString()
  })), null, 2));
}

main().catch((err) => {
  console.error("Erreur:", err.message);
  process.exit(1);
});