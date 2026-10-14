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
