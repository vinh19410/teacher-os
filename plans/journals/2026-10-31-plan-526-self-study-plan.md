---
title: "Plan #526: Self study plan — tự động giao đề hằng ngày cho lớp theo khung giờ"
date: 2026-10-31
summary: "Thiết kế kế hoạch 4 phase cho module Self Study Plan (#526) kèm Red-Team review (RT-1..RT-6) và kiểm chứng kongming."
---

## What happened
- Khảo sát toàn diện codebase tại worktree `feat/526-self-study-plan` (`packages/db`, `packages/api`, `apps/server`, `apps/student`, `apps/web`, `apps/e2e`, `packages/infra`).
- Khởi tạo kế hoạch 4 phase tại `plans/261031-2220-526-self-study-plan/` theo chuẩn `--tdd --advice`.
- Chạy 3 reviewer Red-Team (`RedTeamSecurity`, `RedTeamAssumptions`, `RedTeamFailureModes`) phát hiện và xử lý 6 điểm trọng yếu (`RT-1`..`RT-6`).

## Decision
- Cô lập hoàn toàn bài tự học khỏi `loadSnapshot` (cả `class_assignment`, `class_assignment_target`, `quiz_attempt`) và giới hạn 200 bài giao tay bằng `isNull(classAssignment.planItemId)`.
- Mọi thao tác chèn nhiều dòng trên D1 đều chia chunk dưới trần 100 biến bind; thông báo `self_study_released` chỉ gửi cho `createdIds` mới chèn ở bước 1–2 và quét lại các bản ghi `queued` quá hạn trên 5 phút ở bước 3.
- Trong trang chi tiết lớp `/classes/$classId`, dùng nút chuyển `<button type="button" aria-pressed>` và chỉ mount `SelfStudyPlanSection` khi mở chế độ `"Kế hoạch tự học"` để bảo toàn toàn bộ test hiện có.

## Next steps
- Thực thi tuần tự Phase 1 → Phase 4 qua `/ak-cook --tdd --auto`.
