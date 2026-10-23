---
title: "Thư viện đề: tầng Question Group cho Reading/Listening (PR1 + PR2)"
description: "Admin soạn được đề IELTS có nhiều nhóm câu trong một part, bố cục editor kiểu Selfomy; câu hỏi giữ mảng phẳng để grader không đổi."
status: completed
priority: P1
effort: "3-4d"
tags: [admin, library, contracts, grader, migration]
created: 2026-10-22
branch: develop
mode: advice
brainstorm: plans/reports/brainstorm-261022-2024-question-group-exam-structure.md
issue: https://github.com/vinh19410/teacher-os/issues/420
---

# Thư viện đề: tầng Question Group (PR1 + PR2)

## Mục tiêu

Admin (`apps/admin`) soạn được đề IELTS Reading/Listening mà **một part (passage/section) chứa nhiều nhóm câu**. Mỗi nhóm có dạng bài riêng, hướng dẫn rich text riêng, có thể hiển thị câu dạng ô điền liền mạch như ghi chú (marker `____` sẵn có), option bank riêng. Mỗi câu có thể kèm giải thích. Bố cục editor tham chiếu Selfomy: mục lục bên trái (Nhóm → Câu), thẻ nhóm mở ra được ở cột phải.

## Quyết định đã chốt (2026-10-22)

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Câu hỏi giữ **mảng phẳng** `questions[]`; nhóm chỉ trỏ vào một dải `startIndex..startIndex+count-1` | `gradeQuiz` chấm theo index phẳng không đổi; snapshot/review không vỡ |
| D2 | Nhóm lưu trong cột JSON mới `library_test_part.groups` (mặc định `[]`) | `[]` = một nhóm ngầm phủ cả part, đề cũ không cần migrate dữ liệu |
| D3 | Chỉ làm PR1 + PR2, chỉ `library_test` | Không đụng `assignment_prompt`, web composer, màn làm bài học viên |
| D4 | Giữ slot cố định `p1..p3` / `s1..s4` | Part tab giữ nguyên; nhóm là tầng mới bên trong part |
| D5 | Thư viện bỏ khóa dạng-bài-theo-slot, chỉ giữ catalog theo skill | `assignment_prompt` vẫn giữ khóa cũ |
| D6 | "Choose TWO" = 2 câu phẳng cùng khóa `answerSet`; grader so theo tập trong cùng khóa | Grader nhận thêm một nhánh, chỉ kích hoạt khi câu có `answerSet` |
| D7 | Ô trống của nhóm inline dùng marker `____` sẵn có trong stem, không dùng `{{gap}}` | Một quy ước ô trống duy nhất; tái dùng `ClozeEditor` |

Ghi chú D6: người dùng gọi là "cờ `unordered`". Vì grader chỉ thấy mảng câu phẳng (không thấy nhóm), cờ được hiện thực bằng **khóa chuỗi trên từng câu** (`answerSet`): các câu cùng khóa được chấm như một tập không thứ tự. Đây là cách duy nhất giữ chữ ký `gradeQuiz(questions, answers)`.

## Cơ chế ô trống của nhóm inline (D7, chốt 2026-10-23)

Dùng quy ước sẵn có: marker `____` (≥4 gạch dưới, `CLOZE_MARKER_SOURCE` trong `packages/api/src/lib/infer-question-types.ts`) trong `stem` từng câu, nhập bằng `ClozeEditor` mà `QuestionKeyEditor` tự hiện cho dạng thuộc `CLOZE_EDITOR_TYPES` (`sent, note, summary, flowchart, form, notes, sent4, flow`). Cờ `answersInline` của nhóm nghĩa là "hiển thị stem các câu trong nhóm liền mạch như một khối ghi chú". Không dùng token `{{gap}}` (người dùng chọn, kongming khuyến nghị): một quy ước ô trống duy nhất, đảo/xóa câu không lệch ô. Đánh đổi chấp nhận: không chèn tiêu đề giữa các ô — tiêu đề đặt trong hướng dẫn nhóm.

