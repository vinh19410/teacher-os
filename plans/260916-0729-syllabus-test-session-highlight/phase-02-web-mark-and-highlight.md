---
phase: 2
title: "Web UI — đánh dấu loại buổi + highlight syllabus detail"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Web UI — đánh dấu loại buổi + highlight syllabus detail

## Goal

Ở màn hình syllabus: thêm/kẹn loại buổi qua modal (select "Loại buổi học"), và
buổi thi hiển thị nổi bật (nền dòng amber + badge cạnh title). Màn hình Chi tiết
lớp không đổi.

## Context Links

- Đặc tả nhãn/highlight: [plan.md](./plan.md#đặc-tả-data-model--nhãn-ui)
- `apps/web/src/lib/mock-data.ts:118-131` (SyllabusLesson type);
  `apps/web/src/lib/repos/syllabus.ts` (mapSyllabi);
  `apps/web/src/components/modals/add-lesson-modal.tsx` +
  `edit-lesson-modal.tsx` (pattern `showStatus`);
  `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:279-317` (lesson row);
  `apps/web/src/components/syllabus/lesson-status.tsx` (fallback pattern);
  `apps/web/src/components/ui/badge.tsx` (variant `warn`);
  `apps/web/src/lib/data-actions.ts:133-156` (payload union add/edit-lesson —
  regex-pin bởi `kernel-runtime.contract.test.ts`, red-team #1);
  `apps/web/src/lib/data-store-reducer.ts:242-285` (reducer mirror add/edit —
  literal SyllabusLesson thiếu kind sẽ gãy compile);
  `apps/web/test/fixtures/mock-data.ts:192-198` (seed lesson literal);
  `apps/web/src/lib/data-store-reducer.test.ts` (test reducer).

## Requirements

- [x] `SyllabusLessonKind = "lesson" | "midterm" | "final"` + field `kind` trên
      `SyllabusLesson` (mock-data.ts).
- [x] `mapSyllabi` map kind với normalize: giá trị lạ → `"lesson"` (mirror
      fallback `lessonDotClassFor` — snapshot cũ/khác version không crash UI).
      Normalize là belt-and-braces: sau phase 1 snapshot luôn có kind; test
      "không kind" viết bằng literal cast + comment version-skew (kind là
      required trên `KernelSyllabusLessonRow` — red-team #5).
- [x] Component mới `apps/web/src/components/syllabus/lesson-kind.tsx`:
      `lessonKindLabel(kind)` → "Thi giữa kỳ"/"Thi cuối kỳ",
      `isTestSessionKind(kind)` (duy nhất nguồn sự thật điều kiện test — dùng
      chung badge + row tint, red-team #2) và
      `<LessonKindBadge kind>` → `null` khi không phải buổi thi (fallback:
      lạ → null).
- [x] `data-actions.ts`: payload union `add-lesson`/`edit-lesson` thêm
      `kind?: SyllabusLessonKind` (red-team #1).
- [x] `data-store-reducer.ts`: add-lesson literal thêm
      `kind: action.payload.kind ?? "lesson"`; edit-lesson mirror
      `kind: action.payload.kind ?? l.kind` (pattern `status` dòng 285 —
      red-team #1).
- [x] Add/EditLessonModal: prop mới `showKind?: boolean` (mặc định false — lớp
      học không truyền, không đổi hành vi). Khi bật: select "Loại buổi học"
      (Buổi học/Thi giữa kỳ/Thi cuối kỳ), payload gửi `kind` chỉ khi showKind
      — spread có điều kiện `...(showKind ? { kind } : {})` mirror đúng
      `...(showStatus ? { status } : {})` của `add-lesson-modal.tsx:53`, KHÔNG
      dùng `kind: showKind ? kind : "lesson"` (red-team #6).
- [x] Guard payload (red-team #6): unit test khẳng định payload edit/add khi
      `showKind=false` **không chứa key `kind`** (server preserve).
- [x] `$syllabusId.tsx`: truyền `showKind` cho 2 modal; lesson row khi
      `isTestSessionKind(kind)` (kiểm tra dương — red-team #2) thêm
      `bg-warn-soft/50` vào className của row và `<LessonKindBadge>` cạnh
      title (cùng dòng `font-medium text-sm`).

## Implementation Steps

1. mock-data.ts: type + field (giữ `status` như cũ); cập nhật seed literal
   `apps/web/test/fixtures/mock-data.ts` (thêm `kind: "lesson"` — 12 lesson).
2. repos/syllabus.ts: map `kind` (normalize lạ → lesson); cập nhật
   `apps/web/src/lib/repos/syllabus.test.ts` — case snapshot có kind, không
   kind (cast + comment version-skew), kind lạ.
3. Tạo `lesson-kind.tsx` theo pattern `lesson-status.tsx` (Badge warn dot,
   `isTestSessionKind` export dùng chung).
4. `data-actions.ts` payload union + `data-store-reducer.ts` mirror
   (add literal `?? "lesson"`, edit `?? l.kind`); cập nhật
   `data-store-reducer.test.ts`.
5. 2 modal: state `kind` ("lesson" mặc định; edit load từ lesson khi showKind),
   UI select đặt dưới trường Tài liệu, payload theo showKind (spread có điều
   kiện) + unit guard "không key kind khi showKind=false".
6. `$syllabusId.tsx`: row className (điều kiện `isTestSessionKind`) + badge +
   truyền showKind.
7. Grep contract test ghim markup (`kernel-runtime.contract.test.ts` ghim
   source modal bằng regex theo plan #152; cũng regex-pin `data-actions.ts`
   ở :263-268) — cập nhật nếu ghim payload modal.
8. Kiểm tra visual: `pnpm dev:web` → mở 1 syllabus → sửa 1 buổi thành "Thi
   giữa kỳ" → badge + nền amber hiện; hover row vẫn bg-surface-warm; màn
   hình lớp KHÔNG hiện select Loại (regression theo Requirement).
9. `pnpm --filter web test` + `pnpm check-types`.

## Verification

- E2E che phủ ở phase 3; bước này pass unit + check-types + visual step 7.

## Risk Assessment

- Quên normalize kind lạ trong mapSyllabi → runtime crash kiểu
  "class undefined" (bài học `lessonDotClassFor`) — test case bắt buộc.
- Tint `bg-warn-soft/50` quá nhạt/đậm trên nền trắng Card — chỉnh 1 lần trong
  PR nếu visual fail, không tự ý đổi token `--warn-soft` (dùng chung).

## Security Considerations

- Không có surface mới nhận input ngoài enum select — payload vẫn qua zod
  contract của phase 1.
