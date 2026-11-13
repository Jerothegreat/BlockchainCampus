# HeronPay: Build Overview

In plain words, what we will build, how each part works, and what is still missing. Sources: the hackathon PRD, `PRODUCT.md`, and the decisions in `first-look.md`. Look: direction **A. Receipt** (`docs/standards/design-brief.md`). Board: `board.html`, plain export in `board-A/`. Handoff: `docs/handoff.md`.

## What we are building

One React + Vite PWA on Android Chrome, one Fastify server, and one smart contract on Polygon Amoy. Students pay at stalls by tapping their UMak ID, confirming, and entering a PIN. The stall phone can be offline. The payment settles on-chain as soon as the student's phone or the stall's phone gets signal. App screens follow Material 3: top app bar, navigation bar on phones (rail on tablets and laptops), one FAB for the main action, dialogs and snackbars.

## Pages and sections

### `/` Landing (pitch page)
1. **Nav**: wordmark, How it works, Settlements, Safety, Roadmap, EN/FIL, Open app.
2. **Hero**: headline, short pitch, Open app, explorer link, and a **live demo** visitors click through (tap ID, PIN, Approved offline, Settled), drawn as a receipt slip that gets stamped Settled.
3. **How it works**: Load, Pay offline, Settle.
4. **Latest settlements**: a feed read from the contract; each row opens on the explorer.
5. **Safety**: offline limits, clone detection, assistant; next to the four known limits.
6. **Roadmap**: Bluetooth mesh relay, anti-clone IDs, UMak pilot.
7. **Footer**: product, team and legal links, testnet notice, copyright.

### `/app` Role picker
Cashier, Stall, Student (the phone remembers), plus a link to the ops panel.

### `/cashier` (Android phone with the MetaMask app)
1. **Tap ID**, with **Look up by student number** when a card won't read.
2. **Link new ID** for an unlinked card: student number, name, PIN, consent → `POST /link`.
3. **Load credits**: amount chips → `mint()` in MetaMask.
4. **Loaded**: new balance, transaction, explorer link.

### `/pos` Stall (works offline). Navigation: Charge, Today, Queue
1. **Charge**: peso keypad + quick-item chips.
2. **Tap ID** → **Confirm** (name, amount, offline limit) → **PIN**.
3. Problems (wrong PIN, over the limit, not enough balance, flagged or unlinked ID) open as **dialogs** over the PIN screen, so the sale isn't lost.
4. **Approved**: the receipt slip prints with its QR; returns to the keypad after the scan or 20 seconds.
5. **Today**: total, busy-hours forecast, sales with status.
6. **Queue**: receipts waiting for signal, Push now.

### `/me` Student. Navigation: Home, Activity, Assistant, Profile. FAB: Scan receipt
1. **Intro** (first run, 3 steps) → **Log in** (student number + PIN, once, online).
2. **Home**: available balance (on-chain and pending shown below it); recent receipts.
3. **Scan** → **Receipt** slip stamped Pending → stamped Settled with transaction and explorer link; a **snackbar** announces each settlement.
4. **Activity**: every receipt, filtered by All, Pending, Settled, Failed.
5. **Assistant**: question chips and chat, answering only from the student's receipts.
6. **Profile**: language, change PIN, offline limit, privacy, data requests, log out.

### `/ops` Fraud and AI panel (projector)
Clone-suspect flag with the limit drop, stall status (online or offline, queue, last sync), today's totals, live receipts, offline limits with reasons.

### States
Dialogs, banners and empty states drawn on the board's States screen.

## Tools
React + Vite + TypeScript, Tailwind (M3 tokens as CSS variables, class names from the board), Material Symbols, vite-plugin-pwa, dexie, html5-qrcode, qrcode.react, wagmi + viem, Fastify, Node's built-in `node:sqlite` (no native build on Windows; replaces the PRD's better-sqlite3), Solidity in Remix, scikit-learn, an LLM API for the assistant. Impeccable's design hook checks UI files as they are edited.

## What the owner still owes
- UMak school gold hex value (placeholder `#F2C230`).
- Stall names and quick items for the demo.
- Team names and a contact email for the footer and legal pages.
- The wrong-PIN lock rule (3 tries, 5 minutes is a placeholder).
- A native speaker's review of the Filipino copy.
- Contract address and explorer URL after deploy.
- Full privacy notice and terms text (outlines only so far).

## Steps from here to launch (demo day)
1. Turn the PRD and this design into a spec, then tickets per person (contract, API + AI, POS, cashier + student + deck).
2. Build to `board-A/` 1:1. Run the pixel parity check at 1920, 1280, 768 and 390 before polishing.
3. Run the PRD timeline: ID read and contract by hour 2, mint by 8, online payment by 14, offline + settle by 18, AI by 21.
4. Go through the launch checklist in `references.md`, rehearse the 3-minute demo, record the backup video.
