---
title: "fix-profile-lightbox-full-image"
description: "Sửa lỗi popup lightbox trên apps/profile (msmy.io.vn) cắt ảnh chứng chỉ còn khe 32px trên iOS Safari và bổ sung kiểm thử TDD + E2E"
status: pending
priority: P1
effort: "2h"
tags: [bugfix, profile, safari, lightbox, tdd]
created: 2026-11-14
---

# fix-profile-lightbox-full-image

## Overview

Khắc phục triệt để lỗi hiển thị popup phóng to ảnh (`<dialog id="imgModal">`) trên trang `apps/profile` (`https://msmy.io.vn`), nơi ảnh chứng chỉ (ví dụ `Chứng chỉ University of London (2022)`) bị cắt chỉ còn một dải ngang ~32px ở giữa ảnh trên iOS Safari (`428×926 @3x` / `1284×2778`). Kế hoạch áp dụng quy trình `--tdd` và hợp đồng bàn giao `--advice` dưới giám sát của `kongming`.

## Root Cause (Đã chứng minh)

- Trong `apps/profile/public/index.html` (CSS dòng 1514–1576, JS dòng 2305–2333):
  1. `dialog.modal-dialog` có `max-height: 90dvh` và `height` mặc định `fit-content`, trong khi `dialog.modal-dialog[open]` đặt `display: flex; flex-direction: column`.
  2. `.modal-body` đặt đồng thời `flex: 1` (`flex-basis: 0%`), `overflow-y: auto` (`min-height: auto` = `0px` theo CSS Flexbox §4.5) và `display: flex; flex-direction: column; justify-content: center`.
  3. Khi WebKit/Safari tính chiều cao nội tại `fit-content` của flex column `<dialog>`, `.modal-body` đóng góp `0px` chiều cao nội dung (chỉ giữ lại `32px` từ `padding: 16px` trên/dưới). `<img class="lightbox-img">` bên trong bị `justify-content: center` đẩy tràn đối xứng lên trên (vùng âm không thể cuộn tới) và xuống dưới, bị `overflow-y: auto` cắt đúng khe `32px` ở chính giữa ảnh.
- Tác động phụ cần phòng tránh (theo tham vấn `kongming` + Red-Team):
  - Giữ `width: min(94vw, 1080px)` trên `dialog.modal-dialog` để `#pdfModal` (`<iframe>`) không bị co hẹp.
  - Bo cả góc trên `.modal-header` (`border-top-left-radius` / `border-top-right-radius: calc(var(--radius-lg) - 2px)`) và góc dưới `.modal-body` (`border-bottom-left-radius` / `border-bottom-right-radius: calc(var(--radius-lg) - 2px)`) để khi `dialog.modal-dialog` dùng `overflow-y: auto` (thay `overflow: hidden`), nền xanh/xám không lẹm ra ngoài viền vàng bo tròn trên WebKit.
  - Đặt `min-width: 0; overflow-wrap: break-word;` cho `.modal-header h3` và `flex-shrink: 0` cho `.modal-header .btn` để tiêu đề dài trên màn `375px` không ép méo nút `Đóng`.
  - Cập nhật backdrop click handler cho cả `#imgModal` và `#pdfModal` bằng kiểm tra tọa độ ngoài `getBoundingClientRect()` để thao tác bấm/kéo thanh cuộn trên `dialog.modal-dialog` không vô tình đóng modal.
  - Xác nhận trước Stage 2: `origin/main` đã có `PROFILE_ORIGIN` (`apps/e2e/specs/origins.ts:12`) và webServer `profile` (`apps/e2e/playwright.config.ts:132-142`), khớp hoàn toàn với `origin/develop`.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Sửa CSS & JS lightbox/modal trong `apps/profile/public/index.html` (`dialog.modal-dialog`, `.modal-header`, `.modal-body`, `.pdf-iframe`, `.lightbox-img`, `imgModal` JS handler).
  - Thêm unit/contract test trong `apps/profile/tests/index.test.mjs`.
  - Thêm Playwright E2E spec đơn lẻ trong `apps/e2e/specs/profile-lightbox.spec.ts`.
  - Phát hành `--both`: Stage 1 (`fix/profile-lightbox-full-image` → `develop`) và Stage 2 (`release/fix-profile-lightbox` tách từ `origin/main` chỉ lấy `apps/profile` + `apps/e2e/specs/profile-lightbox.spec.ts` từ `origin/develop` → `main`).
