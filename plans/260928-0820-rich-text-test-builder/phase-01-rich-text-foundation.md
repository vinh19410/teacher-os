---
phase: 1
title: "Rich text foundation"
status: pending
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Rich text foundation

## Goal

Nền tái sử dụng cho mọi phase sau, **thuần additive đối với luồng hiện hữu** (không field/luồng nào đổi hành vi): deps Tiptap + DOMPurify + jsdom + Testing Library vào workspace, util pure `packages/api/src/rich-text.ts` (import được từ cả web lẫn server Workers), adapter legacy `rich-text-legacy.ts`, 2 component `apps/web` — `RichTextEditor` (soạn) và `RichTextBody` (render + sanitize + legacy fallback) — kèm unit test và hợp đồng a11y cho `getByLabel`.

## Files to Create / Modify

- Modify: `pnpm-workspace.yaml` (catalog: thêm 3 package `@tiptap/*` + `jsdom` + `@testing-library/react` + `@testing-library/dom`)
- Modify: `apps/web/package.json` (`@tiptap/*: catalog:`, `dompurify`; devDeps `jsdom`, `@testing-library/react`, `@testing-library/dom` — repo **chưa có RTL**, research mẫu dùng `render()` của nó)
- Create: `packages/api/src/rich-text.ts` + `packages/api/src/rich-text.test.ts` (export qua glob `./*` của `@teacher-os/api` — đã xác nhận `packages/api/package.json` exports `"./src/*.ts"`, import sẽ là `@teacher-os/api/rich-text`)
- Create: `apps/web/src/lib/rich-text-sanitize.ts` (DOMPurify — chỉ ở apps/web)
- Create: `apps/web/src/lib/rich-text-legacy.ts` + `rich-text-legacy.test.ts` (adapter nạp nội dung cũ vào editor — decision 9 plan.md)
- Modify: `apps/web/src/components/ui/field.tsx` (additive: label element thêm `id={`${id}-label`}` — không đổi prop/API nào)
- Create: `apps/web/src/components/ui/rich-text-editor.tsx`
- Create: `apps/web/src/components/ui/rich-text-body.tsx`
- Create: `apps/web/src/components/ui/rich-text-editor.test.tsx`, `rich-text-body.test.tsx` (`// @vitest-environment jsdom`)

## Requirements

- [ ] `htmlToPlainText(html)`: DOMParser khi có (browser/jsdom), fallback regex khi không (Workers) — **chèn `\n` khi đi qua ranh giới block** (walk DOM hoặc kiểu `innerText` — `textContent` nối các block không phân tách sẽ làm sai word count cho `<p>one</p><p>two</p>`). Độ dài plain dùng cho cap phải đo trên chuỗi đã **collapse whitespace** (`\s+` → 1 space) để `\n` biên không làm lệch trần (passage legacy 19.990 ký tự chia 40 đoạn phải vẫn pass cap 20000 sau round-trip editor). Dùng cho đếm/cap, không phải security.
- [ ] `looksLikeHtml(text)` + `normalizeLegacyRichText(text)`: nếu chuỗi **không** có thẻ HTML → escape `&`, `<` thành entity → chuyển `\n` → `<br>`; chuỗi có thẻ → trả nguyên trạng. Test round-trip: plain 3 dòng → `setContent` → `getHTML()` giữ nguyên 3 dòng qua `<br>`; chuỗi chứa `<` literal (vd `a < b`) không bị editor ăn thành thẻ.
- [ ] `isEmptyRichText(html)`, `richTextField(plainMax, rawMax = ceil(plainMax*2.5))` — factory chỉ cap (raw `.max` + plain refine đo trên collapsed plain), **không** refine non-empty (draft rỗng phải parse pass — contract hiện `prompt: z.string().trim().max(5000)` không có min, `contracts.ts:457`).
- [ ] `RichTextEditor`: controlled `value/onChange` HTML string; v3 `editor.commands.setContent(value, { emitUpdate: false })` khi value đổi từ ngoài; toolbar B/I/U + bullet/ordered list + link với `aria-label` tiếng Việt ("In đậm"…); prop `placeholder`; StarterKit giữ undo/redo, **không expose** nút heading.
- [ ] **Hợp đồng a11y/label** (bắt buộc cho `getByLabel` — contenteditable div **không phải** labelable element nên label `[for]` thường không đủ): `field.tsx` label element thêm `id={`${id}-label`}` (additive); `RichTextEditor` set `useEditor({ editorProps: { attributes: { id, "aria-labelledby": `${id}-label`, "aria-invalid", "aria-describedby" } } })` — `id` nằm trong deps/re-create khi đổi; prop `ariaLabel` cho dùng standalone. Unit test jsdom: `getByLabelText("...")` resolve tới phần tử `.ProseMirror`.
- [ ] `RichTextEditor` render an toàn trong node env (test hiện tại dùng `renderToStaticMarkup`, không jsdom): khi `document` không tồn tại hoặc editor null → toolbar disabled + shell rỗng, không crash (`useEditor` + `immediatelyRender: false`; nếu Tiptap vẫn crash trong node thì gate thêm `typeof document === "undefined"` — quyết định lúc implement).
- [ ] `RichTextBody({ text, className, legacyWhitespace? = "pre-line" })`: phát hiện HTML bằng regex pre-check + DOMParser xác nhận; nhánh rich → `sanitizeRichText` + `dangerouslySetInnerHTML`; nhánh legacy → `whitespace-{legacyWhitespace}` + text escaped (giữ hệt hành vi render hiện tại, tham chiếu `test-preview-paper.tsx:116`; `class-assignments-tab` truyền `"pre-wrap"` vì surface này đang `pre-wrap`); khi không có DOM (node test) → luôn nhánh escaped text, **không bao giờ** innerHTML chưa sanitize.
- [ ] `sanitizeRichText`: DOMPurify allowlist thẻ `p br strong em u s ul ol li a code pre hr blockquote h2-h4` (không có `img`, không có `mark`), `ALLOWED_ATTR: ["href", "target"]` (bỏ `rel/src/alt/title`), `ALLOW_DATA_ATTR: false`; hook `afterSanitizeAttributes` ép mọi thẻ `a`: `target="_blank"` + `rel="noopener noreferrer"` (payload không tự set được `rel`).

