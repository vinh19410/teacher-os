---
phase: 2
title: "Modal warning UI"
status: completed
---

# Phase 2 — Modal warning UI

## Files
- MODIFY `apps/web/src/components/modals/add-class-modal.tsx`
- MODIFY `apps/web/src/components/modals/add-class-modal.test.tsx`
- CREATE `apps/web/src/components/modals/add-class-modal.conflict.test.tsx`

## Steps
1. Trong `AddClassModal`: `const { classes } = useClasses();` và `useMemo(() => findScheduleConflicts({days, start: startTime, end: endTime, startDate, sessionsTotal: Number(total) || 0}, classes), [...])`.
2. Render ngay dưới khối lịch học (days chips + time pickers) một box warning (`role="status"`, `data-testid="schedule-conflict-warning"`, tông amber theo style cảnh báo hiện có của repo):
   - Tiêu đề: "Lịch bị trùng với lớp đang học"
   - Mỗi dòng (chỉ JSX text children — React tự escape, KHÔNG `dangerouslySetInnerHTML`/helper HTML): `{cls.name} · {sharedDays.map((d) => dayNames[d]).join(" & ")} · {parsed.start}–{parsed.end}` với `parsed = parseStoredSchedule(cls.schedule)`; tên lớp thêm `break-words`; cap 3 dòng, phần dư hiển thị `+N lớp khác`.
3. Không đổi `submitBlocked`/handler submit — warning không chặn.
4. Đổi `startDate` hoặc `total` cũng phải re-compute (thêm vào deps của `useMemo`).
5. Ẩn warning khi `saving || notice` (sau submit, optimistic store có thể chứa chính lớp vừa tạo → self-conflict flash).

## Tests

File test hiện có (`add-class-modal.test.tsx`, node env + renderToStaticMarkup) sẽ crash khi modal gọi `useClasses()` — `useData` throw khi thiếu DataProvider. Bắt buộc thêm `vi.mock("@/lib/repos/use-classes", …)` trả store seed được.

Interaction tests sống trong file mới `add-class-modal.conflict.test.tsx` với `// @vitest-environment jsdom` (precedent: verify-email-view.test.tsx) + `@testing-library/react` `fireEvent` (đã có trong deps):
- Store có lớp T2&T4 19:00–20:30 còn buổi (startDate quá khứ, sessionsTotal chưa xong); chọn T2 + 19:00 → warning hiện tên lớp; nút submit vẫn enabled.
- Đổi giờ sang 20:30 → warning biến mất.
- Tên lớp chứa `<img src=x onerror=alert(1)>` render escaped (không tạo element img trong warning).

## Verify
- `pnpm --filter web test add-class-modal`
- `pnpm check && pnpm check-types`
- Smoke: dev web :8001, mở /classes → Tạo lớp, chọn T2 19:00 → thấy warning.
