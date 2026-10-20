---
phase: 11
title: "Học viên: History heatmap + lịch sử chi tiết (mới)"
status: pending
priority: P2
effort: "7h"
dependencies: [10]
---

# Phase 11: History

## Goal

Trang **Lịch sử** theo `design-v2/src/pages/StudentHistory.tsx`: heatmap tháng (`MonthHeatmap`),
bảng tuần theo kỹ năng (`WeekTable`), danh sách chi tiết (`DetailHistory`) có lọc kỹ năng và
xem lại bài viết (`WritingReview`), từ dữ liệu thật — không có Dictation.

## Nguồn dữ liệu

- `quiz_attempt` đã nộp của học viên (cả `mode=assignment` và `practice`) trong org đang chọn:
  ngày (`submitted_at`, giờ Việt Nam qua `packages/api/src/vietnam-date.ts`), kỹ năng (từ test/
  assignment), tiêu đề, thời lượng (`submitted_at - started_at`), điểm/band, trạng thái
  (tự chấm / đã chấm / chờ chấm), loại (Bài tập lớp / Luyện tập).
- Ôn từ vựng: bản ghi review SRS hiện có (`packages/api/src/srs`, schema `vocab.ts`) gộp theo
  ngày → 1 dòng "Từ vựng" (số thẻ đã ôn).

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` — `HistoryMonthResponse { days: { date, count,
  minutes }[] }`, `HistoryWeekResponse { monday, rows: { skill, days: number[] }[] }`,
  `HistoryEntry`, `HistoryListResponse` (phân trang).
- Create: `apps/server/src/routes/student-history.ts` (+ đăng ký `app.ts`):
  `GET /student/history/month?ym=2026-10`, `GET /student/history/week?monday=`,
  `GET /student/history?skill=&page=`; dùng index phase 10.
- Create: `apps/server/src/routes/student-history.test.ts` — gom đúng ngày theo giờ VN (attempt
  23:30 UTC+7), chỉ dữ liệu của chính học viên + org đang chọn, có cả practice + assignment.
- Modify: `apps/student/src/lib/repos/student.ts` — hooks tương ứng.
- Create: `apps/student/src/routes/_auth/history.tsx`; Create:
  `apps/student/src/components/history/{month-heatmap,week-table,history-list,writing-review}.tsx` (+ test).
- Modify: nav học viên — bật mục "Lịch sử"; `HistoryButton` ở Practice (phase 10) dẫn tới
  `/history?skill=…` với số đếm thật.
- Stat đầu trang (chuỗi ngày liên tiếp `Flame`, tổng phút `Clock`, số ngày học `CalendarCheck`)
  tính từ dữ liệu tháng.

## Tasks & Steps

1. Route + test (timezone, quyền, phân trang).
2. Heatmap: ô ngày là `button` có `aria-label` "Ngày dd/mm: N bài", chọn ngày → đặt tuần cho
   `WeekTable`; trạng thái tuần trong URL (`?week=`).
3. Danh sách chi tiết: lọc kỹ năng trong URL; Writing đã chấm → mở `WritingReview` dùng
   `essay-with-highlights` có sẵn.
4. Empty state khi chưa có hoạt động + CTA "Bắt đầu luyện tập".

## Verification

- `pnpm --filter server test -- history && pnpm --filter student test -- history`
- e2e mới `student-history.spec.ts`: nộp 1 bài luyện (phase 10 seed) → heatmap ngày hôm nay
  có đếm ≥1, danh sách có dòng tương ứng.
- `pnpm design:compare --screens s-history --side app --label new` → PASS.
