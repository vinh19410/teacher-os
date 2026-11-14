---
title: "Phase 1: Start"
status: todo
---

# Phase 1: Start — Sửa lỗi CSS/JS Lightbox và Kiểm thử TDD + E2E

## Goal

Khắc phục triệt để lỗi `#imgModal` bị sụp chiều cao cắt ảnh còn ~32px trên iOS Safari/WebKit tại `apps/profile/public/index.html`, bảo toàn `#pdfModal`, đồng thời hoàn thiện bộ test TDD unit/contract và E2E regression để phát hành an toàn qua cả `develop` (Stage 1) và `main` (Stage 2).

## Files to Create / Modify

- Modify: `apps/profile/tests/index.test.mjs` — thêm contract test cho CSS/JS của `dialog.modal-dialog`, `.modal-header`, `.modal-body`, `.pdf-iframe`, `.lightbox-img` và handler `imgModal`/`pdfModal`.
- Create: `apps/e2e/specs/profile-lightbox.spec.ts` — thêm E2E spec kiểm tra kích thước thật, tỷ lệ khung hình, giới hạn nằm trọn trong dialog và thao tác đóng/mở nhiều ảnh ở viewport mobile & desktop.
- Modify: `apps/profile/public/index.html` — cập nhật CSS block `DIALOG MODALS (PDF & IMAGE LIGHTBOX)` (dòng ~1513–1577) và JS block `// 1. Image lightbox` + `// 2. PDF Modal` (dòng ~2305–2347).

## Tasks & Steps

### Task 1.1 — Pha RED: Viết unit/contract test cho modal lightbox và kiểm chứng fail trước khi sửa
<!-- Updated: Red Team Session 1 - thêm kiểm tra bo góc dưới .modal-body và backdrop rect click -->
- **Goal:** Tạo bài test cơ học trong `apps/profile/tests/index.test.mjs` bắt buộc các bất biến CSS & JS tránh tái diễn lỗi flexbox collapse của `#imgModal`, lẹm góc bo và đóng nhầm khi click thanh cuộn.
- **Target files and symbols:** `apps/profile/tests/index.test.mjs` (thêm `test("modal-dialog CSS avoids flex height collapse and JS resets image dimensions on close", ...)`).
- **Steps:**
  1. Đọc phần cuối file `apps/profile/tests/index.test.mjs` (quanh dòng 572–629).
  2. Thêm test kiểm tra trên `html` (`apps/profile/public/index.html`):
     - Trích nội dung `<style>` (loại bỏ comment `/* ... */`).
     - Khẳng định rule `dialog.modal-dialog[open]` đặt `display: block` và không chứa `flex-direction: column`.
     - Khẳng định rule `dialog.modal-dialog` có `width: min(94vw, 1080px)`, `max-width: min(94vw, 1080px)`, `max-height: 90vh`, `max-height: 90dvh`, `overflow-y: auto`.
     - Khẳng định rule `.modal-header` có `position: sticky`, `border-top-left-radius`, `border-top-right-radius`, rule `.modal-header h3` có `min-width: 0`, và rule `.modal-header .btn` có `flex-shrink: 0`.
     - Khẳng định rule `.modal-body` không chứa `flex: 1`, không chứa `overflow-y: auto`, và có `border-bottom-left-radius` + `border-bottom-right-radius`.
     - Khẳng định rule `.lightbox-img` có `width: auto`, `height: auto`, `max-width: 100%`, `object-fit: contain`, `calc(90vh - 150px)` và `calc(90dvh - 150px)`.
     - Khẳng định JS block `// 1. Image lightbox` đọc kích thước `thumb = el.querySelector('img')`, gán `modalImg.width`/`modalImg.height` khi `thumb.naturalWidth > 0`, đặt `imgModal.scrollTop = 0`, dùng `getBoundingClientRect()` khi click backdrop để không đóng nhầm khi kéo/bấm thanh cuộn, và xóa `width`/`height` trong `imgModal.addEventListener('close', ...)`.
  3. Chạy `pnpm --filter profile test` để xác nhận trạng thái RED.
