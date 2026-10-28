// Outside: WhatsApp webhook from Meta (WhatsApp Cloud API). Set this URL in the Meta app's WhatsApp webhook,
// with the same verify token as WA_VERIFY_TOKEN, and subscribe to "messages".
// Messages people send to the Outside number go to Slack #outside-inbox (see _outside_inbox.mjs).
// Their WhatsApp profile name is kept so the game can fill in their first name without asking.
import crypto from "node:crypto";
import { handleInbound, handleStatuses } from "./_outside_inbox.mjs";

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
  for (const e of d.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    try {
      await handleInbound(v);
      await handleStatuses(v);
    } catch (err) { console.error("outside-wa", String(err && err.stack || err).slice(0, 500)); }
  }
  return new Response("ok");
};
