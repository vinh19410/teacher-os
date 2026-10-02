---
title: "Quiz take: câu T/F/NG có lựa chọn + navigator phẳng full-width"
description: "Câu đáp án TRUE/FALSE/NOT GIVEN nằm trong đề type điền chữ được suy ra type tfng/ynng nên học viên có radio để chọn; navigator bỏ tab nhóm, hiển thị toàn bộ số câu trên một thanh trải full chiều ngang màn hình."
status: pending
priority: P1
effort: "6h"
issue: 303
branch: develop
tags: [bugfix, frontend, backend, quiz]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Quiz take: câu T/F/NG có lựa chọn + navigator phẳng full-width

## Overview

Hai vấn đề trên màn làm bài (split-pane reading):

1. **Câu T/F/NG không có lựa chọn.** Đề "Wooden buildings" (DB local, prompt `0ea4e5ea-…`) có `type = "note"` ở cấp đề. Câu 1–4 có đáp án `FALSE / TRUE / NOT GIVEN / FALSE` nhưng **không khai `type` riêng**, nên type hiệu dụng là `note`. `answerKindByType.note` không tồn tại, `questionChoiceRows` trả `[]`, câu render như cloze. Stem lại không có marker `____`, nên `ClozeStemText` in stem nguyên văn, **không có radio cũng không có ô nhập**. Học viên không thể trả lời. Intro giáo viên ghi rõ "Questions 1–4 · True / False / Not Given" nhưng authoring không bắt được (kind `text` chấp nhận mọi đáp án). Toàn bộ 3 prompt trong DB local không có câu nào mang `type: "tfng"`.
2. **Navigator.** `QuizNavigator` có hàng tab nhóm ("Questions 1–4 / 5–8 / 9–13") và chỉ hiện số câu của nhóm đang chọn, container bị chặn `max-w-[720px]`, và ở split-pane nằm trong pane bài làm. User muốn bỏ hàng tab, hiện toàn bộ số câu, thanh trải full chiều ngang màn hình.

Phát hiện phụ (cùng gốc): `buildQuizSim` (`apps/web/src/lib/assignment-quiz-sim.ts:72`) dựng `takeQuestions` mà **bỏ mất `item.type`**, nên preview mô phỏng của giáo viên render sai mọi đề trộn dạng.

## Key Decisions (đã chốt với user)

1. **Suy luận type ở read-time + cảnh báo ở authoring.** Một helper thuần dùng chung (`packages/api`) suy ra type hiệu dụng cho câu không khai type, khi type đề là dạng điền chữ: stem không có marker `____`, không có `opts`, đáp án thuộc bộ TFNG/YNNG. Chỉ suy luận khi type đề thuộc `CLOZE_EDITOR_TYPES` (không đụng `tablecomp`, `shortans`, prompt đã xoá) và câu không có `pin`. Server áp cho payload take và review; web áp cho preview mô phỏng. Đề cũ và attempt đang làm (snapshot không có type) chạy đúng ngay, **không migration, không đụng dữ liệu**.
2. **Quyết định tfng vs ynng theo cả cụm liên tiếp**, không theo từng câu. Câu có đáp án `NOT GIVEN` đứng một mình là mơ hồ (trung tính): cụm có họ `YES`/`NO` thì là `ynng`, còn lại là `tfng`. Cụm bị cắt khi đổi họ `TRUE`/`FALSE` <-> `YES`/`NO` để một typo không làm mất radio của cả cụm. <!-- Updated: Red Team F2 -->
3. **So khớp đáp án đúng chính tả canonical** (`TRUE`, `FALSE`, `NOT GIVEN`, `YES`, `NO`) sau trim, phân biệt hoa thường. Đáp án note-completion kiểu "true" viết thường sẽ không bị chuyển dạng nhầm.
4. **Authoring không chặn lưu.** Answer-key grid cảnh báo inline trên các câu bị suy luận và có nút 1-click "Đặt dạng True/False/Not Given cho câu X–Y". Nút giữ nguyên stem và đáp án (đáp án đã hợp lệ với kind mới). Runtime đã an toàn nên không cần ready-gate.
5. **Navigator phẳng + full-width.** Bỏ `role="tablist"` và state `activePartIndex`; render toàn bộ nút số câu theo thứ tự, `flex-wrap` từ trái qua phải. Ở split-pane, navigator chuyển ra ngoài grid thành footer trải cả 2 pane. Bỏ `max-w-[720px]` ở mọi mode.
6. **Grading không đổi.** `gradeQuiz` so khớp không phân biệt hoa thường, nên giá trị radio `"FALSE"` khớp key `"FALSE"`.