- **Success criteria:** Test mới phát hiện đúng trạng thái code cũ (RED) trong khi 32 test có sẵn vẫn pass.
- **Verify:** `pnpm --filter profile test` — expected RED state: command exits non-zero (`1`) với đúng 1 assertion failure ở test mới vừa thêm (`modal-dialog CSS avoids flex height collapse...`). (Lưu ý TDD: nếu command exit 0 ở bước này là FAIL quy trình).

### Task 1.2 — Pha RED: Viết E2E regression spec cho `#imgModal`
<!-- Updated: Red Team Session 1 - dùng ngưỡng kích thước theo viewport + web-first assertion tránh race với close event -->
- **Goal:** Tạo E2E spec độc lập kiểm tra popup `#imgModal` mở trọn ảnh chứng chỉ (không bị cắt 32px) trên mobile (`375×812` & `428×926`) và desktop (`1440×900`).
- **Target files and symbols:** `apps/e2e/specs/profile-lightbox.spec.ts` (import `{ expect, test } from "@playwright/test"` và `{ PROFILE_ORIGIN } from "./origins"`).
- **Steps:**
  1. Tạo file `apps/e2e/specs/profile-lightbox.spec.ts`.
  2. Viết test cho mobile (`375×812`, `428×926`) và desktop (`1440×900`):
     - `page.goto(PROFILE_ORIGIN)`.
     - Cuộn tới `#co-my-la-ai` và click `[data-lightbox-src*="cert-uol-coursera-2022.png"]`.
     - Chờ `#imgModal` visible và `#imgModalTitle` chứa `"Chứng chỉ University of London (2022)"`, chờ `modalImg.complete && modalImg.naturalWidth > 0`.
     - Đo bounding box của `#imgModal`, `.modal-header`, `#modalImg`: kiểm tra `imgBox.width >= Math.floor(dlgBox.width * 0.75)` và `imgBox.height >= 200` (ảnh chứng chỉ UoL tỷ lệ `1980×1530` tại cả 3 viewport đều > 200px cao, chứng minh không bị cắt khe `32px`), `Math.abs(imgBox.width / imgBox.height - natW / natH) < 0.02`, `imgBox.top >= headerBox.bottom - 1`, `imgBox.bottom <= dlgBox.bottom + 1`, `imgBox.left >= dlgBox.left`, `imgBox.right <= dlgBox.right`, và không tràn ngang (`dlg.scrollWidth <= dlg.clientWidth + 1`).
     - Click `#closeImgModal`, dùng web-first auto-retrying assertions của Playwright kiểm tra `await expect(imgModal).not.toBeVisible()`, `await expect(modalImg).not.toHaveAttribute("src")`, `await expect(modalImg).not.toHaveAttribute("width")`, `await expect(modalImg).not.toHaveAttribute("height")`.
     - Click mở tiếp `[data-lightbox-src*="cert-vinschool-2017.png"]`, kiểm tra `imgBox.height >= 350`, đúng tỷ lệ dọc và nằm trọn trong dialog.
- **Success criteria:** File spec hợp lệ TypeScript và Biome lint, sẵn sàng chạy sau khi áp dụng bản sửa ở Task 1.3.
- **Verify:** `pnpm exec biome check apps/e2e/specs/profile-lightbox.spec.ts apps/profile/tests/index.test.mjs` exits 0 với 0 errors.

