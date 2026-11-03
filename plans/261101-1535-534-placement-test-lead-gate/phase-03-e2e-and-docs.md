---
phase: 3
title: "E2E, test hồi quy & tài liệu"
status: completed
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E, hồi quy & tài liệu

## Goal

Cập nhật e2e hiện có theo hành vi mới (gate + lead), thêm kịch bản cho gate, và đồng bộ tài liệu/copy còn nói "không cần điền thông tin".

## Files to Create / Modify

- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `apps/e2e/specs/placement-test-editor.spec.ts`
- Modify: `apps/profile/public/index.html` (cập nhật mục 4 trong `#lam-test-mien-phi` dòng 2185–2188 cho khớp luồng điền thông tin trước khi làm bài)
- Modify: `docs/codebase-summary.md` và `docs/production-release-runbook.md` (cập nhật mô tả luồng `/kiem-tra-dau-vao/` tạo lead `source = placement-test` ở bước gate và đồng bộ `placement` khi nộp bài)

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - include placement-test-editor.spec.ts, wait for elapsedMs/score sync, explicit index.html:2186-2187 copy target, and advice handover structure -->

### Task 3.1 — Cập nhật copy `apps/profile/public/index.html` và tài liệu `docs/`
- **Goal:** Đồng bộ nội dung giới thiệu bài test trên trang chủ và tài liệu kỹ thuật với luồng gate mới.
- **Target files and symbols:**
  - `apps/profile/public/index.html` (section `#lam-test-mien-phi`, mục 4 dòng 2185–2188)
  - `docs/codebase-summary.md` (mục `apps/profile`)
  - `docs/production-release-runbook.md` (mục smoke test `/kiem-tra-dau-vao/`)
- **Steps:**
  1. Trong `apps/profile/public/index.html:2185-2188`, đổi mục `"4. Không cần đăng nhập trước"` thành mô tả đúng: không cần tạo tài khoản hay mật khẩu; chỉ cần điền họ tên, email và số điện thoại Zalo trước khi vào Phần 1 để nhận ngay điểm từng phần, mức CEFR ước tính và lộ trình gợi ý sau khi nộp bài.
  2. Cập nhật `docs/codebase-summary.md` và `docs/production-release-runbook.md` ghi nhận bước điền thông tin tạo lead (`source = "placement-test"`, email bắt buộc) trước Phần 1 và đồng bộ điểm `placement` khi nộp bài.
- **Success criteria:** Không còn câu chữ mâu thuẫn với bước gate; `pnpm --filter profile test` xanh.
- **Verify:** `pnpm --filter profile test` thoát mã 0.

### Task 3.2 — Cập nhật E2E `profile-placement-test.spec.ts` và `placement-test-editor.spec.ts`, chạy toàn bộ gate
- **Goal:** E2E kiểm chứng đầy đủ bước gate `info`, tạo lead `source = placement-test`, đồng bộ điểm khi nộp bài, giữ thông tin khi reload, xoá khi bấm "Đổi thông tin", xử lý lỗi 500, 3 viewport + bàn phím, và giữ xanh `placement-test-editor.spec.ts`.
- **Target files and symbols:**
  - `apps/e2e/specs/profile-placement-test.spec.ts`
  - `apps/e2e/specs/placement-test-editor.spec.ts`
- **Steps:**
  1. Trong `apps/e2e/specs/placement-test-editor.spec.ts` (bước 6, dòng ~179–191): trước hoặc sau khi bấm `#startTestBtn`, điền form bước `info` (hoặc seed `lead` đã đăng ký trong `localStorage`) để vào Phần 1 và kiểm tra `fieldset[data-question-id="vg-01"]` như cũ.
  2. Trong `apps/e2e/specs/profile-placement-test.spec.ts`:
     - Cập nhật test luồng chính: sau khi bấm `#startTestBtn` hiện bước `info`; điền họ tên, email, SĐT (`uniquePhone`), đảm bảo qua ngưỡng `LEAD_MIN_ELAPSED_MS` (3000ms) rồi gửi form ⇒ vào Phần 1, DB có đúng +1 dòng `lead` (`source = "placement-test"`, `email` đúng, `placement = ""`, `submit_count = 1`); sau khi nộp bài (chờ request đồng bộ điểm hoàn tất) ⇒ **vẫn 1 dòng** cho SĐT đó với `placement` khớp `expectedSummary` và `submit_count = 2`; reload trang kết quả không làm tăng `submit_count`; bấm `"Đăng Ký Theo Kết Quả Này"` chuyển về `#dang-ky-tu-van` điền sẵn thông tin và gửi tiếp vẫn hợp nhất vào cùng 1 dòng lead.
     - Thêm test các kịch bản gate (dọn `ip_hash` trước mỗi test):
       - Thiếu/sai từng trường bắt buộc (`name`, `email`, `phone`) ⇒ hiện lỗi tiếng Việt, `aria-invalid="true"`, focus ô lỗi đầu tiên, không vào Phần 1, không tạo dòng lead.
       - API trả `500` ở bước gửi form ⇒ vẫn ở bước `info`, hiện thông báo lỗi kèm nút Thử lại + link Zalo, không vào Phần 1.
       - Bấm `"Không phải bạn? Đổi thông tin"` ⇒ xoá `lead` khỏi `localStorage` và quay về bước `info`.
     - Trong test 3 viewport (`1440×900`, `768×1024`, `375×812`) + điều hướng bàn phím: kiểm tra cả bước `info` (không tràn ngang ở 3 viewport, chụp screenshot, điều hướng bàn phím + focus ring) rồi qua Phần 1 & Phần 2.
  3. Chạy toàn bộ gate: `pnpm exec biome check .`, `pnpm check-types`, unit/integration tests, và `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e`.
- **Success criteria:** Toàn bộ lint, typecheck, unit tests và Playwright E2E suite đều xanh.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter profile test && E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e` thoát mã 0.

## Verification

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter profile test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e`

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

- E2E dùng chung bucket IP `unknown`: mỗi test tạo lead mới phải dọn `ip_hash` hoặc đặt `CF-Connecting-IP` riêng, nếu không test sau bị 429.
- Rollback: revert commit; không có thay đổi dữ liệu/hạ tầng.
