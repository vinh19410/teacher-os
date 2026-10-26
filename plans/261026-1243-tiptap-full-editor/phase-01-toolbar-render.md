---
title: "Phase 1: Toolbar full-option + style render"
status: completed
---

# Phase 1: Toolbar full-option + style render

## Overview

Mở `TOOLBAR_ACTIONS` của `RichTextEditor` từ 6 nút lên 15 nút (6 cũ + 9 mới: H2, H3, gạch ngang chữ, trích dẫn, code inline, khối mã, kẻ ngang, hoàn tác, làm lại) theo đúng render contract của `sanitizeRichText`, sửa bug stale-state toolbar, và style đồng bộ cho cả editor (soạn) lẫn `RichTextBody` (đọc). Tất cả extension đã nằm trong StarterKit v3.31 — không thêm dependency.

## Requirements

- [x] Sửa stale-state (red-team Critical) bằng `useEditorState` trong component con `RichTextToolbar`: selector trả object phẳng boolean (`isBold`, `isH2`, `canUndo`…), chỉ re-render khi giá trị đổi. Không dùng `shouldRerenderOnTransaction: true` (5 editor trên prompt-composer sẽ re-render cả component mỗi keystroke ×2 do cha controlled). `div[role=toolbar]` vẫn là con trực tiếp, giữ bất biến sibling của e2e cũ.
- [x] Test-first cho F1 (phải fail trên code hiện tại): editor rỗng → bấm "In đậm" (stored mark, không có `onUpdate`) → kỳ vọng `aria-pressed="true"`. Test "undo disabled đổi sau khi gõ" không đủ bắt bug vì harness controlled re-render qua cha.
- [x] Thêm 9 nút toolbar (nhãn tiếng Việt, icon lucide-react): Đề mục cấp 2, Đề mục cấp 3 (`heading` levels đã config [2,3]; nhãn "Đề mục" thay "Tiêu đề" để không đụng getByLabel("Tiêu đề") substring của ~40 chỗ trong e2e), Gạch ngang chữ (`strike` → `s`), Trích dẫn (`blockquote`), Đoạn mã (`code` inline), Khối mã (`codeBlock` → `pre`), Đường kẻ ngang (`horizontalRule` → `hr`), Hoàn tác, Làm lại (`@tiptap/extensions` UndoRedo, bundle trong StarterKit).
- [x] `isActive` trong `ToolbarAction` thành optional: chỉ 6 nút toggle có `aria-pressed`; Hoàn tác/Làm lại/Kẻ ngang KHÔNG render `aria-pressed` (tránh screen-reader hiểu sai toggle). Undo/redo dùng `disabled` thật + `editor.chain().focus().undo().run()` (giữ focus).
- [x] Giữ nguyên chữ ký props `RichTextEditor`; re-export `apps/web/src/components/ui/rich-text-editor.tsx` không đổi. Tổng 12 callsite production phải chạy không sửa (prompt-composer 5, part-content-fields admin 3, admin test-header-form 1, web test-header-form 1, answer-key-grid 1, question-key-editor 1).
- [x] Style authored-content đặt trong component (dùng chung cho web + admin): hằng `RICH_TEXT_CONTENT_CLASSES` dùng chung cho vùng editable lẫn `RichTextBody` — blockquote (`border-l-[3px] border-l-border pl-3 text-muted-foreground`), pre (`bg-muted p-3 rounded-[var(--radius)] font-mono text-sm` + **`whitespace-pre-wrap break-words`, KHÔNG `overflow-x-auto`** — tránh đẩy rộng cột cha thiếu `min-w-0` và đồng bộ wrap khi soạn/đọc), code inline (`rounded-sm bg-muted px-1 py-0.5 font-mono` + `[&_pre_code]:bg-transparent [&_pre_code]:p-0`), hr (`border-border my-2`), h2 (`text-[1.25em] font-semibold`), h3 (`text-[1.1em] font-semibold`) — **đơn vị em tương đối** để không vỡ callsite `text-xs`/`text-sm`; thêm `[&>*:first-child]:mt-0` nếu dùng margin-top.
- [x] `RichTextBody`: áp cùng `RICH_TEXT_CONTENT_CLASSES` (bổ sung h2/h3 hiện render phẳng do preflight `font-size/weight: inherit`).
- [x] Admin base: khối `.ProseMirror` (min-height/outline/padding/placeholder) — đã gộp vào `packages/ui/src/styles/globals.css` (một nguồn, web lẫn admin đều import) thay vì chép 2 bản trong app css.
- [x] Bất biến DOM cho e2e cũ: `div[role=toolbar]` giữ là preceding-sibling trực tiếp của wrapper `EditorContent`; không bọc thêm container, không đổi thứ tự. Toolbar 15 nút wrap 2 hàng trên 375px là bố cục chấp nhận được (`flex-wrap` sẵn có).
- [x] `h4` render-only có chủ đích: nằm trong allowlist cho nội dung cũ, không có nút soạn (heading levels khóa [2,3] từ #280).
- [x] Nội dung `hr` đơn (không text) vẫn được `isEmptyRichText` coi là rỗng (không đổi helper — verify bằng test).

## Related Files

- Sửa: `packages/ui/src/components/web-kit/rich-text-editor.tsx`, `packages/ui/src/components/assignments/rich-text-body.tsx`.
- Test: `apps/web/src/components/ui/rich-text-editor.test.tsx`, `apps/web/src/components/ui/rich-text-body.test.tsx`.
- Chỉ đọc: `packages/ui/src/lib/rich-text-sanitize.ts` (allowlist không đổi), 12 callsite nêu trên.

## Implementation Steps

1. ĐÃ CHỌN `useEditorState` (theo tư vấn kongming sau plan gate), KHÔNG dùng `shouldRerenderOnTransaction: true`. Component con `RichTextToolbar` subscribe transaction qua selector phẳng; `immediatelyRender: false` giữ cho SSR.
2. Định nghĩa `TOOLBAR_ACTIONS` bổ sung theo pattern hiện có (`isActive`, `run` qua `editor.chain().focus()`).
3. Heading dùng `editor.isActive("heading", { level: 2 })` + `toggleHeading({ level: 2 })`; undo/redo dùng `editor.can().undo()` và `editor.commands.undo()`.
4. Style render: `[&_blockquote]:border-l-[3px] [&_blockquote]:border-l-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground`, `[&_pre]:rounded-[var(--radius)] [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:whitespace-pre-wrap [&_pre]:break-words`, `[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono` + override code lồng trong pre bằng `[&_pre_code]:bg-transparent [&_pre_code]:p-0`, `[&_hr]:border-border [&_hr]:my-2`, `[&_h2]`/`[&_h3]` theo scale type của DESIGN.md. Đặt thành hằng `RICH_TEXT_CONTENT_CLASSES` dùng chung cho editable + `RichTextBody`.
5. Unit test: nút mới render đủ với nhãn + `aria-pressed`; **assert state live**: `aria-pressed` đổi sau khi toggleBold, `aria-disabled` của Hoàn tác đổi sau khi gõ; toggle qua Commands API sinh đúng tag (`s`, `blockquote`, `pre><code`, `hr`, `h2`/`h3`); output qua `sanitizeRichText` không mất tag; `isEmptyRichText("<hr>") === true`; `sanitizeRichText('<a href="javascript:alert(1)">')` không còn href (khóa guard URI).

## Todo

- [x] Sửa stale-state bằng `useEditorState` + test state live
- [x] 9 nút toolbar mới theo pattern cũ
- [x] Style authored-content dùng chung + RichTextBody (gồm h2/h3)
- [x] Unit test toolbar + Commands API + sanitize parity + guard URI
- [x] `pnpm check` + `check-types` + test package xanh

## Success Criteria

- Toolbar 15 nút, mọi nút sinh markup nằm trong allowlist; `aria-pressed`/disabled đúng theo state thực khi soạn.
- H2/H3/blockquote/code/hr phân biệt được thị giác ở CẢ editor lẫn render học viên, light + dark.
- 12 callsite không đổi code; focus bàn phím qua toolbar vẫn hoạt động (nút là `button` thật).
- `pnpm check`, `pnpm check-types`, test `apps/web` + `packages/ui` xanh.

## Risk Assessment

- Đã chọn `useEditorState` thay cho `shouldRerenderOnTransaction: true` để tránh re-render cả component mỗi keystroke (5 editor trên prompt-composer).
- Toolbar 15 nút trên 375px: wrap 2 hàng là chấp nhận; verify không đè vỡ layout editor nhỏ (answer-key-grid `min-h-16`).
- `isActive("heading", {level})` phải truyền đúng object, nếu không nút H2 sáng cả khi con trỏ ở H3.
- Undo sau khi external `value` sync có thể không hoàn tác được thay đổi ngoài — hành vi chấp nhận được, giống Tiptap hiện tại.

## Rollback

Revert 2 file component + test; không đụng data/dependency nên rollback thuần UI.
