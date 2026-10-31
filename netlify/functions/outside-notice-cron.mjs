// Andiamo!: every hour, send again the bottle notices WhatsApp didn't deliver a day ago (see lib/_outside_notice.mjs).
import { store } from "../lib/_outside.mjs";
import { retryNotices } from "../lib/_outside_notice.mjs";

export const config = { schedule: "17 * * * *" };

export default async () => {
  const r = await retryNotices(store());
  if (r.sent) console.log("bottle notices sent again", r.sent);
  return new Response(JSON.stringify(r));
};
