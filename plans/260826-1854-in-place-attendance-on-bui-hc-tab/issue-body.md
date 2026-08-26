## Branch

`develop` (feature branch tạo khi cook)

## Plan

- [plan.md](plans/260826-1854-in-place-attendance-on-bui-hc-tab/plan.md)
- Brainstorm report: None found
- Open questions: None

## Summary

Giáo viên điểm danh tại chỗ trên tab **Buổi học** của class detail.

- Reuse `POST /api/lessons/:id/check-in` (body `{}`). Không kernel action mới.
- CTA tuần tự: buổi chưa chốt sớm nhất + `dateISO <= todayISOVietnam()`.
- 1:1 one-click; 1:2+ modal roster — 1 `enrollmentLessonId` / 1 sid / 1 click.
- Buổi tương lai trên **tab này**: Badge "Sắp tới", 0 CTA. Write path `/schedule` không đổi.
- Extract `ClassScheduleTable` trước khi thêm nút (`$classId.tsx` <500).

## Acceptance

- Sequential head ≤ hôm nay VN → Điểm danh → toast "Đã điểm danh." → Badge "Đã học".
- 1:2+ modal; không "Điểm danh tất cả".
- Future / cancelled / completed / legacy: 0 CTA trên tab.
- Mỗi click = 1 POST check-in với enrollment lesson id (không syllabus id).
- E2E: Playwright `timezoneId: Asia/Ho_Chi_Minh`; lớp start-tomorrow 0 button trên tab; lớp start-today CTA tại chỗ persist sau reload.
- Issue #87: chỉ dropdown/fan-out superseded; inline-edit topic vẫn thuộc #87.

## Phases

1. Helper + extract ClassScheduleTable
2. CTA + SessionAttendanceModal
3. Tests / e2e / ghi chú #87
