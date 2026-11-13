# HeronPay build plan (all four parts)

Source of truth: `docs/handoff.md`. Visual target: `docs/design/board-A/`. Behaviour: the PRD (copied to `docs/prd.md`) and `PRODUCT.md`.
Branch: `build/heronpay-a`. Design files are committed on their own first; `apps/api` work in progress is left as it was until Part 2 builds on it.

Each part names its verification first. A part is done only when its check passes and the result is recorded here.

## Part 1: Contract (`contracts/`)

- **Verify:** Hardhat tests on a local chain: `decimals() == 2`; `mint` reverts for a non-owner; `settleBatch` reverts for a non-relayer; a duplicate payment id moves funds once and emits `PaymentSettled` once; a short balance emits `PaymentFailed("INSUFFICIENT")` and leaves the id unsettled so it can retry.
- **Build:** `TagakPeso.sol` (the PRD contract, renamed), tests, and an ABI export the API imports.
- **Owner step (manual):** deploy from Remix with MetaMask on Amoy, fund the cashier and relayer from the faucet, then put the address in `.env.example` and in `first-look.md` under "Placeholders (owner owes)".

## Part 2: API and AI (`apps/api`)

- **Verify:** `node:test` integration tests through `app.inject`: duplicate settlement returns one settled receipt and calls the chain once; insufficient balance marks the receipt failed; the clone rule (same uid at two stalls within minutes) gives `offlineCap = 0` on the next `/sync`; `/link` rejects a reused uid. `tsc --noEmit` is clean.
- **Build:** SQLite (`students`, `merchants`, `receipts`); `POST /link`, `GET /students/by-uid/:uidHash`, `GET /sync`, `POST /settle`, `GET /receipts/:id`; a `Chain` interface (viem relayer in production, a fake in tests); offline-cap scoring and fraud rules in TS; an Isolation Forest (scikit-learn) script that runs after `/settle` and adds a flag when Python is available; the assistant renamed to HeronPay / TagakPeso (tPHP).

## Part 3: Web foundation and `/pos`

- **Verify:** unit tests for the acceptance rule (`amount <= balance - pending`, `amount <= offlineCap`) and the PIN hash; `tsc -b` and `vite build` are clean; the parity gate at 390 and 768 for the eight `pos-*` screens.
- **Build:** tokens in `index.css` (dark on `:root`, light under `[data-theme="light"]`), the board's Tailwind config moved into Tailwind v4 `@theme`, self-hosted fonts and the Material Symbols subset, the shared components, the router, the dexie cache and queue, and `/pos`.

## Part 4: `/`, `/app`, `/cashier`, `/me`, `/ops`, deck

- **Verify:** the parity gate at 1920, 1280, 768 and 390 for every remaining screen; `tsc -b` and `vite build` are clean; the `/me` queue is pushed to `/settle` on `online`, tested with a fake fetch.
- **Build:** the screens from `board-A/` 1:1; the cashier mints through the wagmi MetaMask connector; Sample chips stay until real data exists; the deck follows the PRD demo script.

## Parity gate

`e2e/parity.spec.ts` uses Playwright to screenshot `board-A/<screen>.html` and the matching route at each width, then compares the boxes of landmark elements (header, nav, main sections, buttons) within 8 px. Differences go in `evidence.md`.

## Status

| Part | Check | Result |
| --- | --- | --- |
| 1 Contract | Hardhat tests | pending |
| 2 API + AI | node:test + tsc | pending |
| 3 Foundation + POS | unit + build + parity 390/768 | pending |
| 4 Rest + deck | build + parity 4 widths | pending |
