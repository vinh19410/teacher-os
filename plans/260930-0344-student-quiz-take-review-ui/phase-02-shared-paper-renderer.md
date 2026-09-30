---
phase: 2
title: "Shared paper renderer extraction"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 2: Shared paper renderer extraction

## Goal

Dời các renderer "paper như học viên nhìn thấy" từ `apps/web` về package chung để student
app dùng lại — không sinh bản renderer thứ hai.

## Context Links

- `apps/web/src/components/assignments/cloze-stem.tsx:9-11` — docblock "One
  implementation for BOTH preview surfaces".
- `apps/web/src/components/assignments/student-preview-paper.tsx`,
  `apps/web/src/components/assignment-tests/test-preview-paper.tsx` — consumers.
- `packages/ui/src/components/` — đích đến; `packages/ui/src/styles/globals.css` tokens.

<!-- Updated: Red Team Session 1 — dep graph reality, ClozeStemText interactive respec, PinOverlay contract -->

## Key Insights

- Student app không import được từ `apps/web` (pnpm workspace boundaries) — muốn tái dùng
  thì phải move xuống `@teacher-os/ui`.
- Chỉ move các mảnh *pure render*: `rich-text-body`, `cloze-stem` (+ `lib/cloze`),
  `pin-editor` (PinOverlay), và mảnh render option-bank list nếu tách được sạch từ
  `student-preview-paper`. KHÔNG move `StudentPreviewPaper` nguyên khối (nó còn chứa
  header band/word-count của teacher preview).
- Clean cutover: cập nhật hết imports ở web, không để re-export shim.
- **Dep graph thật khi move** [RT#9]: `pin-editor.tsx` import types từ `@teacher-os/api`
  (QuestionItem/pin), `rich-text-body.tsx` + `apps/web/src/lib/rich-text-sanitize.ts`
  dùng `dompurify`; `lib/cloze.ts` là pure util. → `packages/ui/package.json` phải thêm
  `dompurify` (catalog) + workspace dep `@teacher-os/api`; move luôn
  `rich-text-sanitize.ts` (một sink — nguyên tắc #280).
- **ClozeStemText respec cho interactive** [RT#8]: hiện `blankInput(answer)` tính width
  TỪ ANSWER KEY (`cloze-stem.tsx:31-38`) — take payload không có answer nên (a) crash nếu
  truyền thiếu, (b) width = key length + 4 là key-length oracle nếu giữ answer. Respec:
  prop `answer` OPTIONAL; chế độ interactive nhận `value` + `onChange`, width =
  `max(minWidth, value.length + 2)ch`; preview giữ sizing như cũ qua prop cũ. PinOverlay
  giữ display-only nhưng thêm prop optional `answers`/`onAnswer` để take screen gắn input
  theo pin (contract tối thiểu, không phá preview).

## Requirements

- [ ] `packages/ui` export các component trên qua entry hiện có (pattern
      `@teacher-os/ui/components/...`).
- [ ] Web consumers đổi import; không file nào ở web còn import path cũ.
- [ ] Web tests hiện có (colocated) vẫn xanh — test component theo import mới.

## Files to Create / Modify

- Create: `packages/ui/src/components/assignments/rich-text-body.tsx`,
  `cloze-stem.tsx` (respec), `pin-overlay.tsx` (từ `pin-editor.tsx`, giữ tên export
  PinOverlay + props tương thích + extension optional), option-bank list nếu tách được;
  `packages/ui/src/lib/cloze.ts`, `packages/ui/src/lib/rich-text-sanitize.ts`.
- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx`,
  `apps/web/src/components/assignment-tests/test-preview-paper.tsx`,
  `apps/web/src/components/assignments/pin-editor.tsx` (delete sau khi move),
  `apps/web/src/components/ui/rich-text-body.tsx` (delete sau khi move),
  `apps/web/src/lib/cloze.ts` + `apps/web/src/lib/rich-text-sanitize.ts` (delete sau khi
  move), mọi import `@/lib/cloze` (grep `from "@/lib/cloze"`),
  `apps/web/src/components/assignments/cloze-stem.tsx` (delete), package exports +
  `package.json` deps của `packages/ui`.

## Implementation Steps

1. Grep toàn bộ usages: `ClozeStemText`, `PinOverlay`, `RichTextBody`, `splitStemByMarker`,
   `countBlanks`, sanitize helper — liệt kê callers trước khi move.
2. Move files + deps (`lib/cloze`, sanitize) sang `packages/ui`, xuất theo entry pattern
   hiện có của package (đọc `packages/ui/package.json` exports).
3. Cập nhật imports ở `apps/web` (kể cả tests colocated như
   `test-preview-paper.test.tsx`).
4. Xóa file gốc ở web (không shim).
5. Chạy `pnpm --filter web test`, `pnpm --filter web check-types`, `pnpm check`.

## Todo

- [ ] Inventory usages + callers
- [ ] Move components + libs + deps (dompurify, @teacher-os/api) xuống @teacher-os/ui
- [ ] ClozeStemText respec (answer optional, width theo value) + PinOverlay extension
- [ ] Cập nhật imports web (src + tests), cập nhật tests theo width mới
- [ ] Xóa bản gốc, gates xanh

## Success Criteria

- `pnpm --filter web test` + `check-types` + `pnpm check` xanh; grep không còn
  `apps/web.*components/ui/rich-text-body` hay `assignments/cloze-stem`.

## Risk Assessment

- Render khác biệt sau move (CSS/token scope): components chỉ dùng Tailwind utilities +
  tokens từ globals.css mà cả hai app đều import qua `@teacher-os/ui/globals.css` —
  verify bằng e2e preview có sẵn (`assignment-prompt-create.spec.ts` chip "Xem trước").
- `packages/ui` chưa có vitest config: giữ component tests ở web (import qua package) —
  không dựng test infra mới cho ui package trong plan này.
- ClozeStemText width theo value làm web preview tests đổi kỳ vọng sizing — cập nhật
  assertions trong cùng phase (không để đỏ qua đêm).

## Security Considerations

- Giữ nguyên sanitize sink duy nhất cho rich text (không copy thành 2 bản).

## Next Steps

→ Phase 3 (take screen) consume các component này.
