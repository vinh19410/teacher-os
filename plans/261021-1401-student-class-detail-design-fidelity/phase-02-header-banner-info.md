---
phase: 2
title: "Header, banner bài tập, thẻ thông tin lớp"
status: pending
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Header, banner, thẻ thông tin

## Files

- Modify: `apps/student/src/components/class/class-detail-view.tsx` (phần trước tab; thay khối teacher riêng bằng thẻ thông tin).
- Create: `apps/student/src/components/class/class-info-card.tsx` (+ `todo-banner.tsx` nếu gọn hơn khi tách).
- Giữ nguyên: `teacher-avatar.tsx`, `class-card.tsx` (không sửa `ClassBadges`/`ClassProgress`).

## Steps

1. **Back link**: nút ghost `-ml-3 mb-2 text-muted-foreground` kèm icon `ArrowLeft`; **accessible name vẫn đúng "Trang chủ"**, đích `/` (xem câu hỏi mở #1). Bỏ eyebrow mono "Lớp học".
2. **Banner** (`role="status"`): hiện khi có bài `class_assignment` chưa nộp (`submittedAt == null && scores == null`). Text: "Bạn còn {n} bài chưa làm trong {tên lớp}" / "Giáo viên đang chờ bài của bạn. Cùng hoàn thành nhé." Nút **Làm ngay** là `Link` tới `/learn/quizzes/$assignmentId` của bài đầu tiên. Class: đúng chuỗi design (`bg-primary text-primary-foreground rounded-xl px-5 py-4`, icon `Pin` trong ô `bg-primary-foreground/10`).
3. **Header**: `h1` `text-2xl md:text-3xl font-semibold tracking-tight`; dưới là `Badge outline` có chấm xanh "Đang học" (map từ `cls.status`; trạng thái khác thì hiện nhãn thô, không đoán). Bên phải: `Nhắn giáo viên` (`mailto:`, ẩn khi không có teacher).
4. **Thẻ thông tin** (`dl` 2 → 4 cột, `p-6 gap-x-6 gap-y-5`): Khoá (`level`), Lịch (`formatSchedule`), Hình thức (`mode`), Giáo viên (tên, kèm `mailto:` email giữ `getByRole("link", { name: email })`), Số buổi đã học (`held/total`), Khai giảng (`formatVietnamFullDate`). Footer `border-t`: số tháng (từ `startDate` → buổi cuối), giờ buổi tới, "Buổi tới: {ngày} — {chủ đề}". Mỗi ô có icon lucide 14px như design. Ô thiếu dữ liệu thì **không render** (không đặt "—").
5. Xoá `ClassProgress` khỏi header (design không có; tiến độ nằm ở ring + thẻ).
6. Ring dùng `CircleCheck`; khoảng cách `mb-8` thay `mt-8`.

## Verification

- `pnpm --filter student test -- class-detail` (cập nhật assertion: không còn eyebrow, có banner khi còn bài chưa nộp, không banner khi hết).
- Ảnh 3 viewport: banner và thẻ thông tin xuống dòng đúng ở 375px, không tràn ngang.
