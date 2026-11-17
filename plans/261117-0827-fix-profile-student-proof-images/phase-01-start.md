---
phase: 1
title: "Phase 1: Update Proof Assets, CSS Alignment, Copy, and Tests"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Update Proof Assets, CSS Alignment, Copy, and Tests

## Goal

Align the `#hoc-vien-noi-gi` section in `apps/profile/public/index.html` with the design and real student screenshots from `assets/imports/`, backed by unit and Playwright visual verification across desktop, tablet, and mobile viewports.

## Files to Create / Modify

- Modify: `apps/profile/public/assets/teacher-profile/images/feedback-global-offer.png` (replace 193×258 blurry thumbnail with crisp cropped, metadata-stripped `assets/imports/IMG_4949.PNG` + avatar blur)
- Create: `apps/profile/public/assets/teacher-profile/images/feedback-po-le.png` (cleanly cropped `y=88..302`, metadata-stripped from `assets/imports/feedback-po-le.png`, removing `Zalo`/`Show less`/`X` bar and lock-screen face)
- Create: `apps/profile/public/assets/teacher-profile/images/feedback-ielts-70.png` (cleanly cropped `y=480..2050`, metadata-stripped from `assets/imports/feedback-phuong-anh.png`, excluding pinned banner shadow and bottom bar)
- Delete: `apps/profile/public/assets/pinned-post-20-10/student-feedback.jpg` (orphaned replaced asset)
- Delete: `apps/profile/public/assets/teacher-profile/images/class-offline-selfie.png` (orphaned replaced asset)
- Modify: `apps/profile/public/index.html` (CSS `.proof-img-wrap img.chat-contain` and `#hoc-vien-noi-gi` 3-card markup, exact quotes, authors, alt, and lightbox attributes)
- Modify: `apps/profile/tests/index.test.mjs` (TDD regression test for `#hoc-vien-noi-gi` proof images, `.chat-contain` CSS, and card content)
- Modify: `apps/e2e/specs/profile-lightbox.spec.ts` (verify `.proof-img-wrap` proof thumbnails and lightbox rendering with aspect-appropriate bounds)
- Cleanup: remove untracked `assets/imports/` immediately after generating and verifying the 3 final PNGs

<!-- Updated: Red-Team & Validation Session 2026-11-17 - adjusted crop coordinates, avatar/chrome privacy, CSS base inheritance, zoom-pill clearance, orphaned asset deletion, port 8115, and exact copy -->

## Test Matrix (TDD)

| Case | Verification | Expected Before Fix | Expected After Fix |
|------|--------------|---------------------|--------------------|
| `.chat-contain` CSS rule | `node --test apps/profile/tests/index.test.mjs` | `.proof-img-wrap img.chat-contain` uses `object-fit: cover` | `.proof-img-wrap img` retains shared absolute positioning; `.proof-img-wrap img.chat-contain` overrides `object-fit: contain` and `object-position: center` |
| 3 proof cards assets & class | `node --test apps/profile/tests/index.test.mjs` | Uses `student-feedback.jpg` and `class-offline-selfie.png`, Card 3 lacks `.chat-contain` | Uses `feedback-global-offer.png`, `feedback-po-le.png`, `feedback-ielts-70.png`, all 3 with `.chat-contain` and width ≥ 450px; old orphaned images absent |
| Lightbox & responsive alignment | Playwright `profile-lightbox.spec.ts` + 3-viewport screenshot check (1440×900, 768×1024, 375×812) | Cropped phone chrome / wrong image | Full chat bubble visible without clipping or zoom-pill overlap, `scrollWidth <= clientWidth`, lightbox opens proportional full image (`imgBox.width >= 250 && imgBox.height >= 100`) |

## Tasks & Steps

1. Write failing TDD assertions in `apps/profile/tests/index.test.mjs` checking:
   - `.proof-img-wrap img.chat-contain` sets `object-fit: contain` and `object-position: center` (not overridden by `object-fit: cover`).
   - All 3 `.proof-card` items in `#hoc-vien-noi-gi` use `.chat-contain` and point to `assets/teacher-profile/images/feedback-global-offer.png`, `assets/teacher-profile/images/feedback-po-le.png`, and `assets/teacher-profile/images/feedback-ielts-70.png`, with each image having width ≥ 450px.