- **Explicit Non-Goals:**
  - Không thêm body scroll-lock (`body { overflow: hidden }`) gây scroll jump trên iOS Safari.
  - Không viết lại `#pdfModal` hay thay `<iframe>` bằng PDF.js.
  - Không gộp 30 commit đang chờ của `develop` vào `main`.
  - Không cài thư viện lightbox bên ngoài.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Hiển thị đầy đủ toàn bộ ảnh chứng chỉ/phản hồi trong `#imgModal` trên iOS Safari & desktop ở mọi kích thước màn hình (`320px`, `375×812`, `428×926`, `768×1024`, `1440×900`) | P1 |
| 2 | Bảo toàn hành vi `#pdfModal`, nút `Đóng`, `Esc`, click backdrop, và giữ sạch state `modalImg` (`src`/`width`/`height`) khi đóng | P1 |
| 3 | Bao phủ hồi quy bằng TDD unit/contract test + Playwright E2E spec riêng cho lightbox | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] `pnpm --filter profile test` đạt trạng thái RED ở test mới trước khi sửa code, và PASS 100% sau khi sửa code.
- [ ] `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-lightbox.spec.ts` PASS 100% trên mobile (`375×812`, `428×926`) & desktop (`1440×900`).
- [ ] Kiểm tra trên WebKit thật qua Playwright-Core (`playwright-core@1.63.0` trỏ tới `webkit-2388/pw_run.sh`) ở `320×568`, `375×812`, `428×926`, `768×1024`, `1440×900`: cả 6 ảnh `[data-lightbox-src]` hiển thị trọn vẹn bên trong `#imgModal` (`aspectDiff < 0.02`, không cắt khe `32px`, nút `Đóng` không bị chèn ép, không tràn ngang).
- [ ] Các cổng chất lượng local `pnpm exec biome check .`, `pnpm --filter profile build`, `pnpm check-types`, `pnpm test` đều PASS.
- [ ] Stage 1 (`develop` / staging) và Stage 2 (`main` / `https://msmy.io.vn`) đều deploy xanh và xác nhận HTML live trên `https://msmy.io.vn`.

## Red Team Review

### Session — 2026-11-14
**Findings:** 8 (sau khi gộp trùng từ 10 phát hiện thô của Security Adversary & Assumption Destroyer: 5 accepted, 3 rejected)
**Severity breakdown:** 2 Critical (1 accepted-modified, 1 rejected), 3 High (3 accepted), 3 Medium (2 accepted, 1 rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Lệnh WebKit ở Task 1.4 tham chiếu thô `pw_run.sh` thay vì Node Playwright-Core script | Critical | Accept (modified) | Phase 1 (Task 1.4, Verification) |
| 2 | Stage 2 cherry-pick `profile-lightbox.spec.ts` lên `main` thiếu `playwright.config.ts` / `origins.ts` | Critical | Reject | Đã kiểm chứng `origin/main` có sẵn `PROFILE_ORIGIN` và `profile` webServer; thêm preflight check |
| 3 | Flex row `.modal-body` làm bounding box `cert-vinschool-2017.png` sai tỷ lệ trên `1440×900` | Critical | Reject | Thực nghiệm trực tiếp trên Chromium & WebKit ra `491×660` (`natRatio = 0.7444`) |
| 4 | `overflow-y: auto` trên `dialog.modal-dialog` làm click thanh cuộn kích hoạt `e.target === imgModal` | High | Accept | Phase 1 (Task 1.1, Task 1.3) |
| 5 | Assertion tĩnh `imgBox.width >= 280` & `imgBox.height >= 200` fail tại `320px` hoặc ảnh `210×152` | High | Accept | Phase 1 (Task 1.2) |
| 6 | Không bo góc dưới `.modal-body` gây lẹm nền xám `#EFECE2` ra ngoài viền vàng trên WebKit | Medium | Accept | Phase 1 (Task 1.1, Task 1.3), Plan Root Cause |
| 7 | Kiểm tra xoá `src`/`width`/`height` trên `#modalImg` cần dùng web-first assertion tránh race với event `close` | Medium | Accept | Phase 1 (Task 1.2) |

### Verification Results
- **Tier:** Light (1 phase)
- **Claims checked:** 7
- **Verified:** 7 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 5 (bo góc dưới `.modal-body`, backdrop rect check chống đóng nhầm khi click scrollbar, web-first assertion trong E2E, ngưỡng kích thước theo viewport/ảnh thật trong E2E, lệnh Node Playwright-Core rõ ràng cho WebKit check)
- Reconciled stale references: 5
- Unresolved contradictions: 0

<!-- slug: fix-profile-lightbox-full-image -->
