// Outside: Slack Events API endpoint. Replies typed in a person's thread in #outside-inbox go to their WhatsApp.
// Slack app setup: Event Subscriptions -> Request URL = this path, bot event "message.groups".
import { store, K } from "../lib/_outside.mjs";
import { verifySlack } from "../lib/_outside_slack.mjs";
import { handleSlackEvent } from "../lib/_outside_inbox.mjs";

export const config = { path: "/api/outside-slack" };

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  let d; try { d = JSON.parse(raw); } catch { return new Response("bad", { status: 400 }); }
  // Slack checks the URL once when it's saved. Before the signing secret is in Netlify, just answer it.
  if (d.type === "url_verification") {
    if (process.env.SLACK_SIGNING_SECRET && !verifySlack(req.headers, raw)) return new Response("bad signature", { status: 401 });
    return new Response(JSON.stringify({ challenge: d.challenge }), { headers: { "content-type": "application/json" } });
  }
  if (!verifySlack(req.headers, raw)) return new Response("bad signature", { status: 401 });
  if (d.type !== "event_callback" || !d.event) return new Response("ok");
  // Slack retries if we take over 3 seconds. Handle each event once so nothing goes out twice.
  const s = store();
  const seenKey = K.seen("slack:" + (d.event_id || d.event.client_msg_id || d.event.ts));
  if (await s.get(seenKey)) return new Response("ok");
  await s.set(seenKey, "1");
  try { await handleSlackEvent(d.event); }
  catch (err) { console.error("outside-slack", String(err && err.stack || err).slice(0, 500)); }
  return new Response("ok");
};
