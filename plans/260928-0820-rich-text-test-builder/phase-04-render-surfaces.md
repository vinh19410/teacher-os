---
phase: 4
title: "Render surfaces"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 3]
---

# Phase 4: Render surfaces

## Goal

Mọi nơi hiển thị nội dung rich đổi sang `<RichTextBody>` — đảm bảo (1) HTML render có định dạng qua DOMPurify, (2) hàng plain cũ render **giống hệt** trước kia, (3) word count đếm trên plain text. `cuePoints` **không đụng** (interview Q2 — render `split('\n')` → `<li>` giữ nguyên ở 2 file). Đây là phase khép giao thoa "preview hiện raw HTML" của phase 3.

## Files to Create / Modify

- Modify: `apps/web/src/components/assignment-tests/test-preview-paper.tsx` — passage (L115-118), prompt (L125-127), intro (L136-138); gate `.trim()` (L115/L125/L136) → `isEmptyRichText`
- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx` — passage (L85-86), intro (L107-109), prompt (L174-175); fallback `props.prompt.trim() || "Đề sẽ hiện ở đây khi bạn soạn."` (L175) → gate `isEmptyRichText` trước rồi mới fallback text; Tag note `{props.note.trim() && <Tag>Có hướng dẫn thêm</Tag>}` (L185) → `!isEmptyRichText(note) &&`; wordCount (~L188-192 — **verify-at-implement**, cite gốc L188-191 không chính xác) → đếm trên plain text; **cuePoints render GIỮ NGUYÊN (Q2)**; chú ý block prompt hiện nằm trong `<p className="mt-3 whitespace-pre-line">` (~L173) — `RichTextBody` render block div, lồng div trong `<p>` là invalid HTML, đổi wrapper thành `<div className="mt-3">`
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.tsx` — passage (L62-63), intro (L108-110), prompt (L176-178); Tag note `{prompt.note?.trim() && <Tag>Có hướng dẫn thêm</Tag>}` (L189) → `!isEmptyRichText(note) &&`; wordCount (~L192-195 — **verify-at-implement**, cite gốc L188-191 là cụm Tag note/gate prompt, không phải wordCount); **cuePoints render (L164-171) GIỮ NGUYÊN (Q2)**
- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx` — preview đề khi giao lớp (L575-581, `whitespace-pre-wrap` + `selectedPrompt.passage || selectedPrompt.prompt`) → `<RichTextBody legacyWhitespace="pre-wrap" …/>` (surface này đang pre-wrap chuỗi raw — giữ đúng hình hiển thị hàng cũ)
- Modify tests: `student-preview-paper.test.tsx`, `prompt-preview-aside.test.tsx`, `test-preview-paper.test.tsx`

## Requirements

- [ ] Mọi sink nội dung rich đều qua `RichTextBody` — grep sau phase: `dangerouslySetInnerHTML` chỉ được xuất hiện trong `rich-text-body.tsx`; `whitespace-pre-line`/`whitespace-pre-wrap` không còn bọc prompt/passage/intro/transcript ở 4 file trên (**cuePoints không nằm trong list — render `split('\n')` giữ nguyên theo Q2**).
- [ ] Legacy plain row: render nhánh escaped `whitespace-pre-line` — assert trong test rằng chuỗi `"line1\nline2"` cho cùng markup như trước phase (snapshot string so sánh trực tiếp).
- [ ] cuePoints: KHÔNG đụng — render `split('\n')` → `<li>` ở `student-preview-paper.tsx` + `prompt-preview-aside.tsx` giữ nguyên y hệt (Q2).
- [ ] Gate + fallback: chuỗi chỉ-toàn-thẻ (`<p></p>`) được coi rỗng → hiện fallback text như khi trống; 2 Tag note (L185/L189) không hiện khi note là `<p></p>`.
- [ ] Word count mọi nơi (composer đã đổi phase 3; 2 preview ở phase này) chạy trên `htmlToPlainText`.

## Implementation Steps

1. `test-preview-paper.tsx`: 3 block render swap `RichTextBody`, đổi 3 gate `.trim()`.
2. `student-preview-paper.tsx` + `prompt-preview-aside.tsx`: swap passage/intro/prompt + 2 gate Tag note (L185/L189) + fallback prompt học viên (L175) + 2 wordCount (line ref verify-at-implement) — cuePoints không đụng.
3. `class-assignments-tab.tsx` L575-581: đổi biểu thức chọn passage/prompt thành biến rồi đưa vào một `<RichTextBody legacyWhitespace="pre-wrap">` duy nhất.
4. Test: (a) legacy plain `"<p> & dấu"` render escaped, không parse thẻ; (b) rich `"<p><strong>x</strong></p>"` render `<strong>` — **CHỈ trong file `// @vitest-environment jsdom`**; file node (static markup) chỉ assert nhánh legacy escaped (quy tắc phase 1: no-DOM → không bao giờ innerHTML); (c) XSS smoke unit: `<img src=x onerror=alert(1)>` trong rich text → `onerror` biến mất (jsdom + DOMPurify thật); (d) wordCount trên `"<p>one two</p>"` = 2.
5. Chạy lại test component 3 file bị đụng (hiện assert text content — đa phần giữ nguyên vì plain path không đổi markup).

## Todo

- [ ] 4 component swap RichTextBody (9 điểm render passage/prompt/intro + 1 preview class-tab + 3 gate render + 2 gate Tag note + fallback prompt + 2 wordCount)
- [ ] Grep xác nhận single-sink (không innerHTML ngoài rich-text-body.tsx; cuePoints render giữ nguyên)
- [ ] Test legacy/rich (jsdom)/XSS/wordCount pass
- [ ] `pnpm -F web test` + `pnpm check-types` exit 0

## Success Criteria

Preview giáo viên + preview học viên (aside) + tab Lớp học: rich text hiển thị đúng định dạng; hàng cũ plain có `\n` không đổi hình hiển thị (class-tab vẫn pre-wrap); cuePoints render không đổi; Tag "Có hướng dẫn thêm" không hiện với note `<p></p>`; không sink nào render HTML chưa sanitize.

## Verification

```bash
pnpm -F web test && pnpm check-types
grep -rn "dangerouslySetInnerHTML" apps/web/src --include="*.ts" --include="*.tsx" | grep -v rich-text-body || echo "OK: single sink"
```

## Risk notes

- **DOMPurify bundle ~20KB gzip vào apps/web** — chấp nhận, chỉ load ở nhánh có rich text (import tĩnh đơn giản; dynamic import là tối ưu sau nếu cần).
- **Tailwind không style `ul/ol/strong` trong innerHTML** (preflight strip list style) — `RichTextBody` cần wrapper class cho `ul { list-style: disc }`/`ol`/`strong` (Tailwind 4: dùng class con trực tiếp hoặc layer `@layer` trong component) — quyết định lúc implement, không thêm plugin typography (YAGNI).
- **`<a>` trong nội dung** — đã chốt ở decision 10 plan.md: hook `afterSanitizeAttributes` ép `target="_blank" rel="noopener noreferrer"`; không cần branch "chặn thẻ a" nữa.
- **Line ref wordCount 2 file preview** đã lệch trong bản draft (L188-191) — re-count vị trí thật lúc implement và cập nhật mục này nếu cần.
