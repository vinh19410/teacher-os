# Scout Report: Kiến trúc assignment hiện tại (neo cho 8 dạng Reading mới)

## Bức tranh tổng thể

- Monorepo pnpm: `apps/web` (Vite + TanStack Router + Tailwind v4), `apps/server` (Hono + Drizzle + SQLite/libsql), `packages/api` (contracts zod — nguồn chân lý), `packages/db`, `apps/student` (chỉ list bài), `apps/e2e` (Playwright).
- Copy UI tiếng Việt thuần, không framework i18n.

## Contract 2 chiều whitelist (`packages/api/src/contracts.ts`)

- `ASSIGNMENT_PART_TYPES` (271–307): reading p1 `["tfng","sent"]`, p2 `["headings","info"]`, p3 `["ynng","mcq"]`.
- `ASSIGNMENT_ANSWER_CHOICES` (309–316): tfng/ynng/mcq4/mcq3/roman/letter(A–H).
- `answerKindByType` (318–329): tfng→tfng, headings→roman, info→letter, ynng→ynng, mcq→mcq4, + listening. `sent` KHÔNG có entry (text = fallback; server chỉ validate khi kind tồn tại) — 470–461 superRefine.
- `assignmentPromptCreateSchema` (335–462): `.strict()`; questions `{stem ≤500, opts ≤6 nullish, answer ≤200, alts ≤500}` max 40; reading bắt buộc passage + ≥1 stem; ready bắt buộc stem+answer mỗi câu. KHÔNG có trường ảnh.
- `AssignmentQuestion` (773–778) + `KernelAssignmentPromptRow` (780–802): shape snapshot; có `passage`, `intro`, `transcript`... không có ảnh.

## Lưu trữ (`packages/db/src/schema/assignment-prompt.ts`)

- Bảng `assignment_prompt`: mọi nội dung là cột TEXT; `questions` JSON string (dòng 34). KHÔNG có cột ảnh. Legacy `task/genre` vẫn ghi song song (route insert dòng 71–72).

## Teacher UI (`apps/web`)

- `assignment-presets.ts`: `KIND` map (40–55), `SKILLS` catalog (57–230, label tiếng Việt/Anh), helpers `emptyItem` (261–274: opts chỉ cho mcq4/mcq3), `emptyComposer` (275–289).
- `prompt-composer.tsx`: selector Kỹ năng/Phần/Dạng = ChipFilter từ `SKILLS`; duy nhất 1 `QuestionKeyEditor` (202–213).
- `question-key-editor.tsx`: KHÔNG có editor per-type — 2 nhánh theo kind: choices → ChipFilter (96–129; grid opts chỉ khi mcq4/mcq3), text → Input đáp án + Input `alts` "a/b/c" (130–156). Ô "Hướng dẫn đề" = `intro` Textarea (49–55).
- `new.tsx`: submit qua command bus `create-assignment-prompt` (196–233), validation client (135–165).
- Preview: `preview.tsx:86-95` gọi `StudentPreviewPaper` KHÔNG truyền items/passage/intro (gap hiện hữu — preview reading thiếu câu hỏi); `student-preview-paper.tsx:57-71` render stem + opts A/B/C tĩnh.
- Ngân hàng `index.tsx`/`$assignmentId.tsx` render label qua `typeOf/partOf` — tự ăn theo catalog mới.

## Server (`apps/server`)

- `routes/assignments/index.ts` POST `/prompts` (60–93) insert JSON.stringify(questions); POST `/:id/grade` (98–118) chỉ rubric 4 kỹ năng writing.
- `routes/snapshot.ts` `parseQuestions` (74–108) defensive per-field.
- KHÔNG có grading kernel per-câu: `alts` được lưu nhưng chưa code nào đọc; không có endpoint nộp bài học viên; `apps/student` chỉ render list (assignment-row/list). Teacher chấm rubric thủ công.

## Tests & lệnh

- `apps/web/.../assignment-presets.test.ts`: PIN `readingTypes === 6` (57), `totalTypes === 29` (63), sync ids với contracts (66–78), KIND mapping (80–96), qStart p1=1/p2=14/p3=27 (98–114), type chỉ `{id,label}` (139–153).
- `question-key-editor.test.tsx`: 3 mode render (tfng chips, mcq grid, text+alts).
- `new.test.tsx`, `index.test.tsx`, `preview.test.tsx` (route-level).
- `apps/server/src/kernel.test.ts` (+occurrence): handler chain + snapshot — KHÔNG phải chấm điểm.
- `apps/e2e/specs/assignment-prompt-create.spec.ts`: kỳ vọng STALE — "8/8 đáp án đã khóa" (139), nút "Dùng file mẫu Cambridge 10" (179) đã bị xóa bởi commit 29eee03 (form khởi động trống). E2E chạy riêng `pnpm --filter e2e e2e`, không nằm trong `pnpm test` (turbo).
- Lệnh: `pnpm test` (turbo vitest), `pnpm check-types`, `pnpm check` (Biome, tabs), `pnpm --filter e2e e2e`.

## Rủi ro đã ghi nhận

1. Hai bản sao kind map (server `answerKindByType` + web `KIND`) phải đồng bộ.
2. `opts.max(6)` — không chặn vì features/sentend dùng ngân hàng trong `intro`, không per-question opts.
3. qStart cứng theo part — thêm type KHÔNG đổi qStart (vẫn theo part).
4. Preview reading chưa truyền items — phải sửa để new types verify được qua preview.
5. E2E spec stale trước cả plan này — cần verify/fix trong phase e2e.
