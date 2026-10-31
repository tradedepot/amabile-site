// Andiamo!: every evening, refresh the Wallet cards that have a bottle waiting, so each carries tonight's places
// and an old QR is replaced. 16:45 UTC is 17:45 in Lagos, before people head out.
import { store } from "../lib/_outside.mjs";
import { eveningRefresh, walletConfig, appleOn, googleOn } from "../lib/_outside_wallet.mjs";

export const config = { schedule: "45 16 * * *" };

export default async () => {
  const s = store(), cfg = await walletConfig(s);
  if (!appleOn(cfg) && !googleOn(cfg)) return new Response("off");
  const r = await eveningRefresh(s);
  console.log("wallet evening refresh", JSON.stringify(r));
  return new Response(JSON.stringify(r));
};
