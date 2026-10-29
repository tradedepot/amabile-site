// Guest API for seat ordering.
//   GET  /.netlify/functions/show-order               → menu, prices, availability, Paystack public key
//   GET  /.netlify/functions/show-order?id=K7P&ref=…  → status of one order (self-heals: verifies
//                                                        with Paystack if still pending)
//   POST /.netlify/functions/show-order               → create order + Paystack transaction
import {
  EVENT, WINES, K, store, json, clean, isEmail, getSettings, isOpen, tableLabel, newCode,
  price, publicView, saveOrder, paystackInit, paystackVerify, markPaid
} from "../lib/_show.mjs";


export default async (req) => {
  const s = store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = clean(url.searchParams.get("id"), 6).toUpperCase();
    const ref = clean(url.searchParams.get("ref"), 40);
    if (id) {
      let o = await s.get(K.order(id), { type: "json" }).catch(() => null);
      if (!o || o.ref !== ref) return json({ ok: false, error: "not_found" }, 404);
      if (o.status === "pending" && process.env.PAYSTACK_SECRET_KEY) {
        const tx = await paystackVerify(ref).catch(() => null);
        if (tx) o = await markPaid(s, o, tx, "poll");
      }
      return json({ ok: true, order: publicView(o) });
    }
    const settings = await getSettings(s);
    return json({
      ok: true,
      open: isOpen(settings),
      event: { name: EVENT.name, short: EVENT.short, venue: EVENT.venue, maxBottles: EVENT.maxBottles, suyaMin: EVENT.suyaMin },
      suya: settings.suya,
      wines: WINES.map((w) => ({ ...w, soldOut: !!settings.soldOut[w.id] })),
      paystackKey: process.env.PAYSTACK_PUBLIC_KEY || ""
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const settings = await getSettings(s);
  if (!isOpen(settings)) return json({ ok: false, error: "closed" }, 403);

  const p = price(d.items, settings);
  if (p.error) return json({ ok: false, error: p.error, wine: p.wine }, 400);

  const name = clean(d.name, 60);
  const phone = clean(d.phone, 20).replace(/[^\d+]/g, "");
  const email = clean(d.email, 120).toLowerCase();
  if (!name) return json({ ok: false, error: "name" }, 400);
  if (phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
  if (!isEmail(email)) return json({ ok: false, error: "email" }, 400);

  // Tables only: the table QR carries the number, the general QR asks for it.
  const table = clean(d.table, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!table) return json({ ok: false, error: "where" }, 400);
  const where = tableLabel(table);

  let id = "";
  for (let i = 0; i < 6 && !id; i++) {
    const c = newCode(i < 4 ? 3 : 4);
    if (!(await s.get(K.order(c)).catch(() => null))) id = c;
  }
  if (!id) return json({ ok: false, error: "busy" }, 503);

  const o = {
    id,
    ref: "WM-" + id + "-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    event: EVENT.slug,
    status: "pending",
    createdAt: Date.now(),
    items: p.items, bottles: p.bottles, total: p.total, suya: p.suya,
    table, where, name, phone, email,
    note: clean(d.note, 140),
    utm: Object.fromEntries(Object.entries(d.utm || {}).slice(0, 8).map(([k, v]) => [clean(k, 30), clean(v, 100)]))
  };

  if (!process.env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: "payments_not_configured" }, 503);
  const init = await paystackInit(o, url.origin + "/bachelor?order=" + id + "&ref=" + encodeURIComponent(o.ref));
  if (!init) return json({ ok: false, error: "payment_init" }, 502);

  o.accessCode = init.access_code;
  await saveOrder(s, o);

  return json({
    ok: true,
    order: publicView(o),
    ref: o.ref,
    accessCode: init.access_code,
    authorizationUrl: init.authorization_url
  });
};