## Non-goals

- PR3: `assignment_prompt`, web composer (`apps/web`), học viên làm đề thư viện, highlight review cho câu `answerSet`.
- Section tự do (bỏ slot cố định); Writing/Speaking; nhập đề bằng AI; màn "Answers Checking" mới (đã có `BulkKeyPastePanel`, không mở rộng).

## Kiến trúc tóm tắt

```
library_test ─< library_test_part (slot p1..p3 | s1..s4)
                  ├─ passage / transcript / audio / imageUrl   (nội dung section — như cũ)
                  ├─ questions: AssignmentQuestion[]   (PHẲNG, index 0..n-1)
                  │     + explanation?: rich text      (PR1)
                  │     + answerSet?: string           (PR1, chấm theo tập)
                  └─ groups: QuestionGroup[]           (PR2, mới)
                        { id, type, instruction(rich), startIndex, count,
                          optionBank[], answersInline, splitContent, dragDrop }
```

Bất biến (kiểm ở schema, mọi lần lưu): nhóm đầu bắt đầu từ 0, nhóm sau nối tiếp nhóm trước, tổng `count` = `questions.length`, `id` nhóm không trùng; khi có nhóm thì `part.optionBank` rỗng và `part.type` = `groups[0].type`.

Rule xuất bản (kiểm ở `partIssues`, chỉ khi ready): dạng bài nhóm thuộc catalog skill; câu có `type` phải trùng `type` nhóm; option bank theo nhóm; nhóm dạng ảnh cần ảnh + ghim; nhóm `answersInline` phải có dạng thuộc `CLOZE_EDITOR_TYPES` và mỗi câu trong dải có đúng 1 marker `____`.

## Phases

| # | Phase | PR | Phụ thuộc | Status |
|---|---|---|---|---|
| 1 | [Trường câu hỏi dùng chung + chấm theo tập](phase-01-shared-question-fields-set-grading.md) | PR1 | — | completed |
| 2 | [Schema nhóm, migration, contract thư viện](phase-02-library-groups-schema-contracts.md) | PR2 | 1 | completed |
| 3 | [Route admin lưu/đọc nhóm](phase-03-library-groups-route.md) | PR2 | 2 | completed |
| 4 | [Editor nhóm kiểu Selfomy trong `apps/admin`](phase-04-admin-group-editor-ui.md) | PR2 | 3 | superseded — thay bằng plan `261023-0713-quiz-builder-page-refactor` |
| 5 | [E2E, verify 3 viewport, docs](phase-05-e2e-verify-docs.md) | PR2 | 4 | superseded — thay bằng plan `261023-0713-quiz-builder-page-refactor` |

Ghi chú 2026-10-23: phần UI của phase 4–5 được làm theo bố cục Quiz Builder cả trang trong [`261023-0713-quiz-builder-page-refactor`](../261023-0713-quiz-builder-page-refactor/plan.md); các task helper/test của phase 4–5 được plan đó tái dùng nguyên văn theo ID.

PR1 = phase 1 (merge riêng vào `develop`). PR2 = phase 2–5 trên nhánh mới cắt từ `develop` sau khi PR1 merge.

## Acceptance criteria

