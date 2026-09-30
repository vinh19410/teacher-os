---
title: "Student quiz take redesign: reading split-pane + instruction từng cụm"
description: "Redesign trang làm bài /learn/quizzes/:assignmentId — reading chia 2 pane cuộn độc lập (bài đọc trái, bài làm phải) và mỗi cụm câu hỏi có khối hướng dẫn riêng đặt ngay phía trên cụm đó."
status: completed
priority: P1
effort: 16h
issue: 286
branch: develop
tags: [feature, frontend, api, authoring]
blockedBy: []
blocks: []
created: 2026-09-30
---

# Student quiz take redesign: reading split-pane + instruction từng cụm

## Overview

Trang làm bài học viên `/learn/quizzes/:assignmentId` (app `student`) hiện là một
cột duy nhất `max-w-[720px]` cuộn chung: bài đọc (passage), toàn bộ khối hướng
dẫn (intro) và câu hỏi nằm liền luồng — học viên phải cuộn lên/xuống liên tục
giữa bài đọc và câu hỏi, và các khối hướng dẫn của từng cụm câu hỏi bị dồn
thành một cụm ở đầu trang (như ảnh chụp kèm yêu cầu: 3 khối "Questions 1–4 ·
T/F/NG", "Questions 5–8 · Flow-chart", "Questions 9–13 · Note completion" gom
chung).

Nguyên nhân gốc: model hiện tại là **1 prompt = 1 `type` + 1 `intro` blob**
(`packages/api/src/contracts.ts:450`–`510`, server build detail tại
`apps/server/src/routes/student.ts:815`) — dữ liệu không có ranh giới cụm câu
hỏi, nên renderer không có gì để gắn hướng dẫn vào từng cụm.

Plan này thay theo hướng **user đã chốt** (AskUserQuestion 2026-09-30):
"type theo từng câu" —

1. **Per-question `type`**: thêm `type` cho từng câu hỏi (contract authoring →
   payload student), chia cụm theo chuỗi câu liên tiếp cùng type. Sửa luôn lỗi
   trong ảnh chụp: câu T/F/NG do giáo viên nhét vào prompt cloze hiện KHÔNG có
   chỗ nhập đáp án (type prompt không có `answerKindByType` nên không sinh pill).
2. **Header từng cụm**: mỗi cụm hiển thị `Questions X–Y` + nhãn dạng bài +
   instruction chuẩn IELTS (bản dịch tiếng Anh chuẩn theo type, từ map dùng
   chung) ngay phía trên cụm — đúng đề thi thật.
3. **Split-pane reading**: đề reading có passage chia 2 pane cạnh nhau, mỗi pane
   có thanh cuộn riêng — passage trái, bài làm (header cụm + câu hỏi) phải;
   màn hẹp (< lg) giữ xếp chồng 1 cột như hiện tại.
4. Listening/writing/speaking giữ layout 1 cột hiện tại (chỉ được lợi từ
   header cụm ở listening).

## Key Decisions

1. **Per-question type là optional + fallback `prompt.type`** ở phía server khi
   build payload student — đề cũ (kể cả attempt snapshot đang làm dở) không cần
   migration, hiển thị không đổi. Không có DB migration: `questions` đã là cột
   JSON text (`packages/db/src/schema/assignment-prompt.ts:35`).
2. **Instruction chuẩn theo type đặt trong map dùng chung**
   (`QUIZ_TYPE_DISPLAY` ở `packages/api/src/contracts.ts`) — mỗi type id có
   `{ label, instruction }` tiếng Anh chuẩn IELTS. `intro` của prompt vẫn render
   1 lần phía trên cụm đầu (giữ chỗ cho ghi chú riêng của giáo viên); giáo viên
   không còn phải tự dán instruction chuẩn vào intro. Lưu ý trade-off: intro đề
   CŨ đã dán sẵn 3 khối instruction sẽ tạm trùng lặp với header cụm — giáo viên
   tự dọn intro, không tự động xoá dữ liệu của họ.