## Implementation Steps

1. Thêm catalog: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` `^3.31.0` + `jsdom` + `@testing-library/react` + `@testing-library/dom` vào `pnpm-workspace.yaml` (catalog đã có `zod: ^4.4.3` ở dòng 11); khai báo `catalog:` trong `apps/web/package.json`, `pnpm install`.
2. Viết `packages/api/src/rich-text.ts` (pure; code mẫu researcher-02 mục 3/4, bỏ refine non-empty; plain đo trên collapsed whitespace). Test node env: fallback regex strip đúng block boundary, entity decode, `richTextField` cap plain/raw; test `<p>one</p><p>two</p>` = 2 từ; test DOMParser vs regex fallback cùng kết quả.
3. Viết `rich-text-legacy.ts` + test round-trip (plain 3 dòng → setContent → getHTML giữ 3 dòng; `<` literal không bị ăn).
4. Viết `rich-text-sanitize.ts` + `RichTextBody` (code researcher-02 mục 1/5, thêm nhánh no-DOM + `legacyWhitespace`).
5. Viết `RichTextEditor` (pattern controlled researcher-01 mục 5; toolbar là mảng config `{ label, command, isActive }` render nút `type="button"` + `aria-label` + `aria-pressed`; nhận/forward `id`, `aria-invalid`, `aria-describedby` vì `Field` inject các prop này vào con duy nhất — `field.tsx:17-57`; sửa `field.tsx` additive: label thêm `id={`${id}-label`}`).
6. Unit test jsdom: (a) `new Editor({ extensions, content })` headless — `toggleBold()` → `getHTML()` chứa `<strong>` (Commands API, KHÔNG gõ phím); (b) `RichTextBody` rich path strip `<script>`/`onclick`, giữ `<b>`; (c) legacy path không đi qua innerHTML; (d) `getByLabelText("Nội dung đề")` resolve tới `.ProseMirror`; (e) smoke node env riêng: `renderToStaticMarkup(<RichTextEditor value="x" onChange={vi.fn()} />)` không crash.

## Todo

- [ ] Deps + catalog + `pnpm install` xanh
- [ ] `packages/api/src/rich-text.ts` + test node env (block boundary + collapsed cap)
- [ ] `rich-text-legacy.ts` + test round-trip
- [ ] `rich-text-sanitize.ts` + `RichTextBody` + test jsdom
- [ ] `RichTextEditor` + a11y contract (field.tsx label id + editorProps.attributes) + test jsdom Commands API + smoke node env
- [ ] `pnpm -F web test` + `pnpm check-types` exit 0

## Success Criteria

Không có file app hiện hữu nào bị sửa ngoài `field.tsx` (chỉ thêm `id` cho label — `git diff --name-only` chỉ chứa deps + file mới + field.tsx); toàn bộ test cũ vẫn xanh; 4 khối mới có test riêng pass; `getByLabelText` resolve được editor (điều kiện tiên quyết cho e2e phase 5).

## Verification

```bash
pnpm install && pnpm -F web test && pnpm check-types
git diff --name-only | grep -v -E "pnpm-workspace|pnpm-lock|package.json|rich-text|field.tsx" || echo "OK: additive only"
grep -rn "dangerouslySetInnerHTML" apps/web/src --include="*.ts" --include="*.tsx" | grep -v rich-text-body || echo "OK: single sink"
```

## Risk notes

- **Tiptap trong node env không có DOM** — khả năng cao `useEditor` trả null (SSR path) nhưng phải verify lúc implement; fallback gate `typeof document` đã nêu trong Requirements.
- **DOMPurify khi `isSupported === false`** có thể trả input nguyên trạng — chặn bằng guard nhánh no-DOM trong `RichTextBody`, không phụ thuộc fallback của DOMPurify.
- **Version `^3.31.0`** từ research (npm query 28/09/2026) — pin range minor, không hard-pin patch.
- **`getByLabelText` với contenteditable** chỉ hoạt động qua `aria-labelledby` (không phải label `[for]`) — nếu jsdom test fail, kiểm `editorProps.attributes` đã được áp lên `.ProseMirror` trước khi đổi approach.
