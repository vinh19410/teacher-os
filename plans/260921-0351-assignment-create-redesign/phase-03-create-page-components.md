---
phase: 3
title: "Trang tạo đề 4 kỹ năng + components"
status: completed
priority: P1
effort: "6h"
dependencies: ["2"]
---

# Phase 3: Trang tạo đề 4 kỹ năng + components

## Goal

Dựng lại `/assignments/new` đúng thiết kế v5: composer 3 tầng picker (skill → part → type) + fields theo kỹ năng + q-editor/answer key + audio metadata + cue card, preview live, bank card filter skill + grade banner, action bar state machine 6 bậc, success card meta mở rộng. Giữ nguyên pattern useState + `useKernelFormSubmit` và mọi label mà E2E hiện tại đang khóa.

## Context Links

- Spec: [../research/design-spec.md](../research/design-spec.md) (§1–§7 — bố cục, composer, bank card, preview, action bar, success, reset)
- Mock chuẩn: `assignment-create-5.html` dòng 743–771 (`emptyItem`/`cloneItems`), dòng 779–813 (`applyDefaults`), dòng 889–907 (`canSave`/`answersReady`), dòng 839–1006 (`renderQList/renderUpload/renderBank/renderPreview/action bar`)
- Trang hiện tại: `apps/web/src/routes/_auth/assignments/new.tsx` (262 dòng, useState thuần), components `apps/web/src/components/assignments/` (prompt-composer, bank-context-card, student-preview-paper, create-success-card)
- Hook submit: `apps/web/src/lib/use-kernel-form-submit.ts` (chỉ `kind === "refreshed"` là thành công; `committed/unknown` → notice + reconcile)
- Test hiện tại: `apps/web/src/routes/_auth/assignments/new.test.tsx` (SSR `renderToStaticMarkup`, node env — không DOM)

## Key Insights

- **Label giữ nguyên cho E2E**: "Tiêu đề", "Nội dung đề" (textarea prompt Writing), "Lưu vào ngân hàng"/"Lưu bản nháp", chip "Bản nháp"/"Sẵn sàng giao", heading "Đã thêm vào ngân hàng"/"Đã lưu bản nháp", nút "Tạo đề khác", breadcrumb `Bài tập / Ngân hàng / Tạo mới`, H1 "Thêm đề vào ngân hàng". Default mở trang: writing/task2/discuss/band 7.0/ready — 2 test E2E Writing hiện tại phải xanh không sửa (phase 5 chỉ thêm test).
- **Đổi picker áp template theo ngữ nghĩa dirty đã chốt (Validation Q1)**: `dirtyTitle`, `dirtyMain` (prompt/passage/items/intro/transcript/cue tùy skill); đổi **skill** → reset part/type về đầu danh sách + clear dirty flags + `audioName`/`transcript`/`note` + items (template skill mới apply — theo mock `applyDefaults` dòng 779–813); đổi **part/type** → áp template mới chỉ cho field chưa dirty, **giữ nội dung user đã sửa** (deviation có chủ đích khỏi mock — mock reset dirty cả khi đổi part/type).
- **canSave client mirror y hệt mock** (dòng 889–907): luôn cần `title.trim()`; writing cần prompt; reading cần passage + ≥1 stem (ready: mọi stem + answer); listening cần ≥1 stem (ready: + audioName + mọi stem + answer); speaking p2 cần cueTopic, p1/p3 cần speakPrompt. Server đã enforce ở superRefine (phase 1) — client chỉ để chặn UX.
- **Preview không bao giờ render đáp án** — questions chỉ hiện số + stem (+ opts cho MCQ); answer/alts chỉ ở composer và key-scan.
- **Audio là metadata**: `<input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav">` chỉ lấy `file.name`; "Dùng file mẫu Cambridge 10" set tên cứng; "Gỡ file" clear. Không fetch/upload bytes gì.
- State q-editor đặt trong `ComposerState.items: QuestionItem[]`; số câu hiển thị = `qStartOf(skill, part) + index`; resize qua input số câu 1–40 (thêm/bớt cuối mảng bằng `emptyItem(type)`).

## Requirements

### Functional

