# HeronPay Design Brief

Direction **A. Receipt**, picked 2026-11-13 (replaces B, see `docs/adr/0002-visual-direction-receipt.md`). Source: `docs/design/board.html` (look board, direction A only) and its plain export `docs/design/board-A/`. Impeccable's `DESIGN.md` at the repo root records the same system in its own format; if the two disagree, the board wins and both docs get fixed in the same change.

## The idea

The receipt is the proof. HeronPay draws every payment as the subject's own artifact: a torn thermal-paper slip on a deep navy ground. Approved prints the slip; Settled stamps it with the block number. Gold is the one action colour. Amounts, ids and hashes are set in mono because they are data.

## Rules that must hold

1. **Material 3 structure.** Top app bar 64. Navigation bar 80 on phones (<600 px), navigation rail 80 wide from 600 px. One extended FAB per screen, only for its single primary action (`/me`: Scan receipt). M3 buttons (40, large CTA 56), chips 32, filled text fields 56, dialogs for decisions that must interrupt, snackbars for transient feedback. Touch targets at least 48 px, 8 px apart.
2. **Tokens only.** Every colour comes from the role table below through Tailwind classes (`bg-surface-container`, `text-on-surface-variant`, `bg-paper`, ...). No literal hex in components, except the QR code (always black on white).
3. **Dark by default, light fully designed.** Both themes meet WCAG AA (4.5:1 text), paper and stamp pairs included. Checked for every pair on the board.
4. **The receipt slip is the signature.** Use `slip()` (zig-zag torn edges via CSS mask, mono rows, TOTAL, optional QR) wherever a payment is shown as one object: POS Approved, student Receipt, landing demo, intro step 3. Lists stay M3 list items with status chips. Stamps (SETTLED green with block number, PENDING blue) sit in reserved space at the bottom of the slip and never cover text.
5. **Status never by colour alone.** Pending, Settled, Failed and Flagged chips always carry an icon and a word.
6. **Fonts.** Sora for display, headline and title roles. Manrope for body and label roles. JetBrains Mono only for data: receipt rows, transaction hashes, receipt ids, student numbers.
7. **Icons.** Material Symbols Rounded, weight 400, optical size 24; filled for the active nav item and status chips.
8. **Gold means an action.** `cta` (gold) fills filled buttons, the FAB and the wordmark tile only. Avatars and decoration use `secondary-container`.
9. **Copy.** English and Filipino with a toggle; Filipino needs a native review before launch. No eyebrow labels above headings. No "·" separators.
10. **Motion.** M3 emphasized easing `cubic-bezier(.2,0,0,1)`; screen changes 300 ms; status changes 200 ms; snackbar enters 300 ms with `cubic-bezier(.05,.7,.1,1)`. Slip prints in (clip from top) 400 ms emphasized-decelerate; stamp lands 200 ms; NFC ring loops 1.6 s. Everything off under `prefers-reduced-motion`.
11. **Sample data is labeled.** Until the contract is deployed, every name, stall, transaction and stat on screen carries a "Sample" chip.

## Colour roles (M3 + success, warning, cta, paper, stamp)

UMak gold `#F2C230` is a **placeholder** until the team confirms the school's hex value. Change the seeds in `DIRS.A` on the board and the roles below follow.