## Non-Goals

- Không migration hay backfill `assignment_prompt.questions` / `quiz_attempt.questions_snapshot`.
- Không suy luận cho mcq/letter/roman (cần `opts` hoặc bank, không suy ra được từ đáp án một cách an toàn).
- Không suy luận type từ text intro của giáo viên.
- Không đổi contract wire (`studentQuizQuestionSchema` đã có `type` optional).
- Không thêm ô nhập fallback cho câu cloze không có marker mà đáp án không suy luận được (xem Unresolved Questions).

## Phases

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 1 | [Helper suy luận type câu (packages/api)](./phase-01-infer-question-types-helper.md) | 1.5h | Pending |
| 2 | [Áp suy luận vào payload server + preview mô phỏng](./phase-02-wire-inference-server-and-sim.md) | 1.5h | Pending |
| 3 | [Cảnh báo + 1-click gán dạng ở answer-key grid](./phase-03-authoring-warning-one-click.md) | 1.5h | Pending |
| 4 | [Navigator phẳng full-width + e2e + gate cuối](./phase-04-flat-full-width-navigator-and-e2e.md) | 1.5h | Pending |

Phụ thuộc: 1 → 2 → 3. Phase 4 độc lập về file với 1–3, có thể làm song song; e2e của phase 4 chạy sau cùng vì phủ cả fix TFNG.

## Success Criteria

