# ADR 0002: Visual direction "Receipt" replaces "Campus ID"

Date: 2026-11-13. Status: accepted. Supersedes ADR 0001.

## Context

ADR 0001 picked direction B (Campus ID). Before any build work started, the owner switched to direction A (Receipt) and asked for B and C to be removed so the team focuses on one look.

## Decision

Build direction **A. Receipt**: Material 3 components and colour roles on a deep navy ground, gold as the one action colour, and every payment drawn as a torn thermal-paper slip that is printed on Approved and stamped on Settled. Dark is the default theme; light is fully designed. Tokens and rules: `docs/standards/design-brief.md` and `DESIGN.md`. B and C were deleted from the look board and their export.

## Why

- The receipt is HeronPay's proof: offline approval, the receipt QR, and on-chain settlement are all moments in one receipt's life, so the slip carries the whole story.
- It is the most distinctive of the three, and the stamped slip is a strong demo moment.

## Consequences

- The slip (CSS mask) and the stamp are custom components on top of standard M3; budget build time for them.
- Hard to reverse once screens are built; the slip appears on POS Approved, the student Receipt, the landing demo and the intro.
- The gold hex is a placeholder; confirming it changes only the seed.
