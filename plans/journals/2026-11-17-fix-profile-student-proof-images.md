---
title: Fix student proof images and card alignment on profile landing page (#757)
date: 2026-11-17
summary: Replaced blurry/mismatched proof screenshots in #hoc-vien-noi-gi with cleanly cropped metadata-stripped PNGs, restored .chat-contain object-fit: contain framing, aligned card copy/attribution, and verified 3 viewports plus Playwright lightbox tests.
---

# Fix Student Proof Images and Card Alignment (`#hoc-vien-nói-gì`) (#757)

## What happened
- Diagnosed why the "Học viên nói gì" (`#hoc-vien-noi-gi`) section on `apps/profile/public/index.html` did not align with the design:
  1. `.proof-img-wrap img.chat-contain` was grouped under `.proof-img-wrap img` with `object-fit: cover; object-position: center top;`, zooming portrait phone screenshots into the top status bar and cropping chat messages.
  2. Card 1 pointed to a blurry `193x258` `feedback-global-offer.png` thumbnail, Card 2 pointed to an unrelated Talkshow screenshot (`student-feedback.jpg`), and Card 3 pointed to a `210x152` classroom selfie (`class-offline-selfie.png`).
- User confirmed keeping 3 cards, mapping `IMG_4949.PNG`, `feedback-po-le.png`, and `feedback-phuong-anh.png` from `assets/imports/`, syncing card quotes/attribution, and restoring `.chat-contain` to `object-fit: contain`.

## Decisions & Fixes
- Cropped and stripped all EXIF/XMP/text PNG metadata into `apps/profile/public/assets/teacher-profile/images/`:
  - `feedback-global-offer.png` (`900x1485`, cropped `y=282..2212` with student avatar blurred).
  - `feedback-po-le.png` (`504x214`, cropped `y=88..302` removing Notification Center header, `[Hình ảnh]` card, and lock-screen background face).
  - `feedback-ielts-70.png` (`900x1208`, cropped `y=480..2050` below pinned-banner shadow).
- Deleted orphaned `student-feedback.jpg`, `class-offline-selfie.png`, and scratch `assets/imports/`.
- Separated `.proof-img-wrap img.chat-contain` from `.proof-img-wrap img` with `object-fit: contain; object-position: center; padding: var(--space-4) var(--space-4) 44px;`, bumped `@media (max-width: 768px)` `.proof-img-wrap` height to `360px`, and synced Card 1–3 copy and `data-lightbox-*` metadata.

## Verification
- `pnpm --filter profile test`: 54/54 passed (including new TDD regression test).
- `PROFILE_MAINTENANCE=false pnpm --filter profile build`: passed.
- `pnpm exec biome check .` & `pnpm check-types`: passed (`12/12` tasks).
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-lightbox.spec.ts`: 8/8 passed across 375×812, 428×926, 768×1024, and 1440×900.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
