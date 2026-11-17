---
title: remove-khach-quan-entry-test-751
date: 2026-11-17
summary: "Loại bỏ toàn bộ chuỗi hiển thị 'khách quan' khỏi entry test trên profile, student portal, web giáo viên và bổ sung regression guard (#751)"
---

# remove-khach-quan-entry-test-751

# 2026-11-17 — Issue #751 (Bỏ chữ "khách quan" trong bộ entry test)

- **Bối cảnh:** Chuỗi `"khách quan"` xuất hiện rải rác trên giao diện entry/placement test ở cả 3 bề mặt (`apps/profile`, `apps/student`, `apps/web`), gây câu chữ nặng nề kiểu học thuật cho thí sinh và học viên (ví dụ `40 câu khách quan`, `Đã trả lời X/Y câu khách quan`, `Điểm các phần khách quan`, `Chấm tự động 3 phần khách quan • giáo viên chấm Writing & Speaking`). Vì copy lặp lại giữa static vanilla JS (`apps/profile/public/kiem-tra-dau-vao/test.js`) và React components (`apps/student`, `apps/web`), việc sửa thiếu một chỗ rất dễ làm lệch trải nghiệm giữa các cổng.
- **Quyết định kỹ thuật:**
  - **Cập nhật UI copy trên 3 bề mặt:**
    - `apps/profile/public/kiem-tra-dau-vao/test.js` (lines 577, 661, 859, 3076) và `apps/student/src/components/placement/placement-test-runner.tsx` (lines 363, 457, 813): rút gọn thành `${progress.total} câu` / `Đã trả lời ${progress.answered}/${progress.total} câu` / `còn ${...} câu chưa trả lời`.
    - `apps/student/src/components/placement/placement-result-views.tsx` (line 387): sau Red Team Review (từ chối phương án cụt nghĩa `"Điểm các phần"`), chọn `"Điểm các kỹ năng"` để đồng bộ với `apps/profile/public/kiem-tra-dau-vao/ket-qua/result.js:305`.
    - `apps/web/src/components/leads/placement-submission-panel.tsx` (line 577): đổi thành `"Chấm tự động 3 phần • giáo viên chấm Writing & Speaking"`.
  - **Ranh giới giữ nguyên:** Không đụng dữ liệu từ vựng trong `packages/db/seed-data/vocab-library/lesson_details.csv` và giữ nguyên identifier nội bộ (`objective`, `unansweredObjective`) để không phá contract API/state hay tạo churn không cần thiết.
- **Thay đổi kiểm thử & chống tái diễn:**
  - `apps/profile/tests/placement-test.test.mjs`: thêm `"khách quan"` vào `forbiddenToken` cho `test.js` và quét tĩnh thêm `index.html`, `grading.js`, `lead-gate.js`, `ket-qua/result.js` để chặn chuỗi này quay lại trên static assets.
  - `apps/student/test/placement-test.test.tsx`: bổ sung assertion kiểm tra progress counter (`"Đã trả lời 5/5 câu"`), tiêu đề `"Điểm các kỹ năng"` ở `placement-graded-view`, và test nhánh hộp thoại xác nhận `placement-unanswered-confirm` (`"còn 5 câu chưa trả lời"`, không chứa `"khách quan"`).
  - `apps/web/src/components/leads/placement-submission-panel.test.tsx`: thêm test khẳng định text `"Chấm tự động 3 phần • giáo viên chấm Writing & Speaking"` và không chứa `"khách quan"`.
  - Đồng bộ mô tả/assertions ở `apps/web/src/components/placement-test/content-model.test.ts`, `packages/api/src/placement-test-contracts.test.ts`, và 3 E2E specs (`apps/e2e/specs/profile-placement-test.spec.ts`, `placement-test-editor.spec.ts`, `placement-ai-grading.spec.ts`).
  - Lưu 5 ảnh POT 3 viewport + dark mode tại `plans/reports/751-{profile-intro-desktop-1440x900,student-runner-desktop-1440x900,student-runner-desktop-dark,student-runner-tablet-768x1024,student-runner-mobile-375x812}.png`.
- **Bài học & bước tiếp theo:**
  - Copy dùng chung giữa `apps/profile` (static JS) và `apps/student` (React) rất dễ trôi nếu thiếu static guard; đưa chuỗi cấm vào `placement-test.test.mjs` rẻ và chặn tái diễn ngay từ unit test.
  - **Bước tiếp theo:** Commit và push nhánh `chore/remove-khach-quan-entry-test`, mở PR vào `develop`, và đăng comment POT kèm ảnh permalink SHA lên issue `#751`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
