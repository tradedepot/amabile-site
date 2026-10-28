// Outside: WhatsApp webhook from Meta (WhatsApp Cloud API). Set this URL in the Meta app's WhatsApp webhook,
// with the same verify token as WA_VERIFY_TOKEN, and subscribe to "messages".
// Keeps one thing: the WhatsApp profile name of people who message the Outside number, so the game can
// fill in their first name without asking. Delivery failures are logged.
import crypto from "node:crypto";
import { store, K } from "./_outside.mjs";

export const config = { path: "/api/outside-wa" };

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && process.env.WA_VERIFY_TOKEN &&
      url.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const secret = process.env.WA_APP_SECRET;
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") || "";
    const want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new Response("bad signature", { status: 401 });
  }
  let d; try { d = JSON.parse(raw); } catch { return new Response("ok"); }
  const s = store();
  for (const e of d.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    for (const ct of v.contacts || []) {
      const name = String((ct.profile && ct.profile.name) || "").trim().slice(0, 60);
      if (ct.wa_id && name) await s.set(K.waName("+" + ct.wa_id), name).catch(() => {});
    }
    for (const st of v.statuses || []) if (st.status === "failed") console.warn("whatsapp failed", st.recipient_id, JSON.stringify(st.errors || []).slice(0, 300));
  }
  return new Response("ok");
};
