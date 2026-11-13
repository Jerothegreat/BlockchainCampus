/**
 * Plain, readable log lines for the money flow (student card → stall), next to Fastify's JSON request logs.
 *   14:02:11 [pay] receipt 8c0f7f2e ₱85.00 Ana Reyes → Kuya's Grill (card …9a1c, nonce 3) via settle
 * Never logs PINs, keys or full UIDs.
 */
const time = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export const peso = (centavos: number | bigint) => `₱${(Number(centavos) / 100).toFixed(2)}`;
/** First 8 chars of a receipt id / tx hash, last 4 of a card id: enough to match lines up. */
export const shortId = (id: string) => id.slice(0, 8);
export const shortCard = (cardId: string) => `…${cardId.slice(-4)}`;
export const shortTx = (hash: string) => `${hash.slice(0, 10)}…`;

export const log = {
  info: (tag: string, msg: string) => console.log(`${time()} [${tag}] ${msg}`),
  warn: (tag: string, msg: string) => console.warn(`${time()} [${tag}] WARN ${msg}`),
  error: (tag: string, msg: string, err?: unknown) => console.error(`${time()} [${tag}] ERROR ${msg}`, err ?? ""),
};
