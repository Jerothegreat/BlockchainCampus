# HeronPay API contract (superseded)

The web app now follows the card-wallet API. The contract is **`apps/api/API.md`**: endpoints, the card record byte layout, EIP-712 signing (card states and POS receipts), device auth and the offline PIN check.

The web client for it is `apps/web/src/lib/api.ts`; the card codec is `apps/web/src/lib/card.ts`.
