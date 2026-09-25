---
phase: 2
title: "Option bank có cấu trúc cho các dạng matching + map"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Option bank có cấu trúc cho 5 dạng matching (sharedOpts)

## Context Links

- [Research authoring UI/UX](./reports/research-authoring-ui-ux.md) — Family C + nguyên tắc P3 (Moodle/Canvas pairs + dropdown).
- [Scout codebase](./reports/scout-codebase.md) — khoảng trống 1: bank nằm trong text tự do `intro`; `TYPE_HINTS` hiện hướng dẫn giáo viên gõ bank A–H vào ô intro.
- Plan #269 Decision 1: follow-up `sharedOpts` đã được dự kiến từ iteration trước.

## Overview

- **Priority:** P1 — vá lỗ hổng dữ liệu thật: 5 dạng matching (`headings, info, sentend, features` + listening `match2`) hiện lưu ngân hàng lựa chọn trong `intro` text tự do, không validate giữa bank và đáp án.
- **Mô tả:** Thêm trường `optionBank: string[]` vào prompt (cột DB + contract + web). Giáo viên nhập bank qua danh sách dòng tự gán nhãn (A/B/C… hoặc i/ii/iii… theo kind); đáp án từng câu chọn qua dropdown/chip giới hạn trong bank. Preview render bank thành danh sách đánh số thay vì diễn giải text. Bankable set là cặp (skill, type): 5 dạng matching (headings, info, sentend, features, match2) + listening `map`.

## Key Insights

- `headings` dùng kind `roman` (`answerKindByType` tại `contracts.ts:322-337`): nhãn hiển thị là số La Mã `i–viii` (`ASSIGNMENT_ANSWER_CHOICES.roman`), key lưu trên wire vẫn là chữ số La Mã — bank index ↔ nhãn là bài toán ánh xạ thuần UI. Nhãn chỉ có 8 giá trị (A–H / i–viii): **bank cap = 8**.
- Luồng GHI không phải pass-through: `POST /prompts` map từng trường tường minh vào insert + `.returning({ id })` (`apps/server/src/routes/assignments/index.ts:65-93`). Luồng ĐỌC là `loadSnapshot` trong `apps/server/src/routes/snapshot.ts` — destructuring trường tường minh (`snapshot.ts:351-396`) và `parseQuestions` tái cấu trúc question item chỉ còn `{stem, opts, answer, alts}` (`snapshot.ts:76-110`). **Thêm field mới phải sửa đủ: schema → insert → snapshot destructure → `KernelAssignmentPromptRow` → repo projection → type mock-data → PreviewDraft**, nếu không dữ liệu lưu được nhưng biến mất ngay lần reload đầu.
- Contract `.strict()` áp cho object NGOÀI (`contracts.ts:392`); inner question object KHÔNG strict (zod strip mode) — với `optionBank` (field ngoài), server cũ sẽ 400 rõ ràng khi deploy lệch; sync mirror 3 nơi vẫn là bắt buộc.
- Quy tắc dùng lại theo format chính thức (nghiên cứu trong repo `plans/260925-0515.../reports/research-ielts-formats.md`): chỉ `sentend` là mỗi lựa chọn dùng đúng 1 lần; `features` được dùng lại. Enforce distinct **chỉ** với `sentend`.
- Hiện **không có edit flow** cho prompt (route chỉ insert; không có đường load prompt vào composer) — bank rules áp cho tạo mới; đề cũ lưu bank trong `intro` vẫn hiển thị fallback như cũ.

## Requirements

**Functional**
- FR1: Cột `assignment_prompt.option_bank` TEXT NOT NULL DEFAULT `"[]"`; migration sinh bằng `pnpm db:generate`, chạy `pnpm db:migrate:deploy`.
- FR2: Contract: `optionBank: z.array(z.string().trim().min(1).max(200)).max(8).default([])`. **Bankable set là cặp (skill, type)** — `map` là type-id dùng chung writing task1 (không có câu hỏi) và listening s2: `{(reading, headings), (reading, info), (reading, sentend), (reading, features), (listening, match2), (listening, map)}`. `superRefine` với cặp bankable khi status `ready`:
  - `optionBank.length` từ 2 đến 8 và `≥ số câu`;
  - `questions.length ≤ 8` (giới hạn số nhãn A–H / i–viii — khớp số câu thực tế của dạng matching IELTS, tránh mâu thuẫn với `questions.max(40)` toàn cục);
  - mỗi answer ≠ rỗng phải là nhãn hợp lệ của kind và nhãn tồn tại trong bank (index < `optionBank.length`);
  - riêng `sentend`: các answer phải đôi một khác nhau.
