---
title: "Phase 4: Trang tổng quan học viên"
status: todo
priority: P1
effort: 8h
dependencies: [1, 2, 3]
---

# Phase 4: Trang tổng quan học viên

## Context Links

- Design contract (bắt buộc tuân theo): `open-design/student-portal-prompt.md` — cấu trúc màn hình, token màu, copy VN, a11y, mobile-first
- `reports/scout-report.md` (mục 5, 6 — dữ liệu class/lesson/assignment; API Phase 2)
- Pattern data layer: `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/data-provider.tsx`, `apps/web/src/lib/query-client.ts`
- UI primitives: `@teacher-os/ui/components/{card,button,empty,skeleton,dropdown-menu}`

## Overview

- Priority: P1 · Status: todo
- Thay placeholder `/` bằng trang "Tổng quan" thật: greeting theo tên + ngày VN + dòng tóm tắt, mục "Lớp học của tôi" (card lớp + buổi tới + progress), mục "Bài tập" (tabs lọc 4 trạng thái, chip trạng thái, due tương đối, điểm band), empty states, avatar menu (đăng xuất). Read-only, mobile-first, đúng design contract.

## Key Insights

- Nguồn data duy nhất: `GET /api/student/overview` (Phase 2) qua TanStack Query — một query, hai section tiêu thụ. 401 giữa session đã được xử lý tập trung ở query-client (Phase 1) — không cần mỗi hook tự lo.
- Trạng thái bài tập derive ở client với "hôm nay" Asia/Ho_Chi_Minh (tái dùng `packages/api/src/vietnam-date.ts`); Quá hạn sort trước trong tab "Tất cả". **Luật derive an toàn với dữ liệu lỏng** (red-team #8): source `grading` KHÔNG có classId/className (nullable) và `due` có thể `""` hoặc free-text — `due` không parse được ISO → coi như "Chưa nộp", TỰỆ ĐỐI không dán "Quá hạn"; `submittedAt` chỉ tồn tại ở source `class_assignment`; source `grading` có `scores` → trạng thái "Đã chấm" (kèm Điểm).
- **Band điểm derive ở client** trong `assignment-status.ts`: IELTS overall = mean 4 tiêu chí (task, coherence, lexical, grammar) làm tròn về 0.5 gần nhất theo quy tắc IELTS (.25→lên .5, .75→lên nguyên) — pin bằng unit test (mean 6.25 → 6.5; mean 6.125 → 6.0). Contract server trả nguyên 4 trường, không tự chế `band` (red-team #8).
- Level chip, mode chip, status chip: text + màu cùng lúc (a11y — không dùng màu đơn thuần); warning text dùng `#a16207` trên nền sáng.
- Màn hình lỗi phân loại theo mã server (Phase 2): `STUDENT_NOT_LINKED` → "Tài khoản chưa được liên kết với học viên nào"; `STUDENT_EMAIL_UNVERIFIED` → hướng dẫn xác thực email/đăng nhập Google; `STUDENT_AMBIGUOUS` → liên hệ trung tâm. Đều render trạng thái riêng (không redirect loop) + nút Đăng xuất.

## Requirements

- [ ] Greeting "Chào {tên}" + ngày VN ("Thứ Ba, 23/09") + dòng tóm tắt số bài sắp đến hạn
- [ ] "Lớp học của tôi": card/lớp — tên, chip level, chip mode, lịch tuần, progress "Buổi 12/24" + bar, "Buổi tới: ..."
- [ ] "Bài tập": tabs Tất cả / Sắp đến hạn / Quá hạn / Đã nộp (button thật + `aria-selected`), row: tiêu đề, lớp, "Hạn: 25/09 · còn 2 ngày", chip trạng thái, điểm nếu có
- [ ] Empty states gọn cho "chưa có lớp" và "chưa có bài tập"; skeleton khi loading; avatar menu có Đăng xuất
- [ ] Mobile-first 360→1920 không scroll ngang, touch target ≥ 44px, contrast ≥ 4.5:1, icon Lucide (không emoji)

## Architecture

```
apps/student/src/
├── routes/index.tsx                  # render <StudentOverview/> (guard _auth đã lo session)
├── routes/_auth/route.tsx            # AuthLayout: top bar mobile (wordmark + avatar) / sidebar mỏng desktop (Trang chủ, Bài tập, Hồ sơ — 2 cái sau disabled "sắp có")
├── components/layout/
│   ├── student-shell.tsx             # app shell học viên (không copy AppShell giáo viên — nav chỉ 2-3 mục)
│   └── avatar-menu.tsx               # tên + đăng xuất (authClient.signOut → invalidate + redirect /login)
├── components/overview/
│   ├── greeting-header.tsx
│   ├── class-card.tsx                # progress bar, chip level/mode, buổi tới
│   ├── assignment-list.tsx           # tabs + sort + rows
│   ├── assignment-row.tsx            # chip trạng thái, due tương đối, điểm
│   └── empty-state.tsx               # tái dùng @teacher-os/ui/components/empty
├── lib/
│   ├── repos/student.ts              # fetchStudentOverview() + fetchStudentMe() (fetch credentials: "include"), phân loại mã lỗi STUDENT_*
│   └── assignment-status.ts          # derive 4 trạng thái (an toàn due=""/ISO lỗi) + band IELTS + sort order + relative due (unit-test được thuần)
└── test/assignment-status.test.ts    # vitest: derive biên (hôm nay, +3 ngày, quá hạn, đã nộp, có điểm, due rỗng, due lỗi, band .25/.75)
```

Error mapping: `/api/student/me` 403 → render trạng thái tương ứng mã (NotLinked/Unverified/Ambiguous — xem Key Insights); 401 → query-client (Phase 1) đã redirect `/login?returnUrl=...` tập trung.

## Related Code Files

- Create: cây file nêu trên trong `apps/student/src/`
- Modify: `apps/student/src/routes/index.tsx`, `apps/student/src/routes/_auth/route.tsx`
- Modify (api types): consume types từ `@teacher-os/api` (contracts Phase 2) — không copy tay shape

## Implementation Steps

1. `lib/repos/student.ts` + query hooks (`useStudentMe`, `useStudentOverview`) với staleTime ngắn (60s), error handling phân loại 401/403.
2. `lib/assignment-status.ts` thuần function + unit test biên trước khi dựng UI (gồm case due `""`, due ISO lỗi, band rounding .25/.75, grading có scores không có class).
3. `student-shell.tsx` + `avatar-menu.tsx` (đăng xuất gọi `authClient.signOut`, sau đó `router.invalidate()` + redirect `/login`).
4. Dựng sections theo design contract: greeting → class grid (1 cột mobile, 2-3 cột desktop) → assignment tabs/list; token màu/ngày VN theo `open-design/student-portal-prompt.md` (accent #0071e3, surfaces #f5f5f7/#fbfbfd, type scale 12/14/17/21/28).
5. Empty states + skeleton + NotLinkedState.
6. Kiểm chứng responsive bằng resize thủ công 360/390/430/768/1024/1440; chạy `pnpm --filter student test` + gates monorepo.

## Todo

- [ ] repos + hooks + 403 mapping
- [ ] assignment-status derive + unit test
- [ ] Shell + avatar menu + đăng xuất
- [ ] Greeting + lớp card + buổi tới + progress
- [ ] Bài tập tabs/list + chips + điểm
- [ ] Empty states + skeleton + 3 màn hình lỗi (NotLinked/Unverified/Ambiguous)
- [ ] Responsive + a11y checklist theo design contract

## Success Criteria

- Login với student có data → thấy đúng lớp/bài tập của chính mình; tab lọc hoạt động; Quá hạn nổi đầu; bài đã chấm hiện "Điểm: 6.5" (band từ mean 4 tiêu chí, quy tắc IELTS pinned test).
- Bài grading không có `due` → "Chưa nộp", KHÔNG bao giờ "Quá hạn" (unit test khoá).
- Login bằng user chưa liên kết / chưa verify / mơ hồ → thấy đúng màn hình lỗi tương ứng (không crash, không loop).
- Tất cả gates xanh; không thêm dependency UI mới ngoài packages/ui + lucide-react.

## Risk Assessment

- Dữ liệu lớp legacy: `lesson.date` NULL → ẩn "Buổi tới" (null) thay vì đoán; progress vẫn dùng `sessionsDone/sessionsTotal` trên class.
- `assignment` (grading) và `class_assignment` trùng tiêu đề khi teacher dùng cả hai nguồn → phân biệt qua `source`, không dedupe cưỡng bức (ghi chú; chờ write-path thật ở plan sau).
- Múi giờ: mọi so sánh ngày qua `vietnam-date.ts` như e2e đã pin `Asia/Ho_Chi_Minh` (playwright.config.ts) — tránh so `Date` máy người dùng.

## Security Considerations

- Không cache data học viên vào localStorage; chỉ trong bộ nhớ TanStack Query.
- Fetch luôn `credentials: "include"` về API origin; không render HTML từ title/note (React escape mặc định).

## Next Steps

- Phase 5 đưa app lên topology deploy; sau plan: trang Hồ sơ, chi tiết bài tập, submit flow (đề xuất plan kế tiếp).
