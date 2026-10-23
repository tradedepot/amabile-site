// The Room: shared "who is in the room" ticks per Table edition, so every phone on the team
// sees the same state. One blob per guest (t<edition>:in:<gid>), same no-shared-counter
// pattern as the RSVP tool, so two phones ticking at once cannot clobber each other.
// /table/1/room/state keeps the t1: prefix it always had; /table/2/room/state is t2:, and so on.
import { getStore } from "@netlify/blobs";

export const config = { path: "/table/:ed/room/state" };

const store = () => getStore({ name: "amabile-room", consistency: "strong" });

export default async (req, context) => {
  const ed = String((context && context.params && context.params.ed) || "").replace(/\D/g, "").slice(0, 3);
  if (!ed) return json({ error: "edition" }, 404);
  const PREFIX = `t${ed}:in:`;
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
