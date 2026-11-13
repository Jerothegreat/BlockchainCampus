# HeronPay Handoff (direction A, Receipt)

Start here. Everything below points at one look, **direction A. Receipt**, and one product, **HeronPay** with the token **TagakPeso (tPHP)** on Polygon Amoy. Directions B and C were deleted; ADR 0001 is kept only as history.

## The source of truth, in reading order

| # | File | What it settles |
| --- | --- | --- |
| 1 | `PRODUCT.md` | Users, purpose, constraints, brand commitments (name, token, no UMak seal, sample data labeled) |
| 2 | `UMak-Pay-Hackathon-PRD.md` (owner's Downloads; copy it into `docs/` before sharing) | Architecture, contract, API, AI, team split, 24-hour timeline, demo script. Read "UMak Pay" as HeronPay and "UMakCredit / UMC" as TagakPeso / tPHP |
| 3 | `docs/design/first-look.md` | Every grilling decision (rounds 0 to 3), flows, states, wireframes, placeholders owed |
| 4 | `docs/design/build-overview.md` | Each screen and section in plain words |
| 5 | `docs/standards/design-brief.md` | The rules that must hold and every colour role for dark and light |
| 6 | `DESIGN.md` + `.impeccable/design.json` | The same system in Impeccable's format (the design hook reads it) |
| 7 | `docs/design/board-A/index.html` | **The build target**: 26 screens as standalone HTML with the exact Tailwind classes; buttons link screen to screen |
| 8 | `docs/design/board.html` / https://claude.ai/artifact/A5FFNSe7S78WzF76A6TeVU | The look board: flow view, tokens + spec per breakpoint, all screens at 390 to 2560 px |
| 9 | `docs/adr/0002-visual-direction-receipt.md` | Why A |
| 10 | `docs/design/references.md` | Reference sites and the launch checklist (legal, accessibility, performance, forms) |

If two files disagree, the board wins for anything visual and the PRD + `PRODUCT.md` win for behaviour. Fix the losing file in the same change.

## How to build the UI

1. Put the colour roles from `design-brief.md` into `apps/web/src/index.css` as CSS variables (dark on `:root`, light under `[data-theme="light"]`), and copy `TW_CONFIG` from `board.html` into the Tailwind config: M3 screens (`medium` 600, `expanded` 840, `large` 1200, `xlarge` 1600, `wide` 1920), the M3 type roles (`text-title-l`, `text-body-m`, ...), colours as `var(--role)`.
2. Load Sora, Manrope, JetBrains Mono and Material Symbols Rounded (self-host them for the offline PWA).
3. Build the shared components once, matching the board's helpers: `TopBar`, `NavBar` (rail from 600 px), `Fab`, `Button` (filled, tonal, outlined, text), `Chip`, `StatusChip`, `NetChip`, `TextField`, `ListItem`, `Dialog`, `Snackbar`, `Card`, `TapTarget`, and the signature `ReceiptSlip` with its `Stamp`.
4. Port each screen from `board-A/<screen>.html` 1:1. Deviations are proposals, not choices.
5. **Parity gate before polish:** Playwright screenshots of `board-A/<screen>.html` and the build at 1920, 1280, 768 and 390. Section order, columns, element sizes and positions must match within 8 px; record differences in `evidence.md`. Use `e2e/viewports.html` to see the running build at 390 to 3440 px from a laptop.
6. The Impeccable design hook (`.claude/settings.local.json`) checks UI files after every edit in Claude Code. Act on its findings.

## Work split (from the PRD) with paste-ready prompts

Each prompt is self-contained; paste it into a fresh agent session at the repo root.

### Person 1: Contract
> Read `docs/handoff.md`, `PRODUCT.md` and the PRD's "Smart contract" section. Deploy the PRD's ERC-20 contract to Polygon Amoy from Remix, renamed: `contract TagakPeso`, `ERC20("TagakPeso", "tPHP")`, `decimals() = 2`, `mint` only by the owner (cashier MetaMask), `settleBatch` only by the relayer, skip any payment id already settled, emit `PaymentSettled` / `PaymentFailed`. Fund the cashier and relayer wallets from the Amoy faucet. Record the contract address and explorer URL in `docs/design/first-look.md` under "Placeholders (owner owes)" and in `.env.example`. Done when a mint and a duplicate `settleBatch` behave as the PRD says on the explorer.

### Person 2: API and AI
> Read `docs/handoff.md`, `PRODUCT.md` and the PRD's "Fastify API" and "AI" sections. In `apps/api`, implement `POST /link`, `GET /students/by-uid/:uidHash`, `GET /sync` (with each student's `offlineCap`), `POST /settle` (calls `settleBatch`, returns the tx hash), `GET /receipts/:id`, on SQLite tables `students`, `merchants`, `receipts`. Add the offline-cap scoring and clone/fraud flags (rules + Isolation Forest) and the spending assistant (answers only from the student's receipts). Use the product name HeronPay and the token TagakPeso (tPHP) in every prompt and message. Note: `apps/api/src/assistant/kimi.ts` already exists with an old "UMak Pay" system prompt; rename it there. Write tests for duplicate settlement, insufficient balance, and a flagged ID getting cap 0.

### Person 3: Stall POS (`/pos`)
> Read `docs/handoff.md`, then `docs/standards/design-brief.md`. Build `/pos` in `apps/web` to match `docs/design/board-A/pos-keypad.html`, `pos-tap.html`, `pos-confirm.html`, `pos-pin.html`, `pos-dialog.html`, `pos-approved.html`, `pos-today.html`, `pos-queue.html` 1:1 (M3 navigation: Charge, Today, Queue). Behaviour from the PRD: cache `/sync` in IndexedDB (dexie); on tap, `sha256(uid)` finds the student, `sha256(pin + uid)` must match; accept only if `amount <= balance - pending` and `amount <= offlineCap`; errors open as M3 dialogs over the PIN screen (see `states.html`); save the receipt to the queue and show the `ReceiptSlip` with its QR; return to the keypad after the scan or 20 s; push the queue to `/settle` on `online`. Reuse the existing Web NFC hook `apps/web/src/hooks/useNfc.ts`. Run the parity gate at 390 and 768.

### Person 4: Cashier, student, landing, ops, deck
> Read `docs/handoff.md`, then `docs/standards/design-brief.md`. Build to `docs/design/board-A/` 1:1: `/` (`landing.html`, including the click-through demo with the receipt slip), `/app` (`app.html`), `/cashier` (`cashier-tap`, `cashier-lookup`, `cashier-link`, `cashier-load`, `cashier-done`; mint through the wagmi MetaMask connector), `/me` (`me-intro`, `me-login`, `me-home`, `me-scan`, `me-receipt`, `me-settled`, `me-activity`, `me-assistant`, `me-profile`; Scan receipt is the FAB; Settled shows the stamped slip and a snackbar), and `/ops` (`ops.html`). Receipts scanned on `/me` go to IndexedDB and are pushed to `/settle` on `online`. Keep every sample label until real data exists. Run the parity gate at 1920, 1280, 768 and 390. Then build the pitch deck from the PRD's demo script.

## Still owed by the owner

- UMak gold hex value (placeholder `#F2C230`).
- Stall names and quick items for the demo.
- Team names and a contact email (footer, legal pages, privacy notice).
- Wrong-PIN lock rule (3 tries, 5 minutes is a placeholder).
- Native review of the Filipino copy.
- Full privacy notice and terms (outlines only).
- Approval of the names `DESIGN.md` proposes (north star, colour names).

## Repo state at handoff

Nothing from the design phase is committed yet: `PRODUCT.md`, `DESIGN.md`, `.impeccable/`, `.claude/` (Impeccable skill, agents, hook), `docs/`, `e2e/`. Someone else has uncommitted work in `apps/api` (`index.ts`, `package.json`, `assistant/`, `catalog/`); commit the design files separately from it.
