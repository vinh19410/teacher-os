---
phase: 1
title: "Phase 1: Core Reading Annotation Engine & Design Tokens"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Core Reading Annotation Engine & Design Tokens

## Goal

Thêm semantic CSS tokens cho Reading highlight đạt WCAG AA (Light & Dark, kể cả trong `<blockquote>`) và non-text ≥ 3.0:1 vào `globals.css`, dùng chung bộ nhận diện rich-text HTML với `RichTextBody`, và xây dựng theo TDD toàn bộ core engine xử lý AST, ánh xạ UTF-16 offset và đại số khoảng tô sáng/ghi chú tại `packages/ui/src/lib/reading-annotations.ts`.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/src/components/assignments/rich-text-body.tsx`
- Create: `packages/ui/src/lib/reading-annotations.ts`
- Create: `packages/ui/src/lib/reading-annotations.test.ts`

## Tasks & Steps

### Task 1.1 — Add accessible Light & Dark Reading highlight tokens in `globals.css`
<!-- Updated: Red-Team RT-9 - color: var(--foreground) for blockquote contrast + darker Light highlight border >= 3.0:1 -->
- **Goal**: Định nghĩa CSS custom properties `--reading-highlight` và `--reading-highlight-border` (và `@theme inline` mapping) tách biệt khỏi `mark.anno`, đạt tương phản chữ `--foreground` ≥ 4.5:1 ở cả Light và Dark mode (kể cả bên trong `<blockquote>`) và viền ghi chú ≥ 3.0:1 (WCAG 1.4.11).
- **Target files and symbols**: `packages/ui/src/styles/globals.css` (`:root`, `.dark`, `@theme inline`, `@layer base`).
- **Steps**:
  1. Trong `:root` (`packages/ui/src/styles/globals.css`), thêm:
     - `--reading-highlight: oklch(0.93 0.11 95);` (vàng giấy dịu trên `--background: oklch(1 0 0)` — contrast với `--foreground: oklch(0.145 0 0)` > 14:1).
     - `--reading-highlight-border: oklch(0.56 0.15 78);` (hổ phách đậm cho gạch chân highlight có ghi chú — đạt ≥ 4.0:1 trên cả `--background` và `--reading-highlight`, vượt ngưỡng WCAG 1.4.11 3.0:1).
  2. Trong `.dark` (`packages/ui/src/styles/globals.css`), thêm:
     - `--reading-highlight: oklch(0.37 0.08 86);` (hổ phách trầm trên `--background: oklch(0.145 0 0)` — contrast với `--foreground: oklch(0.985 0 0)` > 8:1).
     - `--reading-highlight-border: oklch(0.78 0.14 86);` (nổi rõ ≥ 4.5:1 trong dark mode).
  3. Trong `@theme inline`, map `--color-reading-highlight: var(--reading-highlight);` và `--color-reading-highlight-border: var(--reading-highlight-border);`.
  4. Trong `@layer base`, thêm class `mark.reading-hl` với `background: var(--reading-highlight); color: var(--foreground); border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone;` (ép `color: var(--foreground)` thay vì `inherit` để giữ tương phản ≥ 10:1 kể cả khi highlight nằm trong `<blockquote>` có `text-muted-foreground`) và biến thể `mark.reading-hl[data-has-note="true"]` với `border-bottom: 2px solid var(--reading-highlight-border);`. Không sửa `mark.anno`.
- **Success criteria**: `globals.css` có đủ token cho Light/Dark và class `mark.reading-hl` không dùng hex cứng, giữ nguyên `mark.anno`.
- **Verify**: `pnpm exec biome check packages/ui/src/styles/globals.css` exits 0; kiểm tra contrast bằng node script ở Task 1.4.

### Task 1.2 — Write failing TDD unit tests for the Reading annotation core engine (Red Phase)
<!-- Updated: Red-Team RT-4, RT-5, RT-8, RT-13 - safe int & id validation, sanitizeHref & span cap, upsertNoteSpan overlap rules, no `--` in pnpm vitest filter -->
- **Goal**: Tạo bộ unit test bao phủ đầy đủ hành vi engine rich-text AST, sanitizer defense-in-depth, offset mapping, word snapping, interval algebra (kể cả overlap khi thêm ghi chú), và selection reading trước khi viết implementation.
- **Target files and symbols**: `packages/ui/src/lib/reading-annotations.test.ts`.
- **Steps**:
  1. Tạo `packages/ui/src/lib/reading-annotations.test.ts` import các symbol dự kiến từ `@teacher-os/ui/lib/reading-annotations`:
     - `isHtmlRichText`, `hashPassage`, `sanitizeReadingHref`, `isValidReadingAnnotationId`, `buildPassageModel`, `snapPassageSpan`, `getPassageExcerpt`, `normalizeReadingAnnotations`, `applyHighlightSpan`, `upsertNoteSpan`, `removeHighlightRange`, `splitLeafByAnnotations`, `readDomSelectionRange`, `READING_ANNOTATION_MAX_ITEMS`, `READING_ANNOTATION_NOTE_MAX`, `READING_TABLE_SPAN_MAX`.
  2. Viết test cases cho:
     - `isHtmlRichText`: phân biệt plain text (`"a < b > c"`), HTML tags (`<p>Hello</p>`), void tags (`a<br>b`), HTML entities (`&amp;`).
     - `hashPassage`: deterministic FNV-1a 32-bit hex string; đổi 1 ký tự ra hash khác.
     - `sanitizeReadingHref`: cho phép `https://`, `http://`, `mailto:`, `tel:`, đường dẫn tương đối `/path`; chặn `javascript:`, `data:`, `ftp://`, `//attacker.example`, `/\attacker.example`, chuỗi chứa ký tự điều khiển.
     - `buildPassageModel`:
       - HTML có `<p>`, `<strong>`, `<em>`, `<a>` hợp lệ (giữ `target="_blank"` & `rel="noopener noreferrer"`), `<a href="javascript:alert(1)">bad</a>` và `<a href="//phishing.example">proto-rel</a>` (bị hạ cấp / bỏ `href` — không có `attrs.href`), `<table>` có whitespace giữa `<tr>`/`<td>` (bỏ qua whitespace text nodes trong structural containers `table/thead/tbody/tfoot/tr/ul/ol`), `<td colspan="1000000" rowspan="0">` (clamp/bỏ giá trị ngoài `1..50`), `<ul><li>`, `<br>`, và `<script>alert(1)</script><p onclick="x()">Safe</p>` bị loại hoàn toàn.
       - Khi `DOMParser` hoặc `document` là `undefined`, rơi an toàn về nhánh plain text (`isHtml: false`) mà không fail-open.
       - `blockBreakOffsets` ghi nhận ranh giới giữa 2 đoạn `<p>Tea</p><p>begins</p>` và qua `<br>`.
       - Plain text passage trả về model hợp lệ với `isHtml: false` và 1 text node.
     - `snapPassageSpan`: bắt dính ranh giới từ trên tiếng Anh + tiếng Việt có dấu, KHÔNG nối 2 từ vắt qua `blockBreakOffsets` (`"Tea"` | `"begins"`).
     - `getPassageExcerpt`: chèn `" "` khi trích đoạn vắt qua `blockBreakOffsets`, cắt tối đa `max` ký tự kèm `"…"`.
     - Interval algebra & hardening:
       - `normalizeReadingAnnotations`: sắp xếp tăng dần; loại biên lỗi gồm `NaN`, `Infinity`, float `1.5`, `start < 0`, `start >= end`, `end > maxLength`; loại `id` sai pattern `/^[a-zA-Z0-9_-]{1,64}$/` (gồm selector injection `a"], button`, `"__proto__"`, `"toString"` có hoặc trùng ID → chỉ giữ ID hợp lệ duy nhất); loại trùng lấn; cắt note về `READING_ANNOTATION_NOTE_MAX`; cap số lượng `READING_ANNOTATION_MAX_ITEMS`.
       - `applyHighlightSpan`: tạo highlight mới; gộp 2 highlight không có ghi chú khi chọn đè; mở rộng highlight có ghi chú khi chọn bao trọn đúng 1 ghi chú mà vẫn giữ nguyên `note`; khi chọn vắt qua ghi chú sẵn có thì giữ nguyên ghi chú và chỉ tô phần trống.
       - `upsertNoteSpan`:
         - Thêm ghi chú vào vùng chưa tô (tạo mới);
         - Cập nhật ghi chú theo `id`;
         - Gắn ghi chú vào vùng trùng khớp / chồng lấn một phần với highlight **không có ghi chú**: cắt gọt (carve) các highlight không có ghi chú quanh `[start, end]` và chèn span ghi chú mới đúng `[start, end]` (không bao giờ rơi mất ghi chú mới);
         - Chạm/chồng đúng 1 highlight **đã có ghi chú**: cập nhật/mở rộng highlight đó giữ nguyên định danh (không tạo trùng hay làm mất ghi chú);
         - Vắt qua **≥ 2 highlight đã có ghi chú**: trả về `{ ok: false, reason: "multiple_notes_overlap", items }` để UI cảnh báo inline thay vì làm rơi dữ liệu.
       - `removeHighlightRange`: xoá toàn bộ highlight nằm trong vùng chọn; cắt đôi `[10, 50]` trừ `[20, 30]` thành `[10, 20]` và `[30, 50]`; cắt bớt đầu/cuối khi giao 1 phần.
     - `splitLeafByAnnotations`: tách chính xác 1 text leaf `[leafStart, leafEnd)` thành các mảnh thường và mảnh highlight có `isLastSegment` đúng trên mảnh cuối cùng của từng highlight (dùng `Map`, kiểm cả id như `"constructor"` vẫn không va chạm).
     - `readDomSelectionRange` (chạy trên jsdom): đọc đúng `[start, end]` cho vùng chọn trong 1 text node, vắt qua `<strong>`, vắt qua 2 `<p>`, vắt qua nút icon `<button data-reading-ui="true"><svg /></button>`, trường hợp `ELEMENT_NODE` boundary, và trả `null` khi vùng chọn nằm ngoài root hoặc chỉ có khoảng trắng.
