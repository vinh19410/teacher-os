---
phase: 1
title: "DB Schema, Migration & Shared Contracts"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: DB Schema, Migration & Shared Contracts

## Goal

Mở rộng schema DB (`lesson_material` và `class_assignment`) theo hướng backward-compatible bằng `ALTER TABLE ADD COLUMN`, sinh Drizzle migration, và cập nhật toàn bộ shared Zod contracts trong `@teacher-os/api` cho phân loại tài liệu buổi (`lecture` | `homework`), thông tin trang cắt từ sách gốc, liên kết bài tập theo buổi (`sessionDate`), và response mới cho chi tiết lớp / chi tiết buổi phía học viên.

## Files to Create / Modify

- Modify: `packages/db/src/schema/material.ts` — thêm cột `category`, `sourceTitle`, `sourcePageStart`, `sourcePageEnd` trên `lessonMaterial`.
- Modify: `packages/db/src/schema/class-assignment.ts` — thêm cột `sessionDate` và index `class_assignment_class_session_idx` trên `(classId, sessionDate)`.
- Create: `packages/db/src/migrations/0095_*.sql` + `meta/0095_snapshot.json` + update `meta/_journal.json` (qua `pnpm --filter @teacher-os/db db:generate`).
- Modify: `packages/api/src/material-contracts.ts` — thêm `LESSON_MATERIAL_CATEGORIES`, `LessonMaterialCategory`, `isLessonMaterialCategory`, mở rộng `lessonMaterialAttachSchema`, thêm `lessonMaterialUpdateSchema`, `lessonMaterialLinkCreateSchema`, `lessonMaterialPageRangeSchema`, mở rộng `LessonMaterialView` & `StudentLessonMaterialView`.
- Modify: `packages/api/src/contracts.ts` — mở rộng `classAssignmentCreateSchema`, `KernelClassAssignmentRow`, `studentAssignmentSchema`, `studentClassLessonSchema`, `studentClassDetailSchema`, thêm `studentSessionDetailResponseSchema`. <!-- Red-Team RT-3 -->
- Modify / Create tests: `packages/api/src/material-contracts.test.ts`, `packages/api/src/student-session-contracts.test.ts`, test migration trong `apps/server/src/`. <!-- Red-Team RT-3 -->

## Tests Before (TDD)

1. Viết unit tests trong `packages/api/src/material-contracts.test.ts` kiểm tra:
   - `lessonMaterialAttachSchema` mặc định `category: "lecture"`, nhận `"homework"`, từ chối giá trị lạ; kiểm tra `sourcePageStart`/`sourcePageEnd` (cả hai phải dương, `start <= end`, không nhận nửa chừng chỉ 1 đầu).
   - `lessonMaterialUpdateSchema` chỉ nhận `category: "lecture" | "homework"`.
   - `lessonMaterialLinkCreateSchema` kiểm tra URL an toàn `http/https`, title/description limit, mặc định `category: "lecture"`.
2. Viết unit tests trong `packages/api/src/student-session-contracts.test.ts` kiểm tra:
   - `classAssignmentCreateSchema` nhận `sessionDate: "2026-11-28"` / `null` / vắng mặt, từ chối chuỗi sai định dạng `yyyy-mm-dd`.
   - `studentClassDetailSchema` tương thích ngược (payload cũ không có `syllabus` hay các trường mở rộng vẫn parse thành công — NFR-sc-004) và parse đúng payload mới có `syllabus`, `moduleId`, `lectureCount`, `homeworkCount`, `assignmentCount`.
   - `studentSessionDetailResponseSchema` parse đúng payload chi tiết buổi gồm `lectures`, `homeworkMaterials`, `assignments`, `curriculum`, `prevSessionDate`, `nextSessionDate`.

## Implementation Steps

1. Cập nhật `packages/db/src/schema/material.ts`:
   - Trên `lessonMaterial`, thêm:
     - `category: text("category").notNull().default("lecture")`
     - `sourceTitle: text("source_title")`
     - `sourcePageStart: integer("source_page_start")`
     - `sourcePageEnd: integer("source_page_end")`
   - Thêm SQLite `check` constraints cho `category in ('lecture', 'homework')` và cặp `source_page_start`/`source_page_end` (hoặc cả 2 NULL, hoặc cả 2 nguyên dương và `source_page_start <= source_page_end`). <!-- Red-Team RT-8 -->
   - Giữ nguyên primary key `(classId, date, materialId)` và các FK hiện có.
