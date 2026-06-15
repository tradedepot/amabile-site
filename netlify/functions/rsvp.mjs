// Record an RSVP against an invite code, email the host about it, and (optionally)
// add the responder to the Brevo newsletter list if they opted in.
import { getStore } from "@netlify/blobs";
import { SITE, json, isEmail, clean, sendEmail, shell, countRsvps } from "./_lib.mjs";

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

  // Optional: responder opts into the newsletter.
  const rEmail = clean(d.email, 160);
  if (apiKey && d.optin && isEmail(rEmail)) {
    try {
      const body = { email: rEmail, attributes: { FIRSTNAME: entry.name }, updateEnabled: true };
      const lid = process.env.BREVO_LIST_ID;
      if (lid) body.listIds = [Number(lid)];
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body)
      });
    } catch (_) {}
  }

  // Email the host about this RSVP (the tie-back).
  const meta = await store.get("inv:" + code, { type: "json" }).catch(() => null);
  if (apiKey && meta && isEmail(meta.email)) {
    const hostLink = `${SITE}/pourlist.html?c=${encodeURIComponent(code)}&k=${encodeURIComponent(meta.token || "")}`;
    const verb = response === "in" ? "is IN 🎉" : response === "maybe" ? "might come 🤔" : "can't make it 😢";
    const bringLine = response === "in" && entry.bringing ? `<p style="margin:0 0 12px;color:#ffd9c9">Bringing: <b>${entry.bringing}</b></p>` : "";
    const html = shell(`
      <h2 style="font-family:Arial;margin:10px 0 6px;font-size:22px">${entry.name} ${verb}</h2>
      <p style="margin:0 0 6px;color:#ffe9d9">for <b>${meta.vibeLabel || "your invite"}</b>${meta.when ? " — " + meta.when : ""}</p>
      ${bringLine}
      <p style="margin:10px 0 16px;color:#ffe9d9">So far: <b>${counts.in} in</b> · ${counts.maybe} maybe · ${counts.out} out</p>
      <p style="margin:0"><a href="${hostLink}" style="background:#C6FF4D;color:#15260a;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block">Open your Pour List →</a></p>
    `);
    const subj = `${entry.name} ${response === "in" ? "is in" : response === "maybe" ? "might come" : "is out"} — ${meta.vibeLabel || "your invite"}`;
    await sendEmail(apiKey, meta.email, subj, html);
  }

  return json({ ok: true, counts });
};
