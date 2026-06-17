// Shared helpers for the invite / RSVP functions (filename starts with _ so Netlify
// does not expose it as its own endpoint).

// Public site (for store/find-a-bottle links). Invite/RSVP links use the short domain.
export const SITE = "https://www.amabiledirosa.com";
export const INVITE_SITE = "https://wya.to";
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

// Occasion playlists (Spotify). Games night + Just because reuse the closest mood.
export const PLAYLIST = {
  linkup:   "6na6gvlPZ5mMNIs73zviV8", // casual link-up → golden-hour soundtrack
  drinks:   "5UicJ37BPuqc11E30NU1xI", // drinks tonight → dancefloor soundtrack
  matchday: "5UicJ37BPuqc11E30NU1xI", // matchday → dancefloor soundtrack
  beach:    "6na6gvlPZ5mMNIs73zviV8",
  dinner:   "2riRKe0E1qVRYoh3onIGQr",
  dance:    "5UicJ37BPuqc11E30NU1xI",
  cosy:     "2riRKe0E1qVRYoh3onIGQr", // Games night → dinner-party soundtrack
  just:     "6na6gvlPZ5mMNIs73zviV8"  // Just because → golden-hour soundtrack
};
export const playlistUrl = (vibe) => "https://open.spotify.com/playlist/" + (PLAYLIST[vibe] || PLAYLIST.beach);

// Branded pill button for emails
export function button(href, label, color = "#E74529") {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#FFF3E0;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:13px 24px;border-radius:999px">${label}</a>`;
}

// Clean, readable email shell: red header strip + light body.
export function shell(inner) {
  return `<div style="background:#FBFAEB;padding:26px 14px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:2px solid #2a1207;border-radius:20px;overflow:hidden">
      <div style="background:#E74529;padding:18px 26px">
        <div style="font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:#FFF3E0">Amabile di Rosa</div>
      </div>
      <div style="padding:26px;color:#2a1207;font-size:15px;line-height:1.5">
        ${inner}
      </div>
    </div>
    <p style="font-size:12px;color:#b09a8c;text-align:center;margin:16px 0 0">Friends · Wine · Good Times</p>
  </div>`;
}
