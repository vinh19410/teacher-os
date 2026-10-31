---
phase: 4
title: "E2E, tài liệu và cổng phát hành"
status: in-progress
priority: P2
effort: "0.4d"
dependencies: [2, 3]
---

# Phase 4: E2E, tài liệu và cổng phát hành

## Goal

Chứng minh trọn luồng từ CTA tới lead, cập nhật tài liệu vận hành và kiểm chứng trên host thật trước khi công khai.

## Files to Create / Modify

- Create: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `docs/codebase-summary.md`
- Modify: `docs/production-release-runbook.md`

## Tasks & Steps

<!-- Updated: Red Team Session 1 - RT-2 E2E ip_hash cleanup and fast audio playback verification -->

### Task 4.1 — Viết E2E spec `apps/e2e/specs/profile-placement-test.spec.ts`
- **Goal:** Kiểm chứng tự động toàn bộ luồng người dùng trên trình duyệt thật: từ bấm CTA trên trang profile → làm 30 câu → giới hạn nghe 2 lần bền vững qua reload → giữ câu trả lời khi reload → chuyển kết quả về form đăng ký và tạo lead trong DB; làm bài không bấm đăng ký thì không tạo lead.
- **Target files and symbols:** `apps/e2e/specs/profile-placement-test.spec.ts`.
- **Steps:**
  1. Tạo `apps/e2e/specs/profile-placement-test.spec.ts` dùng `PROFILE_ORIGIN` và kết nối SQLite `local.db` giống `apps/e2e/specs/profile-lead-intake.spec.ts` (nhớ xóa `ip_hash` trong bảng `lead` trước khi gửi form để không đụng giới hạn 3 lead/10 phút theo IP).
  2. Kiểm tra luồng làm bài nhưng KHÔNG bấm đăng ký: bấm CTA từ `/` sang `/kiem-tra-dau-vao/`, chọn câu trả lời ở Phần 1, reload giữa bài xác nhận câu trả lời vẫn giữ nguyên, sang Phần 2 phát 1 đoạn audio 2 lần (tua tới gần cuối sau khi `playing` nổ để kết thúc nhanh trong E2E) xác nhận nút nghe bị khóa ngay sau lần 2 và sau khi reload vẫn khóa, nộp bài xem kết quả (điểm từng phần, CEFR, khóa gợi ý, không lộ đáp án) và xác nhận bảng `lead` trong DB không phát sinh dòng mới.
  3. Kiểm tra luồng bấm "Đăng Ký Theo Kết Quả Này": chuyển về `/#dang-ky-tu-van`, URL đã xóa query `ketqua` và `khoa`, banner hiện kết quả đính kèm, `select[name=course]` chọn đúng khóa đề xuất; điền họ tên + SĐT và gửi form ngay → tạo dòng `lead` trong DB với `placement` và `course` khớp kết quả bài test.
- **Success criteria:** E2E spec `profile-placement-test.spec.ts` chạy qua toàn bộ test case trên Playwright Chromium.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e profile-placement-test` exits 0.

### Task 4.2 — Cập nhật tài liệu `docs/codebase-summary.md` và `docs/production-release-runbook.md`
- **Goal:** Tài liệu phản ánh đúng kiến trúc trang `/kiem-tra-dau-vao/` và quy trình duyệt `status: approved` trước khi build phát hành.
- **Target files and symbols:** `docs/codebase-summary.md`, `docs/production-release-runbook.md`.
- **Steps:**
  1. Cập nhật phần mô tả `apps/profile` trong `docs/codebase-summary.md` (thêm trang `/kiem-tra-dau-vao/` 30 câu, chấm client-side, chuyển kết quả qua query về form đăng ký).
  2. Cập nhật mục `"Build & deploy apps/profile"` trong `docs/production-release-runbook.md`: ghi rõ cổng `status: "approved"` trong `apps/profile/public/kiem-tra-dau-vao/questions.json`, cách cập nhật đề/audio và tăng `version` để xóa bản lưu `localStorage` cũ của học viên, cùng checklist smoke test trên `https://msmy.io.vn` và `https://www.msmy.io.vn`.
- **Success criteria:** Hai file tài liệu cập nhật đầy đủ, qua kiểm tra Biome và typecheck.
- **Verify:** `pnpm exec biome check . && pnpm check-types` exits 0.

### Task 4.3 — Kiểm tra UI ở 3 viewport (1440×900, 768×1024, 375×812) và chụp ảnh minh chứng
- **Goal:** Xác nhận giao diện `/kiem-tra-dau-vao/` và section `#lam-test-mien-phi` trên trang chủ đạt chuẩn `REVIEW.md` ở cả 3 viewport và điều hướng bàn phím.
- **Target files and symbols:** `plans/reports/` (ảnh chụp màn hình minh chứng).
- **Steps:**
  1. Mở trang trên trình duyệt ở 3 viewport `1440×900`, `768×1024`, `375×812`, kiểm tra không tràn ngang (`scrollWidth <= clientWidth`), kiểm tra focus bàn phím và chụp ảnh màn hình lưu vào `plans/reports/`.
- **Success criteria:** Không có lỗi tràn ngang hay lỗi console ở cả 3 viewport; ảnh chụp màn hình được lưu đầy đủ.
- **Verify:** `pnpm --filter profile test && pnpm exec biome check . && pnpm check-types` exits 0.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e profile-placement-test`
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter profile build` qua khi `status: approved` (và chặn build rõ ràng khi `status: draft`).

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

Host production chưa rõ nên smoke test có thể lộ lỗi directory index hoặc Range. Nếu lỗi directory index, đổi CTA sang `kiem-tra-dau-vao/index.html` là cách lùi rẻ nhất.