- `new.tsx` — `ComposerState` v2: `{ skill, part, type, title, band, source, prompt, passage, intro, transcript, cueTopic, cuePoints, audioName, note }` + state riêng `items: QuestionItem[]`, `status`, `dirtyTitle`, `dirtyMain`, `showErrors`, `saved: SavedPrompt | null` (SavedPrompt v2: title, status, skill, part, type, band, source, audioName, questions, note). Submit payload đúng action v2 (phase 2); chỉ `result?.kind === "refreshed"` → set `saved`. **Reconcile-check tường minh (finding R8 — thay citation "#208 F3" không tồn tại)**: `handleReconcile` sau khi `submit.reconcile()` trả thành công phải **xác nhận snapshot có row mới** (tìm trong `data.assignmentPrompts` row khớp `title` + `skill` vừa submit) rồi mới set `saved` — tránh success card cho đề không tồn tại khi outcome-unknown mà server không ghi; kèm test nhánh "refresh OK nhưng row vắng" (giữ form + lỗi hiển thị).
- Action bar state machine đúng thứ tự ưu tiên §5: (1) thiếu tiêu đề → "Đặt tên đề rồi lưu vào ngân hàng." / "Chưa giao lớp."; (2) listening + ready + chưa file → "Thiếu file nghe" / "Đính file hoặc dùng file mẫu trước khi lưu sẵn sàng giao."; (3) R/L + ready + thiếu đáp án → "Thiếu đáp án chấm tự động" / "Khóa đáp án đúng cho mọi câu trước khi lưu sẵn sàng giao."; (4) !canSave → "Thiếu nội dung đề" / "Soạn xong rồi lưu vào ngân hàng. Chưa giao lớp."; (5) draft → "Lưu bản nháp" / "Bản nháp chưa hiện khi giao từ trang Lớp học." (R/L thiếu đáp án: sub "Bản nháp chưa đủ đáp án — chưa chấm tự động được."); (6) sẵn sàng → "Sẵn sàng lưu vào ngân hàng" / R-L: "X/Y đáp án đã khóa. Chưa giao lớp." — skill khác: "Chưa giao lớp. Giao sau ở trang Lớp học.". Nút submit disabled khi !canSave; field error đỏ sau submit (`showErrors`): title / prompt / passage / key-field / audio / cue-topic / speak.
- Reset ("Hủy"/"Tạo đề khác") về default §7: skill=writing, part=task2, type=discuss, band=7.0, status=ready, xóa dirty flags + audio + note + items, `submit.reset()`.
- `prompt-composer.tsx` rework: heading card theo skill ("Writing Academic"/"Reading Academic"/"Listening"/"Speaking"); skill picker ChipFilter 4 kỹ năng; part picker (label theo skill: "Dạng bài" vs "Phần thi"); type picker (label "Dạng đề" vs "Dạng câu hỏi", options theo part); Tiêu đề (autofill dirty-flag); Band chips 6.0–7.5; Nguồn đề (autofill `skill.source`); Số câu hỏi 1–40 (chỉ R/L); fields theo skill (§2.5): Writing textarea "Nội dung đề" + đếm "N từ" + help; Reading textarea "Đoạn đọc" + đếm từ; Listening khối audio (upload-btn + tên file + meta + "Dùng file mẫu Cambridge 10" + "Gỡ file") + Q-EDITOR **trước** transcript + textarea "Transcript (chỉ giáo viên)"; Speaking part2 (input "Chủ đề cue card" + textarea "You should say" mỗi ý một dòng) hoặc part1/3 (textarea "Câu hỏi giám khảo"); Textarea "Hướng dẫn thêm (không bắt buộc)".
- `question-key-editor.tsx` (MỚI): props `{ skill, partId, typeId, intro, items, showErrors, status, onIntroChange, onItemsChange }`. Render: textarea "Hướng dẫn đề" (intro); danh sách q-card — header "Câu {qStartOf+index}" + nút "Xóa" (khi items.length > 1) + input stem "Nội dung câu hỏi phía học viên" + grid opts A–D/A–C (khi type là MCQ) + khối "Đáp án đúng · học viên không thấy": chip radiogroup theo `answerChoices(kindOf(typeId))` (tfng/ynng/mcq4/mcq3/roman/letter) HOẶC 2 input "Đáp án chấm tự động" + "Chấp nhận thêm, cách nhau bằng /" (kind text); link "Thêm câu" (append `emptyItem`); dòng key-scan mono right-aligned `"{qNum} {answer||'—'}"` join " · ".
- `student-preview-paper.tsx` extend: props nhận ComposerState + status; kicker "XEM TRƯỚC PHÍA HỌC VIÊN"; title fallback `typeOf(...).title`; spec = `part.spec + " · Band {band}"`, R/L thay phút bằng "{n} câu · 20 phút/~10 phút"; audio row (icon + audioName hoặc "Chưa đính file nghe") chỉ listening; cue preview "Describe {cueTopic}." + "You should say:" + từng dòng cuePoints chỉ speaking p2; passage (R) + intro (R/L) + danh sách câu (số + stem + opts "A  …" cho MCQ, KHÔNG đáp án) + body (writing prompt / speaking câu hỏi giám khảo) với fallback trống đúng §4; tags: Skill · Part · Type · Band · Nguồn (nếu có) · "Chấm tự động" (R/L) · "Có hướng dẫn thêm" (note) · Trạng thái.
- `bank-context-card.tsx` extend: thêm props `skill`; heading section "Đề {Skill} đã có"; list 5 đề mới nhất **filter theo skill** (rỗng → "Chưa có đề {skill} trong ngân hàng."); **grade banner** chỉ R/L: đủ đáp án → "X/Y đáp án đã khóa. Học viên nộp sẽ được chấm tự động. Preview bên dưới không hiện đáp án." / thiếu → "Thiếu N đáp án. Chấm tự động cần khóa hết trước khi lưu sẵn sàng giao."; giữ status chips + note "Đề này chỉ được thêm vào ngân hàng…" + link Lớp học.
- `create-success-card.tsx` extend: props v2 (skill, part, type, band, source, audioName, questions, status, title); H2 + lead giữ pattern `""{title}" chưa được giao lớp…`; meta rows: Kỹ năng · Phần thi (`{part.label} · {type.label}`) · Band mục tiêu · Chi tiết (listening: audioName || "Chưa đính file"; R/L: "{N} câu"; khác: type label) · Chấm điểm (chỉ R/L: đủ → "Tự động · X/Y đáp án đã khóa", thiếu → "Chưa đủ đáp án · chưa chấm tự động") · Nguồn ("Không ghi nguồn" fallback) · Trạng thái · Giao lớp: "Chưa giao"; CTA "Tạo đề khác" + link "Mở trang Lớp học" (giữ link "Xem ngân hàng đề" hiện có).
- Tests (`new.test.tsx` update + `question-key-editor.test.tsx` create): SSR cấu trúc — skill picker hiện 4 chip; default writing ẩn q-editor/audio/cue; preview có tag "Chấm tự động" khi fixture reading… (default là writing → assert không có q-editor, đủ breadcrumb/H1/action copy default); q-editor component render với props reading/tfng: "Câu 1"…"Câu 8", chips TRUE/FALSE/NOT GIVEN, key-scan "1 FALSE · 2 TRUE…", nút "Xóa" ẩn khi 1 câu; props mcq: grid 4 opts + chips A–D; props kind text: 2 input answer/alts.

