---
title: "Phase 1: Prep refactor (extract + extend helper)"
status: todo
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 1: Prep refactor (extract + extend helper)

## Overview

Refactor thuần, không đổi hành vi UI. Extract khu curriculum edit hiện tại thành component `CurriculumManagementSection` (chuẩn bị cho P4 nhúng vào tab mới), và mở rộng `sessionTopic()` để trả thêm module context (chuẩn bị cho P2 render Module badge). Hai bước độc lập nhưng gom vào 1 phase vì cả hai đều là chuẩn bị không rủi ro, không cần feature flag.

## Requirements

- [ ] Component mới `CurriculumManagementSection` chứa toàn bộ UI hiện tại của tab Giáo trình (`$classId.tsx:198-352`).
- [ ] Tab Giáo trình cũ dùng lại component này → render pixel-identical.
- [ ] Helper mới (hoặc mở rộng `sessionTopic`) trả về `{ title: string, moduleTitle: string | null, lessonId: string | null }`.
- [ ] Callers hiện tại của `sessionTopic()` (chỉ có `ClassScheduleTable`) migrate sang shape mới, hiển thị vẫn chỉ dùng `title`.
- [ ] Unit test cho helper: (a) session có syllabus lesson, (b) session không có syllabus (index > lessons length), (c) edited topic override, (d) syllabus null.

## Architecture

**Component extraction**
- File mới: `apps/web/src/components/class-detail/curriculum-management-section.tsx`.
- Props: `{ cls: ClassRecord, syllabus: Syllabus | null }` (đọc `useData()` bên trong nếu cần, tránh prop drill).
- Xuất default component; giữ nguyên các modal hiện có (`AddModuleModal`, `EditModuleModal`, `AddLessonModal`, `EditLessonModal`, `ImportSyllabusModal`).
- Nội bộ giữ nguyên logic add/edit/remove; không đụng kernel actions.

**Helper mở rộng**
- Trong `apps/web/src/lib/class-sessions.ts`, thêm helper mới `sessionLessonInfo(session, syllabus)`:
  ```ts
  export type SessionLessonInfo = {
    title: string | null;
    moduleTitle: string | null;
    lessonId: string | null;
  };
  export function sessionLessonInfo(
    session: ClassSession,
    syllabus: Syllabus | null,
  ): SessionLessonInfo;
  ```
- Logic: giữ ưu tiên edited topic (từ `row.topic`), nếu không thì tìm syllabus lesson theo `session.index - 1` (flatten modules → lessons), trả về title lesson + tên module cha + lesson id.
- Không đổi chữ ký `sessionTopic()` cũ — vẫn giữ để tương thích với tests hiện có; helper mới bổ sung.

## Related Code Files

- Create: `apps/web/src/components/class-detail/curriculum-management-section.tsx`
- Create: `apps/web/src/lib/class-sessions.test.ts` bổ sung test cho `sessionLessonInfo` (nếu file tests đã tồn tại thì extend)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — thay 155 lines curriculum UI bằng `<CurriculumManagementSection cls={cls} syllabus={syllabus} />`
- Modify: `apps/web/src/lib/class-sessions.ts` — thêm `SessionLessonInfo` type + `sessionLessonInfo()` helper

## Implementation Steps

1. Đọc lại `$classId.tsx:198-352` liệt kê tất cả state, effects, handlers thuộc về khu curriculum → xác định biên component.
2. Tạo `curriculum-management-section.tsx` với đúng cùng UI + handlers. Import modals từ path hiện tại.
3. Thay khu inline trong `$classId.tsx` bằng `<CurriculumManagementSection />`. Verify render bằng dev server (mở Class Detail → tab Giáo trình).
4. Trong `class-sessions.ts`, thêm `SessionLessonInfo` type + `sessionLessonInfo()`. Tái sử dụng logic flatten hiện có nếu có; nếu không, viết nội bộ.
5. Trong `ClassScheduleTable` (`$classId.tsx:479-574`), migrate `sessionTopic()` sang `sessionLessonInfo()` — chỉ render `info.title`, ignore `moduleTitle`/`lessonId` ở phase này.
6. Chạy `pnpm test class-sessions` + biome check.

## Todo

- [ ] Tạo `curriculum-management-section.tsx` extract từ `$classId.tsx:198-352`
- [ ] Thay inline curriculum UI trong `$classId.tsx` bằng component mới
- [ ] Manual verify: tab Giáo trình render + hoạt động đúng như cũ (add module, edit lesson, import template, remove)
- [ ] Thêm `SessionLessonInfo` type + `sessionLessonInfo()` trong `class-sessions.ts`
- [ ] Migrate `ClassScheduleTable` sang `sessionLessonInfo()` (chỉ dùng `.title`)
- [ ] Bổ sung unit test cho 4 edge cases (có/không syllabus, edited topic, index vượt lessons)
- [ ] `pnpm test` + `pnpm biome check` xanh

## Success Criteria

- [ ] Tab Giáo trình cũ render identical (visual diff = 0) và mọi flow (add/edit/import/remove) hoạt động như trước.
- [ ] `sessionLessonInfo()` có test coverage cho 4 edge cases.
- [ ] `$classId.tsx` giảm ≥ 100 lines (155 dòng curriculum → thay bằng ~5 dòng props).
- [ ] Test suite pass, biome không có warning mới.
- [ ] Không có regression ở tab Lịch học (Chủ đề vẫn hiển thị đúng).

## Risk Assessment

**Risk 1**: Extract sai boundary — component mới cần state hoặc handler chưa export từ route.
- Signal: TypeScript error hoặc modal không mở.
- Response: Pass state qua props hoặc lift lên context — không dùng `useData()` từ 2 nơi khác nhau nếu state phải sync.

**Risk 2**: `sessionLessonInfo()` flatten sai index khi syllabus có module rỗng (0 lessons).
- Signal: Test edge case "module rỗng giữa" fail.
- Response: Test này phải viết trước; nếu fail, dùng `flatMap(m => m.lessons)` với filter loại module rỗng.

**Risk 3**: Migrate `ClassScheduleTable` khiến test snapshot cũ vỡ.
- Signal: Snapshot mismatch trong CI.
- Response: Update snapshot nếu chỉ đổi shape internal; giữ visual output identical.
