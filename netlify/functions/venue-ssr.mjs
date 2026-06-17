// Serve /venue with a venue-coded title so the link preview reads
// "Guest list — <venue>" instead of "Guest list — Amabile". Page body is the static venue.html.
import { clean } from "./_lib.mjs";

export const config = { path: "/venue" };

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async (req) => {
  const url = new URL(req.url);
  const v = clean(url.searchParams.get("v") || url.searchParams.get("venue") || "", 80);

  let html;
  try {
    html = await (await fetch(url.origin + "/venue.html")).text();
  } catch (e) {
    return new Response("", { status: 302, headers: { location: "/venue.html" + url.search } });
  }

  if (v) {
    const title = "Guest list — " + v;
    html = html.replace(/<title>[\s\S]*?<\/title>/,
      `<title>${esc(title)}</title>\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="Round-up links for ${esc(v)} bookings.">`);
  }

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
