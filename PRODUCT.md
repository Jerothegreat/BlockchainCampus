# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, Android Chrome first (Web NFC needs it). The app screens follow Material 3 phone guidelines; this is mobile web, not a native app.

## Users

- **Students** of the University of Makati (UMak), paying at campus stalls between classes, often with no signal or no mobile data. Job: pay fast with the student ID they already carry, then see that the payment went through.
- **Stall merchants**, running a phone as the point of sale in a queue. Job: charge a sale in seconds even when offline, and trust that the money will arrive.
- **The cashier**, loading credits onto student IDs from an Android phone with the MetaMask app. Job: link new IDs and mint credits.
- **Hackathon judges**, watching a 3-minute live demo on phones and a projector. Job: believe that offline payments are safe and that the record cannot be altered.

## Product Purpose

HeronPay lets students pay at campus stalls by tapping their UMak ID and entering a PIN, even when the stall has no internet. Each payment settles on BNB Smartchain Test as soon as the student's phone or the stall's phone comes back online. Success for the hackathon: the full flow (load, pay offline, settle, fraud flag) works live in under 3 minutes.

## Positioning

Pay with the ID you already have, with no signal, and a record no one can alter. GCash and Maya need internet and a verified e-wallet; cash is slow; org collections live in editable spreadsheets. HeronPay needs only the student ID, works offline, and every settled payment is public on the block explorer. AI sets each student's offline limit and flags cloned IDs, which is what makes offline payment safe.

## Operating Context

- Routes: `/` landing, `/app` role picker, `/cashier`, `/pos`, `/me`, `/ops` (fraud and AI panel for the projector).
- Payment: stall enters amount, student taps ID, confirms, enters PIN; the stall shows a receipt QR that the student's phone scans. Either phone settles it when online; the contract skips duplicates.
- Settlement: Fastify relayer calls `settleBatch()` on the TagakPeso ERC-20 contract (2 decimals = centavos) on BNB Smartchain Test (chain ID `97`). Transaction links use BscScan Testnet (`https://testnet.bscscan.com`). Local development uses Anvil.
- Demo: POS and student phones in airplane mode; the same ID tapped at a second stall a minute later triggers the clone flag.

## Capabilities and Constraints

- Testnet only (BNB Smartchain Test); TagakPeso (tPHP) has no cash value; no cash-out, no admin panel, no iOS.
- Web NFC works only in Chrome on Android, from a user gesture. Nothing is written to the card; the UID (hashed) is the identity.
- Offline acceptance requires `amount <= balance - pending` and `amount <= offlineCap` (default 200 pesos; AI sets a per-student cap; a flagged ID gets 0).
- 24-hour build, team of 4.
- Bluetooth mesh relay and anti-clone NTAG 424 DNA IDs are roadmap only (pitch slide).
- Open decisions: wrong-PIN lock rule; UMak color hex values; stall names and menu items; team contact email; Filipino copy review.

## Brand Commitments

- Name: HeronPay (heron is "tagak" in Filipino). Token: TagakPeso, symbol tPHP, an ERC-20 with 2 decimals (centavos). Own wordmark; no official UMak seal. Not affiliated with or endorsed by the University of Makati unless approved.
- Fonts: Sora and Manrope (user-specified).
- Copy in English and Filipino, with a toggle.
- Status (Pending, Settled, Failed, Flagged) always shown with a word and an icon, never color alone.

## Evidence on Hand

- PRD: `UMak-Pay-Hackathon-PRD.md` (owner's Downloads folder).
- Working Web NFC chip check: `apps/web/src/App.tsx`, `apps/web/src/hooks/useNfc.ts`.
- No real usage data, testimonials, or deployed contract yet. Stats, transactions, names and stalls on any mock are samples and must be labeled as such.

## Product Principles

1. The stall line never waits on the network.
2. Every payment is honest about its state: pending until the chain says settled.
3. Safety limits (PIN, offline caps, clone flags) are visible and explained, not hidden.
4. Nothing but the student ID is required to pay.
5. Say the known limits before anyone asks.

## Accessibility & Inclusion

WCAG 2.2 AA contrast in light and dark. Touch targets at least 48 px. Works for students without a phone (the stall settles the receipt). Respect reduced motion.
