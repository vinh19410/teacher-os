---
title: "Fix student proof images and card alignment on profile landing page"
description: "Replace stale/mismatched proof images in #hoc-vien-noi-gi with cleanly cropped screenshots from assets/imports, fix .chat-contain CSS so screenshots fit without cropping, and align card copy/attribution."
status: completed
priority: P1
effort: "1h"
tags: [profile, ui, bugfix]
created: 2026-11-17
---

# Fix Student Proof Images and Card Alignment (`#hoc-vien-noi-gi`)

## Overview

Fix the "Học viên nói gì" (`#hoc-vien-noi-gi`) section on `apps/profile/public/index.html` where:
1. CSS `.proof-img-wrap img.chat-contain` overrides contain behavior with `object-fit: cover; object-position: center top;`, zooming into phone status bars and cropping chat text.
2. Card 1 uses a blurry 193×258 thumbnail (`feedback-global-offer.png`), Card 2 uses a mismatched Talkshow screenshot (`student-feedback.jpg`) instead of Po Le's message, and Card 3 uses a 210×152 classroom selfie (`class-offline-selfie.png`) instead of the IELTS 7.0 student feedback screenshot.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Replace the 3 card images with cleanly cropped, metadata-stripped screenshots from `assets/imports/` | P1 |
| 2 | Restore `object-fit: contain` framing on `.proof-img-wrap img.chat-contain` with zoom-pill clearance and responsive sizing | P1 |
| 3 | Align quotes, authors, captions, and alt text of all 3 cards with the verified screenshots and remove orphaned assets | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Update Proof Assets, CSS Alignment, Copy, and Tests](./phase-01-start.md) | Pending |

## Success Criteria

- [x] `.proof-img-wrap img.chat-contain` inherits `.proof-img-wrap img` positioning and sets `object-fit: contain; object-position: center;` with bottom clearance so full chat feedback renders uncropped inside `.proof-card`.
- [x] All 3 cards in `#hoc-vien-noi-gi` reference verified, cleanly cropped, metadata-stripped PNGs under `apps/profile/public/assets/teacher-profile/images/` (`feedback-global-offer.png`, `feedback-po-le.png`, `feedback-ielts-70.png`), with Card 1–3 quotes/authors/alt/lightbox captions matching their screenshots.
- [x] Orphaned replaced images (`student-feedback.jpg`, `class-offline-selfie.png`) and scratch `assets/imports/` are removed.
- [x] `apps/profile/tests/index.test.mjs` includes TDD regression assertions covering the 3 proof card assets, `.chat-contain` CSS, and lightbox wiring.
- [x] `pnpm --filter profile test`, `PROFILE_MAINTENANCE=false pnpm --filter profile build`, `pnpm exec biome check .`, `pnpm check-types`, and targeted Playwright `profile-lightbox.spec.ts` + 3-viewport verification (1440×900, 768×1024, 375×812) pass cleanly.

## Red Team Review

### Session — 2026-11-17
**Findings:** 12 total across 2 lenses (10 accepted / modified, 0 rejected, 2 overlapping asset-orphan findings merged)
**Severity breakdown:** 2 Critical, 4 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `feedback-po-le.png` contains Notification Center chrome and translucent wallpaper face | Critical | Accept (modified) | Phase 1 (crop `y=88..302`) |
| 2 | `maintenance.json` `"disabled": true` skips `dist/` copy on default build & port `8105` collides with Playwright | Critical | Accept | Phase 1 (build env + port `8115`) |
| 3 | `IMG_4949.PNG` bottom crop slices blue bubble & retains student avatar face | High | Accept (modified) | Phase 1 (crop `y=282..2212` + avatar blur) |
| 4 | `feedback-phuong-anh.png` top crop `y=460` leaves pinned-banner shadow | High | Accept (modified) | Phase 1 (crop `y=480..2050`) |
| 5 | Separating `.chat-contain` CSS risks dropping `position: absolute` & mobile 300px height/zoom-pill overlap | High | Accept | Phase 1 (inherit base positioning + clearance + responsive height) |
| 6 | Unstripped PNG EXIF/XMP metadata & deferred `assets/imports/` cleanup | Medium | Accept | Phase 1 (strip metadata + delete `assets/imports/` after generation) |
| 7 | Orphaned replaced images (`student-feedback.jpg`, `class-offline-selfie.png`) still copied to `dist/` | Medium | Accept | Phase 1 (delete unused assets) |
| 8 | `profile-lightbox.spec.ts` certificate dimension assertions incompatible with proof screenshots | Medium | Accept | Phase 1 (aspect-appropriate positive bounds) |
| 9 | Card 1 & Card 2 quote/subtitle alignment underspecified | Medium | Accept | Phase 1 (exact verified copy) |

## Validation Log

### Session — 2026-11-17
- **User Decisions Locked (`ask_question`):**
  - Keep 3 proof cards in `#hoc-vien-noi-gi`: Card 1 ← `IMG_4949.PNG`, Card 2 ← `feedback-po-le.png`, Card 3 ← `feedback-phuong-anh.png`, syncing quotes and attribution to match the real screenshots.
  - Restore `.chat-contain` to `object-fit: contain` with balanced padding and clean cropping of phone/notification chrome.
- **Verification Results:** All file paths, CSS selectors, `maintenance.mjs`/`build.mjs` behavior, `playwright.config.ts` port settings, and pixel coordinates verified directly against source files and images (`Failed: 0`).
- **Whole-Plan Consistency Sweep:** `plan.md` and `phase-01-start.md` agree on asset paths, exact crop bounds, CSS inheritance, exact card copy, orphaned-file cleanup, and verification commands.

<!-- slug: fix-profile-student-proof-images -->
