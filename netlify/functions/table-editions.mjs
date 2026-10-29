// Public read: the Tables that have happened, for the Spumante page. Returns only what is
// already public on each photo page (number, date, venue, three headline pictures, the
// photo page path). No guest data, no names. Editions whose date is still ahead are left out.
import { json } from "../lib/_lib.mjs";
import { tstore, kMetaPrefix, fmtDate, editionPathId, headlinePhotos, clientIp, rateOk } from "../lib/_table.mjs";

export default async (req, context) => {
  const st = tstore();
  if (!(await rateOk(st, "table-editions", clientIp(req, context), 60, 60000))) return json({ ok: false, error: "rate" }, 429);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  try {
    const { blobs } = await st.list({ prefix: kMetaPrefix() });
    for (const b of blobs) {
      if (b.key.split(":").length !== 2) continue;
      const m = await st.get(b.key, { type: "json" }).catch(() => null);
      if (!m || !m.edition || !m.dateISO || m.dateISO > today) continue;
      const pathId = editionPathId(m, m.edition);
      out.push({
        no: parseInt(pathId, 10) || 0,
        title: m.title || ("Table No " + pathId),
        dateLabel: fmtDate(m.dateISO),
        dateISO: m.dateISO,
        venue: m.venue || "",
        photos: headlinePhotos(m, m.edition),
        url: `/table/${pathId}/photos`
      });
    }
  } catch (_) {}
  out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return new Response(JSON.stringify({ ok: true, editions: out }), {
    status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=300" }
  });
};
