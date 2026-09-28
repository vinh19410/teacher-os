---
phase: 3
title: "Builder UI swap"
status: pending
priority: P1
effort: "6h"
dependencies: [1, 2]
---

# Phase 3: Builder UI swap

## Goal

7 instance textarea soạn nội dung (5 Textarea `PromptComposer`: prompt writing, passage, transcript, prompt speaking, note + intro `QuestionKeyEditor` + description `TestHeaderForm`; sau phase 2 contract đã nhận HTML) đổi sang `RichTextEditor`, giữ nguyên `Field`/label/help/error. `cuePoints` giữ Textarea plain (interview Q2). Mọi gate "có nội dung hay không" `.trim()` đổi sang `isEmptyRichText` (trừ gate/payload đã adjudicate giữ nguyên — liệt kê rõ bên dưới). Transient boxes (paste key, cloze source) **giữ Textarea**. Render preview chỉ đổi ở phase 4 — sau phase này preview vẫn render raw HTML string ở nhánh legacy (escaped text có thẻ nhìn thấy) — chấp nhận trong 1 phase, được gọi rõ.

## Files to Create / Modify

- Modify: `apps/web/src/components/assignments/prompt-composer.tsx` — 5 Textarea: prompt writing (L172), passage (L185), transcript (L264), prompt speaking (L302), note (L312). **cuePoints (L288) GIỮ Textarea plain (Q2)**
- Modify: `apps/web/src/components/assignments/question-key-editor.tsx` — intro (L161). pasteRaw (L315) GIỮ Textarea
- Modify: `apps/web/src/components/assignment-tests/test-header-form.tsx` — description (L167, bỏ `maxLength={2000}` — cap chuyển xuống plain cap + check client bên dưới)
- Modify (gate `.trim()` → `isEmptyRichText`):
  - `apps/web/src/routes/_auth/assignments/new.tsx` — `hasCoreContent` (L70-83), `fieldErrors` (L248-254)
  - `apps/web/src/components/assignment-tests/test-builder-shell.tsx` — `composerFieldErrors` (L766-800), `composerSaveAllowed` (L804-822)
  - `apps/web/src/components/assignments/composer-transitions.ts` — L64-71 (**`value.cuePoints.trim()` L70 GIỮ — cuePoints plain**)
  - `apps/web/src/lib/assignment-draft-store.ts` — `composerDraftHasContent` (L178-192)
  - `apps/web/src/lib/assignment-test-draft-store.ts` — `testDraftHasContent` (L199-209) + local mirror **`composerDraftHasContent` (L216-235)** *(entry cũ ghi nhầm tên `partHasContent` — symbol thật trong file này là bản mirror local của `composerDraftHasContent`)*
  - `apps/web/src/components/assignment-tests/test-preview-paper.tsx` — `partHasContent` (L24-32) *(symbol này đúng — file khác với draft store)*
  - `apps/web/src/components/assignments/question-key-editor.tsx` — gate `KNOWN_HINTS` (L107-117): `KNOWN_HINTS.has(intro.trim())` → so trên `htmlToPlainText(intro)` (intro giờ là HTML — so sánh plain)
  - `apps/web/src/components/assignment-tests/test-header-form.tsx` — payload `description: value.description.trim() || undefined` (L98) → `isEmptyRichText(description) ? undefined : description`
- Modify (legacy adapter wiring — decision 9 plan.md):
  - `apps/web/src/routes/_auth/assignments/new.tsx` — restore draft (~L200-225): bọc `prompt/passage/intro/transcript/note/description` bằng `normalizeLegacyRichText`
  - `apps/web/src/components/assignment-tests/test-builder-shell.tsx` — `openComposeNew` slotDrafts restore (~L312-318): idem
  - `apps/web/src/lib/repos/assignment-tests.ts` — `composerFromPrompt` (~L93-119) bank-edit: idem
