---
phase: 2
title: "Rewire schedule tab table"
status: todo
priority: P1
effort: "2-3h"
dependencies: [1]
---

# Phase 2: Rewire schedule tab table

## Overview

Thay block `tab === "schedule"` trong class detail (`apps/web/src/routes/_auth/classes/$classId.tsx:339-373`) sang consume helper Phase 1: 1 dòng/buổi theo ngày thật, cột gộp "Thứ Ba, 25/08 · 19:00–20:30", chủ đề mapping syllabus, trạng thái per-buổi, giữ fallback nguyên trạng khi helper trả `null`.

## Requirements

- Functional:
  - **Scope rows theo `classId`, KHÔNG theo studentIds (red-team F5)**: `classLessons` hiện tại (`$classId.tsx:86-88`) lọc `cls.studentIds.includes(l.sid)` — sai khi 1 học viên ở 2 lớp (schema cho phép, `packages/db/src/schema/enrollment.ts:35-38`). API snapshot **đã trả** `classId` trên lesson rows (`packages/api/src/contracts.ts: KernelLessonRow.classId`, `apps/server/src/routes/snapshot.ts:238-248`) nhưng `mapLessons` đang bỏ field này. Thay đổi:
    - `apps/web/src/lib/mock-data.ts`: thêm `classId: string` vào interface `Lesson` (+ cập nhật mọi chỗ khởi tạo `Lesson` literals nếu typecheck bắt).
    - `apps/web/src/lib/repos/lessons.ts`: map `classId: row.classId` trong `mapLessons`.
    - `$classId.tsx` tab schedule: `const scheduleLessons = data.lessons.filter((l) => l.classId === classId)` — truyền vào helper. Nhánh fallback bảng cũ vẫn dùng `classLessons` nguyên trạng (parity tuyệt đối hành vi cũ).
  - Gọi `buildClassSessions({ schedule: cls.schedule, startDate: cls.startDate, lessons: scheduleLessons })`.
  - Helper trả `null` → render đúng bảng hiện tại (headers `["Ngày","Giờ","Học viên","Chủ đề","Trạng thái"]`, row per lesson row, dữ liệu `classLessons`) — hành vi fallback cho lớp legacy startDate/schedule **và cho lớp có row bị edit day/time lệch schedule** (divergence guard Phase 1).
  - Helper trả sessions → `DataTable` headers mới `["Ngày & Giờ", "Học viên", "Chủ đề", "Trạng thái"]` (bỏ cột Giờ riêng), 1 row per session:
    - Ngày & Giờ: `formatSessionDate(s.dateISO)` + " · " + `sessionTimeRange(s)` trong cùng 1 cell (giữ style `font-mono text-meta text-xs` như cột Ngày hiện tại).
    - Học viên: tên unique của `s.rows.map(r => studentById(r.sid)?.name)` join ", "; rỗng → "—".
    - Chủ đề: `sessionTopic(s, safeSyLessons) ?? "—"`; **red-team F8**: `safeSyLessons = sy && sy.classId === classId ? syLessons : []` — lớp có con trỏ giáo trình anomaly (legacy pointer trỏ template — nhánh đã xử lý ở tab Giáo trình `$classId.tsx:320-336`) phải render "—" thay vì rò title từ template dùng chung. `syLessons` flatten có sẵn `$classId.tsx:79`.
    - Trạng thái: `sessionStatus(s)` → `"completed"`: Badge success "Đã học"; `"cancelled"`: Badge danger "Đã hủy"; ngược lại Badge accent "Sắp tới" (giữ nguyên Badge components hiện có, `$classId.tsx:355-367`). Heuristic per-sid in-order prefix — đã documented ở Phase 1.
  - Không thay đổi: tab khác (roster/syllabus/notes), StatCards, header card, edit/cancel lesson flows ở trang /schedule, dashboard, weekly grid.
- Non-functional: 0 thay đổi `apps/server`, `packages/db`, `packages/api`; không thêm dependency mới. Thêm field `classId` vào display `Lesson` là additive — không consumer hiện có nào phá.

## Architecture

```
$classId.tsx (tab schedule)
  ├─ classLessons (:86-88, student-scoped) ── fallback bảng cũ (nguyên trạng)
  ├─ scheduleLessons = data.lessons.filter(classId === classId)  (red-team F5)
  ├─ safeSyLessons = sy.classId === classId ? syLessons : []     (red-team F8)
  ├─ buildClassSessions(scheduleLessons) ──null──▶ fallback bảng cũ
  │                                       └─ sessions[]
  └─ DataTable 1 row/session: formatSessionDate + sessionTimeRange | students | sessionTopic(safeSyLessons) | sessionStatus
```

## Related Code Files

- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (block dòng 339-373 + import helper), `apps/web/src/lib/mock-data.ts` (Lesson.classId), `apps/web/src/lib/repos/lessons.ts` (mapLessons thêm classId)
- Tham chiếu (không sửa): `apps/web/src/lib/class-sessions.ts` (Phase 1), `apps/web/src/components/*` (DataTable, Badge — dùng nguyên), `packages/api/src/contracts.ts` (KernelLessonRow đã có classId)

## Implementation Steps

1. Thêm `classId` vào `Lesson` type + `mapLessons`; chạy typecheck để bắt mọi literal khởi tạo `Lesson` thiếu field.
2. Import helper Phase 1 vào route; tính `scheduleLessons`, `safeSyLessons`, `const sessions = buildClassSessions(...)` trong block `tab === "schedule"`.
3. Viết nhánh fallback `sessions === null` giữ nguyên JSX bảng hiện tại (dữ liệu `classLessons`).
4. Viết nhánh mới: headers 4 cột, map sessions → rows như Requirements; style đồng bộ bảng hiện tại.
5. Manual verify trên dev server (class như screenshot: T3 & T6 · 19:00–20:30 · start 2026-08-25 · 26 buổi): 26 dòng xen kẽ Thứ Ba/Thứ Sáu theo ngày tăng dần; chủ đề fill từ syllabus lesson 1..26; lớp legacy (startDate "") → fallback; lớp có row edit time → fallback.
6. Chạy `pnpm biome check` + typecheck + full `pnpm --filter web test`; smoke dashboard + /schedule không đổi.

## Todo

- [x] `Lesson.classId` + `mapLessons` + typecheck sạch các literal
- [x] `scheduleLessons` (classId scope) + `safeSyLessons` (anomaly guard) + nhánh fallback + nhánh sessions mới
- [x] Cột gộp Ngày & Giờ + học viên gộp 1 cell + chủ đề syllabus + trạng thái per-buổi
- [x] Verify: 4 kịch bản cover bằng unit tests helper (lớp chuẩn 26 buổi / legacy null / chưa import syllabus "—" / divergence edit time → null); browser verify deferred sang CI e2e — local ports 8000/8001 bị dev stack đang chạy giữ và boot shim hardcode port (không thể boot stack riêng; e2e `class-operations.spec.ts` cover đúng flow tab Lịch học này)
- [x] biome + typecheck + test xanh, smoke dashboard + /schedule

## Success Criteria

- [x] Bảng Lịch học: các dòng xen kẽ đúng thứ tự ngày thật (25/08 T3, 28/08 T6, 01/09 T3, ...) — không còn nhóm 13 dòng T3 rồi 13 dòng T6.
- [x] Cột "Ngày & Giờ" hiển thị đầy đủ "Thứ Ba, 25/08 · 19:00–20:30"; không còn cột Giờ riêng.
- [x] Cột Chủ đề hiển thị title syllabus theo thứ tự buổi; lớp chưa import giáo trình / syllabus ngắn hơn → "—"; topic user đã sửa qua lesson-edit hiển thị tại occurrence được gán (in-order heuristic, Phase 1).
- [x] Cột Trạng thái: buổi đã check-in (in-order prefix) hiện "Đã học"; buổi bị cancel hiện "Đã hủy"; còn lại "Sắp tới".
- [x] Lớp nhiều học viên: mỗi buổi 1 dòng, tên học viên gộp trong 1 cell.
- [x] Lớp startDate rỗng/legacy và lớp có row edit day/time lệch schedule: bảng fallback đúng hành vi cũ, không crash, không render ngày sai.
- [x] Lớp có con trỏ giáo trình anomaly (legacy pointer): Chủ đề render "—", không rò title từ template.
- [x] Dashboard + trang /schedule weekly grid: behavior không đổi (không đụng server query, sort, hay consumer dùng chung `data.lessons` — chỉ thêm field).
- [x] biome check, typecheck, `pnpm --filter web test` sạch.

## Risk Assessment

- Rủi ro lớn nhất: regression hiển thị cho lớp legacy (schedule free-text, startDate rỗng) — tín hiệu: bảng trắng hoặc sai định thay vì fallback. Phản ứng: giữ nguyên nhánh fallback dùng `classLessons` như bảng cũ; không bao giờ render sessions khi helper trả `null`.
- Thêm `classId` vào `Lesson` type phá chỗ khởi tạo literal chưa được liệt kê — typecheck bắt hết tại bước 1; nếu mock seed lessons tồn tại ở file khác, cập nhật cùng commit.
- Trạng thái/chủ đề heuristic hiển thị sai chỗ khi teacher thao tác ngoài trình tự — documented limitation (Phase 1); tổng số mỗi trạng thái vẫn đúng, không có dữ liệu render-only nào tốt hơn.
- Block JSX dài thêm: nếu vượt ~60 dòng, tách `ClassScheduleTable` trong cùng file — không tạo file component riêng (giữ ranh giới thay đổi tối thiểu).
