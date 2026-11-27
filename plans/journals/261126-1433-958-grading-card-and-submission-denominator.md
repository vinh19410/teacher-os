# Journal — Sửa thẻ «Chấm bài» gây hiểu lầm và đồng bộ mẫu số nộp bài lớp (#958)

- **Ngày:** 2026-11-26
- **Issue:** #958 (`Thẻ «Chấm bài – Đã hoàn tất hôm nay» gây hiểu lầm khi vẫn còn bài trễ hạn và bài nộp thiếu`)
- **Nhánh:** `vinh19410/th-ch-m-b-i-ho-n-t-t-h-m-nay-g-y-hi-u-l-m-khi-v`
- **Plan:** `plans/261126-0840-958-fix-grading-card-and-submission-denominator/plan.md`

## Tóm tắt kết quả

Đã xử lý đồng bộ cả hai lỗi UX và nghiệp vụ báo cáo trong `#958`:

1. **Thẻ «Chấm bài» và Hero trên `/teacher/dashboard` (`apps/web`):**
   - Bổ sung selector thuần `overdueUnsubmittedSummary(students, lessons, now, classes, classAssignments, assignments)` trong `dashboard-from-kernel.ts` dùng chung chính xác bộ lọc `students`, loại trừ lớp `paused`, guard `submittedAt != null || attemptId != null` và `evaluateAssignmentDeadline` với `atRiskRows` — giữ nguyên 100% wire contract `.strict()` của `GET /api/dashboard/reminders`.
   - Nâng cấp `ReminderCards` tách nhãn zero-state theo từng thẻ (`"Đã hoàn tất hôm nay"` cho Thẻ 1 `Điểm danh`, `"Không còn bài quá hạn chấm"` cho Thẻ 2 `Chấm bài`, `"Không có khoản đến hạn"` cho Thẻ 3 `Học phí`), hiển thị dải cảnh báo màu `--warn` (`"Còn N bài quá hạn chưa nộp (M học viên) — xem ở Cần kiểm tra"`) non-interactive nối `aria-describedby` vào `<Link>` trên nền `bg-card` không hạ mờ khi `targets > 0`, và cập nhật Hero summary sang `"Còn N học viên cần kiểm tra."` khi `openTasks === 0 && risk.length > 0`.
2. **Mẫu số nộp bài `0/1` → `0/2` và đồng bộ bài tập lớp (`packages/db`, `packages/api`, `apps/server`, `apps/web`, `apps/e2e`):**
   - Thêm cột `target_scope` (`"class" | "selected"`) trên `class_assignment` bằng cặp migration tách DDL/DML `0095_class_assignment_target_scope.sql` + `0096_backfill_class_assignment_targets.sql` kèm `meta/0095_snapshot.json`, `meta/0096_snapshot.json` và `_journal.json` (`idx: 95, 96`).
   - Thêm `backfillClassAssignmentTargetsForStudent` gọi từ `activateEnrollment(db, orgId, enrollmentId, now)` chỉ trên chuyển trạng thái thật `'invited' -> 'active'` (không gọi ở nhánh replay `active`), đóng cửa sổ TOCTOU ở `POST /api/classes/:id/assignments` bằng câu lệnh catch-up `db.all(... INSERT OR IGNORE ... SELECT ... RETURNING student_id)` và thêm endpoint `POST /api/classes/:id/assignments/:assignmentId/targets` (`409 CLASS_PAUSED` atomic guard, RBAC `canPublishGrade` chặn `ta`, chunk 15 dòng tránh giới hạn 100 bind D1).
   - Cập nhật `AssignClassPromptModal` (`targetScope` đồng bộ với cảnh báo học viên `invited`) và `ClassAssignmentsTab` (`"Giao X/Y HV"` + nút `"Giao bổ sung"` cắt lô `<= 100` HV, toast đọc chính xác `result.added`).

## Nguyên nhân gốc & Quyết định kỹ thuật

1. **Không sửa wire contract `GET /api/dashboard/reminders`:** Tận dụng kernel snapshot sẵn có trên `/teacher/dashboard` giúp giữ nguyên schema `.strict()` và tương thích ngược deploy skew, đồng thời bảo đảm số đếm trên Thẻ 2 khớp tuyệt đối với bảng `"Cần kiểm tra"` phía dưới.
2. **Tách DDL (`0095`) và DML (`0096`) + `target_scope`:** Tách riêng để kiểm thử idempotency re-run và retry trên D1 an toàn; chỉ backfill tự động bài thường còn hạn (`target_scope = 'class'`) khi kích hoạt thật để không gán oan bài đã quá hạn lên học viên mới vào giữa khóa, còn bài cũ thiếu người xử lý bằng nút `"Giao bổ sung"` 1 chạm.
3. **Tương thích Cloudflare D1 `drizzle-orm/d1` (`db.batch` vs `db.all`):** Code review độc lập phát hiện `db.run(sql\`...\`)` (`SQLiteRaw`) nằm trong `db.batch(...)` chạy pass trên `libsql` nhưng ném `TypeError: Cannot read properties of undefined (reading 'bind')` trên `drizzle-orm/d1`. Đã tách catch-up `INSERT OR IGNORE ... SELECT ... RETURNING student_id` ra chạy độc lập bằng `db.all(...)` sau `db.batch(...)`, gộp `catchUpStudentIds` vào `assignmentPublishedEvents`, và khóa hồi quy bằng unit test chạy trực tiếp qua adapter `drizzle-orm/d1` thật.

## Sự cố, Điểm vướng & Cách xử lý

- **`POST /api/students` dùng `new Date()` thay vì `deps.now`:** Làm test kích hoạt với mốc thời gian giả lập bị hiểu nhầm bài chưa quá hạn là quá hạn. Đã truyền đồng bộ `deps.now ? deps.now() : new Date()` qua toàn bộ 4 caller của `activateEnrollment`.
- **OOM `exit 137` khi chạy song song 6 `tsc` trên VM chia sẻ RAM:** Chuyển sang `VITE_SERVER_URL=http://localhost:8000 pnpm exec turbo run check-types --concurrency=1` và `--maxWorkers=1` cho Vitest; pass trọn vẹn 14/14 gói.
- **Race `design:compare` blank frame dưới tải VM cao (`load > 20`):** Xác nhận qua ảnh debug toàn bộ 6 viewport render sạch, không phải lỗi UI; dùng cờ `--side app` thu đủ 6/6 ảnh đạt `0 lỗi` mà không tắt kiểm tra pixel.
- **Hợp nhất 4 PR mới trên `origin/develop` (`#976`, `#957`, `#985`, `#959`):** Giải quyết xung đột test ở `dashboard.test.tsx` và `reminder-cards.test.tsx` (giữ trọn vẹn bộ test của cả hai phía), kiểm chứng lại toàn bộ suite liên quan, `biome check .` và `check-types`.
