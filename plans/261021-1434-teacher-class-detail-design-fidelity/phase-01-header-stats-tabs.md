---
phase: 1
title: "Header, hàng stat, tabs + dọn token chết"
status: done
effort: "2h"
dependencies: []
---

# Phase 1: Header, stat, tabs

## Files

- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (header, stat, danh sách tab, tab mặc định, `validateClassDetailSearch`).
- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` (dòng 333, 342, 350), `session-actions-modal.tsx` (dòng 173) — chỉ thay class chết.
- Tham chiếu (không sửa): `components/ui/page-head.tsx`, `card.tsx` (`StatCard` đã có `sub`, `hot`).

## Steps

1. Back link: dùng nút ghost `Button variant="ghost" size="sm"` + icon `ArrowLeft`, nhãn "Lớp học", đích `/classes`.
2. Header: `kicker` = `${loại} · ${lịch} · ${phòng/hình thức}` theo mẫu design; bỏ `lead` (chuỗi
   `Học phí: X / học viên` chuyển sang tab Học viên ở phase 3 — hợp đồng hook). Header còn đúng 2 action:
   "Giao bài tập" (outline, mở `assignmentsView="assign"`) + **"Sắp xếp buổi"** (primary, mở
   `ClassSessionsManageModal`, disabled khi lớp chưa có bản sao giáo trình — giữ nhãn hiện tại vì
   `class-sessions-manage-modal.spec.ts:122` + `syllabus-test-session-mark.spec.ts:182` click đúng nhãn).
   Nút `+ Thêm học viên vào lớp` (giữ nguyên nhãn) và `Sửa` học phí chuyển sang tab Học viên (phase 3 dựng
   chỗ, phase 1 chỉ gỡ khỏi header). "Add session" của design = "Sắp xếp buổi" — lệch có chủ đích ghi `DESIGN.md`.
3. Stat: giảm còn 4 thẻ `grid-cols-2 lg:grid-cols-4`: Học viên (sub = khoảng ngày), Buổi đã học `x/y` (sub = `% giáo trình`), **Bài trong syllabus** (thẻ 3 — chốt red-team: bỏ Chuyên cần vì không có data tin được), Bài chờ nộp (sub = "Trên N bài đã giao"). Tính từ dữ liệu có sẵn trong route (`classAssignments`, `cls.sessionsDone`); bỏ biến không còn dùng.
4. Tabs: id `sessions-practice` (nhãn "Sessions & practice", mặc định) · `roster` ("Học viên") ·
   `curriculum` ("Giáo trình") · `vocab` ("Từ vựng") · `notes` ("Ghi chú"). Mở rộng `CLASS_DETAIL_TABS`
   và ánh xạ giá trị cũ trong `validateClassDetailSearch`: `sessions`/`assignments` → `sessions-practice`
   (giữ `assignmentsView` khi `assignments`); `roster` → giữ nguyên. Helper e2e `openClassScheduleTab`
   (bấm tab "Buổi học") đổi sang tab mới — 1 chỗ trung tâm.
5. Thay token chết ở **6 chỗ** (acceptance grep toàn `apps/web/src`): `class-schedule-table.tsx` (333,
   342, 350), `session-actions-modal.tsx:173`, `class-assignments-tab.tsx:601`, `syllabus/$syllabusId.tsx:305`
   — `bg-muted/40/30` → `bg-muted/40`, `text-foreground-2` → `text-muted-foreground`.

## Verification

- `pnpm --filter web test -- '\$classId'` xanh (cập nhật assertion tab/stat đã đổi, không nới lỏng).
- `grep -rnE "foreground-2|muted/40/30" apps/web/src` rỗng.
- `pnpm check-types` xanh.
- Mở `/classes/<id>` ở 1440/768/375: header 2 nút, 4 stat, tab segmented không tràn ngang ở 375.
- Tuân thủ "Hợp đồng hook" trong `plan.md` (nhãn nút, testid, chuỗi học phí).
