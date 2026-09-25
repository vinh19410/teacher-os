---
phase: 2
title: "Web Catalog & Editor: label, hint, editor ảnh, validation client, draft pipeline"
status: pending
priority: P1
effort: 4.5h
dependencies: [1]
---

# Phase 2: Web Catalog & Editor

## Context Links

- [plan.md](./plan.md) · [reports/scout-codebase.md](./reports/scout-codebase.md)
- Code: `apps/web/src/components/assignments/assignment-presets.ts` (KIND 40–55, SKILLS 93–134, emptyItem 261–274, emptyComposer 275–289); `question-key-editor.tsx` (intro 49–55, nhánh kind 96–156); `new.tsx` (actionCopyFor 65–105, validation 135–165, reset khi đổi type 175–185, submit 196–233, savePreviewDraft 323–341); `assignment-preview-draft.ts:4-23` (PreviewDraft whitelist)

## Goal

Giáo viên soạn được đề `ready` cho cả 8 dạng mới trên UI tiếng Việt hiện có: chọn dạng → nhập câu hỏi + khóa đáp án đúng nhánh (chips A–H cho 2 dạng matching, text + alts cho 6 dạng còn lại) + dán URL https cho diagram; `imageUrl` đi trọn dây chuyền state → validation → payload → preview draft.

## Key Insight

Không cần editor per-type: nhánh kind hiện có tại `question-key-editor.tsx:96-156` đã phủ render editor cho letter/text. Thay đổi UI là: catalog data, placeholder theo type, field URL ảnh cho `diagram`, và **đủ 3 khối validation** (fieldErrors, canSave, actionCopyFor) + dây chuyền draft.

## Requirements

- [ ] `KIND` có đủ 8 entry mới: `note/shortans/diagram/summary/tablecomp/flowchart → "text"`, `features/sentend → "letter"`
- [ ] **Test sync mới:** `KIND[typeId] === answerKindByType[typeId]` cho mọi type trong `ASSIGNMENT_PART_TYPES` (dùng map vừa export ở Phase 1; type không entry → cả hai cùng fallback text) — red-team #3
- [ ] `SKILLS.reading` đủ 14 type với label chuẩn: Note completion, Short-answer questions, Diagram label completion, Summary completion, Matching sentence endings, Table completion, Matching features, Flow-chart completion
- [ ] `TYPE_HINTS: Record<string, string>` mới (nằm ngoài object type trong catalog — test `139-153` pin type chỉ có `{id,label}`): placeholder "Hướng dẫn đề" theo câu lệnh IELTS chính thức (giới hạn từ), `features`/`sentend` nhắc liệt kê ngân hàng lựa chọn A→ trong ô này kèm ghi chú "nhập đủ các mục A–H" (hạn chế đã ghi nhận ở plan Decision 1)
- [ ] `emptyComposer` thêm `imageUrl: ""`; editor nhận prop `imageUrl` + `onImageUrlChange` (song song `intro` tại `question-key-editor.tsx:49-55`)
- [ ] UI diagram: field "Ảnh biểu đồ (URL)" chỉ nhận https (dùng pattern export từ contracts — red-team #8) + thumbnail `<img>` + lỗi khi ready mà trống
- [ ] **Đủ 3 khối validation trong `new.tsx`** (red-team #12): fieldErrors + canSave + `actionCopyFor` nhánh mới copy kiểu "Thiếu ảnh biểu đồ" (mirror "Thiếu file nghe" — test `new.test.tsx:73-152` pin copy)
- [ ] **Reset `imageUrl: ""` trong nhánh đổi part/type của `handleFieldChange`** (`new.tsx:175-185`) — tránh URL dính sang đề type khác (red-team #5); giữ nguyên semantics reset `intro` hiện có (non-goal đổi hành vi)
- [ ] **`imageUrl` vào dây chuyền draft** (red-team #2): `PreviewDraft` interface + guard `isPreviewDraft` + lệnh `savePreviewDraft(...)` tại `new.tsx:323-341` + nhánh restore draft
- [ ] Cập nhật help copy 3 part reading (p1/p2/p3) liệt kê đúng các dạng hay gặp mới

## Implementation Steps

1. `assignment-presets.ts` — 8 entry `KIND`; 8 type vào `SKILLS.reading` đúng part; export `TYPE_HINTS`; `imageUrl: ""` vào `emptyComposer`.
2. `question-key-editor.tsx` — 2 prop mới; field URL ảnh khi `typeId === "diagram"` (Input + thumbnail có border `border-line` + alt "Ảnh biểu đồ đề Reading"); placeholder Textarea intro từ `TYPE_HINTS[typeId]`; placeholder Input đáp án từ hint khi kind text.
3. `new.tsx` — state `imageUrl`; validation cả 3 khối (diagram + ready → bắt buộc, https); reset trong `handleFieldChange`; payload submit; savePreviewDraft + restore draft.
4. `assignment-preview-draft.ts` — thêm `imageUrl?: string` vào `PreviewDraft` + guard + giữ qua roundtrip (par `audioName` tại dòng 21).
5. `prompt-composer.tsx` — kéo `imageUrl` từ composer state truyền vào `QuestionKeyEditor` (cạnh đường `intro`).
6. Cập nhật tests: `assignment-presets.test.ts` — `readingTypes` 6→14, `totalTypes` 29→37, KIND mapping 8 id mới, **test sync KIND ↔ answerKindByType**; `question-key-editor.test.tsx` — mode `features` (chips A–H + placeholder ngân hàng) và mode `diagram` (field URL + text đáp án); `new.test.tsx` — lỗi required khi diagram ready thiếu URL, `actionCopyFor` copy mới, payload chứa `imageUrl`, reset imageUrl khi đổi type.
7. Chạy `pnpm check` (Biome).

## Todo

- [ ] KIND + SKILLS + TYPE_HINTS + emptyComposer
- [ ] Editor: 2 prop mới, field URL diagram, placeholder theo type
- [ ] new.tsx: state + 3 khối validation + reset + payload; prompt-composer kéo dây
- [ ] assignment-preview-draft.ts: PreviewDraft + guard + save/restore
- [ ] Tests: presets counts + KIND + sync map, editor 2 mode mới, new validation/copy/payload/reset
- [ ] `pnpm check` sạch

## Verification

- `pnpm --filter web test` xanh — counts 14/37, sync contracts pass, sync KIND map pass.
- `pnpm check-types` sạch.
- Soạn tay 1 đề `summary` và 1 đề `diagram`: submit 201, ngân hàng label đúng, preview roundtrip giữ nguyên URL ảnh, đổi type thì URL bị reset.

## Risk & Mitigation

- **Test pin `{id,label}`** — `TYPE_HINTS` đứng ngoài catalog object.
- **2 bản sao kind map lệch nhau** — test sync mới dùng map export từ Phase 1 chặn vĩnh viễn (không còn dựa test ids cũ vốn không so kind).

## Security

- URL ảnh: chỉ https, pattern import từ contracts (single source); không render HTML — chỉ `<img src>`, không `dangerouslySetInnerHTML`.