- [ ] Tạo part Reading `p1` gồm 2 nhóm (nhóm 1 `tfng` 3 câu; nhóm 2 `note` 2 câu, `answersInline`, mỗi stem có 1 marker `____`), lưu, tải lại trang: nhóm, dải câu, hướng dẫn, giải thích đều giữ nguyên.
- [ ] Đề cũ (part có `groups = []`) mở trong editor hiển thị như một nhóm duy nhất và lưu lại không đổi dữ liệu nếu admin không sửa.
- [ ] Schema từ chối (HTTP 400) payload có dải chồng, dải hở, tổng `count` ≠ số câu, `id` nhóm trùng.
- [ ] Xuất bản bị chặn với lý do rõ khi một câu của nhóm inline không có đúng 1 marker `____`, hoặc dạng nhóm inline không thuộc `CLOZE_EDITOR_TYPES`.
- [ ] `gradeQuiz` pass toàn bộ test hiện có + test mới cho `answerSet`.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, Playwright `admin-library-*.spec.ts` pass ở local.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Schema `assignmentQuestionSchema` `.strict()` dùng chung với web | Trường mới đều optional, không `default` → output shape câu cũ không đổi, dirty-check web không lệch |
| Đánh số câu lệch khi chèn/xóa câu giữa nhóm | Không lưu số câu; mọi thao tác sửa đi qua helper thuần tính lại `startIndex` toàn bộ nhóm |
| `answerSet` chưa có tác dụng trên dữ liệu thật: `parseQuizQuestions` (`apps/server/src/routes/student.ts`) dựng lại câu và bỏ field này | Ghi nhận cho PR3 — PR3 phải giữ `answerSet` (và cân nhắc `explanation`) ở hàm này VÀ ở `normalizeQuestion` của web sim (`apps/web/src/lib/assignment-quiz-sim.ts` — cùng whitelist strip, red-team F6); PR1 chỉ chứng minh bằng unit test |
| `answerSet` sai ngữ nghĩa nếu khóa trải qua nhiều nhóm hoặc chỉ 1 câu | superRefine + partIssues chặn: mỗi khóa ≥ 2 câu và nằm trọn một nhóm (red-team S1, Task 2.5/2.6) |
| Deploy skew: DTO/upsert schema `.strict()` thêm key `groups` — worker và admin lệch phiên bản thì fail cứng | Runbook ghi cùng release train + reload tab cũ + rollback đồng bộ (red-team A2/F3, Task 5.4) |
| `explanation`/`instruction` là raw HTML | Mọi render site (PR3) PHẢI qua `RichTextBody` (DOMPurify) — không `dangerouslySetInnerHTML` (red-team S7, Task 5.4) |
| Grader khớp theo tập nhưng UI review tô đáp án theo vị trí (`quiz-question-item.tsx` dùng `isAcceptedAnswer` từng câu) — câu `answerSet` có thể tô viền lệch cặp khớp | PR1 chưa lộ (parse/normalize còn bỏ `answerSet`); PR3 phải trả cặp khớp từ grader ra UI thay vì để UI tự suy lại (kongming checkpoint 2026-10-23) |
| Migration D1 production | Cột additive có default; thêm mục runbook "chạy `db:migrate:deploy` trước khi deploy worker" |

## Handover

Plan viết cho executor model yếu hơn: mỗi phase có task kèm file đích, bước, tiêu chí, lệnh verify so khớp được, và khối **Failure Protocol** — verify trượt thì DỪNG và hỏi `kongming`, không tự đoán.

## Validation Log

### Session — 2026-10-23 (vibe ai-handle #420, autonomous)

#### Verification Results
- **Tier:** Full (5 phases)
- **Claims checked:** 30
- **Verified:** 28 | **Failed:** 1 | **Unverified:** 1 (adapted)

