---
phase: 3
title: "Nối CTA và form đăng ký"
status: completed
priority: P2
effort: "0.4d"
dependencies: [2]
---

# Phase 3: Nối CTA và form đăng ký

## Goal

Trang profile dẫn thẳng sang bài kiểm tra mới, không còn quiz cũ, và nhận kết quả vào form đăng ký.

## Files to Create / Modify

- Modify: `apps/profile/public/index.html`
- Modify: `apps/profile/tests/index.test.mjs`
- Modify: `apps/server/src/lead-catalog-drift.test.ts`

## Tasks & Steps

<!-- Updated: Red Team Session 1 - RT-2 elapsedMs backdating, RT-5 query validation & banner prefix, RT-6 lead-catalog-drift, RT-7 scoped 2-minute copy -->

### Task 3.1 — Cập nhật CTA, thay quiz 5 câu bằng phần giới thiệu trang kiểm tra 30 câu, và dọn JS/CSS cũ
- **Goal:** Mọi nút làm test trên `apps/profile/public/index.html` dẫn sang `kiem-tra-dau-vao/`; bỏ hẳn `form#placementQuizForm` và JS/CSS chỉ phục vụ quiz 5 câu.
- **Target files and symbols:** `apps/profile/public/index.html` (section `#lam-test-mien-phi`, các link CTA, CSS `.quiz-*`, JS mục 9).
- **Steps:**
  1. Đổi toàn bộ 7 `href="#lam-test-mien-phi"` sang `href="kiem-tra-dau-vao/"` (D7), gồm cả menu, hero, các thẻ khóa học và thanh nổi.
  2. Đổi chữ nút hero từ `"📝 Làm Bài Test Trình Độ Miễn Phí (2 Phút)"` thành `"📝 Làm Bài Kiểm Tra Đầu Vào Miễn Phí (30 Câu)"` và cập nhật tiêu đề/mô tả trong `#lam-test-mien-phi` (không đụng dòng `"chỉ trong 2 phút đọc"` của tài liệu PDF số 3 trong `#bo-ho-so-pdf`).
  3. Thay nội dung `form#placementQuizForm` và `aside#quizResultPanel` trong `#lam-test-mien-phi` bằng khung giới thiệu bài kiểm tra đầu vào 30 câu (Phần 1: 15 câu Ngữ pháp & Từ vựng; Phần 2: 5 đoạn Nghe hiểu – 15 câu; khoảng 25–30 phút; không cần đăng nhập; cần chuẩn bị tai nghe/loa; kèm quyền lợi 01 buổi Khám Bệnh Tiếng Anh 1-1 qua Google Meet và nút `"📝 Bắt Đầu Làm Bài Kiểm Tra (30 Câu)"` trỏ tới `kiem-tra-dau-vao/`).
  4. Xóa JS mục `"9. Interactive Placement Quiz Grading"` và các class CSS `.quiz-*` không còn dùng (`quiz-questions-list`, `quiz-q-card`, `quiz-q-title`, `quiz-options`, `quiz-opt-label`, `quiz-result-panel`, `quiz-score-badge`). Giữ nguyên `quizPlacementInput`, `quizPlacementBanner`, `.quiz-applied-banner`, `getCombinedPlacement()` và phần lưu nháp.
- **Success criteria:** Không còn `placementQuizForm` và `href="#lam-test-mien-phi"` trong `apps/profile/public/index.html`; `id="lam-test-mien-phi"` vẫn tồn tại.
- **Verify:** no verification needed (verified by Task 3.3 unit tests).