- **Success criteria**: File test tồn tại, bao phủ mọi hàm và edge case cốt lõi, fail ở bước Red vì module chưa tồn tại.
- **Verify**: `pnpm --filter @teacher-os/ui test src/lib/reading-annotations.test.ts` exits non-zero (module not found / failing tests; passing test is a failure).

### Task 1.3 — Implement `reading-annotations.ts` and share `isHtmlRichText` with `RichTextBody` (Green Phase)
<!-- Updated: Red-Team RT-4, RT-5, RT-8, RT-13 -->
- **Goal**: Triển khai đầy đủ engine thuần `packages/ui/src/lib/reading-annotations.ts` và tái dùng `isHtmlRichText` trong `RichTextBody` để hai surface không bao giờ lệch nhánh HTML/plain-text.
- **Target files and symbols**:
  - Create: `packages/ui/src/lib/reading-annotations.ts`
  - Modify: `packages/ui/src/components/assignments/rich-text-body.tsx` (`RichTextBody`)
- **Steps**:
  1. Triển khai `packages/ui/src/lib/reading-annotations.ts`:
     - Export hằng số `READING_ANNOTATION_MAX_ITEMS = 200`, `READING_ANNOTATION_NOTE_MAX = 1000`, `READING_TABLE_SPAN_MAX = 50`.
     - Export types `ReadingAnnotation`, `PassageAstNode`, `PassageTextLeaf`, `PassageElementNode`, `PassageModel`, `LeafSlice`, `UpsertNoteResult`.
     - Export `isHtmlRichText(text: string): boolean` dùng đúng logic regex + `DOMParser` hiện tại của `RichTextBody` (`rich-text-body.tsx:9-42`).
     - Export `hashPassage(passage: string): string` (FNV-1a 32-bit unsigned hex 8 ký tự).
     - Export `isValidReadingAnnotationId(id: string): boolean` kiểm `/^[a-zA-Z0-9_-]{1,64}$/` và loại bỏ key nguy hiểm (`__proto__`, `prototype`, `constructor`).
     - Export `sanitizeReadingHref(raw: string | null): string | undefined` (allowlist `http:`, `https:`, `mailto:`, `tel:` hoặc đường dẫn tương đối không bắt đầu bằng `//` hay `/\`, loại ký tự điều khiển và colon trước path).
     - Export `buildPassageModel(passage: string): PassageModel`:
       - Nếu `!isHtmlRichText(passage)` hoặc `typeof DOMParser === "undefined"` hoặc `typeof document === "undefined"` → trả `{ isHtml: false, nodes: [{ kind: "text", start: 0, end: passage.length, text: passage }], canonicalText: passage, blockBreakOffsets: new Set(), passageHash: hashPassage(passage) }`.
       - Nếu là HTML trên DOM: gọi `sanitizeRichText(passage)` → `new DOMParser().parseFromString(clean, "text/html")` → duyệt DFS `doc.body` chỉ giữ các thẻ trong allowlist (`p, br, strong, em, u, s, ul, ol, li, a, code, pre, hr, blockquote, h2, h3, h4, table, thead, tbody, tfoot, tr, th, td`); lọc whitespace-only `TEXT_NODE` trong `table/thead/tbody/tfoot/tr/ul/ol`; trên `a` chỉ giữ `href = sanitizeReadingHref(el.getAttribute("href"))` kèm `target="_blank"` & `rel="noopener noreferrer"` (nếu không có `href` hợp lệ thì bỏ `href` để renderer hạ cấp thành `<span>`); trên `th`/`td` chỉ nhận `colspan`/`rowspan` nguyên dương `1..READING_TABLE_SPAN_MAX`; ghi `blockBreakOffsets` tại `<br>`, `<hr>` và ranh giới block tags (`p, h2, h3, h4, li, blockquote, pre, tr, td, th`).
     - Export `snapPassageSpan(model, start, end)` (tôn trọng `blockBreakOffsets` và Unicode `/[\p{L}\p{N}'’-]/u`), `getPassageExcerpt(model, start, end, max)`.
     - Export `normalizeReadingAnnotations(items, maxLength)` (ép `Number.isSafeInteger(start) && Number.isSafeInteger(end)`, kiểm `isValidReadingAnnotationId`, dedup ID bằng `Set`, cap `READING_ANNOTATION_MAX_ITEMS`), `applyHighlightSpan(items, start, end, createId)`, `upsertNoteSpan(items, target, note, createId): UpsertNoteResult` (carve note-less overlaps, update/expand single noted overlap, return `{ ok: false, reason: "multiple_notes_overlap", items }` khi cắt ≥ 2 highlight đã có note), `removeHighlightRange(items, start, end, createId)`, `splitLeafByAnnotations(leaf, annotations, lastSegmentOffsets: ReadonlyMap<string, number>)`.
     - Export `readDomSelectionRange(root, range, model)`: duyệt DFS text nodes bên trong `root` (bỏ qua toàn bộ subtree có `[data-reading-ui="true"]`), hỗ trợ boundary `TEXT_NODE` và `ELEMENT_NODE`, xác định chính xác `[start, end]` theo `canonicalText`.
  2. Cập nhật `packages/ui/src/components/assignments/rich-text-body.tsx` để import `isHtmlRichText` từ `@teacher-os/ui/lib/reading-annotations` thay cho bản sao cục bộ (giữ nguyên hành vi 100%).
- **Success criteria**: Toàn bộ test trong `reading-annotations.test.ts` và `apps/web/src/components/ui/rich-text-body.test.tsx` pass; `RichTextBody` không đổi contract.
- **Verify**: `pnpm --filter @teacher-os/ui test src/lib/reading-annotations.test.ts && pnpm --filter web test src/components/ui/rich-text-body.test.tsx && pnpm --filter @teacher-os/ui check-types` exits 0.

### Task 1.4 — Verify WCAG AA contrast of Reading highlight tokens and check package lint
<!-- Updated: Red-Team RT-9, RT-13 - check both text and border contrast pairs + web RichTextBody test -->
- **Goal**: Xác minh toán học tương phản giữa `--foreground` trên `--reading-highlight` (≥ 4.5:1 AA) và giữa `--reading-highlight-border` trên `--background` & `--reading-highlight` (≥ 3.0:1 WCAG 1.4.11) ở cả Light và Dark mode, rồi chạy Biome + UI & Web RichTextBody tests.
- **Target files and symbols**: `packages/ui/src/styles/globals.css`, `packages/ui/src/lib/reading-annotations.ts`, `packages/ui/src/components/assignments/rich-text-body.tsx`.
- **Steps**:
  1. Chạy script node tính relative luminance (OKLCH → linear sRGB → WCAG contrast ratio) cho:
     - Light text: `--foreground` (`oklch(0.145 0 0)`) trên `--reading-highlight` (`oklch(0.93 0.11 95)`) → phải ≥ 4.5:1.
     - Dark text: `--foreground` (`oklch(0.985 0 0)`) trên `--reading-highlight` (`oklch(0.37 0.08 86)`) → phải ≥ 4.5:1.
     - Light border: `--reading-highlight-border` (`oklch(0.56 0.15 78)`) trên `--background` (`oklch(1 0 0)`) và trên `--reading-highlight` (`oklch(0.93 0.11 95)`) → cả 2 phải ≥ 3.0:1.
     - Dark border: `--reading-highlight-border` (`oklch(0.78 0.14 86)`) trên `--background` (`oklch(0.145 0 0)`) và trên `--reading-highlight` (`oklch(0.37 0.08 86)`) → cả 2 phải ≥ 3.0:1.
     (Nếu bất kỳ cặp nào dưới ngưỡng, tinh chỉnh lightness ngay trong `globals.css` và đo lại.)
  2. Chạy Biome check, toàn bộ `@teacher-os/ui` tests, `apps/web` `rich-text-body.test.tsx`, và typecheck.
- **Success criteria**: Mọi cặp contrast đạt chuẩn WCAG AA / 1.4.11; lint, typecheck và unit test pass.
- **Verify**: `pnpm exec biome check packages/ui/src/styles/globals.css packages/ui/src/lib/reading-annotations.ts packages/ui/src/lib/reading-annotations.test.ts packages/ui/src/components/assignments/rich-text-body.tsx && pnpm --filter @teacher-os/ui test && pnpm --filter web test src/components/ui/rich-text-body.test.tsx && pnpm --filter @teacher-os/ui check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
