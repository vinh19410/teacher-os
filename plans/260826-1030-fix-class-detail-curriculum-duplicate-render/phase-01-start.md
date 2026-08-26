---
phase: 1
title: "Single curriculum tree in class detail"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Single curriculum tree in class detail

## Overview

Gộp hai cây `modules→lessons` đang render trùng trong tab "Giáo trình" của class detail thành MỘT cây duy nhất: editor tree giữ nguyên CRUD, được bổ sung status dot + badge mỗi lesson row và `{done}/{total} buổi` mỗi module header; summary tiến độ (card + progress bar) render phía trên; xóa component `SyllabusProgress`.

## Requirements

- Functional:
  - Mỗi module và mỗi lesson xuất hiện đúng MỘT lần trong tab "Giáo trình".
  - Lesson row editor hiển thị status dot + badge (Đã dạy / Đang học / Sắp tới) — dữ liệu `l.status` hiện có, `EditLessonModal` vẫn sửa được. Row PHẢI giữ nguyên dòng `Mục tiêu: {l.objectives}` như cây read-only cũ (`syllabus-progress.tsx:95-97`) và như editor template page (`$syllabusId.tsx:214-216`).
  - Module header hiển thị `{số done}/{tổng} buổi`.
  - Summary trên cùng: tên syllabus, level/skills (hoặc type label), `%`, `done/total` buổi VÀ `{syllabus.totalLessons} buổi` (meta line `syllabus-progress.tsx:50`), progress bar — giữ nguyên thông tin như `syllabus-progress.tsx:42-62`.
  - CRUD hiện có giữ nguyên: + Thêm module, Gỡ giáo trình, Sửa module/lesson, + Thêm buổi học.
- Non-functional:
  - DRY: helpers status viz (`dotClass`, `statusBadge`) dùng chung cho class detail và template page `/syllabus/$syllabusId` (hiện bị nhân bản).
  - Không thêm state/feature mới (không collapse) — churn tối thiểu.

## Architecture

Render sau khi gộp (tab `syllabus`, branch `sy && sy.classId === classId`):

```
[Summary card: name · level/skills · {pct}% · {done}/{total} buổi]   ← inline, thay <SyllabusProgress/>
[Progress bar]
[SectionLabel "Nội dung giáo trình của lớp"  + Thêm module / Gỡ giáo trình]
[Module card (mỗi module MỘT lần):
   header: title · Sửa · {mDone}/{total} buổi
   rows:   [status dot] title + materials + Mục tiêu (objectives) · [status badge + Sửa]
   footer: + Thêm buổi học]
```

Row layout chốt theo reference implementation `$syllabusId.tsx:201-231` (editor template page đã giải quyết đủ dot + title/materials/objectives + badge + nút Sửa + mobile wrap bằng flex wrapper `:218`) — KHÔNG phát minh grid/flow mới.

Data flow không đổi: một query `['kernel']` → `useData()` → `syllabusById(cls.syllabusId)`; tính `all/done/pct` local như `syllabus-progress.tsx:36-38`.

## Related Code Files

