---
phase: 4
title: "Màn Đăng ký mới trong web"
status: completed
priority: P2
effort: "0.6d"
dependencies: [3]
---

# Phase 4: `/leads` — Đăng ký mới

## Goal
Giáo viên thấy lead mới, lọc theo trạng thái, xem chi tiết và đổi trạng thái ngay trong app web.

## Files to Create / Modify
- Create: `apps/web/src/routes/_auth/leads/index.tsx`
- Create: `apps/web/src/routes/_auth/leads/index.test.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx` — mục `{ key: "leads", label: "Đăng ký mới", icon: Inbox, href: "/leads" }` trong nhóm có Học viên.
- Modify: `apps/web/src/routeTree.gen.ts` (sinh lại bởi TanStack Router plugin khi chạy dev/build)

## Tasks & Steps
1. Đọc `DESIGN.md` và mẫu `apps/web/src/routes/_auth/notifications/index.tsx` (cùng shape list + counts) và `/assignments` (filter URL).
2. Route: `validateSearch` cho `q`, `status`, `page`; ô tìm kiếm debounce ~300ms mới đẩy lên URL; `ChipFilter` trạng thái (Tất cả / Mới / Đã liên hệ / Đã ghi danh / Bỏ) với badge đếm `aria-hidden`; `useQuery` gọi `GET /api/leads`.
3. `DataTable` cột: Thời gian gửi, Họ tên, SĐT (link `https://zalo.me/<phone>`), Khóa (nhãn từ `LEAD_COURSE_LABELS`), Hình thức (`LEAD_STUDY_MODE_LABELS`), Lịch mong muốn (ngày + giờ), Trạng thái (`StatusTag`), số lần gửi khi > 1.
4. Bấm dòng ⇒ `Modal` chi tiết: mọi field + email (`mailto:`), ngày sinh, ghi chú, kết quả test, `teacherNote` (textarea), nút đổi trạng thái; `useMutation` PATCH, toast, invalidate query.
5. Empty state khi chưa có lead: giải thích lead đến từ form trên msmy.io.vn.
6. Test (vitest + testing-library như `notifications/index.test.tsx`): render list, đổi chip ⇒ URL đổi, debounce tìm kiếm, mở modal, PATCH gọi đúng body, lỗi 401 ⇒ reauth.

## Verification
- `pnpm --filter web test -- leads`
- `pnpm check-types`
- UI 3 viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md`; `pnpm design:compare` nếu PR kèm ảnh.