### Non-functional

- Mọi text render qua text node React (không `dangerouslySetInnerHTML`) — stem/opts/passage là teacher input.
- Không thêm route mới; `routes-matcher.ts` + `routeTitles` đã có `/assignments/new` — không đụng.
- ChipFilter dùng `aria-pressed` (precedent #208 F14) — không thêm role radiogroup mới.

## Architecture (component interactions)

```
new.tsx (state owner: ComposerState v2 + items + status + dirty/showErrors/saved)
  ├─ PromptComposer      (props value/errors/showErrors/onFieldChange — patch Partial)
  │    └─ QuestionKeyEditor (nested cho R/L: onIntroChange/onItemsChange)
  ├─ BankContextCard     (props skill/status/onStatusChange/prompts/lockedCount)
  ├─ StudentPreviewPaper (props value + status — thuần display, không đáp án)
  ├─ CreateSuccessCard   (thay form sau saved)
  └─ sticky action bar   (actionCopy 6 bậc + Hủy + submit)
```

## Related Code Files

- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` (rewrite), `apps/web/src/components/assignments/prompt-composer.tsx` (rework), `apps/web/src/components/assignments/student-preview-paper.tsx` (extend), `apps/web/src/components/assignments/bank-context-card.tsx` (extend), `apps/web/src/components/assignments/create-success-card.tsx` (extend), `apps/web/src/routes/_auth/assignments/new.test.tsx` (update)
- Create: `apps/web/src/components/assignments/question-key-editor.tsx`, `apps/web/src/components/assignments/question-key-editor.test.tsx`
- Delete: không

## Implementation Steps

1. Viết `question-key-editor.tsx` trước (component thuần, props-driven) + test SSR `question-key-editor.test.tsx` (3 bộ props: tfng/mcq/text như Requirements).
2. Rework `prompt-composer.tsx`: khung picker 3 tầng + fields theo skill (§2.4–2.5), nhúng `QuestionKeyEditor` khi skill R/L (listening đặt trước transcript), khối audio metadata, qcount resize gọi `onFieldChange({ items })` qua helper resize trong `new.tsx`.
3. Extend `student-preview-paper.tsx` theo §4 (audio row, cue, questions không đáp án, tags mới).
4. Extend `bank-context-card.tsx` (skill filter + heading + grade banner) và `create-success-card.tsx` (meta rows §6).
5. Rewrite `new.tsx`: state v2 + picker handlers (đổi skill/part/type áp template trừ dirty — dùng `compositionDefaults` v2 phase 2) + canSave + actionCopy 6 bậc + field errors + handleSubmit payload v2 + `handleReconcile` kiểm snapshot + resetAll §7.
6. Update `new.test.tsx`: fixture + assertion theo Requirements (giữ các assertion cũ còn đúng: breadcrumb, H1, lead mới "Soạn Writing, Reading, Listening hoặc Speaking…", defaults, list bank).
7. Chạy `pnpm --filter web test` + `pnpm check-types`.

## Todo

- [ ] QuestionKeyEditor component + test SSR (tfng/mcq/text)
- [ ] PromptComposer rework (picker 3 tầng + fields theo skill + audio + qcount)
- [ ] StudentPreviewPaper extend (audio/cue/questions/tags, không đáp án)
- [ ] BankContextCard extend (skill filter + grade banner)
- [ ] CreateSuccessCard extend (meta rows §6)
- [ ] new.tsx rewrite (state machine, canSave, action bar 6 bậc, payload v2, reconcile check)
- [ ] new.test.tsx update; web test + check-types xanh

## Success Criteria

- Trang mặc định (writing) giống hành vi hiện tại về nhãn/flow — 2 E2E Writing cũ sẽ xanh ở phase 5.
- Chọn Reading → hiện passage + q-editor; Listening → audio + q-editor + transcript; Speaking p2 → cue card; preview/bank/success đổi theo live.
- Submit bị disable đúng canSave; action copy đúng bậc ưu tiên; lỗi đỏ sau submit đúng field.
- `pnpm --filter web test` + `pnpm check-types` xanh.

## Verification

```bash
cd apps/web && npx vitest run new question-key
cd apps/web && npx vitest run
pnpm check-types
```

## Risk Assessment

- **R1: State machine 6 bậc sai thứ tự** — pin bằng unit test actionCopy cho 6 nhánh (thiếu title / thiếu file / thiếu đáp án / thiếu nội dung / draft / ready) trong `new.test.tsx` (export helper `actionCopyFor(state)` thuần từ route file để test được không cần DOM).
- **R2: vỡ E2E Writing cũ do đổi label/structure** — danh sách label giữ nguyên ở Key Insights; phase 5 chạy spec cũ trước khi thêm mới.
- **R3: items resize/dirty-flag regression** (đổi type xóa câu đã soạn) — ngữ nghĩa đã chốt (Validation Q1): đổi part/type giữ items đã sửa, chỉ đổi skill reset; pin bằng test `compositionDefaults` phase 2 (2 nhánh: field sạch → template apply; field dirty → giữ).
- **R4: file input không dùng được trong SSR test** — component render input type=file không cần interaction; E2E phase 5 dùng nút "Dùng file mẫu" thay picker thật.

## Security Considerations

- Render toàn bộ text (stem/opts/passage/transcript/cue) bằng text node — không innerHTML (khác mock dùng `innerHTML + esc`; React text node an toàn mặc định).
- `audioName` chỉ là chuỗi hiển thị — không tạo URL/object URL nào; bound ≤200 ở contract.
- Submit qua kernel bus JSON + CSRF guard kế thừa; không field nào chảy vào attribute nguy hiểm (không style/src injection).

## Next Steps

- Phase 4 migrate consumer surfaces (`bank.tsx`, class picker, bank preview) rồi dọn compat exports.
