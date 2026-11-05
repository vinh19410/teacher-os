# Phase 01 — Xoá khối ExamEnglish

<!-- Updated: Validation & Red-Team Session 1 - handover contract (--advice), preserve getCombinedPlacement().trim().slice(0, 300), mechanical Verify + Failure Protocol -->

## Goal

Xoá hoàn toàn khối `<details id="examEnglishDetails">`, CSS `.examenglish-*`, và logic JS/draft liên quan khỏi `apps/profile/public/index.html`, giữ nguyên hợp đồng gửi `placement` chỉ từ `quizPlacementInput` (tối đa 300 ký tự) mà không phát sinh lỗi console hay lệch bố cục form.

## Context

Xem [plan.md](plan.md). Khối được thêm ở #506 như ô tuỳ chọn; nay bỏ hẳn theo issue #559. Plan này đạt chuẩn handover `--advice` kèm `## Failure Protocol` bắt buộc bên dưới.

## Files to Create or Modify

- Sửa:
  - `apps/profile/public/index.html`
  - `apps/profile/tests/index.test.mjs`
  - `CHANGELOG.md`
- Không sửa: output build `apps/profile/dist/`, `apps/profile/public/kiem-tra-dau-vao/*`, `apps/e2e/*`, plan/journal cũ.

## Tasks & Steps

### Task 1.1 — Thêm kiểm tra biên dịch inline `<script>` (`node:vm`) vào `apps/profile/tests/index.test.mjs`
- **Goal:** Chặn triệt để lỗi `SyntaxError` trong `<script>` inline của `apps/profile/public/index.html` (bù đắp việc `biome.json:37` loại trừ file này), không viết mock DOM cồng kềnh hay source-text regex dư thừa theo Scope Lock của Kongming.
- **Target files and symbols:** `apps/profile/tests/index.test.mjs` (thêm 1 test ở cuối file sử dụng `vm.Script` từ `node:vm`).
- **Steps:**
  1. Import `vm` từ `"node:vm"` ở đầu `apps/profile/tests/index.test.mjs`.
  2. Ở cuối `apps/profile/tests/index.test.mjs`, thêm test trích xuất mọi thẻ `<script>` thực thi JS inline (không có thuộc tính `src` và không có `type` khác rỗng/`text/javascript`/`module`, ví dụ bỏ qua `application/ld+json`), khẳng định tìm thấy ít nhất 1 khối `<script>`, và biên dịch từng khối qua `new vm.Script(code)` không ném lỗi.
- **Success criteria:** Test biên dịch `<script>` chạy xanh và sẽ fail ngay nếu bất kỳ thao tác xoá JS nào ở Task 1.2 để sót dấu phẩy/ngoặc gây `SyntaxError`.
- **Verify:** `pnpm --filter profile test` thoát với mã `0` (`pass 19`, `fail 0`).

### Task 1.2 — Xoá CSS `.examenglish-*`, HTML `<details id="examEnglishDetails">`, và tham chiếu JS/draft trong `apps/profile/public/index.html`
- **Goal:** Loại bỏ hoàn toàn CSS, HTML và logic JS/draft của ExamEnglish khỏi `apps/profile/public/index.html` mà không đổi tên `getCombinedPlacement()` và không làm mất `.trim().slice(0, 300)`.
- **Target files and symbols:** `apps/profile/public/index.html`:
  - CSS `.examenglish-details`, `.examenglish-details summary`, `.examenglish-body`, `.examenglish-body a` (`1445–1470`).
  - HTML `<details class="field full-span examenglish-details" id="examEnglishDetails">…</details>` (`2835–2847`).
  - JS `const examEnglishInput` (`3220`), `getCombinedPlacement()` (`3304–3310`), `saveDraft()` (`3324–3325`), `restoreDraft()` (`3361`).
