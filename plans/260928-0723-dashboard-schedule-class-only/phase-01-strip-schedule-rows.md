---
phase: 1
title: "Gọn card lịch dạy trên dashboard"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Gọn card lịch dạy trên dashboard

## Goal

Card lịch dạy trên `/dashboard` chỉ còn tên lớp + meta buổi học ở cả hai section "Lịch hôm nay" và "Lịch sắp tới".

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/dashboard.tsx` (thay đổi UI chính)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (drift-guard: bỏ 3 positive pin dashboard check-in ở 2 test, thay bằng negative pin)

## Key Insights

- Toàn bộ UI dashboard nằm trong 1 file; buổi học đã được gom theo lớp bởi `groupLessonsByClassSession` (`apps/web/src/lib/dashboard-from-kernel.ts:37`), type `DashboardClassSession` có sẵn `classId, time, dur, type, topic` — không cần đụng helper hay tầng data.
- `Avatar`, `Badge` vẫn được dùng ở section "Học viên rủi ro" → giữ import. `Button` và `useDirectKernelAction` chỉ dùng cho nút "Điểm danh" trong student list → xóa import.

## Tasks & Steps

Section "Lịch hôm nay" (dòng số theo file hiện tại):
1. Xóa `<Avatar text={className.charAt(0)} size="md" />` (dòng 107).
2. Xóa toàn bộ khối student rows dòng 115–148 (`<div className="flex flex-col gap-2 border-border/50 border-t pt-2">` … `</div>`), gồm nút "Điểm danh" và Badge "Đã học".
3. Xóa việc build `studentRows` (dòng 83–96) và early-return `if (studentRows.length === 0) return null;` (dòng 98).

Section "Lịch sắp tới":
4. Xóa `<Avatar text={className.charAt(0)} size="sm" />` (dòng 194).
5. Xóa khối student rows dòng 204–213.
6. Xóa build `studentRows` (dòng 170–183) và early-return (dòng 185).

Dọn code chết:
7. Bỏ `const { run, isPending, busy } = useDirectKernelAction();` (dòng 39) và import `useDirectKernelAction` (dòng 25).
8. Xóa import `Button` (dòng 9).
9. Đổi `const { data, studentById, classById } = useData();` thành `const { data, classById } = useData();` (dòng 38).
10. Card "Lịch hôm nay" còn lại: `<div className="font-semibold text-sm">{className}</div>` + dòng meta `{g.time} · {g.dur}' · {g.type} · {g.topic}`; card "Lịch sắp tới" tương tự. Giữ nguyên `Card`, key, variant, layout `flex items-center gap-3` (bỏ Avatar thì còn `min-w-0 flex-1` div — có thể gọn thành chỉ còn khối text).

Drift-guard `kernel-runtime.contract.test.ts`:
11. Test "dashboard reads today and at-risk from kernel helpers…": xóa 3 assertion `toMatch` dòng 194–196 (`useDirectKernelAction\(\)`, `void run\(`, `disabled=\{busy \|\| isPending\(l\.id\)\}`), thay bằng negative pin `expect(dashboard).not.toMatch(/useDirectKernelAction/)` — dashboard không còn là surface check-in. Giữ mọi assertion khác (helpers + negative pin KPI hardcode).
12. Test "direct actions await the outcome, disable while pending and report visibly": xóa block dashboard (dòng 283–286), giữ nguyên các pin tuition/classDetail/lessonModal/scheduleTable.

## Todo List

- [x] Xóa avatar lớp + student rows ở "Lịch hôm nay"
- [x] Xóa avatar lớp + student rows ở "Lịch sắp tới"
- [x] Xóa imports/state không còn dùng (Button, useDirectKernelAction, studentById)
- [x] Card chỉ còn tên lớp + meta buổi học, layout không vỡ
- [x] Cập nhật contract test: negative pin thay positive pin dashboard check-in

## Verification

- `pnpm --filter web check-types` exit 0
- `pnpm check` (biome) không báo unused import

## Risk Assessment

- Rủi ro thấp: chỉ xóa JSX trong 1 file. Điểm dễ sót nhất là import thừa (biome/tsc sẽ bắt) và việc bỏ early-return khiến card "mọc thêm" cho các buổi có lesson record thiếu student — đây là hành vi mong muốn, ghi chú trong PR.

## Security Considerations

- Không thay đổi luồng auth/authorization; chỉ thay đổi presentation.

## Next Steps

- Phase 2: kiểm chứng & regression.
