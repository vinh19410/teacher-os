# Journal: Gộp tab Hành trình học & Giáo trình, trang chi tiết buổi học và cắt bài giảng PDF (#998)

- **Date:** 2026-11-26 17:25 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#998](https://github.com/vinh19410/teacher-os/issues/998)
- **Branch:** `vinh19410/Gộp-tab-màn-hình/student/classes`
- **Plan:** `plans/261126-1451-student-session-detail-and-pdf-slicing/plan.md`
- **Component:** Student Class Detail, Session Materials, PDF Slicing (`packages/db`, `packages/api`, `apps/server`, `apps/web`, `apps/student`, `apps/e2e`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Trang chi tiết lớp học của học viên trước đây tách rời hai tab **Hành trình học** (lịch buổi học phẳng) và **Giáo trình** (mục lục module tĩnh), đồng thời học viên không có màn hình chi tiết từng buổi học để xem riêng **Bài giảng** (cắt đúng khoảng trang từ sách PDF gốc) và **Bài tập của buổi** (tài liệu/link giao trước hoặc sau buổi + bài tập tương tác gắn buổi).

Các hạng mục đã hoàn thiện:
- **Schema & Migration (`packages/db`):** Thêm `lesson_material.category` (`'lecture'` mặc định | `'homework'`), `source_title`, `source_page_start`, `source_page_end` và `class_assignment.session_date` (kèm `class_assignment_class_session_idx`) qua migration online-safe `0097_session_materials_and_assignment_date.sql` (nối sạch sau `0096` sau khi merge `origin/develop`).
- **Contracts (`packages/api`):** Mở rộng `material-contracts.ts` (giữ `.strict()`, thêm kiểm soát bidi cho `lessonMaterialLinkCreateSchema.title`, `materialSourceTitleSchema`, `sourcePageStart <= sourcePageEnd`) và `contracts.ts` (`studentClassDetailSchema` mở rộng tùy chọn tương thích ngược, `studentSessionDetailResponseSchema`, `classAssignmentCreateSchema.sessionDate`).
- **Server & Đồng bộ ngày (`apps/server`):** Mở rộng `materials.ts` (validate + `cancelBody()` trước R2 upload, dọn R2 khi lỗi DB, phân loại `lecture`/`homework`, thêm link trực tiếp, chặn `ta` 403), đồng bộ nguyên tử `class_assignment.session_date` trên cả 5 luồng (`moveDate`, `holidays.ts` shift/undo, `enrollment-activation.ts`, `class-start-date-reschedule.ts` 2-pha chunk 30, `DELETE /sessions/:date` set `null`), bổ sung `GET /api/student/classes/:classId/sessions/:date` (cô lập org/active enrollment, ẩn tài liệu buổi `holiday`/`cancelled`, tái sử dụng `currEntry.bankMaterialIds` không truy vấn thừa, tuân thủ `student-projection-lock.test.ts`).
- **PDF Slicer & UI Giáo viên (`apps/web`):** Tích hợp `pdf-lib` (`^1.17.1`, lazy dynamic import riêng trong `apps/web/src/lib/pdf-slicer.ts`) cùng `SliceBookModal` (nguồn mặc định riêng tư: file cục bộ ≤ 100 MB hoặc Ngân hàng tài liệu; tab Tài liệu chung kèm cảnh báo hiển thị cho học viên; cắt 1 hoặc nhiều buổi thành PDF độc lập; `sanitizeSourceTitle` và chống rò rỉ `blob:` URL), nâng cấp `SessionMaterialsModal` (2 tab độc lập với 2 `useMaterialUploadQueue` riêng), `ClassSessionsSection`, `AssignClassPromptModal`, `ClassAssignmentsTab` và `MaterialItem`.
- **UI Học viên (`apps/student`):** Gộp còn 3 tab (`Hành trình học` | `Bài tập` | `Tài liệu chung`), nhóm buổi theo Module giáo trình kèm tiến độ (fallback timeline phẳng cho lớp không giáo trình/legacy `date: null`, đánh số `Buổi N` bỏ qua `holiday`), tạo route `/classes/$classId/sessions/$date` (`SessionDetailView`, `SessionNotFound`) với reflow an toàn `320px`–`1440px` trên Light & Dark.
- **Tài liệu, Kiểm thử & POT (`DESIGN.md`, `CHANGELOG.md`, `apps/e2e`):** Cập nhật `DESIGN.md`, viết `student-session-detail.spec.ts` (xác minh stream PDF học viên tải về giải nén đúng `/Count 3` trang, không chứa `/Count 6`), chạy xanh 7 spec E2E liên quan và lưu 10 ảnh POT trong `plans/reports/998-*.png`.

## Quyết định kỹ thuật & Đánh đổi

1. **Cắt PDF bằng `pdf-lib` ở trình duyệt thay vì Cloudflare Worker:** Tránh hoàn toàn giới hạn 128 MB RAM của Cloudflare Workers khi xử lý sách giáo khoa PDF dung lượng lớn (tối đa 100 MB trên máy giáo viên), đồng thời chỉ tải lên R2 đúng file PDF con đã cắt nên học viên không bao giờ tiếp cận được các trang ngoài phạm vi buổi học.
2. **Tách `category` trên `lesson_material` thay vì bảng mới & thêm `session_date` tùy chọn trên `class_assignment`:** Giữ nguyên toàn bộ luồng upload R2, preview PDF, kiểm soát quyền và dọn mồ côi sẵn có; đồng thời cho phép bài tập của một buổi kết hợp tự nhiên cả bài tập tương tác làm trực tuyến lẫn tài liệu/link giáo viên tải lên trước hoặc sau buổi học.
3. **Đồng bộ `class_assignment.session_date` theo mọi biến đổi lịch:** Đảm bảo không phát sinh bài tập "mồ côi ngày" khi giáo viên dời buổi, áp/hoàn tác kỳ nghỉ lễ, đổi ngày khai giảng hoặc xóa buổi thủ công.

## Sự cố, Điểm vướng & Cách xử lý

- **11 phát hiện Red-Team trước triển khai (RT-1..RT-11):** Khóa sớm các biên D1 100 bind params, guard TOCTOU bằng SQL, fallback lớp legacy `date: null`, ẩn tài liệu buổi `cancelled`/`holiday` đồng bộ giữa `student.ts` và `student-materials.ts`, ưu tiên nguồn PDF riêng tư, và tuân thủ `student-projection-lock.test.ts`.
- **Phát hiện khi chụp ảnh & review trực quan (Visual Inspection + Pre-Landing Code Reviewer):**
  - Thanh tiêu đề link trong `SessionMaterialsModal` bị bó chữ từng từ trên dòng → sửa `min-w-[min(12rem,100%)]` trong `MaterialItem`.
  - Link "Quay lại lớp" tràn ngang ở viewport `320px` → thêm `max-w-full` + `<span className="truncate">` trong `SessionDetailView`.
  - 5 lỗi Important từ lượt review cục bộ: (1) khóa "Cắt từ sách gốc" / "Giao bài" trên buổi `cancelled` và validate `defaultSessionDate`; (2) `sanitizeSourceTitle` + lọc `\p{Cc}\p{Cf}` cho tên file, `sourceTitle`, `rowTitle` và `lessonMaterialLinkCreateSchema.title`; (3) đánh số `Buổi N` bỏ qua `holiday` đồng nhất với server; (4) chặn rò rỉ `blob:` URL qua `mountedRef`/`loadSeqRef` nếu đóng modal khi đang parse PDF; (5) giữ `assignmentCount` trên buổi `cancelled` và thêm banner trạng thái buổi `cancelled`/`holiday` ở `SessionDetailView`.
- **Xung đột migration khi merge `origin/develop`:** Trong lúc phát triển, `origin/develop` đã gộp migration `0095`/`0096` (`targetScope` của #958). Đã hủy bản nháp `0095`, giữ trọn thay đổi `targetScope` của `develop` song song với `sessionDate`, và dùng `drizzle-kit generate` tái sinh `0097_session_materials_and_assignment_date.sql` nối chuẩn sau `0096`.
- **Đường dẫn worktree có dấu tiếng Việt:** `new URL(..., import.meta.url).pathname` mã hóa percent-encoding làm lệch thư mục đích khi ghi ảnh E2E; chuyển sang `fileURLToPath(...)` giải quyết triệt để.
