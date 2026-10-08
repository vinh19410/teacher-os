---
phase: 6
title: "App học viên: shell, tổng quan, làm bài, kết quả, auth"
status: pending
priority: P2
effort: "6h"
dependencies: [2]
---

# Phase 6: App học viên

## Goal

`apps/student` khớp design `src/pages/Student.tsx` (`StudentPortal`, `Exam`, `Writing`,
`Results`) trên dữ liệu thật, cùng theme toggle và token với app giáo viên. Component quiz dùng
chung trong `packages/ui/src/components/quiz/*` đổi một lần, áp cho cả preview phía giáo viên.

Chỉ phụ thuộc phase 2 → có thể làm song song phase 3–5 nếu tách người/agent (file không
chồng: phase này chỉ sửa `apps/student/**` và `packages/ui/src/components/{quiz,payments,assignments}/**`).

## Ánh xạ trang

| Route / khu vực | File | Design | Thay đổi chính |
|---|---|---|---|
| Shell | `apps/student/src/components/layout/student-shell.tsx`, `org-switcher.tsx`, `notification-bell.tsx`, `avatar-menu.tsx` | header `StudentPortal` | `max-w-6xl px-6 md:px-10 py-8`; tên học viên extrabold xl bên trái; phải: org switcher `neu-sm rounded-md`, `ThemeToggle`, chuông `neu-sm` 36px + badge số mono nền cam, panel thông báo `neu rounded-lg`; nút Chấp nhận `primary` / Từ chối `secondary` |
| `/` (tổng quan) | `routes/_auth/index.tsx`, `components/overview/*` (`greeting-header`, `class-card`, `assignment-list`, `assignment-row`, `tuition-list`, `empty-state`) | tab Home | `PageHead` kiểu mới: kicker = tên org, tiêu đề "Lớp của tôi" (giữ chữ hiện có), `StudentSpot` ở `action`; lưới `[1.5fr_1fr]`; class card `neu rounded-lg p-6`: tên extrabold 2xl, lịch mono, giáo viên + phòng `text-meta`, `Tag` đếm buổi (`hot` cho buổi vắng), bảng bài tập trong card; cột phải card học phí: kicker cam "HỌC PHÍ", 2 `StatCard` (Còn lại `hot`), QR trong `neu-in` (nền QR trắng) + nội dung chuyển khoản mono cam |
| `/classes/$classId` | `routes/_auth/classes/$classId.tsx`, `components/class/*` | (không vẽ riêng) | PageHead kiểu mới, danh sách bài học dạng hàng `border-t`, avatar giáo viên `neu-sm` |
| `/learn/quizzes/$assignmentId` (làm bài) | `routes/_auth/learn/quizzes/$assignmentId.tsx`, `components/quiz/*` (app), `packages/ui/src/components/quiz/*` | `Exam`, `Writing` | thanh runtime `neu-in rounded-md font-mono text-xs` (phần thi · trạng thái lưu cam · đồng hồ); reading split pane `md:grid-cols-2 md:h-[440px]` → giữ chiều cao hiện có nếu đã tính theo viewport, passage `leading-[1.85]` weight thường, cột câu hỏi: số đậm + lựa chọn T/F/NG dạng nút mono 10px `neu-sm`, chọn = `neu-in text-hot`; writing: đề bài `font-display`, textarea `neu-sm` focus viền cam, đếm từ mono (đủ = `text-fg`, thiếu = `text-hot`); speaking dropzone `neu-in` viền đứt |
| `/learn/quizzes/attempt/$attemptId(.detail)` (kết quả) | `routes/_auth/learn/quizzes/attempt/*`, `components/quiz/attempt-grade-card.tsx`, `packages/ui/src/components/quiz/{attempt-score-card,essay-with-highlights,quiz-review-item,attempt-compact-list}.tsx` | `Results` | 2 cột `[1.3fr_1fr]`; bài viết `text-lg leading-[1.9] border-l-2 border-line pl-5`, lỗi `mark.anno` + nhận xét inline nền cam chữ `accent-on`; cột phải: nhãn "BAND" mono, số extrabold 8xl cam, tiêu chí hàng `border-t` điểm mono, nhận xét giáo viên in nghiêng |
| `/tuition/$invoiceId` | `routes/_auth/tuition/$invoiceId.tsx`, `packages/ui/src/components/payments/payment-qr-panel.tsx` | card học phí + `PayPage` | stat Đã đóng / Còn lại (`hot`), QR nền trắng, mã chuyển khoản mono cam |
| `/onboarding` | `routes/_auth/onboarding.tsx`, `components/onboarding/*` | (không có) | quy tắc chung; bước hiện tại `neu-in text-hot`; commit `debda12` từng vá chữ accent khó đọc ở đây — kiểm lại contrast cả 2 theme sau khi `accent-blue` thành `hot` |
| Auth | `routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`, `components/auth/*` | `Login` | như phase 3 phía web: `brand-panel` dùng `StudentSpot` thay `TeacherDesk`; `ThemeToggle` góc phải |
| Lỗi/loader | `components/overview/student-error-view.tsx`, `components/loader.tsx`, `components/quiz/attempt-review-error.tsx` | — | page head kiểu mới, mã lỗi mono |

## Tasks & Steps

1. Đọc design `src/pages/Student.tsx`.
2. `packages/ui/src/components/quiz/*` trước (ảnh hưởng cả preview giáo viên ở phase 5 —
   nếu phase 5 chạy trước, kiểm lại `/assignments/preview` sau bước này).
3. Shell + tổng quan + học phí; rồi làm bài/kết quả; cuối cùng auth/onboarding.
4. Kiểm `quiz-attempt-store` autosave không bị ảnh hưởng (chỉ đổi class).

## Verification

- `pnpm --filter student test`, `pnpm --filter web test` (preview dùng quiz chung),
  `pnpm check-types`.
- E2E (port override): `student-*` (class-detail, org-invitation-and-switcher, package-*,
  portal-email-verification, portal-onboarding, portal-provisioning, quiz-take-review),
  `account-role-separation`.
- Thủ công 375×812: split pane đọc hiểu chuyển 1 cột, thanh runtime không tràn, bàn phím ảo
  không che textarea writing.

## Ghi chú lệch design

_(điền khi thực thi)_

## Rollback

Revert commit phase 6; phía giáo viên chỉ bị ảnh hưởng ở preview quiz (component chung).
