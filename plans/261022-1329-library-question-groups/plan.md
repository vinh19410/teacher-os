---
title: "Thư viện đề: tầng Question Group cho Reading/Listening (PR1 + PR2)"
description: "Admin soạn được đề IELTS có nhiều nhóm câu trong một part, bố cục editor kiểu Selfomy; câu hỏi giữ mảng phẳng để grader không đổi."
status: pending
priority: P1
effort: "3-4d"
tags: [admin, library, contracts, grader, migration]
created: 2026-10-22
branch: develop
mode: advice
brainstorm: plans/reports/brainstorm-261022-2024-question-group-exam-structure.md
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
| 1 | [Trường câu hỏi dùng chung + chấm theo tập](phase-01-shared-question-fields-set-grading.md) | PR1 | — | pending |
| 2 | [Schema nhóm, migration, contract thư viện](phase-02-library-groups-schema-contracts.md) | PR2 | 1 | pending |
| 3 | [Route admin lưu/đọc nhóm](phase-03-library-groups-route.md) | PR2 | 2 | pending |
| 4 | [Editor nhóm kiểu Selfomy trong `apps/admin`](phase-04-admin-group-editor-ui.md) | PR2 | 3 | pending |
| 5 | [E2E, verify 3 viewport, docs](phase-05-e2e-verify-docs.md) | PR2 | 4 | pending |

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
| `answerSet` chưa có tác dụng trên dữ liệu thật: `parseQuizQuestions` (`apps/server/src/routes/student.ts`) dựng lại câu và bỏ field này | Ghi nhận cho PR3 — PR3 phải giữ `answerSet` (và cân nhắc `explanation`) ở hàm này; PR1 chỉ chứng minh bằng unit test |
| Migration D1 production | Cột additive có default; thêm mục runbook "chạy `db:migrate:deploy` trước khi deploy worker" |

## Handover

Plan viết cho executor model yếu hơn: mỗi phase có task kèm file đích, bước, tiêu chí, lệnh verify so khớp được, và khối **Failure Protocol** — verify trượt thì DỪNG và hỏi `kongming`, không tự đoán.
