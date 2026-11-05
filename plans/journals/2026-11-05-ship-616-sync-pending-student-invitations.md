---
title: "Ship #616: Thống nhất định nghĩa đang chờ và đang học giữa hồ sơ học viên và lời mời"
date: 2026-11-05
summary: "Hoàn tất sửa lỗi #616: thống nhất định nghĩa học viên portalLinked=false là Chờ xác nhận, không tính vào số học viên đang học ở kicker đầu trang, hiển thị trong tab Lời mời đang chờ kèm nút Gửi lại lời mời, bổ sung unit và route tests TDD đạt 100% pass, code review đạt 0 findings, sẵn sàng mở PR beta vào develop"
---

# Ship #616: Thống nhất định nghĩa đang chờ và đang học giữa hồ sơ học viên và lời mời

## Chuyện gì đã xảy ra

1. **Phân tích nguyên nhân gốc:**
   - Tại trang `/students` (`apps/web/src/routes/_auth/students/index.tsx`), hai luồng học viên dùng hai nguồn dữ liệu khác nhau:
     - Lời mời gửi qua modal "Mời học viên" được lưu vào bảng `student_invitation` (trạng thái `pending`).
     - Học viên thêm qua modal "Thêm học viên" với email được lưu trực tiếp vào bảng `student` với `onboardingCompletedAt = null` (`portalLinked: false`).
   - Kicker đầu trang dùng `${students.length} học viên đang học` (gộp cả học viên `portalLinked === false` vào đang học) và `${pendingInvites.length} lời mời đang chờ` (chỉ đọc từ `usePendingInvitations()`).
   - Tab "Lời mời đang chờ" chỉ đọc từ `usePendingInvitations()`, và component `PendingInvitationsList` không nhận dữ liệu học viên từ route cha, dẫn đến tab báo 0 và rỗng dù danh sách học viên có nhãn "Chờ xác nhận".

2. **Triển khai TDD Red → Green:**
   - **Phase 1 (Helper & Component):**
     - Tạo hàm thuần `isPendingPortalStudent(student)` trong `apps/web/src/lib/repos/students.ts`, kiểm tra chặt chẽ `Boolean(student.email?.trim()) && student.portalLinked === false` (an toàn trước deploy skew với `portalLinked === undefined`).
     - Viết unit test trong `students.test.ts` kiểm chứng đầy đủ các edge cases (email rỗng, whitespace, null, portalLinked true/false/undefined).
     - Viết test Đỏ trong `pending-invitations-list.test.tsx` cho prop `pendingStudents` (hiển thị hàng học viên với badge "Chờ xác nhận", nút "Gửi lại lời mời", không có nút "Thu hồi", non-blocking khi API đang loading/error, deduplicate email case-insensitively).
     - Nâng cấp `PendingInvitationsList` (`apps/web/src/components/students/pending-invitations-list.tsx`) để nhận `pendingStudents`, render đồng bộ cả 2 loại trong cùng `<ul>`, chỉ hiển thị empty state khi tổng số lượng bằng 0.
   - **Phase 2 (Route Integration & Verification):**
     - Viết test Đỏ trong `apps/web/src/routes/_auth/students/index.test.tsx` kiểm tra: kicker không tính học viên chưa liên kết vào "đang học" mà tính vào "lời mời đang chờ"; tab "Lời mời đang chờ (1)" hiển thị đúng số tổng và khi chuyển tab render đầy đủ hàng học viên kèm nút gửi lại.
     - Cập nhật route `/students` (`apps/web/src/routes/_auth/students/index.tsx`):
       - Tính `pendingStudents`, `pendingStudentEmails`, deduplicate `pendingInvites`, `totalPendingCount`, `activeStudentsCount`.
       - Kicker: `${activeStudentsCount} học viên đang học · ${totalPendingCount} lời mời đang chờ`.
       - Tab label: `Học viên (${students.length})` và `totalPendingCount > 0 ? "Lời mời đang chờ (" + totalPendingCount + ")" : "Lời mời đang chờ"`.
       - Truyền `pendingStudents` vào `<PendingInvitationsList>`.
       - Thay các kiểm tra inline bằng `isPendingPortalStudent(s)`.
   - **Phase 3 (Verify & Quality):**
     - Chạy toàn bộ 183 test files của web (1,881 tests): pass 100%.
     - `pnpm exec biome check` và `pnpm check-types`: pass sạch (0 errors).

3. **Tham vấn Kongming & Code Review:**
   - Tham vấn Kongming (`--advice`): Kongming nhất trí phương án client-side unification, đề xuất 5 điểm hiệu chỉnh (truyền prop thay vì dùng hook thứ hai, non-blocking loading/error, dùng email làm recipientLabel cho resend button, giữ `students.length` cho tab Học viên, empty state kiểm tra tổng số). Tất cả 5 điểm đã được áp dụng vào plan và triển khai.
   - Code Review subagent: **APPROVED** (0 Critical / 0 Important / 3 Minor informational).

## Quyết định

- Ship theo chế độ `beta` vào nhánh `develop`.
- Toàn bộ thay đổi nằm ở Web UI client-side, không sửa backend hay DB schema.
- Thống nhất định nghĩa "chờ xác nhận" thông qua hàm thuần `isPendingPortalStudent`.

## Bước tiếp theo

- Mở PR vào `develop` qua `ak-ship beta`.
- Kích hoạt `ak-review-pr` để review, fix, reply, gắn label `ready to ship beta`.
- Merge PR và theo dõi CI `develop` tới khi xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
