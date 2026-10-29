// Outside: Paystack webhook handler, called from show-paystack-hook.mjs for metadata.app === "outside".
import { store, K, getJSON, paystackVerify } from "./_outside.mjs";
import { markBottlePaid, markTopupPaid } from "./_outside_flow.mjs";

export async function handleOutsidePayment(tx) {
  const s = store();
  const ref = String(tx.reference || "");
  const rv = await s.get(K.ref(ref)).catch(() => null);
  if (!rv) return;
  // Re-check with the API rather than trusting the payload.
  const verified = (await paystackVerify(ref).catch(() => null)) || tx;
  if (String(rv).startsWith("T:")) {
    const b = await getJSON(s, K.bottle(String(rv).slice(2)));
    if (b && b.topup && b.topup.ref === ref) await markTopupPaid(s, b, verified, "webhook");
    return;
  }
  const b = await getJSON(s, K.bottle(rv));
  if (b && b.ref === ref) await markBottlePaid(s, b, verified, "webhook");
}
