// Serves /table and /table/<edition> with per-edition link-preview tags injected, so a
// guest link shows the actual edition (name, date, venue). Same trick as invite-ssr:
// the body is the static table.html; only the <head> preview tags are rewritten. The
// meta tags in table.html must match these regexes character-for-character or the replace
// silently no-ops. This one DOES rewrite the twitter tags (the bug invite-ssr had).
import { getStore } from "@netlify/blobs";
import { edId, fmtDate } from "./_table.mjs";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inject(html, { title, desc, img }) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(img)}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${esc(img)}$2`);
  return html;
}

export const config = { path: ["/table", "/table/:edition"] };

export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/table\/([^\/?#]+)/);
  const ed = edId(m ? m[1] : "");
  const origin = url.origin;

  let html;
  try {
    html = await (await fetch(origin + "/table.html")).text();
  } catch (e) {
    return new Response("", { status: 302, headers: { location: "/table.html" } });
  }

  const img = origin + "/assets/images/occasions/dinner.jpg";
  let title = "The Amabile Table";
  let desc = "An invitation to our hosted long-table lunch. By invite only.";

  if (ed) {
    const meta = await getStore("amabile-invites").get("table:" + ed, { type: "json" }).catch(() => null);
    if (meta) {
      title = meta.title || title;
      const bits = [];
      if (meta.dateISO) bits.push(fmtDate(meta.dateISO)); else if (meta.dateLabel) bits.push(meta.dateLabel);
      if (meta.venue) bits.push(meta.venue);
      bits.push("You're invited");
      desc = bits.join(" · ");
    }
  }

  html = inject(html, { title, desc, img });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
