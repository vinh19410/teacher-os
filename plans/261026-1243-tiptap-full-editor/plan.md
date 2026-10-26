---
title: "Tiptap full-option editor"
description: "Giữ Tiptap, nâng RichTextEditor lên full-option: mở đủ thanh công cụ theo đúng render contract hiện có (heading, strike, blockquote, code, code block, hr, undo/redo) và style render tương ứng."
status: completed
priority: P2
effort: 0.5d
issue: 436
branch: ai-handle-issue-436
tags: [frontend, rich-text, ui]
blockedBy: []
blocks: []
supersedes: "plans/261026-0524-ckeditor-rich-text-migration/plan.md"
created: 2026-10-26
---

# Tiptap full-option editor

## Overview

Issue #436 ban đầu đề xuất chuyển rich text sang CKEditor 5. Sau license gate (Phase 1 của plan CKEditor): CKEditor 5 từ v44 bắt buộc `licenseKey`, repo teacher-os là **private, không LICENSE**, và bundle JS phân phối tới browser người dùng sẽ kích hoạt nghĩa vụ GPL-2+ nếu dùng key `GPL`; free plan CDN chỉ đủ ~1.000 lượt tải editor/tháng. Người dùng đã chốt (2026-10-26): **giữ Tiptap, nâng lên full-option editor**.

Hiện trạng: `RichTextEditor` (Tiptap v3 StarterKit) chỉ exposing 6 nút toolbar (đậm, nghiêng, gạch chân, 2 danh sách, liên kết). Trong khi đó StarterKit đã bundle sẵn blockquote, strike, code, codeBlock, horizontalRule, undo/redo (`@tiptap/extensions`) — và allowlist `sanitizeRichText` + `RichTextBody` **đã cho phép** các tag tương ứng (`s`, `blockquote`, `code`, `pre`, `hr`, `h2`–`h4`). Nghĩa là: nội dung dán vào (paste) đã sinh được markup mà UI không có nút để soạn.

Scope: mở đủ toolbar theo **đúng render contract hiện có**, sửa bug stale-state toolbar (`useEditor` v3 không re-render theo transaction — `shouldRerenderOnTransaction` mặc định undefined, `@tiptap/react@3.31.3/dist/index.js:457`), style đồng bộ authored-content (editor) + render (`RichTextBody`) cho các tag expose. Không đổi: props công khai, mô hình bảo mật (sanitize khi render), model dữ liệu (HTML thuần), Tiptap giữ MIT.

## Scope

- Trong phạm vi: thêm nút toolbar cho heading H2/H3, gạch ngang chữ, blockquote, code inline, code block, đường kẻ ngang, hoàn tác/làm lại; style render `blockquote`/`pre`/`code`/`hr` trong `RichTextBody`; unit test + e2e cho tính năng mới; docs.
- Ngoài phạm vi (đòi mở rộng allowlist + model bảo mật — cần plan riêng): bảng (table), ảnh (image/upload), màu chữ/highlight, căn giữa, task list; Tiptap Pro (collaboration, comments); các `<Textarea>` khác chưa chuyển rich text; thay prompt() liên kết bằng popover riêng.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Toolbar full-option + style render](./phase-01-toolbar-render.md) | Completed |
| 2 | [E2E, docs và gates](./phase-02-e2e-docs-gates.md) | Completed |

## Quyết định đã chốt

1. **Engine**: giữ Tiptap v3 (MIT) — user chốt 2026-10-26 sau license gate CKEditor (GPL-2+ ràng buộc bundle frontend; free CDN không đủ production). Plan CKEditor `261026-0524` chuyển `cancelled`.
2. **Phạm vi**: "full-option" = đủ mọi tag render contract hiện có của `sanitizeRichText`; không mở allowlist.
3. **Toolbar**: giữ toolbar Tailwind tự vẽ hiện tại (pattern `TOOLBAR_ACTIONS`), thêm nút mới cùng pattern — không đổi sang UI thư viện.

## Dependencies

Không phụ thuộc plan khác. Nền: #280 (Tiptap v3) đã hoàn tất.

## Success Criteria