2. Cập nhật `packages/db/src/schema/class-assignment.ts`:
   - Trên `classAssignment`, thêm `sessionDate: text("session_date")` và `index("class_assignment_class_session_idx").on(table.classId, table.sessionDate)`.
3. Chạy `pnpm --filter @teacher-os/db db:generate` để tạo migration `0095_*.sql` và kiểm tra file SQL sinh ra chỉ chứa `ALTER TABLE ... ADD` + `CREATE INDEX` (lưu ý nếu SQLite `CHECK` trên table đã tồn tại khiến drizzle-kit rebuild bảng thì đặt CHECK ở mức cột inline hoặc chỉ validate ở tầng app/Zod để tránh rebuild bảng D1 ngoài ý muốn — kiểm tra kỹ file SQL sinh ra!). <!-- Red-Team RT-8 -->
4. Cập nhật `packages/api/src/material-contracts.ts`:
   - Export `LESSON_MATERIAL_CATEGORIES = ["lecture", "homework"] as const`, `LessonMaterialCategory`, `isLessonMaterialCategory`, `MATERIAL_SOURCE_TITLE_MAX = 200`, `MATERIAL_PAGE_MAX = 10000`, và kiểm tra chặn ký tự điều khiển/bidi (`/[\p{Cc}\p{Cf}]/u`) trên `sourceTitle` và `title` override. <!-- Red-Team RT-8 -->
   - Cập nhật `lessonMaterialAttachSchema`, thêm `lessonMaterialUpdateSchema` và `lessonMaterialLinkCreateSchema`.
   - **Tách `SyllabusBankMaterialRef` khỏi `StudentLessonMaterialView`**: cho `export type SyllabusBankMaterialRef = StudentClassMaterialView;` vì `syllabus_lesson_material` không có cột `category`. Giữ `category?: LessonMaterialCategory`, `sourceTitle?: string | null`, `sourcePageStart?: number | null`, `sourcePageEnd?: number | null` là optional trên `LessonMaterialView` và `StudentLessonMaterialView` để tương thích ngược toàn bộ fixture/rolling deploy (server luôn trả đủ các trường này cho tài liệu buổi). <!-- Red-Team RT-3 -->
   - Thêm mã lỗi `"INVALID_PAGE_RANGE"` vào `MATERIAL_ERROR_CODES`.
5. Cập nhật `packages/api/src/contracts.ts`:
   - Thêm `sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()` vào `classAssignmentCreateSchema` (server dùng `parseStartDateStrict` chặn ngày lịch giả) và `sessionDate?: string | null` vào `KernelClassAssignmentRow` / `studentAssignmentSchema`. <!-- Red-Team RT-2, RT-3 -->
   - Mở rộng `studentClassLessonSchema` với các trường optional: `moduleId`, `moduleTitle`, `syllabusTitle`, `objectives`, `lessonKind`, `lectureCount`, `homeworkCount`, `assignmentCount`.
   - Mở rộng `studentClassDetailSchema` với `syllabus` optional/nullable.
   - Export `studentSessionDetailResponseSchema` và type `StudentSessionDetailResponse` (whitelist trường student-safe cho `curriculum`: chỉ `syllabusName`, `moduleId`, `moduleTitle`, `title`, `objectives`, `kind` — tuyệt đối KHÔNG có `materialsNote` hay `syllabusLesson.status`). <!-- Red-Team RT-9 -->

## Tests After

1. Chạy `pnpm --filter @teacher-os/api test` và `pnpm --filter @teacher-os/db test` — tất cả pass.
2. Chạy migration smoke test (chạy drizzle migrate trên SQLite sạch và kiểm tra default `category = 'lecture'` cho dòng cũ).

## Regression Gate

```bash
pnpm --filter @teacher-os/db check-types && pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test
```

## Todo

- [ ] Viết test trước cho contracts mới (`material-contracts` & `student-session-contracts`).
- [ ] Cập nhật schema `material.ts` và `class-assignment.ts`.
- [ ] Sinh và kiểm tra migration `0095_*.sql`.
- [ ] Triển khai contracts trong `@teacher-os/api`.
- [ ] Chạy regression gate Phase 1 xanh.