- Modify (draft store caps):
  - `apps/web/src/lib/assignment-draft-store.ts` — `ASSIGNMENT_DRAFT_MAX_LENGTH` (L19): 200KB → **512KB**
  - `apps/web/src/lib/assignment-test-draft-store.ts` — `ASSIGNMENT_TEST_DRAFT_MAX_LENGTH` (L18): 200KB → **512KB**
- Modify tests: `prompt-composer.test.tsx`, `question-key-editor.test.tsx`, `test-header-form.test.tsx`, `routes/_auth/assignments/new.test.tsx`, `test-builder-shell.test.tsx` (assert payload/gate mới; node env không crash với editor null)

## Requirements

- [ ] Mỗi Textarea → `<RichTextEditor value onChange placeholder />` bên trong `Field` giữ nguyên label/help/error; word count passage (L194) → `wordCount(htmlToPlainText(value.passage))`. Nạp value vào editor phải qua `normalizeLegacyRichText` (decision 9) — draft cũ/bank row plain không bị collapse `\n`.
- [ ] Gate đổi dùng helper chung: `isEmptyRichText(value.prompt)` v.v. — KHÔNG giữ `.trim()` sót field rich. Ngoại lệ adjudicated: `cuePoints` giữ `.trim()` (plain); payload trims `new.tsx` L361-371 và `test-builder-shell.tsx` L840-850 **giữ nguyên** (`adjudicated: keep` — trim HTML chuỗi ngoài rìa vô hại).
- [ ] Chip "Chèn câu lệnh chuẩn" (question-key-editor) nạp hint qua editor HTML (`<p>hint</p>`) — unit test bấm chip 2 lần không hiện confirm oan (lần 2 phải nhận diện hint đã có qua `htmlToPlainText`).
- [ ] Description client cap: thay `maxLength={2000}` bị bỏ bằng check client `htmlToPlainText(description).length > 2000` → error tiếng Việt trong `test-header-form` (server 400 generic không chỉ field — không được để teacher kẹt không rõ lỗi).
- [ ] Draft/autosave: value HTML đi qua `composerDraftHasContent` (draft store + mirror trong test-draft store), `testDraftHasContent`, `partHasContent` (preview paper) — `<p></p>` không kích hoạt autosave "có nội dung".
- [ ] Draft store caps 512KB: legal payload HTML (×2.5 inflation + 3 passage) có thể vượt 200KB → hiện silent-skip **mất draft**; đổi skip im lặng → `console.warn`; sửa 2 comment "plain text only" / "3 passage × 20KB" cho đúng giả định HTML; thêm test trần mới.
- [ ] Tôn trọng convention không hard-code `p1/p2/p3` trong `components/assignment-tests/**` (source-parse test `kernel-runtime.contract.test.ts:662-681` đọc source mọi file thư mục) — không thêm chuỗi cấm.

## Implementation Steps

1. `prompt-composer.tsx`: swap 5 field (cuePoints không đụng); mỗi field truyền `placeholder` tiếng Việt đúng ngữ cảnh (vd "Dán hoặc soạn đề bài…"); giữ `error={showErrors ? errors.prompt : undefined}`.
2. `question-key-editor.tsx` intro + `test-header-form.tsx` description swap tương tự; description bỏ `maxLength` attr, thêm check client plain cap 2000 (error tiếng Việt).
3. Đổi 11 cụm gate ở "Files to Modify" sang `isEmptyRichText` (import từ `@teacher-os/api/rich-text`); giữ nguyên payload trims (L361-371, L840-850 — adjudicated keep) và `cuePoints.trim()` (plain).
4. Wire `normalizeLegacyRichText` tại 3 cửa nạp (new.tsx restore, shell `openComposeNew`, `composerFromPrompt`) + test round-trip: "draft cũ 3 dòng → editor → lưu → 3 dòng còn nguyên".
5. Raise 2 hằng cap draft store lên 512KB + `console.warn` khi skip + sửa comment.
6. Cập nhật test node env hiện hữu: nếu `renderToStaticMarkup` của composer crash vì Tiptap → quay lại fix guard phase 1 (không thêm jsdom cho test cũ); thêm case gate mới: composer có prompt = `"<p></p>"` → lỗi "Dán hoặc soạn đề trước khi lưu."; prompt = `"<p>x</p>"` → pass; `test-header-form.test.tsx` (L50-62): assert hiện tại description `"  "` → undefined — sau swap editor rỗng trả `<p></p>` → vẫn phải ra undefined.
7. Manual smoke (không bắt buộc CI): `pnpm dev:web` — soạn draft, refresh, draft restore đủ HTML (kể cả draft cũ plain 3 dòng).

