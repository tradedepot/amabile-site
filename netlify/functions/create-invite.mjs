// Store a new invite (keyed by its short code) and, if the host gave an email,
// send them their private "Pour List" link so RSVPs find their way back.
import { getStore } from "@netlify/blobs";
import { SITE, json, isEmail, clean, sendEmail, shell } from "./_lib.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const code = clean(d.code, 40).toLowerCase();
  const token = clean(d.token, 64);
  if (!code || !token || !/^[a-z0-9-]{4,40}$/.test(code)) return json({ ok: false, error: "bad_code" }, 400);

  const meta = {
    code, token,
    host: clean(d.host, 80),
    vibe: clean(d.vibe, 20),
    vibeLabel: clean(d.vibeLabel, 40),
    when: clean(d.when, 120),
    where: clean(d.where, 160),
    note: clean(d.note, 240),
    email: clean(d.email, 160),
    createdAt: Date.now()
  };

  const store = getStore("amabile-invites");
  await store.setJSON("inv:" + code, meta);
  const existing = await store.get("rsvps:" + code, { type: "json" }).catch(() => null);
  if (!existing) await store.setJSON("rsvps:" + code, []);

  // Email the host their Pour List link (the tie-back).
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey && isEmail(meta.email)) {
    const hostLink = `${SITE}/pourlist.html?c=${encodeURIComponent(code)}&k=${encodeURIComponent(token)}`;
    const shareLink = `${SITE}/i/${encodeURIComponent(code)}`;
    const html = shell(`
      <h2 style="font-family:Arial;margin:10px 0 6px;font-size:22px">Your Pour List is live 🍷</h2>
      <p style="margin:0 0 14px;color:#ffe9d9">Every time a friend RSVPs to <b>${meta.vibeLabel || "your invite"}</b>, you'll get an email — and they all collect here:</p>
      <p style="margin:0 0 18px"><a href="${hostLink}" style="background:#C6FF4D;color:#15260a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;display:inline-block">See who's coming →</a></p>
      <p style="margin:0;color:#ffd9c9;font-size:13px">Bookmark that link. To invite people, share this one: <a href="${shareLink}" style="color:#C6FF4D">${shareLink}</a></p>
    `);
    await sendEmail(apiKey, meta.email, `Your Pour List is live 🍷 ${meta.vibeLabel || "Good times"}`, html);
  }

  return json({ ok: true });
};
