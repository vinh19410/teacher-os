---
phase: 5
title: "Tests e2e regression"
status: completed
priority: P1
effort: "5h"
dependencies: [2, 3, 4]
---

# Phase 5: Tests e2e regression

## Goal

Chuyển e2e Playwright từ `fill()` textarea sang contenteditable (Playwright hỗ trợ chính thức `fill()` trên `[contenteditable]`; `getByLabel` hoạt động **nhờ hợp đồng a11y của phase 1** — `Field` gắn `id` riêng cho label element và `RichTextEditor` set `aria-labelledby`/`id` qua `editorProps.attributes`, vì contenteditable div **không phải** labelable element nên association `label[for]` thông thường không đủ — **phase 1 phải xong hợp đồng a11y trước**), thêm e2e XSS + persistence, chạy full regression. Kết luận IME tiếng Việt bằng manual smoke checklist.

## Files to Create / Modify

- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts` — fill "Nội dung đề" (L25-28, L54-55, L76); assert `toHaveValue` trên "Nội dung đề" (L99-101) không còn hợp lệ trên contenteditable → `toHaveText` *(assert `toHaveValue(TITLE)` ở L98 là Tiêu đề — Input thường, giữ nguyên; line refs đã re-verify)*
- Modify: `apps/e2e/specs/assignment-prompt-reading-types.spec.ts` — fill "Đoạn đọc" (L35, L111, L218, L296, L347, L470, L534, L605) + "Hướng dẫn đề" (L40, L114, L473, L537)
- Modify: `apps/e2e/specs/assignment-test-create.spec.ts` — passage fill (L115-116, L202-203); key paste (L228, L234, L301) GIỮ nguyên (vẫn Textarea)
- Modify: `apps/e2e/specs/assignment-bank.spec.ts` (L18, L30) + `class-assign.spec.ts` (L55, L66) — fill "Nội dung đề" *(phát hiện thêm ngoài danh sách ban đầu — cùng đổi hoặc spec chết tại bước soạn đề)*
- Modify: `apps/e2e/specs/assignment-prompt-map-listening.spec.ts` — fill "Nội dung đề" (L110-111) *(spec thứ 6 — phát hiện khi red-team)*
- Create: `apps/e2e/specs/rich-text-content.spec.ts` — bold persist + XSS neutralize + legacy render

## Requirements

- [ ] Helper chung trong spec/helper: `fillRichEditor(page, label, text)` = click `.ProseMirror` + `fill()`; selector qua `getByLabel` (hoạt động nhờ `aria-labelledby` từ phase 1 — nếu fail, check `editorProps.attributes` trước khi đổi approach) — không hard-code index trừ khi multi-editor (dùng `.first()`/scope part).
- [ ] Bold-flow e2e: soạn prompt → select text (double-click hoặc `pressSequentially` sau khi fill) → click nút `aria-label="In đậm"` → lưu → mở lại → `expect(editor.locator("strong")).toContainText(...)`; assert cả preview giáo viên render `<strong>` thật.
- [ ] XSS e2e (Chromium thật): tạo prompt có prompt = `<img src=x onerror="window.__pwned=1"><p>safe text</p>` (dùng fill — Playwright fill không chạy HTML parse nên set qua `page.evaluate` dispatch paste event với `clipboardData` HTML, đúng hướng researcher-01 mục 6) → mở preview → "safe text" visible + `window.__pwned` undefined + không `<img>` trong DOM render.
- [ ] Legacy render e2e hoặc unit (đã có unit phase 4): hàng plain `"Dòng 1\nDòng 2"` preview giữ xuống dòng (assert computed `white-space: pre-line` hoặc 2 text node).
- [ ] IME manual smoke checklist (ghi kết quả vào plan.md Validation Log, không CI): EVKey/Unikey Telex + VNI gõ "Vietnam" → "Việt Nam" đúng trong `.ProseMirror`; pasted text giữ nguyên; undo/redo không vỡ composition.

## Implementation Steps

1. Thêm helper `fillRichEditor`; refactor 6 spec theo bảng line ở trên; chạy từng spec riêng trước.
2. Viết `rich-text-content.spec.ts` với 3 test (bold persist, XSS, legacy newline) — boot qua webServer có sẵn (`playwright.config.ts:33-59`).
3. Full regression: `pnpm check` (Biome), `pnpm check-types`, `pnpm test` (turbo + workflow scripts), e2e toàn bộ `pnpm --filter e2e exec playwright test`.
4. Sửa những assertion text bị ảnh hưởng format (vd e2e assert text chứa `\n` từ passage cũ).

## Todo

- [ ] 6 spec refactor contenteditable fill
- [ ] `rich-text-content.spec.ts` (bold persist + XSS + legacy)
- [ ] IME manual smoke chạy + ghi log
- [ ] Full regression xanh (check + check-types + test + e2e)

## Success Criteria

Toàn bộ e2e xanh trên Chromium với editor thật; payload XSS lưu-được-nhưng-không-thực-thi; không spec nào còn `fill()` vào textarea nội dung đã rich (key paste vẫn Textarea — giữ fill thường).

## Verification

```bash
pnpm --filter e2e exec playwright test rich-text-content
pnpm check && pnpm check-types && pnpm test
pnpm --filter e2e exec playwright test
```

## Risk notes

- **`fill()` + IME không test được qua Playwright** — composition events thật chỉ verify manual (checklist trên); đây là rủi ro chấp nhận có chủ đích.
- **XSS e2e set HTML qua evaluate/paste** — nếu dispatch paste không ổn định ở Tiptap v3, fallback: soạn bold bằng toolbar rồi assert payload qua GET; XSS assert bằng cách seed DB trực tiếp qua boot script (nhưng giữ 1 đường e2e UI cho persistence flow).
- **e2e số lượng lớn đụng "Nội dung đề"** (6 spec) — refactor helper 1 chỗ giúp diff nhỏ; spec nào fail vì label/scope editor sai phải sửa selector, KHÔNG hạ getLabel sang class selector.
