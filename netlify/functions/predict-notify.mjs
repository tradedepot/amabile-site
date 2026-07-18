// Private: email the selected Predict & Win winners (from the admin page).
// Sends a branded "you won" email via Brevo, from media@amabiledirosa.com.
// Gated by SAMPLING_KEY (same key as the admin page).
import { json, clean, isEmail } from "./_lib.mjs";

const FROM = { email: "vibes@amabiledirosa.com", name: "Amabile di Rosa" };
const SUBJECT = "🏆 You won! — Amabile x Bamboa Predict & Win";

function winHtml(name, prediction) {
  const pred = prediction ? String(prediction) : "the exact final score";
  return `<!doctype html><html><body style="margin:0;background:#f4ecdd;font-family:Arial,Helvetica,sans-serif;color:#2a1207">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4ecdd;padding:26px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ecd9b6">
        <tr><td style="background:#7d1d1d;padding:26px 28px;text-align:center">
          <div style="color:#C9A15A;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold">Amabile × Bamboa · Predict &amp; Win</div>
          <div style="color:#FFF3E0;font-size:30px;font-weight:bold;margin-top:8px">You won! 🏆</div>
        </td></tr>
        <tr><td style="padding:28px 30px">
          <p style="font-size:17px;margin:0 0 14px">Ciao ${clean(name, 80) || "there"},</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">You called it — <b>${pred}</b> at the World Cup final watch party, and you've been drawn as one of our winners! 🎉</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 6px">Your prize:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
            <tr><td style="font-size:15px;line-height:1.9">🍷 &nbsp;A bottle of <b>Amabile di Rosa</b><br>🃏 &nbsp;A <b>Pour Decisions</b> card deck (our own drinking card game)</td></tr>
          </table>
          <div style="background:#FFF6E4;border:1px solid #EAD59B;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#3a2410">
            <b>Come forward now to collect.</b> Prizes are handed out in person at Bamboa during the event — find the Amabile team and show them this email to collect yours. If you're not on site when prizes are handed out, a replacement winner will be drawn in your place, so please don't wait.
          </div>
          <p style="font-size:15px;line-height:1.6;margin:18px 0 0">Pour one, raise a glass, and enjoy the rest of the night. 🍷</p>
          <p style="font-size:15px;line-height:1.6;margin:14px 0 0">— The Amabile di Rosa team</p>
        </td></tr>
        <tr><td style="padding:16px 30px;border-top:1px solid #eee;color:#9a8576;font-size:12px;text-align:center">
          Amabile di Rosa · Friends. Wine. Good Times. · Please drink responsibly, 18+.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const ADMIN = process.env.SAMPLING_KEY || "";
  if (!ADMIN || d.k !== ADMIN) return json({ ok: false, error: "unauthorized" }, 401);

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return json({ ok: false, error: "no_brevo_key" }, 500);

  const winners = Array.isArray(d.winners) ? d.winners.slice(0, 20) : [];
  if (!winners.length) return json({ ok: false, error: "no_winners" }, 400);

  const results = [];
  for (const w of winners) {
    const email = clean(w.email, 160);
    const name = clean(w.name, 80);
    const prediction = clean(w.prediction, 60);
    if (!isEmail(email)) { results.push({ email, ok: false, error: "bad_email" }); continue; }
    try {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: FROM, to: [{ email, name: name || undefined }], subject: SUBJECT, htmlContent: winHtml(name, prediction) }),
      });
      results.push({ email, ok: r.ok, status: r.status, text: r.ok ? "" : (await r.text().catch(() => "")).slice(0, 200) });
    } catch (e) {
      results.push({ email, ok: false, error: String(e).slice(0, 120) });
    }
  }
  return json({ ok: true, results });
};