3. **Grading không đổi**: `gradeQuiz` so khớp chuỗi thuần sau normalize
   (`apps/server/src/lib/grade-quiz.ts:50`), không đọc type — per-question type
   chỉ ảnh hưởng render + validation authoring.
4. **Phân cụm thực hiện trong `buildQuizParts`** (`apps/student/src/lib/quiz-parts.ts`)
   — `QuizPart`/`QuizPaper`/`QuizNavigator` đã thiết kế sẵn multi-part
   (part tabs ở navigator, `<section>` per part ở paper), giờ mới bật lên.
5. **Thứ tự với plan pending `260930-0801-teacher-quiz-preview-simulation`**
   (user chốt "redesign trước"): plan này làm trên `apps/student` + contracts;
   plan sáng nay sau đó rebase (thuộc dạng move + cutover thuần). Không chạy
   song song để tránh đụng `quiz-paper.tsx`/`quiz-parts.ts`/`grade-quiz.ts` hai
   lần.
6. **Split-pane chỉ áp dụng khi `skill === "reading"` và passage không rỗng**;
   ảnh đề (diagram/map pin) + option bank vẫn thuộc pane bài làm vì câu trả
   lời nằm ở đó. Review screen (`attempt/$attemptId.detail.tsx`) dùng chung
   layout mới để học viên soi bài thấy đúng cấu trúc đã làm.

## Non-Goals

- Không đưa full test (`assignment_test`) xuống student take (hướng dài hạn,
  chọn khi có nhu cầu thực tế).
- Không đổi grader, không đổi autosave/attempt domain (#283 giữ nguyên).
- Không thêm transcript vào listening take (vẫn không render như hiện tại).
- Không render header cụm trên teacher preview page (`/assignments/preview`) —
  chỉ student take + review.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Contracts + server: per-question type & instruction metadata](./phase-01-contracts-server-per-question-type.md) | Pending |
| 2 | [Authoring: chọn type từng câu](./phase-02-authoring-per-question-type.md) | Pending |
| 3 | [Take screen: chia cụm + header instruction trên từng cụm](./phase-03-take-cluster-instruction-headers.md) | Pending |
| 4 | [Reading split-pane: passage trái / bài làm phải](./phase-04-reading-split-pane-layout.md) | Pending |

Phase 1 → 2 → 3 → 4 tuần tự (2 và 3+4 thuộc app khác nhau — sở hữu file rạch
ròi, có thể chạy song song nếu cần).

## Success Criteria

- [ ] Đề reading trên take screen: passage bên trái, bài làm bên phải, mỗi bên
      cuộn độc lập (desktop ≥ lg); màn hẹp xếp chồng không mất chức năng.
- [ ] Mỗi cụm câu hỏi có header `Questions X–Y` + nhãn dạng bài + instruction
      chuẩn ngay phía trên cụm — không còn gom 1 cụm ở đầu trang.
- [ ] Đề trộn nhiều dạng câu hỏi (như ảnh: T/F/NG + flow-chart + note) từng câu
      nhập được đáp án đúng dạng (pill lựa chọn hoặc ô điền).
