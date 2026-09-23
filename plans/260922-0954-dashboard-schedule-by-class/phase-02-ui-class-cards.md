---
phase: 2
title: "Dashboard render card theo lớp + verification"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Dashboard render card theo lớp + verification

## Goal

Sửa `apps/web/src/routes/_auth/dashboard.tsx` để "Lịch hôm nay" và "Lịch sắp tới" render card theo buổi-lớp (tên lớp tiêu đề, học viên liệt kê trong card) dùng helper từ Phase 1, rồi chạy toàn bộ verification.

## Files to Modify

- Modify: `apps/web/src/routes/_auth/dashboard.tsx` — duy nhất file này thay đổi ở phase 2

## Tasks & Steps

1. Lấy `classById` từ `useData()` (dashboard.tsx:37): đổi thành `const { data, studentById, classById } = useData();` — `classById(id): ClassGroup | undefined` đã có sẵn ở `data-provider.tsx:54` (interface) và `:134` (impl). Thêm `groupLessonsByClassSession` vào import từ `@/lib/dashboard-from-kernel` (dashboard.tsx:14–21).
2. "Lịch hôm nay" render theo buổi-lớp: sau `const today = lessonsToday(...)` (dashboard.tsx:45), thêm `const todayGroups = groupLessonsByClassSession(today);` rồi thay vòng `today.map` (dashboard.tsx:79–116) bằng `todayGroups.map`:
   - Card key = `` `${g.classId}-${g.time}` `` (unique trong scope hôm nay, ổn định qua re-render khi điểm danh vì không đổi khi status thay đổi).
   - Card layout: `Avatar text={(classById(g.classId)?.name ?? "Lớp").charAt(0)} size="md"` + tiêu đề `classById(g.classId)?.name ?? "Lớp"` (`font-semibold text-sm`) + meta `{g.time} · {g.dur}' · {g.type} · {g.topic}` (`font-mono text-meta text-xs`).
   - Danh sách học viên: với từng `l` trong `g.lessons`, resolve `const s = studentById(l.sid)` — bỏ qua row khi `!s` (filter, không hủy cả card như `if (!s) return null` cũ ở dashboard.tsx:80–81). Mỗi học viên 1 dòng: Avatar sm (`s.avatar`) + `s.name` + action per-lesson giữ nguyên logic cũ (dashboard.tsx:95–113): `l.status === "completed"` → `<Badge variant="success" dot>Đã học</Badge>`, ngược lại Button "Điểm danh" (`disabled={busy || isPending(l.id)}`, onClick `void run(l.id, { type: "check-in", lessonId: l.id }, "Đã điểm danh.")`, label "Đang lưu…" khi pending).
   - Group có tất cả học viên đều miss thì rỗng sau filter — không render card; đổi điều kiện empty-state (dashboard.tsx:74) từ `today.length === 0` sang `todayGroups.length === 0` cho nhất quán.
3. "Lịch sắp tới" giữ group theo thứ: vòng `upcomingGroups` theo `l.day` (dashboard.tsx:48–56) giữ nguyên; trong mỗi day group, thay `group.lessons.map` (dashboard.tsx:131–149) bằng `groupLessonsByClassSession(group.lessons).map`:
   - Card key = `` `${group.day}-${g.classId}-${g.time}` `` (prefix thứ vì mỗi day group gọi helper riêng).
   - Card: Avatar sm chữ cái đầu tên lớp + tên lớp (`classById(g.classId)?.name ?? "Lớp"`) + meta `{g.time} · {g.dur}&apos; · {g.type} · {g.topic}` + danh sách học viên (Avatar sm `s.avatar` + `s.name`, bỏ row khi `!s`).
   - KHÔNG nút action — parity với render hiện tại của mục này.
4. Lead (dashboard.tsx:62): đổi `formatDashboardLead(now, today.length)` thành `formatDashboardLead(now, todayGroups.length)` — chữ format không đổi, chỉ nguồn count.
5. Rà specs e2e trước khi chạy: không spec nào pin UI card dashboard (chỉ `apps/e2e/specs/helpers.ts:23` assert URL `/dashboard` sau login) — e2e là regression-only, không cần sửa spec. Chạy full verification ở mục Verification; nếu fail thì sửa trong dashboard.tsx, không đổi data layer.

## Verification

- `pnpm check-types`
- `pnpm --filter web test`
- `pnpm exec biome check apps/web/src`
- `pnpm --filter e2e e2e`
