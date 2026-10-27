---
phase: 3
title: "E2E AC-003"
status: completed
effort: 2h
---

# Phase 3 — E2E AC-003

<!-- Updated: Red Team & Validation Session 1 - assert wallet unchanged, reload persistence, disabled/enabled publish gate, and navigation to /assignments/tests/$id + /assignments -->

## Goal

Kiểm chứng E2E đầu-cuối cho AC-003 của US-005 trên trình duyệt thật: sửa câu hỏi/đáp án và lưu nháp tốn 0 Credit (reload giữ nguyên nội dung đã sửa, ví giữ nguyên 25 Cr), nút `"Lưu vào Ngân hàng đề"` bị khóa khi chưa tích xác nhận câu `"(!) Cần rà soát lại"`, mở khóa khi tích xác nhận, và xuất bản thành công sang `/assignments/tests/<id>` + xuất hiện trong ngân hàng đề `/assignments`.

## Files to Create or Modify

- `apps/e2e/specs/ai-exam-import-ac-003.spec.ts`: spec Playwright kiểm chứng toàn bộ luồng AC-003.

## Tasks & Steps

### Task 3.1 — Viết và chạy E2E spec `ai-exam-import-ac-003.spec.ts`
- **Goal:** Spec `ai-exam-import-ac-003.spec.ts` pass ổn định trên stack E2E (port 8100/8101/8103/8104) và kiểm tra 3 viewport + keyboard focus.
- **Target files and symbols:** `apps/e2e/specs/ai-exam-import-ac-003.spec.ts`.
- **Steps:**
  1. Tạo `apps/e2e/specs/ai-exam-import-ac-003.spec.ts`:
     - Đăng ký tài khoản giáo viên mới qua `signUpViaUi(page)`, mở `/assignments/tests/import`, kiểm tra ví ban đầu `30 Cr`.
     - Upload `fixtures/exam-import/cambridge-sample.pdf` → chờ bóc tách xong (`Ví: 25 Cr`, có 1 câu gắn nhãn `(!) Cần rà soát lại`).
     - Sửa nội dung/đáp án của câu gắn nhãn (điền đáp án `"infrastructure"` cho câu 3), kiểm tra nhãn `(!) Cần rà soát lại` vẫn hiển thị và nút `"Lưu vào Ngân hàng đề"` đang `disabled` (vì chưa tích hộp kiểm xác nhận).
     - Bấm `"Lưu bản nháp"` → thấy thông báo đã lưu nháp → `page.reload()` → kiểm tra đáp án `"infrastructure"` vẫn được giữ nguyên trên form và số dư ví vẫn là `Ví: 25 Cr` (0 Credit).
     - Kiểm tra nút `"Lưu vào Ngân hàng đề"` vẫn `disabled`; tích hộp kiểm `"Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại"` → nút `"Lưu vào Ngân hàng đề"` chuyển sang `enabled`.
     - Bấm `"Lưu vào Ngân hàng đề"` → điều hướng sang `/assignments/tests/<id>` (không bị 404), hiển thị tiêu đề `"Cambridge IELTS Sample"` và slot `"Passage 1"`; mở `/assignments` thấy prompt `"Cambridge IELTS Sample — Passage 1"` trong danh sách ngân hàng đề.
  2. Chạy E2E với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104` và chụp screenshot 3 viewport (`1440×900`, `768×1024`, `375×812`) lưu vào `plans/reports/`.
- **Success criteria:** `pnpm --filter e2e e2e -- ai-exam-import-ac-003` và `ai-exam-import-ac-001` đều pass.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- ai-exam-import-ac-003` exits 0.

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
