// Runner board API (password: SHOW_KEY, falls back to SAMPLING_KEY).
//   GET  ?k=…            → all orders + settings + cursor
//   GET  ?k=…&after=…    → only orders changed since cursor (cheap to poll every few seconds)
//   POST {k, action, id?, runner?, settings?}
//        action: claim | deliver | undo | approve | settings
import { K, store, json, clean, getSettings, saveOrder, boardAuthorised, adminAuthorised, DEFAULT_SETTINGS, WINES } from "./_show.mjs";

async function fetchAll(s, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = await Promise.all(keys.slice(i, i + 25).map((k) => s.get(k, { type: "json" }).catch(() => null)));
    out.push(...batch.filter(Boolean));
  }
  return out;
}

async function listKeys(s, prefix) {
  const { blobs } = await s.list({ prefix });
  return blobs.map((b) => b.key).sort();
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!boardAuthorised(url.searchParams.get("k") || "")) return json({ ok: false, error: "unauthorized" }, 401);
    const after = url.searchParams.get("after") || "";
    const evKeys = await listKeys(s, K.evPrefix);
    const cursor = evKeys.length ? evKeys[evKeys.length - 1] : "";
    let orders;
    if (!after) {
      orders = await fetchAll(s, await listKeys(s, K.ordersPrefix));
    } else {
      // Re-read a 20s overlap: writes from other function instances can land slightly out of
      // timestamp order, and the board merges by updatedAt, so overlap is harmless.
      const ts = Number((after.slice(K.evPrefix.length).split("-")[0]) || 0);
      const floor = K.evPrefix + String(Math.max(0, ts - 20000)).padStart(14, "0");
      const fresh = evKeys.filter((k) => k > floor);
      // Several events for one order: keep the newest snapshot only.
      const byId = new Map();
      for (const o of await fetchAll(s, fresh)) {
        const prev = byId.get(o.id);
        if (!prev || (o.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(o.id, o);
      }
      orders = [...byId.values()];
    }
    orders = orders.map(({ accessCode, ...o }) => o);
    return json({ ok: true, full: !after, cursor: cursor || after, orders, settings: await getSettings(s), now: Date.now() });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const isAdmin = adminAuthorised(d.ak);
  // Admin key check for the QR printer and the board's Unlock controls.
  if (d.action === "admin-check") return isAdmin ? json({ ok: true }) : json({ ok: false, error: "unauthorized" }, 401);
  if (!boardAuthorised(d.k || "") && !isAdmin) return json({ ok: false, error: "unauthorized" }, 401);
  if ((d.action === "settings" || d.action === "approve") && !isAdmin) return json({ ok: false, error: "admin_only" }, 403);

  if (d.action === "settings") {
    const cur = await getSettings(s);
    const inc = d.settings || {};
    const next = {
      open: typeof inc.open === "boolean" ? inc.open : cur.open,
      suya: typeof inc.suya === "boolean" ? inc.suya : cur.suya,
      soldOut: { ...cur.soldOut }
    };
    for (const w of WINES) if (inc.soldOut && typeof inc.soldOut[w.id] === "boolean") next.soldOut[w.id] = inc.soldOut[w.id];
    await s.setJSON(K.settings, { ...DEFAULT_SETTINGS, ...next });
    return json({ ok: true, settings: next });
  }

  const id = clean(d.id, 6).toUpperCase();
  const o = await s.get(K.order(id), { type: "json" }).catch(() => null);
  if (!o) return json({ ok: false, error: "not_found" }, 404);
  const runner = clean(d.runner, 30) || "Runner";

  if (d.action === "claim") {
    if (o.status === "claimed" && o.runner && o.runner !== runner && !d.force) return json({ ok: false, error: "taken", order: o }, 409);
    if (!["paid", "claimed"].includes(o.status)) return json({ ok: false, error: "state", order: o }, 409);
    o.status = "claimed"; o.runner = runner; o.claimedAt = Date.now();
  } else if (d.action === "deliver") {
    if (!["paid", "claimed"].includes(o.status)) return json({ ok: false, error: "state", order: o }, 409);
    o.status = "delivered"; o.runner = o.runner || runner; o.deliveredAt = Date.now();
  } else if (d.action === "undo") {
    if (o.status === "delivered") { o.status = "claimed"; o.deliveredAt = null; }
    else if (o.status === "claimed") { o.status = "paid"; o.runner = ""; o.claimedAt = null; }
    else return json({ ok: false, error: "state", order: o }, 409);
  } else if (d.action === "approve") {
    // For orders flagged "review" (amount mismatch) after a human has checked Paystack.
    if (o.status !== "review") return json({ ok: false, error: "state", order: o }, 409);
    o.status = "paid"; o.paidAt = Date.now(); o.paidVia = "manual:" + runner;
  } else {
    return json({ ok: false, error: "action" }, 400);
  }
  await saveOrder(s, o);
  const { accessCode, ...view } = o;
  return json({ ok: true, order: view });
};
