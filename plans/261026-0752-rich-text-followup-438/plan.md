---
title: "Rich text follow-up #438: a11y toolbar, popover link, cascade layer"
description: "Follow-up #437: focus ring toolbar, roving tabindex (Base UI Toolbar), popover chọn link thay window.prompt, chốt H4, bọc .ProseMirror vào @layer components, verify mặt học viên + 2 test-header-form bằng hình ảnh."
status: in-progress
priority: P2
effort: 1d
issue: 438
branch: ai-handle-issue-438
tags: [frontend, rich-text, a11y, ui]
blockedBy: []
blocks: []
supersedes: ""
created: 2026-10-26
---

# Rich text follow-up #438

## Overview

Follow-up của PR #437 (Tiptap full-option editor, đã merge develop `6fb5ca4`): xử lý các mục kongming post-PR gate + advisor tổng hợp. 7 mục trong scope; mục 8 (mở rộng allowlist table/text-align/highlight/task-list) issue ghi rõ **cần plan riêng** → loại trừ khỏi PR này, ghi `Relates to #438` trong PR.

Hiện trạng đã investigate (evidence `file:line`):

- Nút toolbar (`rich-text-editor.tsx:201-231` render map, không có class `focus-visible`) chỉ có `hover:bg-accent`; `TOOLBAR_BUTTONS` 15 entry ở `:68-158`. Global `:focus-visible { outline: none; box-shadow: var(--focus-ring) }` tồn tại trong `@layer base` (`globals.css:233-237`) nên ring có thể đang hiện — nhưng wrapper editor có `focus-within:ring-[3px]` (cuối file) sáng cùng lúc, nuốt mất ring 28px của nút; kongming đánh giá độ tin trung bình, cần verify thực nghiệm khi implement.
- Link dùng `window.prompt` (`promptLinkHref`, `rich-text-editor.tsx:31-34`); click nút khi đang active link = gỡ link (giữ nguyên hành vi này).
- Toolbar 15 nút, tất cả đều Tab-stop (map render trong `RichTextToolbar`) — 15 nút × 5 editor ≈ 75 Tab.
- `h4` render-only: allowlist cho phép (`rich-text-sanitize.ts:27`) nhưng StarterKit heading levels [2,3] (`rich-text-editor.tsx:297`).
- `.ProseMirror { min-height: 5rem; ... }` unlayered (`globals.css:279-285`) thắng TẤT CẢ utility `[&_.ProseMirror]:min-h-*` mà 11 callsite truyền qua `contentClassName` (unlayered > `@layer utilities`) → hiện tại mọi editor đều đang 5rem, min-h của callers vô hiệu.

## Scope

- Trong phạm vi: (1) focus-visible tường minh trên nút toolbar + ring wrapper chỉ bật khi focus nằm trong `.ProseMirror`; (2) toolbar chuyển sang Base UI `Toolbar` (roving tabindex, ←/→/Home/End); (3) popover chọn link thay `window.prompt`, giữ hành vi gỡ-link-khi-active; (4) thêm nút H4 (levels [2,3,4]) + style `[&_h4]` trong `RICH_TEXT_CONTENT_CLASSES`; (5) bọc khối `.ProseMirror` vào `@layer components` (chiều cao editor thay đổi thật ở 11 callsite — có chủ đích, liệt kê từng mức trong PR); (6) verify hình ảnh: quiz-paper + quiz-reading-layout @375+1440 light+dark với passage có h2/blockquote/pre, 2 surface test-header-form (web + admin), prompt-composer, answer-key-grid, part-content-fields; (7) e2e + docs + gates REVIEW.md.
- Ngoài phạm vi: mục 8 issue #438 (table, text-align, highlight, task-list — mở allowlist, cần plan riêng); prop `compact` (kongming: cascade fix tự làm answer-key-grid gọn thật); CKEditor (đã hủy #437); primitive `popover.tsx` dùng chung (scope creep).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Toolbar a11y + H4 + popover link (TDD)](./phase-01-toolbar-a11y-link-popover.md) | Pending |
| 2 | [Cascade layer, verify hình ảnh, e2e, docs, gates](./phase-02-cascade-verify-gates.md) | Pending |