- [ ] Đề cũ (1 type, không per-question type) hiển thị và chấm y hệt trước đây;
      attempt đang làm dở không mất dữ liệu resume.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter student test`,
      `pnpm --filter web test`, `pnpm --filter server test`,
      `pnpm --filter e2e e2e` (ports 8100/8101/8103) đều xanh.

## Dependencies

- Sau #283/#284 (đã merge, `f0ceefc`) — tận dụng renderer + attempt domain.
- Issue theo dõi: [#286](https://github.com/vinh19410/teacher-os/issues/286).
- Plan `260930-0801-teacher-quiz-preview-simulation` (#285, pending) sẽ
  rebase lên kết quả plan này — nó move chính các file phase 3–4 sửa.

## Validation Log

### Session 1 — 2026-09-30
**Trigger:** ak-plan validation gate sau khi soạn plan (mode auto/fast + scope
interview đầu session đã chốt hướng per-question type & thứ tự với plan sáng).
**Questions asked:** 3 (+2 scope interview trước khi scaffold)

#### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier, 4 phases)
- **Claims checked:** 24 (file:line cites trong 4 phase files + scripts verify)
- **Verified:** 23 | **Failed:** 0 | **Unverified:** 1→0 (tự resolve)
- Caller enumerations: `questionChoiceRows` — 1 caller duy nhất
  (`quiz-paper.tsx:90`) ✓; `buildQuizParts` — 2 caller
  (`$assignmentId.tsx:132`, `$attemptId.detail.tsx:71`) ✓; package/test scripts
  (`server`, `web`, `student` vitest; `e2e` playwright) ✓.

#### Failures / Findings (đã propagate)
1. [Contract Verifier] `studentQuizDetailSchema` được client student
   strict-parse tại `apps/student/src/lib/repos/quiz.ts:61` — plan gốc yêu cầu
   `type: z.string()` REQUIRED ở client schema → tab học viên đang mở (bundle
   cũ) sẽ throw khi server mới gửi field lạ trong cửa sổ deploy.
   **Fix đã áp dụng:** phase-01 đổi thành `z.string().optional()` + fallback
   kép (server resolve `?? prompt.type` khi gửi; client
   `question.type ?? detail.type`); phase-03 cập nhật signature
   `buildQuizParts(questions, promptType)` + test fallback.

#### Questions & Answers

1. **[Tradeoff]** Instruction chuẩn trên header từng cụm hiển thị bằng ngôn
   ngữ nào?
   - Options: Tiếng Anh chuẩn IELTS | Song ngữ EN + Việt | Tiếng Việt
   - **Answer:** Tiếng Anh chuẩn IELTS
   - **Rationale:** đúng nguyên văn đề thi thật, map type→instruction tĩnh dễ
     bảo trì; `QUIZ_TYPE_DISPLAY` phase-01 đã soạn EN — không cần đổi phase.
2. **[Scope/UX]** Ở viewport hẹp (< lg), layout split-pane reading fallback
   về dạng nào?
   - Options: Xếp chồng 1 cột | Tab "Bài đọc"/"Bài làm" | Collapse passage
   - **Answer:** Xếp chồng 1 cột
   - **Rationale:** không thêm UI/state mới, rủi ro thấp nhất; phase-04 đã ghi
     đúng phương án này.
3. **[Assumptions]** Khối `intro` của prompt xử lý thế nào trên take screen
   sau khi có instruction chuẩn từng cụm (đề cũ đã dán instruction vào intro
   sẽ trùng lặp)?
   - Options: Giữ nguyên intro | Ẩn intro trên take | Collapse intro
   - **Answer:** Giữ nguyên intro
   - **Rationale:** không tự ẩn dữ liệu giáo viên; trùng lặp tạm thời của đề
     cũ được GV tự dọn; khớp Key Decisions #2 sẵn có.

#### Confirmed Decisions
- Hướng triển khai: per-question type + split-pane + instruction chuẩn EN —
  user chốt ở scope interview.
- Thứ tự với plan `260930-0801`: redesign trước, plan sáng rebase sau.
- Instruction EN chuẩn IELTS; mobile xếp chồng; intro giữ nguyên.

#### Impact on Phases
- Phase 1: schema client optional + fallback kép (verification finding).
- Phase 3: `buildQuizParts(questions, promptType)` + test case fallback.
- Phase 2/4: không đổi.

### Whole-Plan Consistency Sweep
- Files reread: plan.md + cả 4 phase files (sau khi propagate).
- Decision deltas checked: 4 (optional-type/fallback kép, EN instruction,
  stacked mobile, intro giữ nguyên).
- Reconciled stale references: 0.
- Unresolved contradictions: 0.