- **Steps:**
  1. Xoá trọn 4 khối CSS `.examenglish-details`, `.examenglish-details summary`, `.examenglish-body`, `.examenglish-body a` (`1445–1470`), giữ nguyên `.quiz-applied-banner`.
  2. Xoá trọn thẻ `<details class="field full-span examenglish-details" id="examEnglishDetails">…</details>` (`2835–2847`), giữ nguyên `#quizPlacementInput` và `#quizPlacementBanner`.
  3. Xoá dòng `const examEnglishInput = document.getElementById('examEnglishInput');`.
  4. Thay thân hàm `getCombinedPlacement()` (giữ nguyên tên hàm để bảo toàn cả 3 điểm gọi tại `buildFallbackZaloMessage`, `renderSuccessSummary`, và handler `submit`) thành chính xác:
     ```js
     function getCombinedPlacement() {
       return quizPlacementInput ? quizPlacementInput.value.trim().slice(0, 300) : '';
     }
     ```
  5. Trong `saveDraft()`, xoá dòng `examEnglish: examEnglishInput.value` và bỏ dấu phẩy thừa cuối dòng `quizPlacement: quizPlacementInput.value`.
  6. Trong `restoreDraft()`, xoá dòng `if (typeof draft.examEnglish === 'string') examEnglishInput.value = draft.examEnglish;`.
- **Success criteria:** Không còn bất kỳ chuỗi `examenglish` nào trong `apps/profile/public/index.html`; `getCombinedPlacement` xuất hiện đúng 4 lần (1 định nghĩa + 3 điểm gọi).
- **Verify:** `test "$(grep -ci 'examenglish' apps/profile/public/index.html || true)" = "0" && test "$(grep -c 'getCombinedPlacement' apps/profile/public/index.html)" = "4"` thoát với mã `0`.

### Task 1.3 — Chạy TDD Green & kiểm tra lint/build của `apps/profile`
- **Goal:** Xác nhận toàn bộ unit test của `apps/profile` (bao gồm test mới ở Task 1.1), `build.mjs`, và `biome check` đều xanh.
- **Target files and symbols:** `apps/profile/tests/*.test.mjs`, `apps/profile/build.mjs`.
- **Steps:**
  1. Chạy `pnpm --filter profile test`.
  2. Chạy `pnpm --filter profile build` và kiểm tra `apps/profile/dist/index.html` không chứa `examenglish`.
  3. Chạy `pnpm exec biome check .` (kiểm tra `apps/profile/tests/index.test.mjs` và toàn repo).
- **Success criteria:** Toàn bộ bài test `profile` (19/19) pass, build thành công, `dist/index.html` sạch `examenglish`, và `biome check .` báo 0 lỗi.
- **Verify:** `pnpm --filter profile test && pnpm --filter profile build && test "$(grep -ci 'examenglish' apps/profile/dist/index.html || true)" = "0" && pnpm exec biome check .` thoát với mã `0`.

