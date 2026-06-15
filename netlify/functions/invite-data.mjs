// Read an invite. Public callers get the card details + RSVP counts.
// The host (who holds the secret token) additionally gets the full guest list.
import { getStore } from "@netlify/blobs";
import { json, clean, countRsvps } from "./_lib.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const code = clean(url.searchParams.get("c"), 40).toLowerCase();
  const k = clean(url.searchParams.get("k"), 64);
  if (!code) return json({ ok: false, error: "bad_code" }, 400);

  const store = getStore("amabile-invites");
  const meta = await store.get("inv:" + code, { type: "json" }).catch(() => null);
  if (!meta) return json({ ok: false, error: "not_found" }, 404);

  const list = (await store.get("rsvps:" + code, { type: "json" }).catch(() => null)) || [];
  const counts = countRsvps(list);

  const out = {
    ok: true,
    counts,
    invite: {
      host: meta.host,
      vibe: meta.vibe,
      vibeLabel: meta.vibeLabel,
      when: meta.when,
      where: meta.where,
      note: meta.note
    }
  };

  // Only the host link (correct token) reveals who's coming.
  if (k && meta.token && k === meta.token) out.rsvps = list;

  return json(out);
};