- Create: `apps/web/src/components/syllabus/lesson-status.tsx` — export `lessonDotClass` (Record theo `SyllabusLesson["status"]`) và `LessonStatusBadge` (component), gợi ý nội dung lấy từ `syllabus-progress.tsx:7-22` (đã typed chặt hơn theo `$syllabusId.tsx:43-58`).
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — bỏ import + usage `SyllabusProgress` (lines 14, 178); inline summary card + `<Progress>` phía trên SectionLabel; enrich lesson row (lines 227-247) thêm dot + badge; module header count (lines 221-223) đổi thành `{mDone}/{m.lessons.length} buổi`.
- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` — xóa local `dotClass`/`statusBadge` (lines 43-58), import từ `lesson-status.tsx` (thay cơ học, không đổi render).
- Delete: `apps/web/src/components/syllabus/syllabus-progress.tsx` (đã verify chỉ dùng tại `$classId.tsx`).

## Implementation Steps

1. Tạo `apps/web/src/components/syllabus/lesson-status.tsx` với `lessonDotClass` + `LessonStatusBadge` (typed `SyllabusLesson["status"]`).
2. Refactor `$syllabusId.tsx`: bỏ 2 helper local, dùng import shared; chạy `pnpm -C apps/web dev` smoke template page (render không đổi).
3. Sửa `$classId.tsx` tab syllabus:
   a. Xóa dòng 14 (import) và dòng 178 (`<SyllabusProgress … />`).
   b. Inline summary: tính `all = sy.modules.flatMap(m => m.lessons)`, `done`, `pct`; render card (variant="white", flex như `syllabus-progress.tsx:42-61`) + `<Progress value={pct} />`.
   c. Lesson row: copy nguyên cấu trúc row của `$syllabusId.tsx:201-231` — dot span (`lessonDotClass[l.status]`) + title/materials/objectives + flex wrapper (`flex items-center gap-2 max-app:col-start-2 max-app:pt-1`) chứa `LessonStatusBadge` và nút Sửa. Không dùng grid 4 cột mới.
   d. Module header: `{m.lessons.length} buổi` → `{mDone}/{m.lessons.length} buổi` với `mDone` tính per-module.
4. Xóa file `syllabus-progress.tsx`.
5. `grep -rn "SyllabusProgress\|syllabus-progress" apps/ packages/` → phải rỗng.
6. Format/sửa lỗi: `pnpm biome check --write apps/web/src` rồi `pnpm biome check`.

## Success Criteria

- [x] Tab "Giáo trình": mỗi module title và mỗi lesson title xuất hiện đúng MỘT lần (verify bằng mắt trên dev server với lớp đã import template).
- [x] Lesson row có dot + badge đúng status VÀ dòng `Mục tiêu: {l.objectives}` hiển thị; sửa status qua EditLessonModal → badge cập nhật sau mutation.
- [x] Summary + progress bar hiển thị đúng `%` = round(done/total×100), giữ meta `{syllabus.totalLessons} buổi`.
- [x] Template page `/syllabus/$syllabusId` render không đổi so với trước refactor.
- [x] `pnpm exec biome check .` và `pnpm check-types` pass (đúng lệnh CI).
- [x] Grep "SyllabusProgress" trả về 0 kết quả.

## Risk Assessment

- Xóa component phá import ẩn: đã grep trước — chỉ `$classId.tsx`. Signal nếu sai: tsc error `Cannot find module …/syllabus-progress` → tìm refs còn sót, không cần replan design.
- Layout lesson row chật trên mobile (`max-app` breakpoint): copy nguyên cấu trúc row của `$syllabusId.tsx:201-231` (dot → col-start-2 qua flex wrapper) — giữ class `max-app:*` tương ứng.
- **Accepted regression (red-team F4, quyết định theo issue #81):** xóa `SyllabusProgress` thu hồi per-module collapse/expand (`syllabus-progress.tsx:25-34,70-80`) khỏi class detail. Issue #81 đã chốt collapse là ngoài scope ("KHÔNG thêm collapse feature cho editor"); ghi nhận ở đây để reviewer/QA biết đây là regression có chủ đích, không phải bug. Template page `/syllabus/$syllabusId` vẫn giữ collapse.
- **Không có guard tự động cho bug duplicate-render (red-team F3):** không e2e nào mở tab "Giáo trình" (class fixture không có syllabus) nên gates xanh không chứng minh cây không trùng; verify bằng mắt (success criteria) là guard duy nhất. Follow-up đề xuất: e2e import-template → tab "Giáo trình" → `expect(getByText("Unit 1")).toHaveCount(1)`.
- Assumption "badge không va chạm e2e vì tab render độc lập": signal nếu Phase 2 e2e fail count 12/11 → kiểm tra render đồng thời nhiều tab (không có theo code hiện tại) và fix assert theo hướng đếm scoped vào tab Lịch học.
