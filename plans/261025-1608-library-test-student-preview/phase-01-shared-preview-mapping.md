---
phase: 1
title: "Shared: hàm chuyển đổi thư viện → paper + mở rộng QuizPaper"
status: completed
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
| `packages/api/src/lib/quiz-parts.ts` | sửa — thêm `optionBank?: string[]` + `source?: "intro" \| "group"` vào `QuizPart`; cho phép đánh số bắt đầu từ `qOffset` (tham số tùy chọn, mặc định 0) |
| `apps/student/test/quiz-parts.test.ts` | sửa — case `qOffset` (test hiện có của `buildQuizParts` nằm ở đây) |
| `packages/ui/src/components/quiz/quiz-paper.tsx` | sửa — bank theo part; ảnh/pin gate theo part; detail-level bank chỉ render khi có bank |
| `packages/ui/src/components/assignments/pin-overlay.tsx` | sửa — key đáp án theo `item.q ?? offset` (red-team RT1) |
| `apps/student/test/quiz-paper.test.tsx` | sửa — case bank theo part + intro preamble |
| `packages/ui/src/components/quiz/quiz-reading-layout.tsx` | tạo — chuyển nguyên từ app student + prop `fillParent?: boolean` (mặc định false, hành vi cũ) |
| `packages/ui/src/components/quiz/quiz-reading-layout.test.tsx` | chuyển từ `apps/student/test/quiz-reading-layout.test.tsx` — KHÔNG xóa case nào (RT15) |
| `apps/student/src/components/quiz/quiz-reading-layout.tsx` | xóa, cập nhật import ở `quiz-take-view.tsx` và `routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` |
| `packages/ui/package.json` | không cần sửa — exports map `./components/*` wildcard |

## Hợp đồng hàm

```ts
libraryPartToQuizView(
  input: LibraryPartInput,
  opts: { skill: LibrarySkill; qOffset: number },
): { detail: QuizPaperDetail; parts: QuizPart[]; unsupportedGroupFlags: { groupLabel: string; flags: ("answersInline"|"splitContent"|"dragDrop")[] }[] }
```

