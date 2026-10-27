// Paystack webhook for seat ordering. Set in Paystack dashboard > Settings > API Keys & Webhooks:
//   https://www.amabiledirosa.com/.netlify/functions/show-paystack-hook
// Backstop for guests who close the page before their status poll confirms payment.
import crypto from "node:crypto";
import { EVENT, K, store, json, idFromRef, paystackVerify, markPaid } from "./_show.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (!secret || sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return json({ ok: false, error: "signature" }, 401);
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json({ ok: true }); }
  if (evt.event !== "charge.success") return json({ ok: true });

  const tx = evt.data || {};
  const md = tx.metadata || {};
  // Outside (the bottle game) payments: bottles and top-ups.
  if (md.app === "outside") {
    const { handleOutsidePayment } = await import("./_outside_pay.mjs");
    await handleOutsidePayment(tx).catch((e) => console.error("outside payment", e));
    return json({ ok: true });
  }
  // Trade self-serve orders (from initPayment) carry paymentReference + orderId → route to the trade backend.
  // Same Amabile Paystack business, one webhook; we branch on metadata and hand trade events to paymentNotification.
  if (md.paymentReference || md.orderId) {
    const v = (await paystackVerify(tx.reference).catch(() => null)) || tx;
    if ((v.status || tx.status) === "success") {
      try {
        await fetch("https://us-east1-amabile-trade.cloudfunctions.net/paymentNotification", {
          method: "POST",
          headers: { "content-type": "application/json", "x-payment-secret": process.env.TRADE_PAYMENT_NOTIFY_SECRET || "" },
          body: JSON.stringify({
            orderId: md.orderId || null, adrRef: md.adrRef || null,
            paymentReference: md.paymentReference || null, reference: tx.reference, retailOutletId: md.retailOutletId || null,
            email: (tx.customer && tx.customer.email) || "", amount: (v.amount != null ? v.amount : tx.amount),
            currency: tx.currency || "NGN", status: "success", paidAt: v.paid_at || tx.paid_at || new Date().toISOString()
          })
        });
      } catch (e) { /* paymentNotification is idempotent; Paystack retries the webhook on non-200/failure */ }
    }
    return json({ ok: true });
  }
  const id = idFromRef(tx.reference);
  // Same Paystack account may serve other things: ignore anything that is not ours.
  if (!id || (tx.metadata && tx.metadata.event && tx.metadata.event !== EVENT.slug)) return json({ ok: true });

  const s = store();
  const o = await s.get(K.order(id), { type: "json" }).catch(() => null);
  if (!o || o.ref !== tx.reference) return json({ ok: true });

  // Re-check with the API rather than trusting the payload's amount alone.
  const verified = (await paystackVerify(tx.reference).catch(() => null)) || tx;
  await markPaid(s, o, verified, "webhook");
  return json({ ok: true });
};
