// Outside: the WhatsApp inbox, answered from Slack.
// Someone messages the Outside number -> we keep it -> it lands in #outside-inbox, one thread per person.
// Ops reply in that thread -> it goes to their WhatsApp (only within 24 hours of their last message: WhatsApp's rule).
// Our copy of every message is the record. Slack's free plan hides history after 90 days; that's fine.
import { store, K, getJSON, listKeys, fetchAll, levelFor, wine, sendText, waMedia, phoneKey, maskPhone, now, SITE, TZ_OFFSET_MS } from "./_outside.mjs";
import * as S from "./_outside_slack.mjs";

const HOUR = 3600 * 1000, DAY = 24 * HOUR;
export const REPLY_WINDOW = 24 * HOUR;      // WhatsApp: free text only within 24h of their last message
export const FRESH_THREAD = 80 * DAY;       // after this long quiet, start a new thread with a recap (Slack hides >90 days)

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (t) => { const d = new Date(t + TZ_OFFSET_MS); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
function ago(t) {
  const h = Math.floor((now() - t) / HOUR);
  if (h < 48) return h <= 1 ? "an hour ago" : h + " hours ago";
  return Math.floor(h / 24) + " days ago";
}
export function prettyPhone(e164) {
  const d = phoneKey(e164);
  return d.startsWith("234") && d.length === 13 ? `+234 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : "+" + d;
}
const quote = (t) => String(t).split("\n").map((l) => "> " + l).join("\n");
const cut = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "application/pdf": "pdf" };

// What someone sent, as words for Slack and our record. Media comes along as an id to fetch.
// Locations are never shown: Outside doesn't do where.
export function describe(m) {
  const media = (kind, o, label) => ({ text: o.caption ? label + ": " + o.caption : label, media: { id: o.id, kind, mime: o.mime_type || "", filename: o.filename || "" } });
  switch (m.type) {
    case "text": return { text: (m.text && m.text.body) || "" };
    case "image": return media("photo", m.image || {}, "Photo");
    case "video": return media("video", m.video || {}, "Video");
    case "audio": return media("voice note", m.audio || {}, m.audio && m.audio.voice ? "Voice note" : "Audio");
    case "document": return media("file", m.document || {}, "File" + (m.document && m.document.filename ? " (" + m.document.filename + ")" : ""));
    case "sticker": return media("sticker", m.sticker || {}, "Sticker");
    case "location": return { text: "Shared a location (not shown here)" };
    case "contacts": return { text: "Shared a contact: " + (m.contacts || []).map((c) => (c.name && c.name.formatted_name) || "").filter(Boolean).join(", ") };
    case "button": return { text: (m.button && m.button.text) || "Tapped a button" };
    case "interactive": { const i = m.interactive || {}; const r = i.button_reply || i.list_reply || {}; return { text: r.title || "Tapped a button" }; }
    case "reaction": return m.reaction && m.reaction.emoji ? { text: "Reacted " + m.reaction.emoji } : null;
    default: return { text: "Sent something WhatsApp couldn't pass on" };
  }
}

// Who they are to Outside: level and the last bottle sent to them.
const BOTTLE_STATUS = { waiting: "not claimed yet", on_way: "on its way to their table", served: "served", declined: "not claimed", link: "card not opened yet", review: "payment being checked" };
async function context(s, phone) {
  const p = await getJSON(s, K.player(phone));
  if (!p) return { name: "", level: "", line: "Not on Andiamo yet" };
  const keys = await listKeys(s, K.inboxPrefix(phone));
  const items = (await fetchAll(s, keys)).sort((a, b) => b.at - a.at);
  let line = "No bottles yet";
  if (items.length) {
    const b = await getJSON(s, K.bottle(items[0].id));
    if (b) {
      const w = wine(b.wine);
      line = `Last bottle: ${w ? w.label : "Amabile"} from ${b.anon ? "someone" : (b.fromName || "a friend")}, ${day(b.createdAt)}, ${BOTTLE_STATUS[b.status] || b.status}`;
    }
  }
  return { name: p.name || "", level: levelFor(p.received).name, line };
}

async function saveMsg(s, phone, m) { await s.setJSON(K.convMsg(phone), m); }
async function recent(s, phone, n) {
  const keys = (await listKeys(s, K.convMsgPrefix(phone))).slice(-n);
  return fetchAll(s, keys);
}

// A new thread for this person: who they are, a recap if an older thread went quiet, then what they just said.
async function openThread(s, conv, phone, firstText) {
  const ctx = await context(s, phone);
  if (ctx.name) conv.name = ctx.name;
  const label = conv.name ? (conv.waName && conv.waName !== conv.name ? `${conv.name} (WhatsApp: ${conv.waName})` : conv.name) : (conv.waName || "Unknown");
  let text = `*${S.slackEscape(label)}* · ${prettyPhone(phone)}${ctx.level ? " · " + ctx.level : ""}\n${S.slackEscape(ctx.line)}`;
  if (conv.threadTs) {
    const earlier = (await recent(s, phone, 6)).slice(0, -1); // the newest is the message being posted now
    if (earlier.length) text += "\n\n_Earlier_\n" + earlier.map((m) =>
      `${day(m.at)} · ${m.dir === "in" ? "Them" : "Us (" + (m.by || "ops") + ")"}: ${S.slackEscape(cut(m.text, 160))}`).join("\n");
  }
  text += "\n\n" + quote(S.slackEscape(firstText));
  const r = await S.post(text);
  if (!r.ok || !r.ts) return null;
  conv.threadTs = r.ts; conv.threadAt = now();
  await s.set(K.slackThread(r.ts), phoneKey(phone));
  return r.ts;
}

// Backup: if Slack isn't set up or refuses the message, ops still hear about it by email.
async function emailOps(name, phone, text, why) {
  const to = String(process.env.OUTSIDE_OPS_EMAIL || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!to.length || !process.env.BREVO_API_KEY) return false;
  const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<p><b>${esc(name || "Someone")}</b> · ${esc(prettyPhone(phone))}</p>
    <blockquote style="margin:0;padding:8px 12px;border-left:3px solid #c9a27a">${esc(text).replace(/\n/g, "<br>")}</blockquote>
    <p style="color:#6b5646">${esc(why)} It's saved in Andiamo.</p><p><a href="${SITE}/admin">Open Andiamo admin</a></p>`;
  const { sendEmail } = await import("./_lib.mjs");
  for (const addr of to) await sendEmail(process.env.BREVO_API_KEY, addr, "WhatsApp from " + (name || prettyPhone(phone)), html);
  return true;
}

async function toSlack(s, conv, phone, d) {
  const name = conv.name || conv.waName || "";
  if (!S.slackReady()) return emailOps(name, phone, d.text, "Slack isn't connected, so this came by email.");
  const quiet = now() - (conv.lastAt || 0) > FRESH_THREAD;
  let ts = conv.threadTs && !quiet ? conv.threadTs : null, posted;
  if (!ts) { ts = await openThread(s, conv, phone, d.text); posted = !!ts; }
  else posted = (await S.post(S.slackEscape(d.text), { threadTs: ts, broadcast: true })).ok;
  if (!posted) return emailOps(name, phone, d.text, "Slack didn't take this message, so it came by email.");
  if (d.media) {
    const f = await waMedia(d.media.id);
    const ext = EXT[(f && f.mime) || d.media.mime] || "bin";
    const filename = d.media.filename || `${d.media.kind.replace(/\s/g, "-")}-${day(now()).replace(" ", "")}.${ext}`;
    const up = f ? await S.upload(ts, { bytes: f.bytes, filename, title: d.media.kind }) : { ok: false };
    if (!up.ok) await S.post(`_Couldn't show the ${d.media.kind} here (too large or expired)._`, { threadTs: ts });
  }
  return true;
}

// Meta webhook: messages people sent to the Outside number.
export async function handleInbound(value) {
  const s = store();
  const names = {};
  for (const ct of value.contacts || []) {
    const n = String((ct.profile && ct.profile.name) || "").trim().slice(0, 60);
    if (ct.wa_id && n) { names[ct.wa_id] = n; await s.set(K.waName("+" + ct.wa_id), n).catch(() => {}); }
  }
  const msgs = [...(value.messages || [])].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  for (const m of msgs) {
    if (!m.id || !m.from || (await s.get(K.seen("wa:" + m.id)))) continue;
    const d = describe(m);
    if (d && d.text) {
      const phone = "+" + phoneKey(m.from);
      const conv = (await getJSON(s, K.conv(phone))) || { phone };
      if (names[m.from]) conv.waName = names[m.from];
      const at = Number(m.timestamp) * 1000 || now();
      await saveMsg(s, phone, { dir: "in", at, text: d.text, kind: m.type, waId: m.id });
      await toSlack(s, conv, phone, d);
      conv.lastIn = Math.max(conv.lastIn || 0, at); conv.lastAt = Math.max(conv.lastAt || 0, at);
      await s.setJSON(K.conv(phone), conv);
    }
    await s.set(K.seen("wa:" + m.id), "1");
  }
}

// Meta webhook: a reply we sent didn't arrive. Say so in their thread.
export async function handleStatuses(value) {
  const s = store();
  for (const st of value.statuses || []) {
    // One line per delivery update, so a code that "never arrived" can be traced in the function logs.
    console.log("wa status", st.status, maskPhone("+" + (st.recipient_id || "")), (st.pricing && st.pricing.category) || "", (st.errors || []).map((e) => e.code + " " + ((e.error_data && e.error_data.details) || e.title || "")).join("; ").slice(0, 200));
    if (st.status !== "failed") continue;
    const why = (st.errors || []).map((e) => (e.error_data && e.error_data.details) || e.title || e.message).filter(Boolean).join("; ");
    console.warn("whatsapp failed", st.recipient_id, why.slice(0, 300));
    const map = st.id ? await getJSON(s, K.waOut(st.id)) : null;
    if (map && map.ts && S.slackReady()) await S.post(`Didn't reach them${why ? ": " + S.slackEscape(why) : "."}`, { threadTs: map.ts });
  }
}

// Slack: someone on the team typed in #outside-inbox. Only replies inside a person's thread go to WhatsApp.
// Notes for the team stay in Slack: start with // or tag a teammate.
export async function handleSlackEvent(ev) {
  if (!ev || ev.type !== "message" || ev.channel !== S.slackChannel()) return { skip: "other" };
  if (ev.bot_id || (ev.subtype && !["thread_broadcast", "file_share"].includes(ev.subtype))) return { skip: "not_a_person" };
  if (!ev.thread_ts || ev.thread_ts === ev.ts) return { skip: "not_in_thread" };
  const s = store();
  const key = await s.get(K.slackThread(ev.thread_ts));
  if (!key) return { skip: "unknown_thread" };
  if (S.isInternal(ev.text)) return { skip: "internal" };
  const say = (t) => S.post(t, { threadTs: ev.thread_ts });
  const text = S.toWhatsApp(ev.text);
  const files = (ev.files || []).length > 0;
  if (!text) { if (files) await say("Not sent. Only text goes to WhatsApp, so type it as a message."); return { skip: "no_text" }; }

  const phone = "+" + key;
  const conv = (await getJSON(s, K.conv(phone))) || { phone };
  const name = conv.name || conv.waName || "They";
  if (!conv.lastIn || now() - conv.lastIn > REPLY_WINDOW) {
    await say(`Not sent. ${S.slackEscape(name)} last wrote ${conv.lastIn ? ago(conv.lastIn) : "never"}. WhatsApp only allows a reply within 24 hours of their last message.`);
    return { ok: false, error: "window" };
  }
  const r = await sendText(phone, text);
  if (!r.ok) {
    await say(`Not sent: ${S.slackEscape((r.error && r.error.message) || (r.skip === "no-whatsapp" ? "WhatsApp isn't connected" : "WhatsApp refused it"))}`);
    return { ok: false, error: "whatsapp" };
  }
  const by = ev.user ? await S.userName(ev.user) : "ops";
  await saveMsg(s, phone, { dir: "out", at: now(), text, by, slackTs: ev.ts, waId: r.id || null });
  if (r.id) await s.setJSON(K.waOut(r.id), { phone: key, ts: ev.thread_ts });
  conv.lastOut = now(); conv.lastAt = now();
  await s.setJSON(K.conv(phone), conv);
  await S.react(ev.ts, "white_check_mark");
  if (files) await say("The text went. The file stayed here: only text goes to WhatsApp.");
  return { ok: true };
}
