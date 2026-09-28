## 1. Presentation

- [x] 1.1 Create product presentation data and source-documented brand assets.
- [x] 1.2 Implement discovery-first cards, honest Rewards context and compact real account states.
- [x] 1.3 Implement accessible product dialogs and existing product-specific email contact.

## 2. Verification

- [x] 2.1 Test cards, dialogs, keyboard behavior, contact context and empty/unavailable account states.
- [x] 2.2 Run frontend checks, responsive visual review and strict OpenSpec validation; leave local preview available.

Verification: Astro check (62 files, zero errors/warnings), 5 contract tests, 24 desktop/mobile browser tests including 320px, screenshots inspected, strict OpenSpec validation and git diff --check passed. Live local Titanio smoke: Productos HTTP 200, three cards, dialog opens/closes. No product/contact submission or database mutations. Marketing/partner-asset approval remains a prerequisite for publication, not part of this local preview.

## 3. Brand-first commercial revision

- [x] 3.1 Replace card/dialog copy with aspirational product messages and direct Me interesa contact.
- [x] 3.2 Implement horizontal brand-led panels with larger logos; remove generic Rewards and instructional blocks while retaining account states.
- [x] 3.3 Update and run regression tests, responsive visual checks and validate the revised change; verify local preview.

Revision verification: Astro check (62 files, zero errors/warnings/hints), 5 contract tests, 24 desktop/mobile browser regression tests passed; the 8 product-specific tests were rerun after replacing the low-resolution Skandia image with original vector outlines from its official brand guide. Desktop and 320px screenshots inspected. Live local Titanio smoke returned HTTP 200, the new heading, 3 panels, 3 product-specific mailto links, 0 dialogs and both logos loaded. No contact submission or product/database changes. Strict OpenSpec validation and git diff --check passed. This supersedes the first iteration's dialog/Rewards presentation; publication still requires team approval of copy and partner-mark usage.

## 4. Compact card revision

- [x] 4.1 Restore a compact three-column desktop catalog with proportionate brand headers, preserving current commercial copy and direct contact.
- [x] 4.2 Verify card density, untruncated content, aligned actions and responsive layouts; rerun frontend and spec checks.

Compact revision verification: 26 desktop/mobile Playwright tests, 5 contract tests and Astro check (62 files, zero errors/warnings/hints) passed. Density assertions cover three aligned cards under 460px tall at 1280px/1024px, two columns at 768px/600px, shallow brand headers, complete text and single-column 320px cards under 500px without horizontal overflow. Desktop and 320px screenshots inspected. Strict OpenSpec validation and git diff --check passed. Product content, email destinations, APIs and customer data are unchanged in this revision.

## 5. Goal-specific contact copy

- [x] 5.1 Add the approved product-specific CTA labels and human closing invitation, retaining compact cards and existing email destinations; defer contact-channel changes.
- [x] 5.2 Verify exact copy, unchanged contact URLs, keyboard access and responsive card density; run frontend checks and strict spec validation.

Goal-specific copy verification: all 26 desktop/mobile browser tests and 5 contract tests pass; Astro check reports zero errors/warnings/hints. Exact CTA and closing text, unchanged mailto destinations/subjects, keyboard navigation, card dimensions and absence of new WhatsApp/form contact paths are covered. Desktop and 320px screenshots inspected; button spacing adjusted to retain compact cards. Strict OpenSpec validation and git diff --check pass. No new contact channel, advisor identity, lead storage or customer-data changes.

## 6. Confirmed display reward amounts

- [x] 6.1 Display Skandia 600, Quálitas 150 and Modalidad 40 600 points in compact labels above contact, without changing backend reward rules or inventing crediting conditions.
- [x] 6.2 Verify exact amounts, compact responsive layout, unchanged contact behavior and frontend/spec checks.

Scope note: amounts were explicitly provided by the owner after the points discussion. Crediting conditions and production activation were not confirmed and remain outside this UI change; resolve them before publication.

Display amounts verification: 28 desktop/mobile Playwright tests and 5 contract tests passed; Astro check reports zero errors/warnings/hints. Tests confirm the three exact amount mappings, labels above their CTAs, no award form/action or invented crediting condition, unchanged mailto destinations and compact responsive layout including 320px. Desktop card-height allowance increased by one short label row (under 500px); mobile remains under 500px. Desktop and 320px screenshots inspected. Strict OpenSpec validation and git diff --check passed. No backend reward rules, balances, levels or database mutations.
