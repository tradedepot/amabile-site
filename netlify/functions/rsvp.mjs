// Record an RSVP against an invite code, email the host about it, and (optionally)
// add the responder to the Brevo newsletter list if they opted in.
import { getStore } from "@netlify/blobs";
import { INVITE_SITE, json, isEmail, clean, sendEmail, shell, button, countRsvps, playlistUrl } from "./_lib.mjs";
import { bqInsert } from "./_bq.mjs";

const RESPONSES = ["in", "out", "maybe"];

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const code = clean(d.code, 40).toLowerCase();
  if (!code) return json({ ok: false, error: "bad_code" }, 400);

  const response = RESPONSES.includes(d.response) ? d.response : "in";
  const entry = {
    name: clean(d.name, 80) || "A friend",
    response,
    bringing: clean(d.bringing, 24),
    at: Date.now()
  };

  const store = getStore("amabile-invites");
  const list = (await store.get("rsvps:" + code, { type: "json" }).catch(() => null)) || [];
  list.push(entry);
  await store.setJSON("rsvps:" + code, list);
  const counts = countRsvps(list);

  const apiKey = process.env.BREVO_API_KEY;
  const rEmail = clean(d.email, 160);
  const optedIn = d.optin && isEmail(rEmail);
  const meta = await store.get("inv:" + code, { type: "json" }).catch(() => null);
  const vlabel = (meta && meta.vibeLabel) || "good times";

  // Mirror to BigQuery for analysis (best-effort).
  await bqInsert("rsvps", {
    code,
    name: entry.name || null,
    response,
    bringing: entry.bringing || null,
    responder_email: optedIn ? rEmail : null,
    created_at: new Date(entry.at).toISOString()
  });

  // Responder opted in → add to the list (tagged with who invited them + the event) AND send the playlist.
  if (apiKey && optedIn) {
    const lid = process.env.BREVO_LIST_ID;
    const attrs = { FIRSTNAME: entry.name, SOURCE: "invite" };
    if (meta) {
      if (meta.host) attrs.HOST = clean(meta.host, 80);          // the inviter
      if (meta.vibeLabel) attrs.CAMPAIGN = clean(meta.vibeLabel, 80); // the event type
      if (meta.where) attrs.VENUE = clean(meta.where, 80);       // the event location
    }
    async function addContact(a) {
      const b = { email: rEmail, attributes: a, updateEnabled: true };
      if (lid) b.listIds = [Number(lid)];
      const r = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(b)
      });
      return { ok: r.ok || r.status === 204, text: r.ok ? "" : await r.text() };
    }
    try {
      const res = await addContact(attrs);
      if (!res.ok && /attribute/i.test(res.text)) await addContact({ FIRSTNAME: entry.name }); // fallback if attrs missing
    } catch (_) {}

    const purl = playlistUrl(meta ? meta.vibe : "beach");
    const evt = meta && meta.host ? `${meta.host}'s ${vlabel}` : vlabel;
    const whenBit = meta && meta.when ? ` — ${meta.when}` : "";
    const phtml = shell(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#2a1207">You're in — here's the soundtrack 🎶</h2>
      <p style="margin:0 0 18px;color:#6a4634">Get in the mood for <b>${evt}</b>${whenBit}. See you there 🍷</p>
      <p style="margin:0 0 6px">${button(purl, "▶ Play on Spotify", "#1DB954")}</p>
    `);
    await sendEmail(apiKey, rEmail, `Your ${vlabel} playlist 🎶`, phtml);
  }

  // Email the host about this RSVP (the tie-back).
  if (apiKey && meta && isEmail(meta.email)) {
    const hostLink = `${INVITE_SITE}/pourlist.html?c=${encodeURIComponent(code)}&k=${encodeURIComponent(meta.token || "")}`;
    const verb = response === "in" ? "is IN 🎉" : response === "maybe" ? "might come 🤔" : "can't make it 😢";
    const bringLine = response === "in" && entry.bringing ? `<p style="margin:0 0 12px;color:#6a4634">Bringing: <b>${entry.bringing}</b></p>` : "";
    const html = shell(`
      <h2 style="margin:0 0 6px;font-size:22px;color:#2a1207">${entry.name} ${verb}</h2>
      <p style="margin:0 0 6px;color:#6a4634">for <b>${vlabel}</b>${meta.when ? " — " + meta.when : ""}</p>
      ${bringLine}
      <p style="margin:10px 0 18px;color:#6a4634">So far: <b>${counts.in} in</b> · ${counts.maybe} maybe · ${counts.out} out</p>
      <p style="margin:0">${button(hostLink, "Open your Pour List →")}</p>
    `);
    const subj = `${entry.name} ${response === "in" ? "is in" : response === "maybe" ? "might come" : "is out"} — ${vlabel}`;
    await sendEmail(apiKey, meta.email, subj, html);
  }

  return json({ ok: true, counts });
};
