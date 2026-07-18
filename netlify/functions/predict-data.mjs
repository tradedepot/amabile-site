// Private: list all Predict & Win entries (for the admin / winner-selection page).
import { getStore } from "@netlify/blobs";
import { json } from "./_lib.mjs";

const KEY = "predict:bamboa-spain-argentina";

export default async (req) => {
  const url = new URL(req.url);
  const k = url.searchParams.get("k") || "";
  const ADMIN = process.env.SAMPLING_KEY || "";
  if (!ADMIN || k !== ADMIN) return json({ ok: false, error: "unauthorized" }, 401);

  const list = (await getStore("amabile-invites").get(KEY, { type: "json" }).catch(() => null)) || [];
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  return json({ ok: true, count: list.length, entries: list });
};