- [ ] Đề "Wooden buildings" (type `note`, câu 1–4 không type, đáp án TFNG): câu 1–4 hiện 3 radio TRUE / FALSE / NOT GIVEN trên take screen, review screen và preview mô phỏng của giáo viên. Chọn đúng thì được chấm `correct`.
- [ ] Câu 5–13 (stem có `____`) vẫn render ô nhập như cũ.
- [ ] Câu đã khai type riêng, đề type choice (tfng/mcq…) và câu có `opts`: không đổi hành vi.
- [ ] Answer-key grid hiện cảnh báo cho câu 1–4. Bấm nút 1-click thì `type = "tfng"`, đáp án giữ nguyên, cảnh báo biến mất.
- [ ] Navigator không còn tab nhóm, hiện đủ 13 nút. Ở split-pane, thanh trải full chiều ngang dưới cả 2 pane; ở 1 cột, thanh trải full chiều ngang.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, `pnpm --filter web test`, `pnpm --filter server test`, e2e `student-quiz-take-review` (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`) đều xanh.

## Risks

| Risk | Mitigation |
|------|-----------|
| Suy luận nhầm một câu điền chữ thật thành TFNG | Yêu cầu đồng thời: type đề thuộc `CLOZE_EDITOR_TYPES`, stem không có marker, không có opts/pin, đáp án đúng chính tả canonical viết hoa. Unit test cho các case biên (kể cả `tablecomp`). |
| Suy luận lộ thông tin đáp án | Chỉ lộ "đáp án ∈ {TRUE, FALSE, NOT GIVEN}", cũng chính là nội dung instruction của dạng bài. Không lộ đáp án cụ thể. |
| Client cũ + server mới trong cửa sổ deploy | Wire vẫn là `type: string`; client cũ đọc `question.type ?? detail.type` nên nhận `tfng` và render radio như đề tfng thường. |
| Bỏ tab làm navigator dài với đề 40 câu | `flex-wrap` xuống dòng; thanh full-width chứa ~25–30 nút mỗi dòng ở ≥ lg; dưới lg giới hạn `max-h-[30svh]` có cuộn. |

## Unresolved Questions

- Câu thuộc type điền chữ, stem không có `____`, đáp án không phải TFNG/YNNG (đề legacy) hiện vẫn không có ô nhập. Có muốn thêm ô nhập fallback dưới stem ở take mode không? Đây là phạm vi riêng, plan này không làm.

## Validation Log

### Session 1 — 2026-10-02 (vibe, tự động)
- Các quyết định thiết kế đã được user chốt trước khi viết plan (mục Key Decisions), nên không có câu hỏi interview mới.
- Verification pass (tier Standard, 4 phase): đã đối chiếu đường dẫn file, symbol, export wildcard `@teacher-os/api/*`, dòng code ở `contracts.ts`, `cloze.ts`, `student.ts`, `assignment-quiz-sim.ts`, `answer-key-grid.tsx`, `quiz-navigator.tsx`, `quiz-reading-layout.tsx`, spec e2e và các file test. Verified: tất cả; Failed: 0; Unverified: 0. Lệch nhẹ về số dòng (`quiz-navigator.tsx` max-w ở dòng 60 thay vì 63) không ảnh hưởng nội dung.
- Phát hiện thêm: `student-preview-paper.tsx` (preview tĩnh lúc soạn) cũng đọc type theo `item.type ?? typeId`; ghi rõ ngoài phạm vi ở phase 2.

### Whole-Plan Consistency Sweep
- Đã đối chiếu `plan.md` và 4 phase sau các thay đổi red-team: Key Decision 2, Risks, Success Criteria và contract phase 1 cùng dùng một quy tắc (CLOZE_EDITOR_TYPES, không `pin`, cắt run theo họ). Lệnh test trong phase 1–3 đã bỏ `--`. Không còn mâu thuẫn.

## Red Team Review

Báo cáo đầy đủ: [`plans/reports/red-team-261002-303-plan.md`](../reports/red-team-261002-303-plan.md). 3 lens (Assumption Destroyer, Failure Mode Analyst, Security/Data Adversary), 9 finding, mọi finding đều có evidence `file:line`.

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| F1 | Critical | Helper hijack `tablecomp` và prompt đã xoá (`promptType = ""`) | Accept — giới hạn theo `CLOZE_EDITOR_TYPES` + không `pin` (phase 1) |
| F2 | High | Một typo YES làm cả run TRUE/FALSE thành `ynng`; hai section liền kề bị gộp | Accept một phần — cắt run theo họ TF/YN. Reject phần truyền ranh giới section vào helper (thêm coupling, kịch bản hiếm, run trộn họ đã bị cắt) |
| F3 | High | Nút 1-click gán type ngoài catalog của part, server trả 400 | Accept — chỉ hiện nút khi type nằm trong `typeCatalog` (phase 3) |
| F4 | High | Contract `data-testid` của pane cuộn | Accept — làm rõ trong phase 4 |
| F5 | High | Footer navigator ở mobile chiếm quá nhiều chiều cao | Accept — `max-h-[30svh] overflow-y-auto` dưới lg (phase 4) |
| F6 | Medium | `pnpm … test -- <pattern>` chạy toàn bộ suite | Accept — bỏ `--` (phase 1–3) |
| F7 | Medium | Enter trên fieldset thêm câu mới thay vì kích hoạt nút | Accept — cảnh báo đặt sibling trước fieldset (phase 3) |
| F8 | Medium | Đáp án near-miss (`True`, `Not given`) không có widget lẫn cảnh báo | Reject — scope mới, trùng Unresolved Question đã ghi; Key Decision 3 đã chốt so khớp canonical chính tả |
| F9 | Medium | CHANGELOG không có mục Unreleased | Accept — dùng mục `## 2026-10-02` (phase 4) |

Verification source cho disposition: đọc trực tiếp `cloze.ts`, `cloze-stem.tsx`, `assignments/index.ts:165-182`, `CHANGELOG.md:1-14`.

### Whole-Plan Consistency Sweep
- Decision delta: giới hạn type đề, loại `pin`, cắt run theo họ, nút theo catalog, testid giữ trên phần tử cuộn, max-h mobile, bỏ `--`, CHANGELOG theo ngày. Đã đồng bộ ở `plan.md` và phase 1–4. Không còn mâu thuẫn chưa giải quyết.
