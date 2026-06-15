// Shared helpers for the invite / RSVP functions (filename starts with _ so Netlify
// does not expose it as its own endpoint).

export const SITE = "https://www.amabiledirosa.com";
export const FROM = { email: "vibes@amabiledirosa.com", name: "Amabile di Rosa" };

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());
export const clean = (s, n) => String(s == null ? "" : s).slice(0, n).trim();

// Send a transactional email via Brevo. Sender must be a verified sender in Brevo.
export async function sendEmail(apiKey, to, subject, html) {
  if (!apiKey || !isEmail(to)) return;
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html })
    });
  } catch (_) {}
}

export function countRsvps(list) {
  const c = { in: 0, maybe: 0, out: 0 };
  (list || []).forEach((r) => { if (c[r.response] != null) c[r.response]++; });
  return c;
}

// Simple branded email shell
export function shell(inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2a1207">
    <div style="background:#E74529;border-radius:18px;padding:22px 24px;color:#FFF3E0">
      <div style="font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:#C6FF4D">Amabile di Rosa</div>
      ${inner}
    </div>
    <p style="font-size:12px;color:#9a8576;text-align:center;margin:14px 0">Friends. Wine. Good Times.</p>
  </div>`;
}
