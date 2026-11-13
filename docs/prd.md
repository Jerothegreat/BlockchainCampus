# UMak Pay — Hackathon PRD

Nov 13, 2026 · @Charles Nathaniel Togle

Students pay at campus stalls by tapping the UMak ID they already have, even when the stall has no internet. Each payment settles on a blockchain testnet as soon as the student's phone (or the stall's phone) comes back online.

## Problem statement

UMak has no campus payment method that works without internet, needs nothing but the student ID, and keeps a record no one can alter.

| # | Problem | Impact |
| --- | --- | --- |
| P1 | Cash is slow; making change jams lines between classes | Long queues, miscounts |
| P2 | GCash and Maya need internet; campus signal is unreliable | Failed payments, back to cash |
| P3 | Not every student has data or a verified e-wallet | Excluded from cashless options |
| P4 | Org and booth collections live in editable spreadsheets | No trustworthy audit trail |

**Our answer:** tap the ID, pay offline, and let the smart contract settle the payment the moment either phone is online. Every settled payment is public on the block explorer.

|  |  |
| --- | --- |
| Event | Hackathon, 24–48 hours |
| Network | Polygon Amoy testnet (free test tokens) |
| Stack | React + Vite PWA, Fastify, Solidity (Remix), MetaMask, SQLite |

## Scope

We build one end-to-end flow: load credits, pay offline with the ID, settle on-chain when a phone is online.

| Area | Status |
| --- | --- |
| Cashier top-up with MetaMask | Build |
| ID tap + PIN on the merchant phone, offline | Build |
| Receipt QR handed to the student phone | Build |
| Smart contract settlement when a phone is online | Build |
| AI offline limits + clone detection | Build |
| AI spending assistant on the student phone | Build |
| Block explorer proof on screen | Build |
| BLE mesh relay between phones | Concept only (pitch slide) |
| Anti-clone IDs (NTAG 424 DNA) | Concept only |
| Cash-out, admin panel, iOS | Not in scope |

## Demo flow

&#91;embedded content: payment flow · top-up to on-chain settlement\]

The payment is accepted offline at the stall; the contract settles it when the student's phone or the merchant's phone reconnects, and the AI uses settled payments to set the next offline caps.

## Architecture

&#91;embedded content: architecture · 3 screens, 1 server, 3 back ends\]

The cashier mints straight from MetaMask; every other write goes through Fastify, where the relayer pays gas and the AI service reads settled receipts.

## Smart contract

