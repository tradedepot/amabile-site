// Serves /i/<code> with per-invite link-preview tags injected, so a shared invite
// shows the host's actual event (name, vibe, when, where) + the generated card image.
// The page body is the static invite.html; only the <head> preview tags are rewritten.
import { getStore } from "@netlify/blobs";
import { clean } from "./_lib.mjs";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function injectOG(html, { title, desc, img }) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(img)}$2`);
  return html;
}

// Bind this function directly to the pretty invite URL.
export const config = { path: "/i/:code" };

export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/i\/([^\/?#]+)/);
  const code = clean(url.searchParams.get("c") || (m && m[1]) || "", 40).toLowerCase();
  const origin = url.origin;

  let html;
  try {
    html = await (await fetch(origin + "/invite.html")).text();
  } catch (e) {
    return new Response("", { status: 302, headers: { location: "/invite.html?c=" + encodeURIComponent(code) } });
  }

  if (code) {
    const meta = await getStore("amabile-invites").get("inv:" + code, { type: "json" }).catch(() => null);
    if (meta) {
      const host = meta.host || "A friend";
      const vibe = meta.vibeLabel || "Good times";
      const title = `You're invited to ${host}'s ${vibe} 🍷`;
      const bits = [];
      if (meta.when) bits.push(meta.when);
      if (meta.where) bits.push(meta.where);
      bits.push("Tap to RSVP");
      const img = `${origin}/.netlify/functions/invite-image?c=${encodeURIComponent(code)}`;
      html = injectOG(html, { title, desc: bits.join(" · "), img });
    }
  }

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