2. Run `pnpm --filter profile test` to confirm RED state.
3. Generate the 3 cleanly cropped, metadata-stripped PNG assets into `apps/profile/public/assets/teacher-profile/images/` (stripping `eXIf`/`iTXt`/`tEXt` chunks by re-encoding fresh PIL images):
   - `feedback-global-offer.png`: from `assets/imports/IMG_4949.PNG`, crop `(0, 282, 1170, 2212)` (clean gap below teacher's blue bubble), blur the small circular student avatar (`(34, 108, 108, 182)` in cropped coords), resize to width `900px`.
   - `feedback-po-le.png`: from `assets/imports/feedback-po-le.png`, crop `(0, 88, 504, 302)` (`504×214`), removing `Zalo`/`Show less`/`X` bar, `[Hình ảnh]` card, and lock-screen face.
   - `feedback-ielts-70.png`: from `assets/imports/feedback-phuong-anh.png`, crop `(0, 480, 1170, 2050)` (below pinned-banner shadow and above bottom bar), resize to width `900px`.
   Inspect all 3 final PNGs with `read_file`, then delete `assets/imports/`, `apps/profile/public/assets/pinned-post-20-10/student-feedback.jpg`, and `apps/profile/public/assets/teacher-profile/images/class-offline-selfie.png`.
4. Update `apps/profile/public/index.html`:
   - Keep `.proof-img-wrap img` as the shared base (`position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center top; padding: 0;`) and add a separate `.proof-img-wrap img.chat-contain` rule overriding `object-fit: contain; object-position: center; padding: 14px 14px 44px;` (preventing `.zoom-pill` overlap); at `@media (max-width: 768px)` adjust `.proof-split .proof-img-wrap` height (`height: 360px; flex: 0 0 360px;` with `height: 240px; flex: 0 0 240px;` or natural fit where appropriate) and check all 3 viewports visually.
   - Update the 3 `.proof-card` blocks under `#hoc-vien-noi-gi`:
     - Card 1 (`Tiếng Anh công sở`): `feedback-global-offer.png`, quote `"Hello teacher, I have received the new offer from Global company. I want to say thank you for your instruction in English class. It helps me a lot during my interview process."`, author `Học viên Bảo Hân` / `Nhận offer từ công ty toàn cầu`.
     - Card 2 (`Giao tiếp`): `feedback-po-le.png`, quote `"Dạo này em họp em nói được liền lạc hơn, sếp em hiểu hết cái em muốn nói."`, author `Học viên Po Le` / `Lớp giao tiếp tiếng Anh`.
     - Card 3 (`IELTS`): `feedback-ielts-70.png`, quote `"Em cảm ơn cô nhiều đã đồng hành cùng em trên hành trình chinh phục 7.0 IELTS. Cô không chỉ giúp em hiểu hơn về IELTS, hướng dẫn cách làm bài mà còn cho em nhiều lời khuyên có ích."`, author `Học viên Đỗ Anh Thư` / `Chinh phục IELTS 7.0`.
5. Update `apps/e2e/specs/profile-lightbox.spec.ts` to also verify `.proof-img-wrap` proof lightbox openings using `assertContainedAndProportional(metrics)`, page-level `scrollWidth <= clientWidth`, and positive bounds (`imgBox.width >= 250 && imgBox.height >= 100`).
6. Run `pnpm --filter profile test`, `PROFILE_MAINTENANCE=false pnpm --filter profile build`, `pnpm check-types`, and `pnpm exec biome check .`.
7. Start standalone `PROFILE_MAINTENANCE=false PORT=8115 node apps/profile/serve.mjs`, capture 3-viewport (`1440×900`, `768×1024`, `375×812`) screenshots of `#hoc-vien-noi-gi` + lightbox into `plans/reports/`, inspect them with `read_file`, stop the `8115` server completely, then run `pnpm --filter e2e e2e specs/profile-lightbox.spec.ts` (using `E2E_*_PORT` overrides if local dev ports are busy).

## Verification

- `pnpm --filter profile test`
- `PROFILE_MAINTENANCE=false pnpm --filter profile build`
- `pnpm check-types`
- `pnpm exec biome check .`
- `pnpm --filter e2e e2e specs/profile-lightbox.spec.ts`
