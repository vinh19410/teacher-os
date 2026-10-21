---
phase: 1
title: "Module thuần essay-plain.ts + bản đồ offset hai chiều (TDD)"
status: completed
priority: P1
effort: "1.5h"
---

# Phase 1: Module thuần `essay-plain.ts` + bản đồ offset hai chiều (TDD)

## Goal

Cung cấp bộ chuyển đổi thuần (không DOM, chạy giống hệt trên workerd và browser)
từ `rawEssay` sang `PlainEssayView = { text, rawStart, rawEnd, rawLength }` cùng
hai hàm ánh xạ `plainToRaw` / `rawToPlain` đối xứng, có fast path identity cho
mọi essay plain text.

## Files to Create or Modify

- Create: `packages/api/src/lib/essay-plain.ts`
- Create: `packages/api/src/lib/essay-plain.test.ts`

## Tasks & Steps

### Task 1.1 — Viết bộ unit test trước (TDD Red)

- **Goal:** Có đầy đủ test khoá mọi quy tắc của `essayToPlain`, `plainToRaw`,
  `rawToPlain`, và test chạy báo lỗi vì module chưa tồn tại.
- **Target files and symbols:** `packages/api/src/lib/essay-plain.test.ts`
  (import `essayToPlain`, `plainToRaw`, `rawToPlain` từ `./essay-plain`).
- **Steps:**
  1. Tạo `packages/api/src/lib/essay-plain.test.ts` kiểm các nhóm:
     - **Fast path plain text:** chuỗi rỗng, văn bản nhiều dòng `\n`, CRLF
       `\r\n`, khoảng trắng kép, tab, biểu thức `a < b && c > d`,
       `"if a<b and c>d"` (không nhận nhầm `<b ...>`), `"x <i and y> z"`,
       trái tim `I <3 coding`, thẻ giả `<notatag>` → `view.text === raw`,
       `view.rawStart === null`, `view.rawEnd === null`, `plainToRaw(view, 2, 7)`
       trả `{ start: 2, end: 7 }`, `rawToPlain(view, 2, 7)` trả `{ start: 2, end: 7 }`.
     - **Thẻ khối (mở & đóng) và `<br>`:**
       - `<p>First paragraph.</p><p>Second paragraph.</p>` →
         `"First paragraph.\nSecond paragraph."`.
       - `Intro<p>Para</p>` → `"Intro\nPara"` (thẻ khối mở cũng ngắt dòng).
       - `<p></p><p>Bc</p>` → `"Bc"` (thẻ khối rỗng ở đầu không phát `\n` giữa từ).
       - `<p>A</p><p></p><p>B</p>` → `"A\nB"`.
       - `<p>\n  Hello</p>` → `"Hello"` (bỏ whitespace ASCII dẫn đầu khi `out` rỗng).
       - `<p>Line 1<br>Line 2<br/>Line 3</p>` → `"Line 1\nLine 2\nLine 3"`.
       - Khoảng trắng chỉ chứa `\n`/` `/`\t` nằm giữa `</p>` và `<p>` không sinh
         thêm dòng trống thừa: `<p>A</p>\n  <p>B</p>` → `"A\nB"`.
       - Thẻ khối cuối bài không sinh `\n` thừa ở đuôi; bài trống `<p></p>` → `""`.
     - **Thẻ inline, thẻ lạ, và dấu `<` trần trong HTML:**
       - `<p>Remote <strong>learning</strong> has <em>widened</em> the gap.</p>`
         → `"Remote learning has widened the gap."`.
       - `<p>Score <3 and <o:p>word</o:p></p>` → `"Score <3 and word"` (`<3` giữ
         nguyên literal 1:1, thẻ lạ `<o:p>` bị bỏ).
     - **HTML entities (named + numeric dec/hex + invalid + astral):**
       - `<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39; &apos;G&apos; H&nbsp;I &#65; &#x42; &mdash; &rsquo;</p>`
         → `"A & B < C > D \"E\" 'F' 'G' H\u00a0I A B \u2014 \u2019"`.
       - Entity không hợp lệ (`&#0;`, `&#99999999;`, `&#xD800;`, `&unknown;`) giữ
         nguyên literal từng ký tự: `<p>a &#99999999; &#0; &unknown; b</p>` →
         `"a &#99999999; &#0; &unknown; b"`.
       - Astral entity `&#x1F600;` (2 UTF-16 code units): `"<p>a &#x1F600; b</p>"`
         cho `view.text === "a 😀 b"` (`view.text.length === 6`); span cắt ngang
         surrogate (`2..3` hoặc `3..4`) khi `plainToRaw` rồi `rawToPlain` chuẩn
         hoá về `{ start: 2, end: 4 }` (phủ trọn cả 2 code units).
     - **Bỏ `<script>`, `<style>` và comment `<!--...-->` kèm nội dung:**
       `<p>Safe</p><!-- hidden --><script>alert(1)</script><style>body{}</style><p>Text</p>`
       → `"Safe\nText"`.
     - **Đối xứng `plainToRaw` ↔ `rawToPlain`:**
       - Với `<p>A</p><p>B &amp; C</p>` (`text = "A\nB & C"`):
         chọn `"B & C"` trên plain (`2..7`) → `plainToRaw` trả `{ start: 11, end: 20 }`
         (`raw.slice(11, 20) === "B &amp; C"`), và `rawToPlain(view, 11, 20)` trả
         lại `{ start: 2, end: 7 }`.
       - Chọn riêng ký tự `&` (`4..5` trên plain) → `plainToRaw` trả `{ start: 13, end: 18 }`
         (`"&amp;"`), `rawToPlain(view, 13, 18)` trả `{ start: 4, end: 5 }`.
       - Chọn `"learning"` trong `<p>Remote <strong>learning</strong> gap</p>` →
         `raw.slice(rawSpan.start, rawSpan.end) === "learning"`, round-trip khớp.
     - **Span raw nằm trọn trong thẻ hoặc ngoài biên:**
       - `rawToPlain(view, 0, 3)` trên `<p>Hello</p>` (phủ đúng `<p>`) → `null`.
       - `rawToPlain` với `start >= end`, `start < 0`, `end > raw.length` → `null`.
       - `plainToRaw` với `start >= end`, `start < 0`, `end > view.text.length` → `null`.
     - **Kết hợp `snapSpanToWords` + `segmentEssay`:** bôi đen một phần từ
       `"learn"` trên `view.text` → `snapSpanToWords` bắt dính `"learning"` →
       `plainToRaw` → `rawToPlain` → `segmentEssay(view.text, [ann])` tạo đúng
       1 segment highlight có `text === "learning"`.
