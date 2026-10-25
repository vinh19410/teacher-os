---
phase: 1
title: "Shared: hàm chuyển đổi thư viện → paper + mở rộng QuizPaper"
status: pending
priority: P2
effort: "0.5-0.75d"
dependsOn: []
---

# Phase 1 — Shared mapping + QuizPaper option bank theo part

## Mục tiêu

Có một hàm pure ở `packages/api` biến một part thư viện (`LibraryPartInput`) thành dữ liệu mà take screen học viên đang dùng (`QuizPaperDetail` + `QuizPart[]`), và `QuizPaper` hiển thị được option bank riêng của từng nhóm. Dời `QuizReadingSplitLayout` sang `packages/ui` để admin dùng chung.

## File sở hữu

| File | Hành động |
|---|---|
| `packages/api/src/lib/library-quiz-preview.ts` | tạo — `libraryPartToQuizView(input, { skill, qOffset })` |
| `packages/api/src/lib/library-quiz-preview.test.ts` | tạo |
| `packages/api/src/lib/quiz-parts.ts` | sửa — thêm `optionBank?: string[]` vào `QuizPart`; cho phép đánh số bắt đầu từ `qOffset` (tham số tùy chọn, mặc định 0) |
| `apps/student/test/quiz-parts.test.ts` | sửa — case `qOffset` (test hiện có của `buildQuizParts` nằm ở đây) |
| `packages/ui/src/components/quiz/quiz-paper.tsx` | sửa — bank theo part |
| `apps/student/test/quiz-paper.test.tsx` | sửa — case bank theo part + intro preamble |
| `packages/ui/src/components/quiz/quiz-reading-layout.tsx` | tạo — chuyển nguyên từ app student |
| `apps/student/src/components/quiz/quiz-reading-layout.tsx` | xóa, cập nhật import ở `quiz-take-view.tsx` và `routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` |
| `packages/ui/package.json` | sửa nếu exports cần khai báo path mới |

## Hợp đồng hàm

```ts
libraryPartToQuizView(
  input: LibraryPartInput,
  opts: { skill: LibrarySkill; qOffset: number },
): { detail: QuizPaperDetail; parts: QuizPart[]; unsupportedGroupFlags: { groupLabel: string; flags: ("answersInline"|"splitContent"|"dragDrop")[] }[] }
```

- `detail`: `skill`, `type`, `band`, `intro`, `prompt: ""`, `passage`, `cueTopic/cuePoints: ""`, `audioName` (từ `input.audioName ?? ""`), `imageUrl`, `optionBank` (part-level, rỗng khi có nhóm), **không** có `note`.
- Tiền lệ: `apps/web/src/lib/assignment-quiz-sim.ts` (`buildQuizSim`, preview giáo viên #285) đã strip key + `inferQuestionTypes` + normalize pin. Hàm mới theo cùng cách strip; không import từ `apps/web` (khác app) — nếu phần normalize trùng lặp đáng kể thì tách helper chung vào `packages/api` và cho `buildQuizSim` dùng lại.
- Questions: map sang `StudentQuizQuestion` (`stem`, `opts ?? null`, `type` hiệu dụng qua `inferQuestionTypes(questions, input.type)`, `pin ?? null`). Không mang `answer`, `alts`, `explanation`, `answerSet`.
- `groups.length === 0` → `buildQuizParts(questions, input.type, input.intro, qOffset)` (giữ hành vi section-từ-intro).
- `groups.length > 0` → mỗi nhóm thành một `QuizPart`: `typeId = group.type`, `instructionHtml = group.instruction`, `optionBank = group.optionBank` (bỏ khi rỗng), `qStart = qOffset + group.startIndex + 1`, nhãn `Questions X–Y`. `q` của câu = `qOffset + index` để key answers không đụng nhau giữa các part.
- `unsupportedGroupFlags`: liệt kê nhóm bật cờ mà runtime học viên chưa hỗ trợ (D7).

## Thay đổi QuizPaper

- Giữ nguyên `bankKind` part-level cho caller cũ.
- Với part có `optionBank` riêng: tính `optionBankKindFor(skill, part.typeId, …)` cho part đó, render `OptionBankList` ngay dưới header nhóm, và `questionChoiceRows(question, type, part.optionBank)` cho câu trong part.
- Khi part có `instructionHtml` nhưng **không** được dựng từ intro (nhóm thư viện), không được cắt `intro` theo `splitQuizIntro` — thêm điều kiện phân biệt (ví dụ cờ `source: "intro" | "group"` trên `QuizPart`, hoặc chỉ split khi intro thực sự chứa marker). Chọn cách nào phải có test chứng minh intro preamble vẫn hiện đúng ở cả hai nguồn.

## Các bước

1. Viết test trước cho `libraryPartToQuizView`: part không nhóm, part nhiều nhóm khác type, nhóm có option bank, `qOffset` > 0, câu có pin, đảm bảo object câu không có key `answer`/`alts`/`explanation`/`answerSet`.
2. Thêm `qOffset` vào `buildQuizParts` (mặc định 0 — mọi caller cũ không đổi).
3. Hiện thực hàm map.
4. Sửa `QuizPaper` cho bank theo part + điều kiện cắt intro; thêm case vào `apps/student/test/quiz-paper.test.tsx` (nơi đang test `QuizPaper`): render 2 nhóm, mỗi nhóm bank riêng; caller cũ không truyền `optionBank` thì DOM như trước.
5. Dời `QuizReadingSplitLayout` sang `packages/ui`, sửa import student.

## Verify

```bash
pnpm --filter @teacher-os/api test
pnpm --filter @teacher-os/ui test
pnpm --filter student test
pnpm --filter web test
pnpm check-types
pnpm check
```

Pass khi: mọi test xanh, test student cũ không phải sửa kỳ vọng (chỉ sửa import path nếu có).

## Rủi ro / rollback

- Rủi ro chính là regression take screen học viên → các field mới đều optional; rollback = revert commit phase này, admin chưa dùng tới.