### Task 1.3 — Pha GREEN: Sửa CSS & JS modal lightbox trong `apps/profile/public/index.html`
<!-- Updated: Red Team Session 1 - thêm bo góc dưới .modal-body và hit-test rect cho backdrop click -->
- **Goal:** Thay đổi cấu trúc layout của `dialog.modal-dialog` sang block-scrolling với sticky header và sizing rõ ràng cho `.lightbox-img` & `.pdf-iframe` để ảnh hiển thị trọn vẹn trên iOS Safari/WebKit và mọi trình duyệt.
- **Target files and symbols:**
  - `apps/profile/public/index.html` (CSS dòng 1513–1577: `dialog.modal-dialog`, `dialog.modal-dialog[open]`, `dialog.modal-dialog::backdrop`, `.modal-header`, `.modal-header h3`, `.modal-header .btn`, `.modal-body`, `.pdf-iframe`, `.lightbox-img`).
  - `apps/profile/public/index.html` (JS dòng 2305–2347: block `// 1. Image lightbox` và `// 2. PDF Modal` backdrop click).
- **Steps:**
  1. Cập nhật khối CSS `DIALOG MODALS (PDF & IMAGE LIGHTBOX)`:
     - `dialog.modal-dialog`: giữ `margin: auto; width: min(94vw, 1080px);`, thêm `max-width: min(94vw, 1080px); max-height: 90vh; max-height: 90dvh; overflow-x: hidden; overflow-y: auto;`.
     - `dialog.modal-dialog[open]`: đổi thành `display: block;` (gỡ `display: flex; flex-direction: column;`).
     - `dialog.modal-dialog::backdrop`: thêm `-webkit-backdrop-filter: blur(4px);` trước `backdrop-filter: blur(4px);`.
     - `.modal-header`: thêm `position: sticky; top: 0; z-index: 1; flex-shrink: 0; border-top-left-radius: calc(var(--radius-lg) - 2px); border-top-right-radius: calc(var(--radius-lg) - 2px);`.
     - `.modal-header h3`: thêm `min-width: 0; overflow-wrap: break-word;`.
     - Thêm rule `.modal-header .btn { flex-shrink: 0; }`.
     - `.modal-body`: xóa `flex: 1;`, `flex-direction: column;`, và `overflow-y: auto;`; giữ `padding: var(--space-4); display: flex; align-items: center; justify-content: center; background: var(--paper-sunken);` và thêm `border-bottom-left-radius: calc(var(--radius-lg) - 2px); border-bottom-right-radius: calc(var(--radius-lg) - 2px);`.
     - `.pdf-iframe`: đặt `display: block; width: 100%; height: max(240px, calc(90vh - 150px)); height: max(240px, calc(90dvh - 150px));`.
     - `.lightbox-img`: đặt `display: block; width: auto; height: auto; max-width: 100%; max-height: max(160px, calc(90vh - 150px)); max-height: max(160px, calc(90dvh - 150px)); object-fit: contain;`.
  2. Cập nhật khối JS `// 1. Image lightbox` & `// 2. PDF Modal`:
     - Dùng arrow function, trước `modalImg.src = src;` kiểm tra `const thumb = el.querySelector('img');` — nếu `thumb && thumb.naturalWidth > 0 && thumb.naturalHeight > 0` thì gán `modalImg.width = thumb.naturalWidth; modalImg.height = thumb.naturalHeight;`, ngược lại `modalImg.removeAttribute('width'); modalImg.removeAttribute('height');`.
     - Sau `imgModal.showModal();`, gán `imgModal.scrollTop = 0;`.
     - Trong `imgModal.addEventListener('close', () => { ... })`, xóa `src`, `width`, `height`.
     - Thay `if (e.target === modal) modal.close()` bằng helper arrow function `isBackdropClick(modal, e)` kiểm tra `e.target === modal && e.detail !== 0` và tọa độ `e.clientX`/`e.clientY` nằm ngoài `modal.getBoundingClientRect()` (áp dụng cho cả `imgModal` và `pdfModal`) để click thanh cuộn không đóng modal.
