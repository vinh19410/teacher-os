---
title: "Essay Writing chứa HTML: render plain an toàn + giữ đúng offset highlight"
description: "Màn chấm và màn kết quả Writing hiện thẻ <p> nguyên chữ khi essay trong DB chứa HTML. Chuẩn hoá HTML → plain text ở server khi đọc (module thuần có bản đồ offset raw↔plain), remap highlight để mọi offset client nhìn thấy là offset plain, giữ nguyên hệ thống annotation."
status: pending
priority: P1
effort: "4h"
issue: 382
branch: ai-handle-issue-382
tags: [bugfix, backend, grading, quiz]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Essay Writing chứa HTML: render plain + giữ offset highlight

## Overview

`quiz_attempt.essay` không được đảm bảo plain text: ô nhập của học viên là textarea
plain (`quiz-essay-input.tsx`) nhưng dữ liệu seed/sample/user trong DB có chứa HTML
(`<p>…</p>`). `EssayWithHighlights` render mỗi segment là một JSX text node với
`data-start` — cố ý plain, nên thẻ `<p>` hiện nguyên chữ trên màn chấm giáo viên
lẫn màn kết quả học viên (#382).

Không thể parse HTML ở render: hệ thống highlight (#332/#336) khóa offset ký tự
UTF-16 trên **raw essay string** — teacher bôi đen trên DOM → offset =
`data-start` + caret; server validate `isValidAnnotationSpan(essay_raw, start, end)`;
`segmentEssay` cắt raw string. Mọi biến đổi hiển thị phải giữ ánh xạ DOM ↔ raw.

**Hướng (kongming GO 2026-10-21): chuẩn hoá HTML → plain MỘT LẦN ở server khi
đọc**, kèm bản đồ offset hai chiều raw↔plain. Mọi đường trả essay/annotations cho
client trả **plain text + plain offsets**. Khi client gửi offset (POST highlight),
server map ngược plain→raw rồi lưu raw như trước. DB không đổi schema, không
migration. Client không đổi code.

Kết quả người dùng: không còn thấy `<p>` trên màn chấm và màn kết quả; số từ
`countWords` đếm theo text thật; highlight + ghi chú inline vẫn đúng vị trí.

## Key Decisions (kongming counsel 2026-10-21)

1. **Normalize-on-read, không normalize khi ghi.** PATCH essay không strip:
   textarea chỉ sinh plain, và strip khi ghi có nguy cơ sửa nhầm bài viết thật có
   `a < b` hay `<3`. Textarea resume (`GET /assignments/:assignmentId/quiz`) trả
   essay đã plain — lần autosave sau sẽ tự ghi plain (attempt chưa nộp thì không
   có highlight, an toàn).
2. **Module thuần mới `essay-plain.ts`, KHÔNG dùng `htmlToPlainText` hiện có**
   trong `packages/api/src/rich-text.ts`: hàm đó dùng `DOMParser` ở browser và
   regex ở workerd (khác kết quả), có `normalizeSpacing` gộp khoảng trắng + trim
   (làm offset dịch không map được), và không có bản đồ offset.
3. **Heuristic nhận HTML phải chặt**: chỉ coi là HTML khi có **thẻ đóng** thuộc
   whitelist (`</p>, </div>, </li>, </h1..6>, </blockquote>, </pre>, </ul>, </ol>,
   </strong>, </em>, </b>, </i>, </u>, </s>, </sub>, </sup>, </span>, </a>,
   </code>, </script>, </style>`) hoặc thẻ tự đóng `<br>`/`<hr>`.
   Essay plain có `"a<b and c>d"`, `"x <i and y> z"`, `<3` không khớp thẻ đóng
   nào nên đi fast path — trả nguyên bản từng byte, mọi annotation cũ giữ nguyên offset.
4. **Bản đồ offset**: cặp mảng `(rawStart[i], rawEnd[i])` ghi đoạn raw sinh ra
   ký tự plain thứ `i` (entity 5–6 ký tự như `&amp;` có `rawEnd[i] = rawStart[i] + 5`,
   ký tự thường có `rawEnd[i] = rawStart[i] + 1`).
   `plainToRaw(view, start, end)` → `{ start: rawStart[start], end: rawEnd[end-1] }`
   (phủ trọn entity ở cuối đoạn, đối xứng hoàn toàn với `rawToPlain`).
   `rawToPlain(view, start, end)` → span plain tương ứng, `null` nếu rỗng
   (span nằm trọn trong thẻ). Map tăng đơn điệu nên `overlapsAny` so trên raw
   tương đương so trên plain.
5. **Quy tắc sinh plain**: cả thẻ mở lẫn thẻ đóng khối (`p, div, li, h1–h6,
   blockquote, pre, ul, ol`) và `<hr>` đặt `pendingBlockBreak` — khi gặp ký tự
   nội dung đầu tiên sau đó thì **luôn xoá `pendingBlockBreak`** (và chỉ phát
   `"\n"` nếu `out` đã có ký tự và ký tự cuối chưa phải `"\n"`), đồng thời bỏ
   whitespace ASCII dẫn đầu khi `out` còn rỗng. `<br>` → `"\n"`. `<script>`/`<style>`
   và comment `<!--...-->` bỏ cả nội dung. Thẻ = `<\/?[A-Za-z][^<>]*>`, dấu `<`
   không khớp mẫu thẻ giữ nguyên literal 1:1. Named entities trong tập cố định
   (`amp, lt, gt, quot, apos, nbsp, rsquo, lsquo, rdquo, ldquo, mdash, ndash, hellip`)
   và numeric (`&#dd;`, `&#xhh;` hợp lệ `> 0`, `<= 0x10FFFF`, ngoài surrogate)
   decode và gán `rawStart`/`rawEnd` trỏ toàn bộ entity; entity không hợp lệ giữ
   nguyên literal từng ký tự.
6. **Mọi offset client nhìn thấy là plain**: response 201/200 của POST/PATCH
   annotation đều trả `toPlainAnnotation(view, toEssayAnnotation(row))` (tức
   `rawToPlain` từ span raw đã lưu), đảm bảo 201 khớp tuyệt đối với GET kể cả
   khi có astral entity.
7. **Annotation cũ có span nằm trọn trong thẻ** (ví dụ `0..3` phủ `<p>`):
   `rawToPlain` trả `null` → `toEssayView` bỏ annotation đó khỏi payload
   (client `segmentEssay` vốn bỏ annotation sai biên — UI không vỡ). DB giữ
   nguyên dòng.
8. **Không đổi schema, không migration, không đổi client component** (web lẫn
   student). Fast path essay plain: `text === raw` + `rawStart = rawEnd = null`,
   zero biến đổi.

## Non-Goals

- Render rich thật (bold/italic giữ nguyên định dạng) — cần mapping layer DOM
  (hướng B, kongming NO-GO cho beta). Mất định dạng inline được chấp nhận, ghi rõ
  trong PR.
- Strip HTML khi ghi PATCH essay.
- Migration/remap dữ liệu `quiz_attempt_annotation` trong DB.
- Đổi `RichTextBody`/prompt rendering (đề bài đã render đúng).
- Sửa spec `teacher-essay-annotations.spec.ts` ngoài case HTML mới: spec ĐÃ XANH
  trên develop HEAD `bafa6e2` (chạy 2 lần local 2026-10-21, 2/2 pass) — báo cáo
  "fail trên develop" không tái hiện; KHÔNG nới assertion nào.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Module thuần `essay-plain.ts` + map offset (TDD)](./phase-01-essay-plain-lib.md) | pending | 1.5h |
| 2 | [Server: `toEssayView` + wiring 6 đường đọc/ghi](./phase-02-server-essay-view.md) | pending | 1.5h |
| 3 | [E2E case essay HTML + gates cuối](./phase-03-e2e-gates.md) | pending | 1h |

Chạy tuần tự 1 → 2 → 3.

## Success Criteria

- [ ] `GET /api/student/attempts/:id` và `GET /api/grading/:id` trả essay plain
      (không còn `<p>` trong DOM `[data-testid="essay-text"]`/khối bài viết) khi
      DB chứa `<p>A</p><p>B &amp; C</p>` → client thấy `A\nB & C`.
- [ ] Essay plain bất kỳ (`a < b`, `<3`, tab, khoảng trắng kép, CRLF): mọi
      endpoint trả nguyên bản từng byte; toàn bộ test hiện có pass KHÔNG sửa
      expectation.
- [ ] Vòng trọn: teacher bôi đen `B & C` trên màn chấm → 201 trả offset plain
      khớp GET submission → reload mark đúng chỗ → học viên thấy
      `mark[data-n]` + `essay-inline-note` đúng vị trí, không thấy thẻ HTML.
- [ ] `countWords` đếm theo plain (không đếm thẻ) trên cả 2 màn.
- [ ] Annotation cũ có span trọn trong thẻ bị bỏ khỏi payload, không vỡ UI.
- [ ] e2e case essay HTML xanh; `pnpm check`, `pnpm check-types`, unit test
      `apps/server` + `packages/api` xanh.
