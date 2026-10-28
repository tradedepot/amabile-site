// Outside: the Slack side of the WhatsApp inbox. A small client for the few Slack Web API calls we use,
// request signing, and turning Slack's message format into WhatsApp's.
// Env: SLACK_BOT_TOKEN (xoxb-...), SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID (the private #outside-inbox channel).
import crypto from "node:crypto";

const API = "https://slack.com/api/";
export const slackReady = () => !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
export const slackChannel = () => process.env.SLACK_CHANNEL_ID || "";

async function call(method, body, form = false) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "no_token" };
  try {
    const r = await fetch(API + method, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8" },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({ ok: false, error: "bad_json" }));
    if (!j.ok) console.warn("slack", method, j.error);
    return j;
  } catch (e) {
    console.warn("slack", method, String(e));
    return { ok: false, error: "network" };
  }
}

// Post to #outside-inbox. With threadTs it goes into that person's thread; broadcast also shows it in the channel.
export function post(text, { threadTs, broadcast } = {}) {
  const body = { channel: slackChannel(), text, unfurl_links: false, unfurl_media: false };
  if (threadTs) body.thread_ts = threadTs;
  if (threadTs && broadcast) body.reply_broadcast = true;
  return call("chat.postMessage", body);
}

export const react = (ts, name) => call("reactions.add", { channel: slackChannel(), timestamp: ts, name });

// Display name of whoever replied, for our record. Falls back to their Slack id.
export async function userName(id) {
  const j = await call("users.info", { user: id }, true);
  const p = (j.user && j.user.profile) || {};
  return p.display_name || p.real_name || (j.user && j.user.name) || id;
}

// Photos, voice notes and files go into the thread as real files (Slack's external upload flow).
export async function upload(threadTs, { bytes, filename, title, comment }) {
  const a = await call("files.getUploadURLExternal", { filename, length: String(bytes.length) }, true);
  if (!a.ok || !a.upload_url) return a;
  try {
    const r = await fetch(a.upload_url, { method: "POST", body: bytes });
    if (!r.ok) return { ok: false, error: "upload_" + r.status };
  } catch { return { ok: false, error: "upload_network" }; }
  const body = { files: [{ id: a.file_id, title: title || filename }], channel_id: slackChannel(), thread_ts: threadTs };
  if (comment) body.initial_comment = comment;
  return call("files.completeUploadExternal", body);
}

// Slack signs every request: v0=HMAC_SHA256(secret, "v0:{timestamp}:{body}"). Reject anything older than 5 minutes.
export function verifySlack(headers, raw) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;
  const ts = Number(headers.get("x-slack-request-timestamp") || 0);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const sig = headers.get("x-slack-signature") || "";
  const want = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

// Text people send us, made safe for Slack (it treats &, < and > as markup).
export const slackEscape = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A teammate tagged, or @here / @channel: the message is for the team, not the customer.
export const isInternal = (text) => /^\s*\/\//.test(text || "") || /<[@!][^>]+>/.test(text || "");

// Slack's markup to plain WhatsApp text. Bold, italics and strike-through use the same symbols in both.
export function toWhatsApp(text) {
  return String(text || "")
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, (_, url, label) => (label === url || label === url.replace(/^https?:\/\//, "") ? url : `${label} (${url})`))
    .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<tel:[^|>]+\|([^>]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .trim();
}
