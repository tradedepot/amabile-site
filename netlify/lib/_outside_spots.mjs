// Andiamo!: "We'll tell you when one opens." A bottle with nowhere to be claimed waits. When a spot goes live
// (or a live spot starts pouring its wine at its level), the person holding it is told once: a push, and the
// WhatsApp template andiamo_spot once Meta has approved it. Only bottles that had no spot at all are told,
// so a new spot opening doesn't ping everyone who already has somewhere to go.
import { K, getJSON, listKeys, fetchAll, getBands, claimCheck, claimLinkToken, wa, waTemplate, SITE } from "./_outside.mjs";
import { saveBottle } from "./_outside_flow.mjs";

export const SPOT_TPL = () => process.env.OUTSIDE_TPL_SPOT || "andiamo_spot";
const fromOf = (b) => (b.anon ? "someone" : (b.fromName || "a friend"));

export async function tellSpotOpened(s, venueId) {
  const v = await getJSON(s, K.venue(venueId));
  if (!v || !v.active) return { told: 0 };
  const bands = await getBands(s);
  const others = (await fetchAll(s, await listKeys(s, K.venuePrefix))).filter((x) => x && x.active && x.id !== v.id);
  const bottles = (await fetchAll(s, (await listKeys(s, "b/")).slice(-3000))).filter((b) => b && b.status === "waiting" && b.to && !b.spotTold);
  let told = 0;
  for (const b of bottles) {
    if (!claimCheck(bands, b, v).ok) continue;
    if (others.some((o) => claimCheck(bands, b, o).ok)) continue; // they already had somewhere to go
    const link = claimLinkToken(b.to, b.id);
    const { pushTo } = await import("./_outside_push.mjs");
    const [p, w] = await Promise.all([
      pushTo(b.to, { title: v.name + " is on Andiamo", body: "Claim the Amabile " + fromOf(b) + " sent you there.", url: SITE + "/c/" + link, tag: "spot-" + b.id }).catch(() => null),
      wa(b.to, waTemplate(SPOT_TPL(), [v.name, fromOf(b)], link)).catch(() => null)
    ]);
    b.spotTold = { at: Date.now(), venueId: v.id, push: !!(p && p.ok), wa: !!(w && w.ok) };
    await saveBottle(s, b);
    told++;
  }
  return { told };
}