### Task 1.4 — Smoke test trình duyệt thực tế ở 3 viewport + keyboard focus + E2E lead intake
- **Goal:** Xác minh trực quan và hành vi đầu-cuối trên Chromium thật ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow + keyboard `Tab` focus theo `AGENTS.md`/`REVIEW.md`, không chạm production API.
- **Target files and symbols:** `apps/profile/serve.mjs`, `apps/e2e/specs/profile-lead-intake.spec.ts`.
- **Steps:**
  1. Khởi chạy `LEAD_API_URL=http://localhost:8100 PORT=8105 node apps/profile/serve.mjs` (tuyệt đối không để mặc định trỏ `https://api.teacheros.io.vn`).
  2. Trên Chromium thật, mở `http://localhost:8105/?ketqua=Ki%E1%BB%83m+tra+%C4%91%E1%BA%A7u+v%C3%A0o%3A+22%2F30+%E2%80%93+CEFR+B1#dang-ky-tu-van` ở 3 viewport `1440×900`, `768×1024`, `375×812` (và kiểm `320×812` không tràn ngang):
     - Kiểm tra `#examEnglishDetails === null`, không còn chữ `examenglish`, `#quizPlacementBanner` hiện đúng kết quả đính kèm, `0` console error.
     - Đặt focus vào `#targetNote` rồi nhấn `Tab`: xác nhận focus chuyển thẳng tới `#submitLeadBtn` (không bị kẹt ở phần tử ẩn/xoá).
     - Chụp ảnh màn hình khu vực `#dang-ky-tu-van` ở cả 3 viewport lưu vào `/tmp/559-viewport-*.png` (phục vụ kiểm tra trực quan, không làm bẩn git).
     - Mock/intercept `POST http://localhost:8100/public/leads` trả `201 { id: "lead-smoke" }`, điền Tên + SĐT mới, bấm `#submitLeadBtn` và xác nhận JSON request gửi đi có `placement === "Kiểm tra đầu vào: 22/30 – CEFR B1"` và `<dl id="leadSummaryList">` hiển thị `Kết quả test` đúng giá trị đó, `0` console error.
  3. Dừng tiến trình `serve.mjs` trên cổng `8105`, sau đó chạy E2E thật `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/profile-lead-intake.spec.ts` để chứng minh tạo lead thật vào SQLite không hồi quy.
- **Success criteria:** 3 viewport + 320px không tràn ngang, `Tab` đi thẳng từ `#targetNote` sang `#submitLeadBtn`, gửi form kèm `?ketqua=` giữ nguyên `placement` trong cả request lẫn `#leadSummaryList`, `0` console error, và `profile-lead-intake.spec.ts` pass xanh.
- **Verify:** Smoke script trình duyệt in `SMOKE_3VP_OK` (với `consoleErrors: 0`, `tabTargetId: "submitLeadBtn"`, `submittedPlacement: "Kiểm tra đầu vào: 22/30 – CEFR B1"`) VÀ lệnh Playwright `specs/profile-lead-intake.spec.ts` thoát với mã `0`.

### Task 1.5 — Cập nhật `CHANGELOG.md` và kiểm tra vệ sinh repo
- **Goal:** Ghi nhận thay đổi `#559` vào `CHANGELOG.md` theo đúng quy ước ngày của repo và kiểm tra `git status` sạch.
- **Target files and symbols:** `CHANGELOG.md` (thêm mục `## 2026-11-04` → `### Removed`).
- **Steps:**
  1. Thêm mục `## 2026-11-04` → `### Removed` vào đầu danh sách ngày trong `CHANGELOG.md` mô tả việc gỡ khối tuỳ chọn `"Đã làm test examenglish?"` khỏi form đăng ký trên `apps/profile` (`#559`).
  2. Chạy `pnpm exec biome check .` và `git status --short`.
- **Success criteria:** `CHANGELOG.md` có dòng ghi nhận `#559`, `biome check .` thoát `0`, `git status --short` chỉ chứa đúng các file thuộc phạm vi (`apps/profile/public/index.html`, `apps/profile/tests/index.test.mjs`, `CHANGELOG.md`, `plans/261103-2312-559-remove-examenglish-block/*`).
- **Verify:** `grep -q "(#559)" CHANGELOG.md && pnpm exec biome check .` thoát với mã `0`.

## Verification

- `test "$(grep -ci 'examenglish' apps/profile/public/index.html || true)" = "0"` thoát `0`.
- `pnpm --filter profile test` thoát `0`.
- `pnpm exec biome check .` thoát `0`.
- Smoke test Chromium 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` + keyboard `Tab` + E2E `specs/profile-lead-intake.spec.ts` thoát `0`, `0` console error.

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
## Risk / Rollback

- Rủi ro thấp: sót tham chiếu `examEnglishInput` gây `ReferenceError`/`TypeError` làm hỏng script form, hoặc làm mất `.slice(0, 300)` gây HTTP 400 — được chặn bởi Verify của Task 1.3 và Task 1.4.
- Rollback: `git revert` commit sửa `apps/profile/public/index.html`.