Verified (sample): `assignmentQuestionSchema` tại `packages/api/src/contracts.ts:600` (`.strict()`, `pin` :621, `richTextField` import :3); `gradeQuiz`/`normalize`/`acceptedCandidates`/`isAcceptedAnswer` tại `packages/api/src/lib/grade-quiz.ts:22-68`; helper `q()` tại `apps/server/src/lib/grade-quiz.test.ts:5`; `libraryTestPart` + `optionBank` tại `packages/db/src/schema/library-test.ts:58,77`; migration mới nhất `0043` → `0044` kế tiếp; `db:generate` script có sẵn; `libraryPartUpsertSchema`/`partIssues`/`validatePartForReady`/`libraryPartDtoSchema`/`LibrarySkill` tại `packages/api/src/library-contracts.ts:24,104,134,219,263`; `CLOZE_MARKER_SOURCE`/`CLOZE_EDITOR_TYPES` tại `packages/api/src/lib/infer-question-types.ts:2,7`; `z.input<typeof libraryPartUpsertSchema>` tại `apps/admin/src/lib/repos/library.ts:195` (không có `.shape`/`.extend`/`.omit`); `parseJsonArray`/`toPartInput`/`toPartDto`/PUT handler tại `apps/server/src/routes/admin-library.ts:109,125,143,481`; NOT_READY test pattern tại `admin-library.test.ts:406,588`; `qStartOf` tại `question-key-editor.tsx:18,71`; `emptyItem` tại `assignment-presets.ts:342`; `quizTypeDisplay` tại `packages/api/src/contracts.ts:544`; `PartFormValue`/`slotTypes`/`emptyPartValue`/`normalizeQuestions`/`partValueFromDto`/`canonicalPartValue`/`isPartDirty`/`partInputFromValue`/`partReadyIssues` tại `apps/admin/src/components/library/part-form.tsx:36-243`; e2e helpers `createReadingTest`/`openEmptySlot`/`fillRichEditor` có sẵn trong `admin-library-reading.spec.ts`; runbook có mẫu mục migration 0037/0038.

#### Failures
1. [Fact Checker] Phase 4 Task 4.5b — hằng `FIELD_ERROR_TEXT` KHÔNG tồn tại trong `apps/admin/src/components/library/part-issues.ts` (file chỉ có `issueMessage` :37, `issuePathLabel` :64, `formatIssue` :93; hằng thật nằm ở `part-form.tsx`). **Quyết định thích nghi:** mapping message tiếng Việt vào `MESSAGE_LABELS`/`FIELD_LABELS` (part-issues.ts) + `FIELD_ERROR_TEXT` (part-form.tsx); ý định giữ nguyên.
2. [Fact Checker] Phase 2 Task 2.1 — `apps/e2e/local.db` hiện không tồn tại; script e2e ghi nhận "boot xoá local.db mỗi lần" (`apps/e2e/scripts/design-seed.ts:4`). **Quyết định thích nghi:** backup có điều kiện — chỉ copy khi file tồn tại; ghi nhận boot e2e tự tạo lại DB.

#### Interview
Chạy autonomous (ai-handle): câu hỏi quyết định được giải bằng evidence codebase; hai thất bại fact-check trên được thích nghi cơ học vì ý định rõ, không đổi hướng triển khai.

## Red Team Review

### Session — 2026-10-23 (vibe ai-handle #420)