One ERC-20 contract holds every balance and settles payments; it ignores any payment ID it has already settled, so the student phone and the merchant phone can both submit the same receipt safely.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UMakCredit is ERC20, Ownable {
    address public relayer;
    mapping(bytes32 => bool) public settled;

    event PaymentSettled(bytes32 indexed id, address from, address to, uint256 amount);
    event PaymentFailed(bytes32 indexed id, string reason);

    struct Payment { bytes32 id; address from; address to; uint256 amount; }

    constructor(address _relayer) ERC20("UMak Credit", "UMC") Ownable(msg.sender) {
        relayer = _relayer;
    }

    function decimals() public pure override returns (uint8) { return 2; } // centavos

    function mint(address to, uint256 amount) external onlyOwner { _mint(to, amount); }

    function settleBatch(Payment[] calldata ps) external {
        require(msg.sender == relayer, "not relayer");
        for (uint i; i < ps.length; i++) {
            Payment calldata p = ps[i];
            if (settled[p.id]) continue;                       // already settled: skip
            if (balanceOf(p.from) < p.amount) {
                emit PaymentFailed(p.id, "INSUFFICIENT");
                continue;
            }
            settled[p.id] = true;
            _transfer(p.from, p.to, p.amount);
            emit PaymentSettled(p.id, p.from, p.to, p.amount);
        }
    }
}
```

- **Deploy:** paste into [Remix](https://remix.ethereum.org), compile, deploy to Polygon Amoy with MetaMask.
- **Owner** = the cashier's MetaMask account, so only it can `mint()`.
- **Relayer** = a second wallet whose key sits in the Fastify `.env`. It pays gas so students never need tokens.
- **Addresses:** the server generates one address per student and merchant with viem. Nobody needs those keys, because the contract moves the funds.
- **Gas:** get free test POL for the cashier and relayer wallets from the Polygon Amoy faucet.

## Technical details

One React + Vite PWA serves three screens: `/cashier`, `/pos` and `/me` (the student's phone).

### Reading the ID (Web NFC, Chrome on Android)

```ts
const reader = new NDEFReader();
await reader.scan();                               // must start from a button tap
reader.onreading = (e) => onTap(e.serialNumber);   // "04:a2:3f:..." = the UID
```

- Nothing is written to the card; the UID is the student's identity.
- Test real UMak IDs in hour 0. If Chrome can't read them, put NTAG213 stickers on the demo IDs.

### Merchant POS (works offline)

1. While online, `GET /sync` caches `[{ uidHash, address, balance, pinHash }]` in IndexedDB.
2. On tap: `sha256(uid)` finds the student, `sha256(pin + uid)` must match `pinHash`.
3. Accept if `amount <= balance - pending` and `amount <= 200` pesos (offline cap).
4. Save the receipt `{ id: crypto.randomUUID(), from, to, amount, createdAt }` to the queue.
5. Show the receipt as a **QR code** on screen for the student to scan.

### Student phone (the settlement trigger)

1. The student opens `/me`, logs in once with their student number, and scans the receipt QR. This works offline; the receipt goes into IndexedDB.
2. `window.addEventListener('online', push)` sends queued receipts to `POST /settle` the moment the phone has signal.
3. Fastify calls `settleBatch()`; the screen flips from **Pending** to **Settled** with an explorer link.
4. The merchant POS also pushes its queue when it reconnects. Whichever phone is online first settles the payment; the second one is skipped by the contract.

### Fastify API

| Method | Path | Does |
| --- | --- | --- |
| POST | `/link` | `{ uid, studentNo, pin }` saves uidHash and pinHash, generates an address |
| GET | `/students/by-uid/:uidHash` | Cashier lookup of the address to mint to |
| GET | `/sync` | Student list with balances read from the contract |
| POST | `/settle` | Receives receipts from either phone, calls `settleBatch()`, returns the tx hash |
| GET | `/receipts/:id` | Status and tx hash for the student screen |

**Tables:** `students(uid_hash, student_no, name, address, pin_hash)`, `merchants(id, name, address)`, `receipts(id, from, to, amount, status, tx_hash)`.

**Libraries:** wagmi + viem, vite-plugin-pwa, dexie, html5-qrcode, qrcode.react, fastify, better-sqlite3.

## AI

AI decides how much each student may spend offline and catches cloned IDs, which closes the biggest hole in an offline system; a spending assistant adds the demo moment.

| Use case | What it does | How (hackathon build) |
| --- | --- | --- |
| **Smart offline limit** (core) | Gives each student a personal offline cap instead of a flat 200 pesos, based on their history and risk | Fastify job scores each student from past receipts (top-up habits, failed payments, usual spend) and puts `offlineCap` into the `/sync` cache |
| **Clone and fraud detection** (core) | Flags the same ID paying at two stalls minutes apart, odd amounts, or many small payments in a burst | Rules + scikit-learn Isolation Forest on receipts after each `/settle`; a flagged ID gets `offlineCap = 0` on the next sync |
| **Spending assistant** (demo) | Student asks "How much did I spend on food this week?" on `/me` and gets an answer plus a tip | LLM API call with the student's receipts as context; answers only from that data |
| **Merchant forecast** (stretch) | Tells a stall which hours are busiest so they prep stock | Average sales by hour and weekday from settled receipts |

**Why judges will buy it:** the AI is not a chatbot bolted on. It sets the risk limits that make offline payments safe, and the blockchain makes its decisions auditable.

## BLE mesh (concept only)

The mesh is a pitch slide, not a build: it shows how receipts would reach the chain even if neither phone gets signal for hours.

- Every UMak Pay phone on campus relays receipts to nearby phones over Bluetooth Low Energy.
- Receipts hop phone to phone until one reaches a phone with internet, which submits them to `/settle`.
- Duplicates are harmless: the contract already skips any payment ID it has settled.
- **Why not in the demo:** a browser PWA cannot advertise over Bluetooth, so this needs a native app (React + Capacitor) or relay hardware. That is the post-hackathon roadmap.

## Team, timeline and demo

### Team split (4 people)

| Person | Owns |
| --- | --- |
| 1 | Contract in Remix, Amoy deploy, `settleBatch()` call from Fastify |
| 2 | Fastify API, SQLite, `/link`, `/sync`, `/settle`, AI risk scoring and fraud flags |
| 3 | POS screen: Web NFC, PIN pad, offline queue, receipt QR |
| 4 | Cashier screen (MetaMask mint), student `/me` screen, AI assistant, pitch deck |

### Timeline (24 hours)

| Hours | Done when |
| --- | --- |
| 0–2 | Real UMak ID reads in Chrome; contract deployed; faucet tokens in both wallets |
| 2–8 | Link an ID and mint 500 pesos from MetaMask |
| 8–14 | Online tap + PIN payment settles on Amoy |
| 14–18 | Offline payment, receipt QR, student phone settles it on reconnect |
| 18–21 | AI caps + fraud flag + assistant; seed demo data |
| 21–24 | Rehearse, finish deck, record backup video |

### Demo script (3 minutes)

1. **Problem (30s):** cash lines, dead signal, no audit trail.
2. **Load (20s):** cashier taps the ID, mints 500 pesos in MetaMask, explorer shows the tx.
3. **Pay offline (40s):** POS and student phone in airplane mode. Tap ID, enter PIN, pay 85 pesos, student scans the receipt QR.
4. **Settle (30s):** student phone leaves airplane mode; receipt flips to Settled with an explorer link.
5. **AI (40s):** tap the same ID at a second stall a minute later; the fraud flag fires and its offline cap drops to 0. Ask the assistant what was spent today.
6. **Roadmap (20s):** BLE mesh relay, anti-clone IDs, UMak pilot.

Record a backup video of the whole flow before judging.

## Known limits

Say these before the judges ask.

| Limit | Answer |
| --- | --- |
| ID UIDs can be cloned | PIN, AI offline caps and clone detection limit the damage; anti-clone IDs are on the roadmap |
| Two offline stalls could both spend the last pesos | The contract rejects the overdraft at settlement and the AI zeroes that ID's offline cap |
| A receipt only settles when a phone gets signal | Both phones carry it; BLE mesh relay is the roadmap answer |
| The server runs the system | Every settled payment is public and permanent on the chain |
| Students without a phone | They can still pay; the merchant POS settles the receipt instead |
| Testnet only | No real money; a pilot would need university approval and BSP review |