- **Success criteria:** Toàn bộ test unit của `apps/profile` chuyển sang GREEN, không phát sinh lỗi hay cảnh báo Biome mới.
- **Verify:** `pnpm --filter profile test` exits 0 và `pnpm --filter profile build` exits 0.

### Task 1.4 — Kiểm định toàn diện Local Gates, WebKit thật, E2E spec lẻ và chụp ảnh POT
<!-- Updated: Red Team Session 1 - dùng lệnh Node playwright-core@1.63.0 thay cho gọi trực tiếp pw_run.sh -->
- **Goal:** Chứng minh bản sửa hoạt động đúng trên Chromium, WebKit thật (mô phỏng iOS Safari), đáp ứng toàn bộ gate chất lượng và có đủ 3 ảnh chụp POT ở 3 viewport chuẩn (`1440×900`, `768×1024`, `375×812`).
- **Target files and symbols:**
  - Verify toàn repo & tạo 3 ảnh POT tại `plans/reports/<ISSUE_NUM>-profile-lightbox-{375x812,768x1024,1440x900}.png` (đặt đúng `<ISSUE_NUM>` ngay sau bước tạo GitHub Issue).
- **Steps:**
  1. Chạy `pnpm check:fix` (nếu có format nhẹ cho file test mới) rồi chạy `pnpm exec biome check .` (0 errors).
  2. Chạy `pnpm check-types` và `pnpm test` (toàn bộ pass).
  3. Kiểm tra port `8100..8105` trống, sau đó chạy đúng 1 spec E2E lẻ:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-lightbox.spec.ts`
  4. Chạy lệnh Node `node -e` dùng `playwright-core@1.63.0` (`webkit.launch({ executablePath: "/root/.cache/ms-playwright/webkit-2388/pw_run.sh" })`) mở server cục bộ từ `apps/profile/serve.mjs`, kiểm tra toàn bộ 6 ảnh `[data-lightbox-src]` tại các viewport `320×568`, `375×812`, `428×926`, `768×1024`, `1440×900` (đo `fullyInsideDlg`, `dlgScroll`, `aspectDiff < 0.02`, header/close button visible, backdrop click vs inside click, `#pdfModal` width >= 600 trên desktop), và lưu 3 ảnh chụp POT cho chứng chỉ University of London.
- **Success criteria:** Tất cả lệnh gate exit 0, WebKit 0 clipping trên cả 6 ảnh ở mọi viewport, 3 ảnh POT rõ nét và đủ nội dung.
- **Verify:** `pnpm exec biome check . && pnpm --filter profile test && pnpm --filter profile build && pnpm check-types && pnpm test` đều exit 0; `profile-lightbox.spec.ts` exits 0; lệnh Node `playwright-core` WebKit exit 0 và in `fullyInsideDlg: true` cho toàn bộ 6 ảnh.

## Todo

- [x] Task 1.1: Viết unit/contract test RED trong `apps/profile/tests/index.test.mjs`
- [x] Task 1.2: Viết E2E spec `apps/e2e/specs/profile-lightbox.spec.ts`
- [x] Task 1.3: Sửa CSS & JS lightbox trong `apps/profile/public/index.html` (GREEN)
- [x] Task 1.4: Chạy toàn bộ local gates, WebKit check, E2E spec lẻ và chụp ảnh POT 3 viewport

## Verification

- `pnpm --filter profile test` (RED trước khi sửa → GREEN sau khi sửa, 0 fail)
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/profile-lightbox.spec.ts` (exit 0)
- Lệnh Node `playwright-core@1.63.0` (`webkit.launch({ executablePath: "/root/.cache/ms-playwright/webkit-2388/pw_run.sh" })`) kiểm tra cả 6 ảnh tại `320×568`, `375×812`, `428×926`, `768×1024`, `1440×900` (exit 0)
- `pnpm exec biome check .` (0 errors)
- `pnpm --filter profile build` (exit 0)
- `pnpm check-types` (exit 0)
- `pnpm test` (exit 0)

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
