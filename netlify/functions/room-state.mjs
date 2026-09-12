// The Room: shared "who is in the room" ticks for Table No 1, so every phone on the team
// sees the same state. One blob per guest (t1:in:<gid>), same no-shared-counter pattern
// as the RSVP tool, so two phones ticking at once cannot clobber each other.
import { getStore } from "@netlify/blobs";

export const config = { path: "/table/1/room/state" };

const PREFIX = "t1:in:";
const store = () => getStore({ name: "amabile-room", consistency: "strong" });

export default async (req) => {
  const s = store();
  if (req.method === "GET") {
    const { blobs } = await s.list({ prefix: PREFIX });
    const out = {};
    for (const b of blobs) {
      const v = await s.get(b.key, { type: "json" }).catch(() => null);
      if (v && v.at) out[b.key.slice(PREFIX.length)] = v.at;
    }
    return json({ in: out });
  }
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 16);
    if (!id) return json({ error: "id" }, 400);
    if (body.on) await s.setJSON(PREFIX + id, { at: Number(body.at) || Date.now() });
    else await s.delete(PREFIX + id);
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
