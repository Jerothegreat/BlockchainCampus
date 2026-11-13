# References

Source: `UMak-Pay-Hackathon-PRD.md` (Nov 13, 2026). Grilling decisions are in `first-look.md`.

## Page types

HeronPay has two kinds of page:

1. **Product landing page** (`/`): a fintech or wallet product page that pitches the app and links into it.
2. **Phone app screens** (`/app`, `/cashier`, `/pos`, `/me`): a wallet plus point of sale, used on Android Chrome. `/ops` is a desktop dashboard for the projector.

## References (fetched 2026-11-13)

| Site | Page type | Section order | Worth taking |
| --- | --- | --- | --- |
| maya.ph | Wallet landing | Nav, hero carousel, 4 features, card promo, product promos, perks, user guide, deals, partner merchant logos, business, stories, closing CTA, footer | The "how to start" user-guide strip (Create account, Cash in) maps to our Load, Pay, Settle steps. The footer carries the regulator note, NPC/DPO seal, privacy and terms |
| gcash.com | Wallet landing | Nav (Customer/Business tabs), services menu, notice banner, promos, story video, stats ("Strength, in numbers"), #1 app + QR, download CTA, help prompt, regulatory and contact, footer | The Customer/Business split is our Student/Stall split. A stats band builds trust. A QR to open the app on a phone works for judges |
| squareup.com/point-of-sale | POS product page | Nav, product subnav (Overview, Pricing) with Get started / Contact sales, hero "A POS ready for what you've got" (the fetch stopped after the hero) | A short, plain hero that names the job. Two CTAs: one to start, one to talk |
| celo.org | Blockchain payments landing | Nav, hero, metrics band with sources (Dune, Celoscan), core components, ecosystem, differentiators, testimonials, footer (Privacy, Terms, Audits, Security) | Each on-chain number names its source. For us, every stat links to the Amoy explorer, so the proof can be checked |

**Section order we'll use on `/`:** nav, hero (tap the ID, pay offline) with "Open app", 3-step strip (Load, Pay offline, Settle), live proof band (settled payments and explorer link, from the contract), AI safety (offline caps, clone detection), Known limits (stated honestly), roadmap (BLE mesh, anti-clone IDs, UMak pilot), footer.

**App patterns taken from GCash/Maya:** balance as the hero number, one large primary action, a status tag on every transaction, a bottom tab bar.

## Launch checklist

This is a hackathon demo on a testnet. Items marked *demo* are needed for judging. The rest are needed before any real UMak pilot.

### Legal and data
- [ ] *demo*: "Testnet only, no real money" notice in the footer and on `/cashier`
- [ ] Privacy notice under the Philippine Data Privacy Act (RA 10173): what we collect (student number, name, ID UID **hashed**, PIN **hashed**, receipts), why, how long, who sees it. The on-chain record is public and permanent, so say so plainly
- [ ] Terms of use (credits are test tokens; no cash-out)
- [ ] Cookie policy: the PWA uses only essential storage (IndexedDB queue, login). **No cookie bar** unless analytics is added later
- [ ] Consent checkbox and a what-we-collect line on every form: linking an ID (`/cashier`), login (`/me`), the assistant (receipts go to an LLM API)
- [ ] Data requests: contact for access or deletion. On-chain entries cannot be deleted; only the off-chain link is removed
- [ ] Contact: team email (placeholder until the team gives one)
- [ ] Disclaimers: not affiliated with or endorsed by the University of Makati unless approved; a pilot needs university approval and BSP review
- [ ] NPC registration before any real pilot

### Accessibility
- [ ] WCAG AA contrast in both themes, including the dark ops theme and status tags
- [ ] Tap targets at least 48 px (PIN pad, keypad)
- [ ] Status is never shown by color alone (Pending/Settled/Failed tags have a word and an icon)
- [ ] `prefers-reduced-motion` turns off the scan pulse and status flip animation
- [ ] The PIN pad works with a screen reader; the PIN is never read aloud

### Performance
- [ ] PWA precaches the app shell so `/pos` and `/me` open in airplane mode
- [ ] Landing page LCP under 2.5 s on 4G; images in AVIF/WebP

### Sharing and search
- [ ] Title, description, Open Graph image for `/`
- [ ] `noindex` on `/app`, `/cashier`, `/pos`, `/me`, `/ops`

### Form reliability
- [ ] Offline queue survives reload (IndexedDB via dexie)
- [ ] Double submit is safe (the contract skips settled IDs; the UI disables the button while busy)
- [ ] Clear error copy for each state in `first-look.md`
