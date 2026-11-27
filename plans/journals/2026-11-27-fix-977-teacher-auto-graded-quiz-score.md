# Fix #977 — Hiển thị điểm tự chấm bài trắc nghiệm phía giáo viên

**Date:** 2026-11-27

## Phạm vi

Khắc phục lỗi điểm tự chấm bài trắc nghiệm (`reading`, `listening`, `grammar`, `vocabulary`, và phần trắc nghiệm của đề gộp hybrid) không hiển thị ở bất kỳ bề mặt nào phía giáo viên (`packages/api`, `apps/server`, `apps/web`, `apps/e2e`), đồng thời làm trung thực chỉ số `"Bài tập chưa có điểm"` trên Dashboard.

## Quyết định & kỹ thuật chính

- **Zero DB migration:** Tính `totalQuestions` trực tiếp trong `apps/server/src/routes/snapshot.ts` bằng SQLite JSON1 `(SELECT COUNT(*) FROM json_each(...) AS je WHERE je.type = 'object')`, guard bằng `inArray(assignmentPrompt.skill, [...AUTO_GRADABLE_SKILLS])` để khớp 100% `parseQuizQuestions` và không đọc overflow page của bài Writing/Speaking.
- **Bảo toàn contract & biên cạnh:** Tạo `@teacher-os/api/lib/objective-score` (`normalizeObjectiveScore` dùng `Number.isSafeInteger`, `formatObjectiveScore`, `hasValidGradedBand`). `snapshot.ts` bổ sung `hasGradableTask` (cả prompt `libraryRef != null`), lọc `demo-student:%`, và fallback `submittedAt` sang `quizAttempt.submittedAt` trong cửa sổ flip-first (đồng bộ `student-class.ts` và `contracts.ts`).
- **3 bề mặt giáo viên:** `ClassAssignmentsTab` hiển thị `Tự chấm · X/Y` / `Trắc nghiệm · X/Y` và bỏ `sm:shrink-0`; tab **Bài tập** trang chi tiết học viên đổi cột `"Band"` → `"Điểm"` hiển thị `X/Y` + `Tự chấm` (hoặc `Band B · X/Y` cho hybrid); Dashboard dùng `ungradedAssignmentsCount` chỉ đếm bài `hasGradableTask` giao lớp đang mở đã nộp chờ chấm kèm dòng phụ `"Writing & Speaking giao lớp chờ chấm"`.

## Thách thức & xử lý

- **Hồi quy test `student-practice.test.ts:803`:** Fixture `#378` seed `cat-1.submittedAt = null` cùng `attempt-ca` đã nộp; sau tham vấn `kongming`, giữ fallback `submittedAt` ở server (khớp contract derived) và siết chặt assertion test xác minh snapshot nhận đúng timestamp `2026-10-01` + điểm `2/2` của `attempt-ca` (không rò `3/3` từ practice), đồng thời bổ sung guard `attemptId != null` ở `rollupStatus`.
- **Tràn ngang WCAG 320px ở `/classes/$classId`:** E2E POT phát hiện grid 2 cột tại `$classId.tsx:582` thiếu `grid-cols-1` và `[&>*]:min-w-0` khiến `<DataTable>` nhánh `sessions === null` phình quá `288px`; sửa 1 dòng tại `$classId.tsx:582`, E2E `4/4` pass sạch trên `320px–1440px` Light & Dark cùng 18 ảnh POT và `design:compare` 0 lỗi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