| Role | Dark | Light |
| --- | --- | --- |
| `--surface` | `#10141F` | `#F2F4F8` |
| `--on-surface` | `#E7EAF2` | `#151A26` |
| `--surface-container-lowest` | `#0A0D14` | `#FFFFFF` |
| `--surface-container-low` | `#181B26` | `#ECEFF3` |
| `--surface-container` | `#1D212C` | `#E8EAEF` |
| `--surface-container-high` | `#232732` | `#E3E5E9` |
| `--surface-container-highest` | `#2C303A` | `#DDDFE4` |
| `--on-surface-variant` | `#ABAEB7` | `#575B65` |
| `--outline` | `#7C7F89` | `#7F838B` |
| `--outline-variant` | `#3F434D` | `#C6C8CE` |
| `--primary` | `#F2C230` | `#6F5400` |
| `--on-primary` | `#261C00` | `#FFFFFF` |
| `--primary-container` | `#4F4524` | `#F2C230` |
| `--on-primary-container` | `#EED27E` | `#261C00` |
| `--secondary` | `#9DB4FF` | `#2A4FC0` |
| `--on-secondary` | `#0B1A4A` | `#FFFFFF` |
| `--secondary-container` | `#37415E` | `#D9DFF4` |
| `--on-secondary-container` | `#BBCAFA` | `#132456` |
| `--tertiary` | `#A8C0FF` | `#3355C2` |
| `--on-tertiary` | `#0A1A44` | `#FFFFFF` |
| `--tertiary-container` | `#3B445E` | `#DAE0F4` |
| `--on-tertiary-container` | `#C1D1FA` | `#172657` |
| `--error` | `#FFB4AB` | `#BA1A1A` |
| `--on-error` | `#690005` | `#FFFFFF` |
| `--error-container` | `#534146` | `#F3D6D6` |
| `--on-error-container` | `#F5CAC7` | `#540C0C` |
| `--success` | `#7CDCA6` | `#146C43` |
| `--on-success` | `#00391F` | `#FFFFFF` |
| `--success-container` | `#2E4C45` | `#D5E5DD` |
| `--on-success-container` | `#A7E2C4` | `#09311E` |
| `--warning` | `#F7B866` | `#8A5000` |
| `--on-warning` | `#3B2300` | `#FFFFFF` |
| `--warning-container` | `#514233` | `#EAE0D1` |
| `--on-warning-container` | `#F1CC9E` | `#3E2400` |
| `--inverse-surface` | `#DADDE5` | `#222733` |
| `--inverse-on-surface` | `#212530` | `#E0E3E7` |
| `--inverse-primary` | `#6D5716` | `#F2C230` |
| `--scrim` | `#000000` | `#000000` |
| `--cta` | `#F2C230` | `#F2C230` |
| `--on-cta` | `#261C00` | `#261C00` |
| `--paper` | `#F3F0E6` | `#FFFFFF` |
| `--on-paper` | `#1D1C18` | `#1D1C18` |
| `--paper-muted` | `#6E6D66` | `#737270` |
| `--stamp` | `#146C43` | `#146C43` |
| `--stamp-pending` | `#2E4FB8` | `#2E4FB8` |

Status chips use the `*-container` pair (Settled = success, Pending = tertiary, Failed and Flagged = error). Elevation is tonal (`surface-container-*`); shadow level 3 only on FAB, snackbar and dialog.

## Type (M3 roles, rem)

| Role | Size / line | Font |
| --- | --- | --- |
| display-l / m / s | 3.5625/4, 2.8125/3.25, 2.25/2.75 | Sora |
| headline-l / m / s | 2/2.5, 1.75/2.25, 1.5/2 | Sora |
| title-l / m / s | 1.375/1.75, 1/1.5, 0.875/1.25 | Sora |
| body-l / m / s | 1/1.5, 0.875/1.25, 0.75/1 | Manrope |
| label-l / m / s | 0.875/1.25, 0.75/1, 0.6875/1 | Manrope |

Landing h1 is the one exception: 2.75 / 4 / 4.5 / 5.5 rem by breakpoint (never above 6 rem).

## Shape, spacing, breakpoints

- Shape: card 12, button full, FAB 16, chip 8, dialog 28, text field 4 4 0 0, snackbar 4.
- Spacing: 4 px base (4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96, 112). Cards pad 16; screens pad 16 at the sides.
- Tailwind screens: `medium` 600, `expanded` 840, `large` 1200, `xlarge` 1600, `wide` 1920.
- App content column 600 max, centered. Landing container 1200, then 1440 from 1600 px; full-bleed bands stop at 1920 and center. `/ops` grid 380 + fluid (440 + fluid from 1600), 1760 max.

## Sources

- Look board and decisions: `docs/design/board.html`, `docs/design/first-look.md`.
- Material 3 values: m3.material.io (components, type scale, shape, motion). The site did not render for an automated fetch during the design session; check the numbers above against it before the build (secondary until verified).