## Quyết định đã chốt

1. **Toolbar**: dùng `@base-ui/react/toolbar` (`Toolbar.Root/Button`) đã có trong deps — roving tabindex + ←/→/Home/End built-in, không tự viết. Undo/Redo `focusableWhenDisabled={false}` (giữ attr `disabled` native — test hiện có `rich-text-editor.test.tsx:165` vẫn xanh). Toolbar giữ `div role="toolbar"` là SIBLING trực tiếp của `EditorContent` (bất biến DOM mà e2e `rich-text-content.spec.ts` neo XPath `../preceding-sibling::div[@role='toolbar']` — không được bọc thêm container). Flat, không dùng `Toolbar.Group` (giảm rủi ro DOM; aria-label đã có trên root).
2. **Focus ring**: thêm `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none` tường minh trên nút (precedent `theme-toggle.tsx:24`; REVIEW.md:30 là checklist nhìn class). Wrapper đổi `focus-within:ring-…` → `has-[.ProseMirror:focus]:ring-…` + `has-[.ProseMirror:focus]:border-ring` để focus ở toolbar không sáng cả khung. `gap-0.5` → `gap-1` (--focus-ring lan 4px, 2px gap bị nút pressed `bg-muted` đè ring). Wrap 2 hàng ở 375px chấp nhận (tiền lệ F6 #437).
3. **Link popover**: `@base-ui/react/popover` nội bộ trong `rich-text-editor.tsx` (không primitive dùng chung). **Controlled open** (`open={linkOpen}` + `onOpenChange`) — quyết định mở/đóng CHỈ ở `onOpenChange`: `next && reason === "trigger-press" && isActive("link")` → `unsetLink` + KHÔNG mở (onClick riêng không đáng tin — thứ tự với handler nội bộ của trigger không đảm bảo). Trigger là chính `Toolbar.Button` (composition `render`). Panel `modal={true}` + PHẢI có `Popover.Close` ("Hủy") trong Popup — focus trapping của `modal` chỉ bật khi có Close (`PopoverRoot.d.ts:49`); KHÔNG dùng `"trap-focus"` (click-outside sẽ đi vào editor, hỏng ca focus-return). KHÔNG bọc input trong `<form>` (portal bubbles onSubmit lên form của trang — `test-builder-shell.tsx:587`, `assignments/new.tsx:487`): Enter xử lý bằng `onKeyDown` trên input + `preventDefault`, nút Áp dụng `type="button"`. `Popover.Popup onKeyDown` stopPropagation cho Arrow/Home/End (tránh Toolbar.Root composite cướp phím khi caret ở mép; KHÔNG chặn Escape). `initialFocus` trỏ input. Apply → `chain().focus().extendMarkRange("link").setLink({ href })`; scheme allowlist ở đường authoring (`http:`, `https:`, `mailto:`, `#anchor`, `/relative`) — sanitizer chỉ chạy lúc render (`rich-text-body.tsx:48`); giá trị lệch allowlist → lỗi inline (không lưu). `Esc`/click-outside → focus về trigger. Selection rỗng + Apply = stored mark như cũ. Nút link BỎ `aria-pressed` (chỉ `aria-expanded` + `aria-haspopup="dialog"`). Xóa `promptLinkHref`. **Fallback** nếu ca (b)/(f)/(g) vẫn đỏ sau 2 vòng red→green: bỏ `Popover.Trigger`, dùng `Toolbar.Button` thường + `Popover` anchor theo ref, đặt `Popover.Root` ngoài `Toolbar.Root`, tự quản `aria-expanded`/`aria-haspopup`.
4. **H4**: THÊM nút "Đề mục cấp 4" (`heading: { levels: [2,3,4] }`, icon `Heading4`, state `isH4`) + `[&_h4]` style trong `RICH_TEXT_CONTENT_CLASSES` (nhỏ hơn h3: `font-semibold`, 1em) — thay vì bỏ h4 khỏi allowlist (sẽ phá nội dung cũ render-only). Toolbar thành 16 nút.
5. **Cascade**: bọc CẢ khối `.ProseMirror` (base + placeholder `p.is-editor-empty`) vào `@layer components`. Đây là sửa bug có chủ đích: 11 callsite `[&_.ProseMirror]:min-h-*` bắt đầu thắng thật — answer-key-grid + part-content-fields:147 `min-h-16` (4rem), question-key-editor `min-h-24` (6rem), test-header-form ×2 `min-h-22` (5.5rem), part-content-fields:103/119 `min-h-48`/`min-h-32`, prompt-composer `min-h-42/52/32/22`. PR liệt kê từng mức; chụp lại các surface thay đổi.
6. **Research SKIP**: Tiptap + Base UI đã ổn định trong codebase (từ #280/#437; tooltip/menu/dialog dùng `@base-ui/react/*` hiện hữu) — change thuần nội bộ, không có dependency surface mới. **Debug SKIP**: route feature/enhancement, không có defect cần root-cause riêng (claim focus-ring được verify thực nghiệm trong phase 1 như một task red/green).

## Dependencies

Không thêm dependency mới (`@base-ui/react` toolbar + popover đã trong node_modules, kongming đã đối chiếu `ToolbarButton.js:26`). Nền: #437 đã merge develop.

## Success Criteria

- [ ] Nút toolbar có `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`; focus ở toolbar KHÔNG sáng ring wrapper; evidence chụp focus light+dark.
- [ ] Toolbar 1 Tab stop duy nhất; ←/→/Home/End di chuyển; Undo/Redo disabled bị bỏ qua khi điều hướng; unit test keyboard khóa hành vi.
- [ ] Popover link thay `window.prompt`: apply (allowlist scheme)/lỗi inline/Esc/click-outside/active→unset (onOpenChange reason)/selection rỗng (stored mark)/Enter-không-submit-form-trang/focus containment + phím mũi tên trong input — 8 ca unit test; không còn `window.prompt` trong codebase rich text.
- [ ] H4 soạn được từ toolbar, markup `<h4>` qua `sanitizeRichText` nguyên vẹn, style editor ≡ render (`[&_h4]` trong `RICH_TEXT_CONTENT_CLASSES`).
- [ ] `.ProseMirror` trong `@layer components`; computed `min-height` của surface "Mô tả" (web test-header-form, min-h-22) = **77px** (5.5rem × 14px root — `globals.css:220` đặt `html{font-size:14px}`, baseline TRƯỚC fix = 70px) và surface min-h-16 = **56px** (baseline 70px).
- [ ] Screenshot: quiz-paper + quiz-reading-layout @375+1440 × light+dark với passage h2/blockquote/pre; 2 test-header-form; prompt-composer; answer-key-grid; part-content-fields; focus state. Script capture throwaway của plan exit 0; `pnpm design:compare` chạy như canary hồi quy #378 (screens.json hardcode — không cover surface #438).
- [ ] E2E `rich-text-content.spec.ts` 4 spec cũ xanh KHÔNG sửa assertion; +1 spec popover link render `<a>` phía học viên (href qua allowlist). `pnpm check`, `check-types`, test (web+admin), full e2e xanh.
- [ ] Docs grep `tiptap|ProseMirror|rich text` cập nhật (16 nút, popover link).
- [ ] Mục 8 #438 out-of-scope ghi rõ trong PR (`Relates to #438`).

## Câu hỏi mở

None — đã chốt qua kongming checkpoint sau investigation (GO với 3 điều chỉnh: Base UI Toolbar, mô tả đúng mục 5 là thay đổi chiều cao có chủ đích, loại mục 8).

## Red Team Review

### Session — 2026-10-26
2 reviewer song song (Security Adversary + Assumption Destroyer), tier Light (Fact Checker), agent `task` fresh-context (agent `code-reviewer` không spawn được trong runtime này — thiếu model mặc định).
**Findings:** 14 (14 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 5 High, 8 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| A1 | Assertion px sai: root 14px → min-h-22 = 77px (không phải 88px), min-h-16 = 56px, baseline 70px | Critical | Accept | plan Success Criteria, phase-02 Task 2.1 |
| S1 | Authoring-time URL không validate — `javascript:`/`data:` lưu thẳng DB (sanitizer chỉ ở render sink `rich-text-body.tsx:48`) | High | Accept — scheme allowlist (http/https/mailto/#//) ở Apply + test khóa editor level | plan QĐ3, phase-01 Task 1.4 |
| S2 | Mâu thuẫn `type="url"` vs "không thêm validation" — chặn im lặng `mailto:`/`#`/schemeless | High | Accept — `type="text" inputMode="url"` + lỗi inline, không auto-normalize | plan QĐ3, phase-01 Task 1.4 |
| S3 | Popover non-modal — Tab escape mất ngữ cảnh + phá roving | High | Accept — `modal` + test ca (e) focus containment | plan QĐ3, phase-01 Task 1.4 |
| A2 | `Popover.Trigger` uncontrolled tự toggle — ca "active→unset, không mở" fail vĩnh viễn | High | Accept — controlled `open`/`onOpenChange` + click intercept | plan QĐ3, phase-01 Task 1.4 step 3 |
| A3 | `design:compare` không cover surface #438 (screens.json hardcode #378, `capture.mjs:59`) — exit 0 là bằng chứng giả | High | Accept — reframe thành canary; evidence chính = script throwaway plan | plan SC, phase-02 Task 2.2 step 5 |
| S4 | Test ca (d) stored-mark không assert hành vi thật | Medium | Accept — assert insertContent sau Apply → `<a href>abc</a>` | phase-01 Task 1.4 ca d |
| S5 | Nút link vừa `aria-pressed` vừa `aria-expanded` — semantics mâu thuẫn | Medium | Accept — bỏ `aria-pressed` trên nút link | plan QĐ3, phase-01 Task 1.4 step 4 |
| S6 | "Test khóa javascript:" chỉ bảo vệ sink render, không đường mới | Medium | Accept — ca (e) khóa đường authoring | phase-01 Task 1.4 |
| S7 | Focus-return chưa khóa cho click-outside | Medium | Accept — test ca (f) | phase-01 Task 1.4 |
| A4 | Label editor sai ("Đề bài" → thực tế "Mô tả" `test-header-form.tsx:169`); admin part-content không có e2e đi sẵn | Medium | Accept — label "Mô tả"; surface 2 = admin flow theo mẫu `admin-library-*`, fallback answer-key-grid | phase-02 Task 2.1 |
| A5 | jsdom popover cần mock ResizeObserver (precedent `command-search.test.tsx:20-22`) | Medium | Accept — mock step + assert qua aria/portal | phase-01 Task 1.4 step 1 |
| A6 | Roving test chỉ khóa trạng thái Undo-disabled — thiếu ca enabled | Medium | Accept — 2 trạng thái, assert qua `focus()`+`activeElement` | phase-01 Task 1.1 |
| A7 | Line citations lệch (`:213-231` → thực `:196-231`, `TOOLBAR_BUTTONS :68-158`); verify H4 bằng grep quá yếu | Medium | Accept — sửa citations; verify = DOM test 16 nút + thứ tự | plan hiện trạng, phase-01 Task 1.3 |

### Whole-Plan Consistency Sweep

- Decision delta: controlled-open + modal + scheme allowlist + `type="text"` + bỏ `aria-pressed` link (QĐ3); px 77/56/70 (SC + phase-02); label "Mô tả"; design:compare = canary; roving 2 trạng thái; H4 verify DOM.
- Quét term cũ trong cả 3 file: `88px`/`64px`/`80px` = 0 hit; `type="url"` chỉ còn trong ghi chú "KHÔNG dùng"; `Đề bài` = 0 hit; "Không thêm validation" = 0 hit; `grep -c` verify = 0 hit.
- Mâu thuẫn còn lại: none.

<!-- slug: rich-text-followup-438 -->
