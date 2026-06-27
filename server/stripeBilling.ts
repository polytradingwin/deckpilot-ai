import Stripe from "stripe";
import type { UserAccount } from "./auth";
import { addCredits, getUserById } from "./auth";

type CreditPack = {
  id: "starter" | "monthly" | "pro";
  name: string;
  credits: number;
  amount: number;
  currency: "usd";
};

export const creditPacks: CreditPack[] = [
  { id: "starter", name: "DeckEvo Starter Credits", credits: 75, amount: 299, currency: "usd" },
  { id: "monthly", name: "DeckEvo Monthly Credits", credits: 600, amount: 1999, currency: "usd" },
  { id: "pro", name: "DeckEvo Pro Credits", credits: 3500, amount: 9999, currency: "usd" },
];

let stripeClient: Stripe | null = null;

export function getStripeStatus() {
  return {
    publicKeyConfigured: Boolean(process.env.STRIPE_PUBLIC_KEY),
    secretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
  };
}

export function getStripePublicConfig() {
  return {
    publicKey: process.env.STRIPE_PUBLIC_KEY || "",
    packs: creditPacks.map(({ id, credits, amount, currency }) => ({ id, credits, amount, currency })),
  };
}

export async function createCheckoutSession(user: UserAccount, packId: string) {
  const pack = creditPacks.find((item) => item.id === packId);
  if (!pack) throw new Error("Unknown credit pack.");

  const origin = getAppOrigin();
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pack.currency,
          unit_amount: pack.amount,
          product_data: {
            name: pack.name,
            description: `${pack.credits} DeckEvo credits`,
          },
        },
      },
    ],
    metadata: {
      userId: user.id,
      packId: pack.id,
      credits: String(pack.credits),
    },
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
  });
}

export async function fulfillCheckoutSession(sessionId: string, expectedUserId?: string) {
  if (!sessionId.startsWith("cs_")) throw new Error("Invalid Stripe checkout session.");

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (expectedUserId && session.client_reference_id !== expectedUserId) {
    throw new Error("Stripe session does not belong to the current user.");
  }

  if (session.status !== "complete" || session.payment_status !== "paid") {
    return { fulfilled: false, user: expectedUserId ? await getUserById(expectedUserId) : null };
  }

  const userId = session.client_reference_id || session.metadata?.userId || "";
  const credits = Number(session.metadata?.credits || 0);
  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    throw new Error("Stripe session is missing credit metadata.");
  }

  await addCredits(userId, credits, "stripe_checkout", session.id);
  return { fulfilled: true, user: await getUserById(userId) };
}

export async function handleStripeWebhook(payload: Buffer, signature: string | undefined) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signature) throw new Error("Missing Stripe signature.");

  const event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    await fulfillCheckoutSession(session.id);
  }
  return { received: true, type: event.type };
}

function getStripe() {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

function getAppOrigin() {
  return (process.env.APP_ORIGIN || process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173").split(",")[0].trim().replace(/\/$/, "");
}