- `detail`: `skill`, `type`, `band`, `intro`, `prompt: ""`, `passage`, `cueTopic/cuePoints: ""`, `audioName` (từ `input.audioName ?? ""`), `imageUrl`, `optionBank` (part-level, rỗng khi có nhóm), **không set `note`** (field optional của `QuizPaperDetail` — preview không mang note; claim cũ "QuizPaperDetail không có note" SAI — Pick có `note`, FactCheck #7).
- **Hàm phải PURE (RT7):** không mutate `input` hay bất kỳ object con — câu trả về dựng object mới; unit test assert deep-equal input trước/sau lời gọi (input có thể là object dùng chung từ `savedInputs` cache của `effective-parts.ts`).
- **KHÔNG lọc câu (RT14):** mapping giữ 1-1 index với `input.questions` — khác `buildQuizSim` (tiền lệ #285 lọc stem rỗng); câu stem rỗng render hàng rỗng như runtime student thật; `group.startIndex/count` và `q` giữ khớp cây đề. Test case 1 câu stem rỗng giữa nhóm.
- Tiền lệ: `apps/web/src/lib/assignment-quiz-sim.ts` (`buildQuizSim`, preview giáo viên #285) đã strip key + `inferQuestionTypes` + normalize pin. Hàm mới theo cùng cách strip; không import từ `apps/web` (khác app) — nếu phần normalize trùng lặp đáng kể thì tách helper chung vào `packages/api` và cho `buildQuizSim` dùng lại.
- Questions: map sang `StudentQuizQuestion` (`stem`, `opts ?? null`, `type` hiệu dụng qua `inferQuestionTypes`, `pin ?? null`). Không mang `answer`, `alts`, `explanation`, `answerSet`, `transcript`, `note`.
- **Infer theo nhóm (RT9):** `groups.length > 0` → chạy `inferQuestionTypes(questions.slice(group.startIndex, …), group.type)` TỪNG NHÓM (câu draft chưa khai type ở nhóm sau phải nhận type nhóm đó, không phải type nhóm đầu); chỉ part nhóm ngầm (`groups.length === 0`) infer theo `input.type`.
- `groups.length === 0` → `buildQuizParts(questions, input.type, input.intro, qOffset)` (giữ hành vi section-từ-intro; part sinh ra có `source: "intro"` khi dựng từ section, phần cluster không set — **R1: set ngay trong nhánh section của `buildQuizParts`**, test intro-split student hiện có phải xanh không sửa kỳ vọng).
- **R2:** `qOffset` chỉ cộng vào `q`/`number`/`qStart` SAU khi `splitQuizIntro` chạy xong (hàm split tự quy số về local — không truyền qOffset vào split). Test: part có intro "Questions 14–20" và `qOffset=13` → nhãn section giữ "Questions 1–7" local, `q`/`number` của câu = 13+i.
- `groups.length > 0` → mỗi nhóm thành một `QuizPart` (`source: "group"`): `typeId = group.type`, `instructionHtml = group.instruction`, `optionBank = group.optionBank` (bỏ khi rỗng), `qStart = qOffset + group.startIndex + 1`, nhãn `Questions X–Y`. `q` của câu = `qOffset + index` để key answers không đụng nhau giữa các part.
- `unsupportedGroupFlags`: liệt kê nhóm bật cờ mà runtime học viên chưa hỗ trợ (D7).

## Thay đổi QuizPaper

- Giữ nguyên `bankKind` part-level cho caller cũ. **Chỉ render `OptionBankList` cấp detail khi `detail.optionBank.length > 0` (RT2)** — không thì grouped bankable part (detail.bank rỗng bắt buộc theo schema) hiện alert giả "Thiếu ngân hàng lựa chọn". Test: grouped bankable part → DOM không chứa "Thiếu ngân hàng lựa chọn".
- Với part có `optionBank` riêng: tính `optionBankKindFor(skill, part.typeId, …)` cho part đó, render `OptionBankList` ngay dưới header nhóm, và `questionChoiceRows(question, type, part.optionBank ?? detail.optionBank)` cho câu trong part (**R5 — fallback tránh câu bankable rơi về bank detail rỗng**). Unit test: 2 nhóm, 2 bank khác nhau, mỗi câu thấy đúng bank nhóm mình.
- **Điều kiện cắt intro CHỈ theo cờ `source` (RT11 — đã bỏ phương án "chỉ split khi intro chứa marker", đó là bẫy: `splitQuizIntro` trả null ⟺ không có marker nên hai cách tương đương hành vi cũ, vẫn nuốt preamble khi intro có marker):** split intro chỉ khi `parts.some(p => p.source === "intro")`; part `source: "group"` render intro nguyên vẹn (không cắt) kể cả khi intro chứa marker "Questions X–Y". Test bắt buộc: part nhóm + intro chứa marker → intro render nguyên vẹn.
- **PinOverlay key theo `q` (RT1 — Critical; chốt C2+R3 kongming):** PinOverlay vẫn là **MỘT overlay cấp paper** (không per-part — tránh ảnh lặp theo cụm, dời layout học viên). Đổi PinOverlay: key answers/verdicts theo `item.q ?? offset`; nhãn pin hiển thị `item.number ?? qStart + offset`; nới kiểu `items` thành shape `{ pin, q?: number, number?: number }` thay vì `AssignmentQuestion` (bỏ luôn cast `as unknown as` ở QuizPaper). Caller hiện có giữ hành vi cũ: take screen student truyền full mảng (`q === offset`), web preview (`prompt-preview-aside.tsx`, `student-preview-paper.tsx`) truyền item không có `q` → rơi về offset. `qStart` KHÔNG đổi theo part. Test: part pin với `qOffset > 0` → điền pin ghi đúng key `answers[qOffset+i]`, nhãn pin hiển thị số câu toàn đề; test web hiện có phải xanh không sửa kỳ vọng.
- **Ảnh/pin gate (RT5; chốt C3 kongming):** nếu `parts.some(p => p.source === "group")` → gate ảnh theo `parts.some(p => isImageBasedType(skill, p.typeId))` (thư viện hợp lệ cho nhóm image-based không phải nhóm đầu); **mọi trường hợp khác giữ nguyên** `isImageBasedType(skill, detail.type)` — đề học viên có cluster ảnh nhưng detail.type không ảnh hiện tại KHÔNG hiện ảnh, giữ đúng hành vi đó (AC "take screen không đổi hành vi"). `imageUrl` vẫn là field part-level; Paper render MỘT ảnh như cũ.

## Các bước

1. Viết test trước cho `libraryPartToQuizView`: part không nhóm, part nhiều nhóm khác type (infer per-group), nhóm có option bank, `qOffset` > 0, câu có pin (object câu không có key `answer`/`alts`/`explanation`/`answerSet`/canary), câu stem rỗng giữ vị trí (RT14), deep-equal input trước/sau (RT7).
2. Thêm `qOffset` + `optionBank` + `source` vào `buildQuizParts`/`QuizPart` (mặc định 0/undefined — mọi caller cũ không đổi; section part set `source: "intro"`).
3. Hiện thực hàm map (pure, không lọc câu, infer per-group).
4. Sửa `QuizPaper`: bank theo part + suppress detail bank rỗng + intro split theo cờ `source` + gate ảnh theo group-parts (C3) + PinOverlay cấp paper key theo `item.q ?? offset` (C2); thêm case vào `apps/student/test/quiz-paper.test.tsx` (nơi đang test `QuizPaper`): render 2 nhóm, mỗi nhóm bank riêng; caller cũ không truyền `optionBank` thì DOM như trước; pin part qOffset>0 đúng key.
5. Dời `QuizReadingSplitLayout` sang `packages/ui` cùng file test (thêm prop `fillParent?: boolean`, mặc định false), sửa import student — **R4: giữ cả 2 export (`QuizReadingSplitLayout` + `isReadingSplitPane`)**, chạy `pnpm check-types` ngay sau bước này.

## Verify

```bash
pnpm --filter @teacher-os/api test
pnpm --filter @teacher-os/ui test
pnpm --filter student test
pnpm --filter web test
pnpm check-types
pnpm check
```

Pass khi: mọi test xanh; test layout chuyển sang `packages/ui` (không xóa case nào); test student cũ không phải sửa kỳ vọng (chỉ sửa import path nếu có).

## Rủi ro / rollback

- Rủi ro chính là regression take screen học viên → các field mới đều optional; PinOverlay key `item.q ?? offset` giữ hành vi cũ khi `q === offset` (caller student truyền full mảng); rollback = revert commit phase này, admin chưa dùng tới.