- FR3: Composer: panel "Ngân hàng lựa chọn" — mỗi dòng một input, nhãn tự sinh theo kind (`A, B, C…` hoặc `i, ii, iii…`); thêm/xóa dòng đánh số lại; nút "điền đủ N mục" với N = min(số câu + 2, 8). **Xóa dòng i → mọi answer có nhãn ≥ nhãn vị trí i bị reset `answer=""`** (nhãn là positional — sau renumber, nhãn cũ trỏ sang option khác; reset là cách duy nhất tránh re-bind âm thầm sinh key chấm sai).
- FR4: Key của từng câu chọn bằng dropdown (thực thi: chip trong answer-key-grid của Phase 1, nguồn = bank hiện có) thay vì gõ chữ; lựa chọn đã dùng ở câu khác (khi `sentend`) hiển thị mờ + không chọn được.
- FR5: `intro` trở về vai trò câu lệnh; placeholder của `features`/`sentend` trong `TYPE_HINTS` bỏ hướng dẫn "liệt kê A–H tại đây".
- FR6: Preview (student-preview-paper + prompt-preview-aside) render `optionBank` thành danh sách nhãn — nội dung; nếu `optionBank` rỗng (đề cũ) fallback hiển thị như cũ (intro text) kèm cảnh báo "Thiếu ngân hàng lựa chọn" thay vì im lặng.
- FR7: Toàn bộ chuỗi đọc-ghi đủ trường: insert route map `option_bank` + snapshot destructure trả `optionBank` + `KernelAssignmentPromptRow` thêm field + repo projection (`repos/assignment-prompts.ts`) + type `AssignmentPrompt` (mock-data) + `PreviewDraft`/`savePreviewDraft` mang bank qua đường preview. **E2E phải assert round-trip qua ngân hàng đề (snapshot) chứ không chỉ POST 201.**

**Non-functional**
- Bank rules chỉ áp khi **tạo mới** (đường duy nhất hiện có) — đề cũ matching với bank trong `intro` không bị chặn gì vì không tồn tại đường re-save; câu "đề cũ không bị validate chặn" chỉ đúng trong bối cảnh đó.

## Architecture

```mermaid
flowchart LR
  A[Composer: option-bank-editor.tsx mới] -->|optionBank string[]| B[new.tsx ComposerValue]
  B -->|payload| C[POST /prompts insert map tường minh]
  C --> D[(assignment_prompt.option_bank)]
  D -->|snapshot destructure + parseQuestions| E[KernelAssignmentPromptRow]
  E --> F[repos projection → UI bank]
  B --> E2[answer-key-grid: choice-row nguồn = bank]
  B -->|PreviewDraft sessionStorage| G[preview: render bank danh sách]
```

- Nhãn hiển thị sinh từ kind qua helper `bankLabel(kind, index)` (A… hoặc i…); key lưu trên wire = nhãn (giữ nguyên wire format `answer` hiện có, không đổi consumers).

## Related Code Files

