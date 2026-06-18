// Serve the invite-generator shortcuts (/new, /pullup, /host) with a behaviour-led
// link preview ("Round up your crew") instead of the homepage's Amabile-brand preview.
// Body is the homepage, which auto-opens the generator on these paths.
export const config = { path: ["/new", "/pullup", "/host"] };

const IMG = "https://www.amabiledirosa.com/assets/images/occasions/dancefloor.jpg";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async (req) => {
  const url = new URL(req.url);
  let html;
  try {
    html = await (await fetch(url.origin + "/index.html")).text();
  } catch (e) {
    return new Response("", { status: 302, headers: { location: "/?invite=1" } });
  }

  const title = "Round up your crew 🍷";
  const desc = "Make a plan, drop it in the group chat, see who's in.";
  const set = (re, val) => { html = html.replace(re, "$1" + esc(val) + "$2"); };

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  set(/(<meta name="description" content=")[^"]*(">)/, desc);
  set(/(<meta property="og:title" content=")[^"]*(">)/, title);
  set(/(<meta property="og:description" content=")[^"]*(">)/, desc);
  set(/(<meta property="og:image" content=")[^"]*(">)/, IMG);
  set(/(<meta name="twitter:title" content=")[^"]*(">)/, title);
  set(/(<meta name="twitter:description" content=")[^"]*(">)/, desc);
  set(/(<meta name="twitter:image" content=")[^"]*(">)/, IMG);

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