- **Success criteria:** File test tồn tại và khi chạy vitest báo fail do chưa có
  `./essay-plain`.
- **Verify:** `pnpm --filter @teacher-os/api exec vitest run src/lib/essay-plain.test.ts`
  exits non-zero (expected red state: module `./essay-plain` not found).

### Task 1.2 — Cài đặt `packages/api/src/lib/essay-plain.ts` (TDD Green)

- **Goal:** Cài đặt `essayToPlain`, `plainToRaw`, `rawToPlain` thuần để toàn bộ
  unit test ở Task 1.1 pass.
- **Target files and symbols:** `packages/api/src/lib/essay-plain.ts`
  (exports: `PlainEssayView`, `OffsetSpan`, `essayToPlain`, `plainToRaw`, `rawToPlain`).
- **Steps:**
  1. Khai báo kiểu:
     ```ts
     export type PlainEssayView = {
     	text: string;
     	/** null khi fast path (essay không chứa thẻ HTML đã biết). */
     	rawStart: ReadonlyArray<number> | null;
     	rawEnd: ReadonlyArray<number> | null;
     	rawLength: number;
     };
     export type OffsetSpan = { start: number; end: number };
     ```
  2. **Heuristic nhận HTML chặt:** chỉ coi `raw` là HTML khi có **thẻ đóng** thuộc
     whitelist hoặc `<br>`/`<hr>`:
     `/<\/(?:p|div|li|h[1-6]|blockquote|pre|ul|ol|strong|em|b|i|u|s|sub|sup|span|a|code|script|style)\s*>|<(?:br|hr)\s*\/?>/i`.
     Nếu không khớp → trả `{ text: raw, rawStart: null, rawEnd: null, rawLength: raw.length }`.
  3. **Tokenizer thuần (một lượt quét `0..raw.length`):**
     - Tại vị trí `i` có `raw[i] === "<"`:
       - Nếu khớp comment `^<!--[\s\S]*?-->`: nhảy qua hết comment.
       - Nếu khớp khối `^<(script|style)\b[^<>]*>[\s\S]*?<\/\1\s*>` (case-insensitive):
         nhảy qua toàn bộ khối, không phát ký tự.
       - Nếu khớp mẫu thẻ hợp lệ `^<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*)?\/?>`:
         - Lấy `tagName = match[1].toLowerCase()`, `tagEnd = i + match[0].length`.
         - Nếu `tagName === "br"`: nếu đang có `pendingBlockBreak` thì xoá
           `pendingBlockBreak`; đẩy `"\n"` với `rawStart = i, rawEnd = tagEnd`.
         - Nếu `tagName` thuộc tập thẻ khối (`p, div, li, h1, h2, h3, h4, h5, h6,
           blockquote, pre, ul, ol, hr`) — bất kể thẻ mở hay thẻ đóng: gán
           `pendingBlockBreak = { start: i, end: tagEnd }`.
         - Mọi thẻ hợp lệ khác (inline hoặc thẻ lạ như `o:p`): bỏ qua, nhảy `i = tagEnd`.
       - Nếu `<` không khớp mẫu thẻ hợp lệ (ví dụ `<3` hoặc `<` không có `>`):
         xử lý như ký tự text literal ở bước dưới.
     - Khi ở ngoài thẻ (ký tự text hoặc entity):
       - Nếu là whitespace ASCII (` `, `\t`, `\r`, `\n`) và (`out.length === 0`
         hoặc `pendingBlockBreak !== null`): bỏ qua `i++` (không phát whitespace
         dẫn đầu bài hoặc whitespace thuần giữa hai ranh giới khối).
       - Khi gặp ký tự nội dung đầu tiên (không phải whitespace bị bỏ ở trên):
         nếu `pendingBlockBreak !== null`:
         - Lưu `const brk = pendingBlockBreak; pendingBlockBreak = null;`
           (**luôn xoá `pendingBlockBreak`** dù có phát `"\n"` hay không).
         - Nếu `out.length > 0 && out[out.length - 1] !== "\n"`, đẩy `"\n"` với
           `rawStart = brk.start, rawEnd = brk.end`.
       - Kiểm tra HTML entity tại `i` với `^&(#\d+|#x[0-9a-fA-F]+|[A-Za-z]+);`:
         - Giải mã theo bảng named (`amp: "&", lt: "<", gt: ">", quot: '"',
           apos: "'", nbsp: "\u00a0", rsquo: "\u2019", lsquo: "\u2018",
           rdquo: "\u201d", ldquo: "\u201c", mdash: "\u2014", ndash: "\u2013",
           hellip: "\u2026"`) hoặc numeric (`cp > 0 && cp <= 0x10ffff &&
           (cp < 0xd800 || cp > 0xdfff)` → `String.fromCodePoint(cp)`).
         - Nếu giải mã hợp lệ thành chuỗi `decoded`: với mỗi UTF-16 code unit
           `k` của `decoded`, đẩy `decoded[k]` kèm `rawStart = i`,
           `rawEnd = i + entityMatch[0].length`; nhảy `i += entityMatch[0].length`.
         - Nếu không hợp lệ (tên entity lạ hoặc code point `0`/surrogate/overflow):
           xử lý `raw[i]` (`"&"`) như ký tự literal 1:1 (`rawStart = i, rawEnd = i + 1`).
       - Ký tự thường: đẩy `raw[i]` với `rawStart = i, rawEnd = i + 1`, `i++`.
  4. **Hàm `plainToRaw(view, start, end)`:**
     - Kiểm biên nguyên: `0 <= start < end <= view.text.length`, sai → `null`.
     - Nếu `view.rawStart === null || view.rawEnd === null` → `{ start, end }`.
     - Trả `{ start: view.rawStart[start]!, end: view.rawEnd[end - 1]! }`.
  5. **Hàm `rawToPlain(view, start, end)`:**
     - Kiểm biên nguyên: `0 <= start < end <= view.rawLength`, sai → `null`.
     - Nếu `view.rawStart === null || view.rawEnd === null` → `{ start, end }`.
     - Tìm `lo` nhỏ nhất sao cho `view.rawEnd[lo]! > start` và
       `view.rawStart[lo]! < end`; tìm `hi` lớn nhất sao cho
       `view.rawStart[hi]! < end` và `view.rawEnd[hi]! > start`. Nếu không có
       (`lo > hi`) → `null`; ngược lại trả `{ start: lo, end: hi + 1 }`.
- **Success criteria:** Toàn bộ unit test trong `essay-plain.test.ts` và các
  test hiện có của `@teacher-os/api` pass, typecheck sạch.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter @teacher-os/api check-types`
  exits 0.

## Verification

- `pnpm --filter @teacher-os/api test` exits 0 (bao gồm `essay-plain.test.ts` và
  `essay-annotations.test.ts`).
- `pnpm --filter @teacher-os/api check-types` exits 0.

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