- [x] Toolbar có đủ 15 nút: 6 nút cũ + H2, H3, gạch ngang chữ, trích dẫn, code inline, khối mã, kẻ ngang, hoàn tác, làm lại; nhãn tiếng Việt, `aria-pressed`/disabled đúng state **live khi soạn** (không stale).
- [x] Mọi markup sinh từ toolbar đi qua `sanitizeRichText` không bị mất tag (cho phép: p, br, strong, em, u, s, ul, ol, li, a, code, pre, hr, blockquote, h2, h3, h4); guard `javascript:` href vẫn hiệu lực (có test khóa).
- [x] H2/H3/blockquote/pre+code/hr phân biệt được thị giác ở CẢ editor (soạn) lẫn `RichTextBody` (học viên), light + dark. `h4` render-only có chủ đích (nội dung cũ; levels soạn khóa [2,3] từ #280).
- [x] Không đổi props `RichTextEditor`; 12 callsite production (prompt-composer 5, part-content-fields admin 3, admin test-header-form 1, web test-header-form 1, answer-key-grid 1, question-key-editor 1) không phải sửa.
- [x] Không thêm dependency mới (StarterKit đã bundle đủ).
- [x] `pnpm check`, `check-types`, test, full e2e xanh; verify 3 viewport (web + admin) + focus bàn phím; screenshot + `design:compare` trong PR.

## Câu hỏi mở

1. (Follow-up, không chặn) Có mở rộng allowlist cho bảng/ảnh/task list không — cần plan riêng vì đổi mô hình bảo mật.
2. (Follow-up) Thay `window.prompt` cho liên kết bằng popover chọn link trong app.
3. (ĐÃ XỬ LÝ trong plan này) Admin editable area thiếu base `.ProseMirror` styles — đã gộp khối vào `packages/ui/src/styles/globals.css` cho cả web + admin.

## Red Team Review

2 reviewer song song (Security Adversary + Assumption Destroyer), 2026-10-26. Tìm thấy có evidence `file:line` mới được adjudicate.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| F1 | Critical | `useEditor` v3 không re-render theo transaction (`shouldRerenderOnTransaction` undefined) → `aria-pressed`/`isActive`/`can().undo()` stale vĩnh viễn; bug có sẵn cho 6 nút cũ | **Accept** — `useEditorState` selector phẳng trong component con `RichTextToolbar` (tinh chỉnh kongming sau plan gate: tránh re-render cả component mỗi keystroke) + test state live (phase-01) |
| F2 | High | `[&_pre_&]` compile thành `.class pre .class`, không match `<pre><code>` | **Accept** — đổi `[&_pre_code]` (đã sửa trong phase-01) |
| F3 | High | H2/H3 render phẳng ở `RichTextBody` (preflight `font-size/weight: inherit`) | **Accept** — thêm `[&_h2]`/`[&_h3]` vào phase-01 |
| H-1 | High | Chỉ style render học viên, editor soạn không có style → WYSIWYG giả | **Accept** — authored-content style đặt trong component dùng chung (phase-01) |
| H-2 | High | Không test khóa guard `javascript:` URI của DOMPurify/tiptap-link | **Accept** — thêm unit test assert href bị strip (phase-01 step 5) |
| F4/M-3 | Medium | Sai số callsite (10 → 12); admin không được verify | **Accept** — sửa số, thêm admin vào viewport verify |
| F5 | Medium | Port e2e ghi sai (mặc định 8000/8001/8003/8104, 810x là override) | **Accept** — sửa wording phase-02 |
| F6 | Medium | E2E cũ neo XPath preceding-sibling; toolbar wrap 2 hàng 375px chưa có tiêu chí | **Accept** — khóa bất biến DOM + chấp nhận wrap 2 hàng (phase-01 requirements) |
| M-4 | Medium | Sai số nút (14 → 15: undo + redo là 2 nút) | **Accept** — sửa số liệu |
| M-5 | Medium | `h4` trong contract nhưng không có đường soạn — tự mâu thuẫn "full-option" | **Accept (loại trừ có chủ đích)** — h4 render-only cho nội dung cũ, levels [2,3] là lựa chọn #280 |

### Whole-Plan Consistency Sweep

- Decision delta: stale-state fix (F1) thêm vào Scope + phase-01; style mở rộng cả editor (H-1, F3); số liệu 15 nút / 12 callsite đồng bộ cả plan.md lẫn phase-01; h4 loại trừ có chủ đích ghi ở Scope + Success Criteria.
- Quét lại các claim cũ: "10 chỗ gọi" đã thay bằng 12 + bảng phân bổ; "14 nút" thay bằng 15; port 810x ghi rõ là override; `[&_pre_&]` đã thay `[&_pre_code]` ở mọi nơi.
- Không còn mâu thuẫn chưa giải quyết.

<!-- slug: tiptap-full-editor -->