### Task 3.2 — Nhận kết quả kiểm tra từ query `?ketqua=&khoa=` vào form đăng ký (D8)
- **Goal:** Khi học viên bấm đăng ký từ trang kết quả về `/?ketqua=…&khoa=…#dang-ky-tu-van`, form điền sẵn kết quả và khóa đề xuất, xóa `ketqua`/`khoa` khỏi URL, và không bị bẫy chống bot `LEAD_MIN_ELAPSED_MS = 3000` làm rớt lead.
- **Target files and symbols:** `apps/profile/public/index.html` (`restoreDraft`, xử lý query D8 ngay sau `restoreDraft()`, `formRenderedAt`).
- **Steps:**
  1. Trong `restoreDraft()`, nếu khôi phục được bản nháp có sẵn dữ liệu (`draft.name || draft.phone || draft.quizPlacement`), lùi `formRenderedAt = Math.min(formRenderedAt, Date.now() - 3500)`.
  2. Ngay sau `restoreDraft()`, đọc `new URLSearchParams(window.location.search)`:
     - Lấy `rawKetqua = params.get('ketqua')` và `rawKhoa = params.get('khoa')`.
     - Nếu `rawKetqua` có mặt: làm sạch ký tự xuống dòng `rawKetqua.replace(/[\r\n]+/g, ' ').trim().slice(0, 300)`. Nếu chuỗi sau khi trim không rỗng: gán `quizPlacementInput.value = cleanKetqua`, `quizPlacementBanner.textContent = 'Đã đính kèm: ' + cleanKetqua`, `quizPlacementBanner.removeAttribute('hidden')`, và lùi `formRenderedAt = Date.now() - 3500`.
     - Nếu `rawKhoa` có mặt: `cleanKhoa = rawKhoa.trim()`. Chỉ khi `cleanKhoa.length > 0` và `Array.from(courseTrackSelect.options).some((opt) => opt.value === cleanKhoa)` thì mới gán `courseTrackSelect.value = cleanKhoa`.
     - Nếu có `rawKetqua !== null || rawKhoa !== null`: gọi `saveDraft()`, xóa `ketqua` và `khoa` khỏi `params`, rồi gọi `history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash)`.
- **Success criteria:** URL sạch `ketqua` và `khoa` sau khi tải trang; banner hiện `'Đã đính kèm: ...'` bằng `textContent`; khóa rỗng hoặc không hợp lệ không ghi đè khóa đã lưu trong nháp; gửi form ngay sau khi chuyển về từ trang test vẫn có `elapsedMs >= 3000`.
- **Verify:** no verification needed (verified by Task 3.3 and Phase 4 E2E).

### Task 3.3 — Cập nhật unit test `index.test.mjs` và `lead-catalog-drift.test.ts`
- **Goal:** Khóa hợp đồng CTA, nội dung trang chủ và đồng bộ mã khóa trong `questions.json` với `LEAD_COURSES`.
- **Target files and symbols:** `apps/profile/tests/index.test.mjs`, `apps/server/src/lead-catalog-drift.test.ts`.
- **Steps:**
  1. Thêm test vào `apps/profile/tests/index.test.mjs`:
     - Không còn `placementQuizForm` hay `quizResultPanel`.
     - Số `href="#lam-test-mien-phi"` bằng 0; có ít nhất 7 link trỏ tới `kiem-tra-dau-vao/`.
     - Vẫn còn `<section id="lam-test-mien-phi"`.
     - Không còn cụm `"2 Phút"` hay `"5 câu hỏi"` của bài quiz cũ.
  2. Thêm test vào `apps/server/src/lead-catalog-drift.test.ts`: đọc `apps/profile/public/kiem-tra-dau-vao/questions.json` và xác nhận mọi `band.course` trong `bands` đều thuộc `LEAD_COURSES`.
- **Success criteria:** Cả `pnpm --filter profile test` và `pnpm --filter server test` đều chạy xanh.
- **Verify:** `pnpm --filter profile test && pnpm --filter server test && pnpm exec biome check apps/profile apps/server` exits 0.

## Verification

- Thêm test vào `index.test.mjs`: không còn `placementQuizForm`; số `href="#lam-test-mien-phi"` bằng 0; có CTA `kiem-tra-dau-vao/`; `id="lam-test-mien-phi"` vẫn còn; không còn "2 Phút".
- `pnpm --filter profile test`
- `pnpm --filter server test` để chắc catalog khóa trong `lead-catalog-drift.test.ts` không bị ảnh hưởng.

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
## Risks

Xóa CSS `quiz-*` theo tiền tố có thể xóa nhầm class của form. Chỉ xóa sau khi `grep` xác nhận class không còn được dùng trong HTML hoặc JS.
