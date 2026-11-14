---
title: Fix profile lightbox height collapse on iOS Safari
date: 2026-11-14
summary: Diagnosed WebKit flex fit-content 32px crop on msmy.io.vn certificate lightbox and locked TDD + dual-stage plan
---

# Fix profile lightbox height collapse on iOS Safari

## What happened
- Investigated screenshot from iPhone Safari (`1284x2778` / `428x926 @3x`) on `https://msmy.io.vn` where clicking a certificate opened `<dialog id="imgModal">` with only a ~32px horizontal slice of the image visible.
- Proved root cause in `apps/profile/public/index.html` lines 1514-1576: `dialog.modal-dialog[open]` (`display: flex; flex-direction: column`, no explicit height) combined with `.modal-body` (`flex: 1`, `overflow-y: auto`, `justify-content: center`) collapses `.modal-body` content height to `0px` (leaving `32px` padding) while centering the full image across that 0px box and clipping top/bottom.

## Decision
- Switch `dialog.modal-dialog[open]` to `display: block` with `overflow-y: auto`, sticky `.modal-header` (with top corner radius + non-shrinking close button), rounded bottom corners on `.modal-body`, explicit `max-height: max(160px, calc(90dvh - 150px))` on `.lightbox-img`, and `getBoundingClientRect()` backdrop hit-testing so scrollbar clicks do not close the modal.
- Sync thumbnail `naturalWidth`/`naturalHeight` onto `#modalImg` before `showModal()` and clean up on `close`.
- Confirmed Stage 2 (`main`) ships ONLY `apps/profile` and `apps/e2e/specs/profile-lightbox.spec.ts` (per user choice and PR #705 precedent).

## Next steps
- Create tracking GitHub issue (`ai-handle`, `bug`), run TDD RED -> GREEN -> E2E + WebKit checks, capture 3 viewport POT screenshots, and ship `--both` (`develop` then `main`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
