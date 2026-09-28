# Scout: Codebase authoring flow (2026-09-25)

Kết quả khám phá codebase (Explore agent) phục vụ plan authoring UX. Các line number đã verify lại thủ công cùng ngày.

## Nguồn chân lý catalog & contract

- `packages/api/src/contracts.ts`
  - `ASSIGNMENT_SKILLS` (263-269): `writing | reading | listening | speaking`.
  - `ASSIGNMENT_PART_TYPES` (271-307): catalog đầy đủ 26 type.
  - `ASSIGNMENT_ANSWER_CHOICES` (309-316): `tfng` (TRUE/FALSE/NOT GIVEN), `ynng`, `mcq4` (A–D), `mcq3` (A–C), `roman` (i–viii), `letter` (A–H).
  - `answerKindByType` (322-337): `headings → roman`, `info/features/sentend/map/match2 → letter`, `mcq → mcq4`, `mcq1/mcq3 → mcq3`, còn lại completion → `text` (không nằm trong map).
  - `ASSIGNMENT_IMAGE_SRC_PATTERN` + `isAssignmentImageUrl` (345-357): https-only, ≤500 ký tự.
  - `assignmentPromptCreateSchema` (363-505): `.strict()` + `superRefine` — questions chỉ cho reading/listening; passage bắt buộc reading; stem+answer bắt buộc từng câu khi `ready` (auto skills); `audioName` bắt buộc listening khi ready; `imageUrl` bắt buộc **chỉ reading+diagram** khi ready; answer phải thuộc choice set theo kind.
  - Question item: `{stem ≤500, opts string[] ≤6 nullish, answer ≤200, alts ≤500 default ""}`; mảng `questions` ≤40.
- `packages/db/src/schema/assignment-prompt.ts` — bảng `assignment_prompt`: cột phẳng, `questions` TEXT default `"[]"`, **chưa có cột option bank**, migration qua drizzle-kit (`pnpm db:generate` / `db:migrate:deploy` trong `packages/db/package.json:13-14`).
- `apps/web/src/components/assignments/assignment-presets.ts`
  - `KIND` (40-63): mirror `answerKindByType`, có test sync `assignment-presets.test.ts:66-78`.
  - `TYPE_HINTS` (71-82): placeholder giới hạn từ theo câu lệnh IELTS chính thức; với `features`/`sentend`, placeholder **hướng dẫn giáo viên liệt kê ngân hàng A–H vào ô intro** — xác nhận khoảng trống "bank trong text tự do".
  - `SKILLS` preset: `qStart` reading p1/p2/p3 = 1/14/27; listening s1–s4 = 1/11/21/31; helper `emptyItem/kindOf/qStartOf` (284-309).

## Editor UI

- `apps/web/src/routes/_auth/assignments/new.tsx` — route `/assignments/new`, `useState` thủ công, `canSave`/`fieldErrors`, `countAnswers`.
  - `handleFieldChange` (~207-237): đổi **part/type** reset `intro, transcript, cueTopic, cuePoints, imageUrl, items` — **giữ lại** `title, band, source, prompt, passage, note`. Đổi skill reset toàn bộ qua `emptyComposer`.
- `apps/web/src/components/assignments/prompt-composer.tsx` — form chính, render field có điều kiện theo skill (130-269).
- `apps/web/src/components/assignments/question-key-editor.tsx` — nhập câu hỏi + khóa đáp án: ChipFilter cho choice kinds (142-175), text + alts cho completion (176-203), imageUrl cho diagram (77-101).
- Preview: `routes/_auth/assignments/preview.tsx` + `components/assignments/student-preview-paper.tsx` (client-only qua sessionStorage `apps/web/src/lib/assignment-preview-draft.ts`, tự verify https trước khi render `<img>`); `prompt-preview-aside.tsx` cho bank.
- Bank: `routes/_auth/assignments/index.tsx` filter skill/part/tìm kiếm.

## Server / E2E

- `apps/server/src/routes/assignments/index.ts` — `POST /prompts` (59-93) nhận payload `.strict()` verbatim; `POST /:id/grade`.
- E2E: `assignment-prompt-create.spec.ts`, `assignment-prompt-reading-types.spec.ts` (summary + leak-check preview, diagram + URL https), `assignment-bank.spec.ts`.
- Test command: root `pnpm test` = `turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift`; web/server dùng vitest; e2e `pnpm --filter e2e e2e` (playwright).

## Rủi ro/khoảng trống đã xác nhận

1. Ngân hàng lựa chọn `features`/`sentend` nằm trong text tự do `intro` — không validate giữa bank và đáp án.
2. Reset khi đổi part/type xóa `intro/transcript/cueTopic/cuePoints/imageUrl/items` — mất dữ liệu thật (passage/prompt được giữ).
3. Validation lặp 3 nơi (contract / new.tsx / preview renderer) — thêm field phải sửa đồng bộ.
4. `qStart` cố định per part; chưa có đánh số lại động; chưa có field `explanation`.
5. `imageUrl` gate khi ready chỉ áp reading+diagram — listening `map` chưa bị chặn ảnh.
6. Editor dùng `useState` thuần, không autosave — refresh mất toàn bộ nội dung đang soạn.