- Modify: `packages/db/src/schema/assignment-prompt.ts` (cột `option_bank`) + migration mới qua `pnpm --filter db db:generate`
- Modify: `packages/api/src/contracts.ts` (schema field + superRefine rules + `KernelAssignmentPromptRow`/`AssignmentQuestion`)
- Modify: `apps/server/src/routes/assignments/index.ts` (insert map thêm `option_bank`)
- Modify: `apps/server/src/routes/snapshot.ts` (destructure prompt + trả `optionBank` cho web)
- Create: `apps/web/src/components/assignments/option-bank-editor.tsx`
- Modify: `apps/web/src/components/assignments/assignment-presets.ts` (bankablePairs, `bankLabel`, cập nhật TYPE_HINTS)
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` (ComposerValue + canSave mirror FR2)
- Modify: `apps/web/src/lib/repos/assignment-prompts.ts` + `apps/web/src/lib/mock-data.ts` (projection/type thêm field)
- Modify: `apps/web/src/lib/assignment-preview-draft.ts` + gọi site `new.tsx:373-392` (PreviewDraft mang bank)
- Modify: `apps/web/src/components/assignments/question-key-editor.tsx` + `answer-key-grid.tsx` (dropdown/chips nguồn bank, gray-out sentend)
- Modify: `apps/web/src/components/assignments/student-preview-paper.tsx`, `prompt-preview-aside.tsx` (render bank + fallback cảnh báo)
- Modify: `apps/web/src/components/assignments/assignment-presets.test.ts` (sync test mở rộng phủ bank rules)
- Modify: `apps/e2e/specs/assignment-prompt-reading-types.spec.ts` (features với bank; round-trip qua snapshot; leak-check giữ nguyên)

## Implementation Steps

1. DB: thêm cột + `pnpm --filter db db:generate` → commit migration; **thứ tự deploy production: `db:migrate:deploy` TRƯỚC khi deploy worker** (worker mới insert `option_bank` vào DB chưa có cột sẽ 500 mọi lần tạo đề); rollback: lùi code an toàn sau khi migration đã chạy vì cột có default `"[]"`.
2. Contract: thêm field + rules superRefine FR2 + mở rộng `KernelAssignmentPromptRow`; chạy test API hiện hữu, thêm case cho từng rule.
3. Web helpers: `bankablePairs` set + `bankLabel(kind, i)` trong `assignment-presets.ts`; mở rộng sync test.
4. `option-bank-editor.tsx`: danh sách dòng, nhãn tự sinh, thêm/xóa/đánh số lại (kèm luật reset answer khi xóa dòng — FR3), nút điền đủ min(N+2, 8).
5. Grid Phase 1: choice-row đọc bank (props) — chip disabled + mờ nếu `sentend` và nhãn đã dùng.
6. `new.tsx`: thêm `optionBank` vào ComposerValue/emptyComposer; mirror FR2 trong `canSave`/`fieldErrors`; reset logic: đổi giữa 2 dạng bankable cùng skill → GIỮ bank; đổi sang/khỏi bankable → reset bank.
7. Đường đọc: snapshot destructure + repo projection + mock-data type + PreviewDraft mang `optionBank` (FR7) — thiếu bước này dữ liệu lưu nhưng không bao giờ hiển thị lại.
8. Preview: render bank khi có; fallback cũ + cảnh báo khi rỗng; prompt-preview-aside thêm khối bank.
9. E2E: features — nhập bank 5 mục, 4 câu, chốt key dropdown, save ready, **reload ngân hàng đề assert bank hiển thị**; sentend — chặn chọn trùng; xóa bank row giữa sau khi khóa → key bị reset; đề cũ không bank vẫn preview fallback.

## Todo List

- [ ] Cột DB + migration (+ ghi chú thứ tự deploy)
- [ ] Contract field + superRefine + KernelAssignmentPromptRow + test API
- [ ] `bankablePairs`/`bankLabel` + sync test
- [ ] `option-bank-editor.tsx` (kèm reset answer khi xóa dòng)
- [ ] Grid dropdown nguồn bank + gray-out sentend
- [ ] ComposerValue/canSave mirror + reset rules
- [ ] Snapshot + repo projection + mock-data + PreviewDraft mang bank
- [ ] Preview render bank + fallback cảnh báo
- [ ] E2E features/sentend/xóa-row/đề cũ/round-trip snapshot

## Success Criteria

- Tạo đề features với bank 5 mục + 4 câu khóa bằng dropdown, save `ready` không 400; nhập thiếu bank → lỗi hiển thị tại panel bank và tại hàng câu; **reload ngân hàng đề → bank hiển thị đúng** (round-trip qua snapshot).
- sentend không thể chốt 2 câu cùng nhãn (UI chặn + contract từ chối); xóa dòng bank giữa sau khi khóa → các key sau vị trí xóa bị reset, không save ready được cho đến khi khóa lại.
- Đề cũ không bank vẫn load/preview fallback bình thường (không tồn tại đường re-save nên không bị chặn).
- Verification: `pnpm test` + `pnpm --filter e2e exec playwright test assignment-prompt-reading-types.spec.ts` pass; migration deploy được trên dev DB, kèm ghi chú thứ tự deploy production.

## Risk Assessment

- Wire format `answer` = nhãn (A/i) và nhãn là positional: xóa/renumber dòng bank làm lệch nghĩa nhãn — luật reset key khi xóa dòng (FR3) là bắt buộc; thêm e2e riêng.
- Object ngoài `.strict()` nghĩa là server cũ nhận payload có `optionBank` sẽ 400 khi deploy lệch — merge contract+web+server trong cùng PR (đã là ràng buộc 1-PR-per-phase) và migration chạy trước worker.
- Preview fallback đôi đường: bank rỗng mà intro không chứa danh sách → hiển thị cảnh báo "Thiếu ngân hàng lựa chọn" thay vì im lặng.
- Nhãn chỉ có 8 giá trị: cap bank 8 + questions ≤ 8 cho bankable types chặn triệt để tình trạng bank item không có nhãn hợp lệ.

## Security Considerations

- `optionBank` là string list: trim + max 200 ký tự/mục, max 10 mục — không có đường injection mới (render text thuần như intro hiện tại).
- Không đổi auth/org scoping của route.

## Next Steps

- Phase 3 dựng trên text-row của grid: stem cho completion chuyển sang sinh từ cloze editor.