## Todo

- [ ] 7 instance swap RichTextEditor (5 composer + intro + description; cuePoints giữ Textarea)
- [ ] 11 cụm gate → isEmptyRichText (payload trims + cuePoints giữ nguyên — adjudicated)
- [ ] KNOWN_HINTS so plain + chip không confirm oan (test)
- [ ] Legacy adapter 3 cửa nạp + test round-trip
- [ ] Draft store caps 512KB + console.warn + test trần
- [ ] Description client cap plain 2000
- [ ] wordCount passage qua htmlToPlainText
- [ ] Test component cập nhật + case `<p></p>` rỗng
- [ ] `pnpm -F web test` + `pnpm check-types` exit 0

## Success Criteria

Soạn được bold/list ở cả 3 màn (single-part `/assignments/new`, composer nhúng test builder, header form); `"<p></p>"` bị coi rỗng ở nút lưu + autosave; draft cũ plain mở lên không mất xuống dòng; e2e cũ chưa chạy ở phase này (phase 5 mới swap selector) nên không kỳ vọng.

## Verification

```bash
pnpm -F web test && pnpm check-types
# Chỉ bắt gate .trim() CHƯA adjudicate trên field rich (payload `x: value.x.trim()` và cuePoints plain được loại):
grep -rn "\.trim()" \
  apps/web/src/routes/_auth/assignments/new.tsx \
  apps/web/src/components/assignments/prompt-composer.tsx \
  apps/web/src/components/assignments/question-key-editor.tsx \
  apps/web/src/components/assignments/composer-transitions.ts \
  apps/web/src/components/assignment-tests/test-builder-shell.tsx \
  apps/web/src/components/assignment-tests/test-header-form.tsx \
  apps/web/src/components/assignment-tests/test-preview-paper.tsx \
  apps/web/src/lib/assignment-draft-store.ts \
  apps/web/src/lib/assignment-test-draft-store.ts \
  | grep -E "prompt|passage|intro|transcript|note|description" \
  | grep -vE ":\s*value\.|cuePoints" \
  || echo "OK: không còn .trim() trên gate field rich (payload trim adjudicated-keep, cuePoints plain giữ trim)"
```

## Risk notes

- **KHÔNG deploy giữa phase 3 và 4** (gate cứng): ở khoảng này preview hiện raw HTML; phase 3 + 4 ship cùng một nhánh, deploy 1 lần — xem section Deploy & Rollback plan.md.
- **HTML inflation draft store**: `<p>` + attr làm chuỗi phình ~×2-3 — raw cap ×2.5 (phase 2) giữ payload trong trần; cap draft store nâng 512KB phòng legal payload vượt 200KB; `assignment-test-preview-draft.ts:16` có trần sessionStorage 1MB với ref fallback (L24) — đã có đường thoát, chỉ theo dõi.
- **Legacy adapter là bắt buộc, không optional**: thiếu `normalizeLegacyRichText` thì ProseMirror collapse `\n` ngay lúc `setContent` → lưu đè mất dữ liệu vĩnh viễn. 3 cửa nạp phải được test round-trip che hết.
- **Preview chưa render rich trong giai đoạn 3→4** (hiện escaped text) — giao thoa có chủ đích, phase 4 khép ngay sau; gate cứng ở trên đảm bảo không ở trạng thái này trên môi trường thật.
- **Tiptap controlled loop** (`onUpdate` → setState → useEffect setContent): guard `value !== editor.getHTML()` bắt buộc, dùng đúng pattern researcher-01 mục 5.