3 reviewer (Security Adversary + Fact Checker, Failure Mode Analyst + Flow Tracer, Assumption Destroyer + Scope Auditor), 23 findings gốc → 16 duy nhất sau dedupe. Autonomous: adjudicate bằng evidence codebase (mọi finding Accept đều được spot-check lại file:line bởi controller).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `AssignmentQuestion` là interface viết tay (contracts.ts:1318), không task nào sửa → PR1 stall ở check-types | Critical | Accept | Phase 1 Task 1.1 |
| 2 | ClozeEditor `segmentsToItems` rebuild items → xóa `explanation`/`answerSet`/`type`/`pin` khi Apply | Critical | Accept | Phase 4 Task 4.1b, Phase 5 Task 5.1 bước 4b |
| 3 | `answerSet` không invariant: khóa trải nhiều nhóm / chỉ 1 câu → chấm lẫn hoặc cheat | High | Accept | Phase 2 Task 2.5/2.6/2.7 |
| 4 | Grader greedy sai khi `alts` giao nhau (hoán vị hợp lệ bị trừ điểm) | Medium | Accept | Phase 1 Task 1.3 (khớp cực đại Kuhn) + 1.4 |
| 5 | Task 2.1 backup `local.db` vô điều kiện — file không tồn tại, e2e boot xoá mỗi lần | High | Accept | Phase 2 Task 2.1 (viết lại conditional) |
| 6 | Deploy/rollback skew strict DTO hai chiều làm gãy admin thư viện | High | Accept (runbook) | Phase 5 Task 5.4 |
| 7 | Task 4.1 nhắm "vòng lặp render item" không tồn tại — hàng câu ở `AnswerKeyGrid` | High | Accept | Phase 4 Task 4.1 + Files list |
| 8 | Task 4.8 đòi test tương tác nhưng harness là `renderToStaticMarkup` | High | Accept | Phase 4 Task 4.8 (static + helper + e2e) |
| 9 | Lỗi superRefine nhóm bị flatten `path[0]` → dead wiring `errorFor("groups.N.…")`; `FIELD_ERROR_TEXT` không ở `part-issues.ts` | High | Accept | Phase 4 Task 4.5b (dotted path + MESSAGE_LABELS/FIELD_LABELS) |
| 10 | Read path `groups` 2 lần cast mù (`z.unknown()` + `as`) — dữ liệu lệch crash admin | Medium | Accept | Phase 2 Task 2.7 + Phase 3 Task 3.1 (`parseGroups` fail-soft) |
| 11 | `groups` raw cast + canonical `JSON.stringify` nhạy key-order → dirty vĩnh viễn | Medium | Accept | Phase 4 Task 4.4 (`normalizeGroups`) |
| 12 | Task 3.3 premise sai: `admin-library.test.ts` không có literal `LibraryPartInput`; fixture partDto phải sửa ngay phase 2 | Medium | Accept | Phase 2 Task 2.7b + Phase 3 Task 3.3 |
| 13 | `removeGroup` không hoàn `intro` — mất hướng dẫn vĩnh viễn; thao tác phá hoại không confirm | Medium | Accept | Phase 4 Task 4.2 (hoàn intro) + 4.5 (confirm) |
| 14 | Giới hạn câu không nhất quán: 40/nhóm (UI) vs 40/part (schema) | Medium | Accept | Phase 4 Task 4.7 (bộ đếm tổng + disable) |
| 15 | Render contract XSS: `explanation`/`instruction` phải qua `RichTextBody` | Medium | Accept | Phase 5 Task 5.4 + risk table |
| 16 | Payload cũ PUT (thiếu `groups`) xóa trắng groups của đề draft | Medium | Reject | PUT là full-replace last-write-wins theo thiết kế (như `questions`/`optionBank`); Task 3.3 test 4 codify đúng hành vi tương thích; stale-tab là semantics PUT sẵn có toàn repo |

### Kongming GO-checkpoint (sau gates, 2026-10-23)
GO cho PR1. Hai delta đã áp vào plan: (1) deterministic verdict cho Kuhn (Task 1.3 + test 1.4); (2) risk row UI review tô lệch cặp khớp (PR3). Sau implement phase 1, kongming post-phase review bắt được lỗi Kuhn `visited` trước edge-check → sửa + test hồi quy (Task 1.4 mục 7).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05 (sau khi apply toàn bộ findings + kongming delta)
- Decision deltas checked: 16 (field/file targets, thuật toán grader, harness test, path wiring, fixture timing)
- Reconciled stale references: 3 (`FIELD_ERROR_TEXT` target, "vòng lặp render item", Task 2.1 backup)
- Unresolved contradictions: 0
- Ghi chú vận hành: một lần `git checkout -- plans/` vô tình xóa toàn bộ plan edits chưa commit (lỗi thao tác của controller khi dọn screenshot e2e); toàn bộ nội dung đã dựng lại đúng từ transcript session và cross-check lại bởi 21-point grep + `git diff` audit. Bài học: chỉ revert PNG bằng `git checkout -- $(git diff --name-only -- '*.png')`.
