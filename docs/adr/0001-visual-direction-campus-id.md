# ADR 0001: Visual direction "Campus ID" on Material 3

Date: 2026-11-13. Status: superseded by ADR 0002 (direction A, Receipt). B was removed from the board.

## Context

HeronPay is a phone-first PWA (Android Chrome, Web NFC) for a 24-hour hackathon. The owner asked for a dark ops look with UMak flavor, Sora and Manrope, Material 3 phone guidelines, and an Impeccable review. Three directions were rendered on the look board (`docs/design/board.html`): A Receipt, B Campus ID, C Signal.

## Decision

Build direction **B. Campus ID**: Material 3 components and colour roles, UMak blue shell, gold actions, and the balance shown on a rendered student ID card. Dark is the default theme; light is fully designed. Tokens and rules are in `docs/standards/design-brief.md` and `DESIGN.md`.

## Why

- The ID card states the product's idea on every screen: the ID you already carry is the wallet.
- It is the closest of the three to M3 defaults, so the team can build it with standard components in 24 hours.
- The blue shell reads as UMak without the official seal (no affiliation claim).

## Consequences

- Hard to reverse after the build starts: colour roles, shapes, and the ID card component spread through every screen.
- The UMak hex values are placeholders; confirming them later changes only the seeds.
- A and C stay on the board as reference; nothing from them ships unless a later ADR says so.
