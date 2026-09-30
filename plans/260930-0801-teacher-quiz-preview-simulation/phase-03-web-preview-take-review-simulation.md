---
phase: 3
title: "Web preview take + review simulation"
status: pending
priority: P2
effort: "6h"
dependencies: [2]
---

# Phase 3: Web preview take + review simulation

## Goal

Trên `/assignments/preview` (cả bank mode `?id=` lẫn draft mode), đề auto-graded
(reading/listening) có segmented control **"Đề bài" / "Làm thử & Soi bài"**;
tab mới cho giáo viên làm bài tương tác rồi xem review chấm client-side bằng
`gradeQuiz` — không lưu, không API.

## Context Links

- `reports/scout-report.md` mục 1, 5, 6 — hiện trạng route preview, mapping
  precedent server, pattern test web (jsdom opt-in).
- Phase 1 (`gradeQuiz` ở `@teacher-os/api`), Phase 2 (renderer ở
  `@teacher-os/ui/components/quiz`).
- Quyết định user: chế độ Làm thử + Soi bài; chỉ reading/listening; tab layout.

## Key Insights

- **Take view nhận questions ĐÃ STRIP KEY** (Red Team, mirror server precedent
  `apps/server/src/routes/student.ts:886-892` map `{stem, opts, pin}`): DOM của
  tab làm thử không được chứa `answer`/`alts`/`note` và **props/state của cây
  take cũng không** — không dựa vào việc renderer "chợt" bỏ qua field thừa.
  `buildQuizSim` trả 2 mảng cùng thứ tự: `takeQuestions` (strip) cho
  `buildQuizParts` render take; `fullQuestions` (full-key) chỉ đi vào
  `gradeQuiz` lúc submit. Unit test DOM-scan giữ làm lớp 2.
- **Resolver skill/type đúng công thức `StudentPreviewPaper`** (L41-47):
  `skill ?? "writing"` (skill KHÔNG fallback task/genre); `part ?? task`,
  `type ?? genre`. Không "fill chuỗi rỗng" — `type: ""` làm
  `answerKindByType[""]` undefined → câu mcq render thành cloze tự do và
  **chấm sai** so với key letter. Gating của sim phải khớp gating `isAuto` của
  tab "Đề bài" trên cùng một prompt (unit test pin).
- **Malformed data phải normalize** (mirror tinh thần `parseQuizQuestions`
  `student.ts:868-873`): items legacy thiếu `alts`/`answer`/`stem` →
  `buildQuizSim` default `alts: ""`, `answer: ""`, bỏ item thiếu `stem`, trả
  `null` nếu không dựng được — tránh TypeError trong `gradeQuiz` khi "Nộp bài".
- **State lift lên route component** (Red Team — giữ bài làm khi đổi tab +
  tránh stale khi đổi đề): hook `useQuizSimulation(sim)` sống ở
  `preview.tsx`, giữ `answers` + `grade`; render **điều kiện đúng 1 tab tại một
  thời điểm** (không CSS-hidden — DOM chỉ chứa tab active, review key không nằm
  trong DOM ẩn khi ở take). Đổi `?id`/draft không remount route (search-only
  navigation) → reset bằng `useEffect` theo `simKey` (bank `prompt.id`, draft
  fingerprint ổn định — KHÔNG dùng object identity vì `previewDraftFromPrompt`
  tạo object mới mỗi render). Đổi tab KHÔNG reset state; "Làm lại" là reset
  duy nhất bởi user.
- **PinOverlay/ClozeStemText key answers theo offset trong items** — truyền đủ
  và đúng thứ tự; `takeQuestions` và `fullQuestions` phải đồng bộ index để
  verdict/answer map không lệch (`quiz-paper.tsx:93-95` chú thích).
- **Note 1 cho mọi câu** (prompt-level) — giống `attempt.note` ở detail route.
- **Verdict map**: `gradeQuiz` trả `verdicts: QuizVerdict[]` index-aligned →
  build `Record<number, QuizReviewInfo>` + `Record<number, QuizVerdict>` cho
  navigator (number-keyed — phase 2 đã unify).

## Requirements

- [ ] Đề bank (?id=) hoặc draft, sau khi resolve `skill` ∈ {reading, listening}
      VÀ `items` không rỗng → hiện segmented control 2 tab, default "Đề bài".
- [ ] Tab "Đề bài": `StudentPreviewPaper` đúng hiện trạng, nhưng với đề
      auto-graded **ẩn** khối textarea "Bài làm mô phỏng" (vô dụng cho cloze/mcq
      — đã có tab "Làm thử & Soi bài" thay thế); writing/speaking không có tab
      và giữ nguyên textarea như hôm nay. (Validation S1)
- [ ] Tab "Làm thử & Soi bài":
  - [ ] Take: `QuizPaper` mode take + `QuizNavigator` + nút "Nộp bài" (hiện số
        câu đã làm); điền đáp án qua input cloze/choice/pin như học viên.
  - [ ] Review sau nộp: `AttemptScoreCard` (action = nút "Làm lại") +
        `AttemptCompactList` + `QuizPaper` mode review (inputs disabled, verdict
        chip, "Đáp án: X — thay thế", disclosure "Giải thích" từ `note`).
  - [ ] "Làm lại" reset answers + grade, quay về take.
- [ ] Đề writing/speaking hoặc items rỗng: KHÔNG có tab — layout hiện trạng.
- [ ] Unit test: mapping defaults; take DOM **và take props** không chứa
      key/alts/note; luồng điền → nộp → verdict/Đáp án/Giải thích đúng
      `gradeQuiz`; mcq có type-fallback hiển thị radio pills khớp tab "Đề bài"
      (cùng resolver); malformed items (thiếu alts/answer/stem) không crash.
- [ ] Unit test composed state: submit → bấm "Làm lại" → DOM trở lại không
      chứa key/alts/note; transition `?id=A` → `?id=B` không giữ grade cũ
      (search-only navigation không remount — reset qua simKey); đổi tab giữ
      answers.

## Architecture

```
apps/web/src/lib/assignment-quiz-sim.ts          (mới) map AssignmentPrompt →
  { detail: QuizPaperDetail, takeQuestions: StudentQuizQuestion[] (strip key),
    fullQuestions: AssignmentQuestion[], note: string, simKey: string } | null
apps/web/src/lib/use-quiz-simulation.ts          (mới) hook state ở route level:
  answers Record<number,string>, grade: QuizGrade|null, submit(), reset();
  tự reset khi simKey đổi (?id=A → ?id=B, draft đổi)
apps/web/src/components/assignments/preview-quiz-simulation.tsx (mới, presentational)
  take  := QuizPaper(mode take, parts từ takeQuestions) + QuizNavigator + Nộp bài
  review:= AttemptScoreCard(action "Làm lại") + AttemptCompactList
           + QuizPaper(mode review, review map) + QuizNavigator(verdicts)
apps/web/src/routes/_auth/assignments/preview.tsx (sửa)
  + segmented control khi sim != null; render điều kiện 1 tab (chỉ tab active
    nằm trong DOM); state qua use-quiz-simulation (đổi tab không mất bài làm)
```

Không đụng: server, student app, e2e hiện có (chạy lại để xác nhận không regress).

## Files to Create / Modify

- Create: `apps/web/src/lib/assignment-quiz-sim.ts`.
- Create: `apps/web/src/lib/use-quiz-simulation.ts`.
- Create: `apps/web/src/components/assignments/preview-quiz-simulation.tsx`.
- Create: `apps/web/src/lib/assignment-quiz-sim.test.ts`.
- Create: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx`
  (tag `// @vitest-environment jsdom` cho tương tác + composed-state tests —
  precedent `rich-text-editor.test.tsx`).
- Modify: `apps/web/src/routes/_auth/assignments/preview.tsx` (tab state +
  điều kiện render + useQuizSimulation; viết lại phần lead mô tả 2 tab cho đề
  auto-graded).
- Modify (nếu assertion ảnh hưởng): test liên quan preview hiện có.

## Implementation Steps

1. `assignment-quiz-sim.ts`: resolve skill/type bằng đúng công thức
   `StudentPreviewPaper` (`skill ?? "writing"`, `part ?? task`,
   `type ?? genre`); trả `null` nếu không auto-graded hoặc items rỗng;
   normalize từng item (default `alts: ""`/`answer: ""`, bỏ thiếu `stem`);
   build detail + `takeQuestions` (map strip `{stem, opts, pin}` như
   `student.ts:886-892`) + `fullQuestions` + `note` + `simKey` (bank
   `prompt.id`, draft fingerprint). Pure fn, test được.
2. `use-quiz-simulation.ts`: hook giữ `answers` + `grade` + `submit()` (gọi
   `gradeQuiz(sim.fullQuestions, answers)`) + `reset()`; `useEffect` reset khi
   `sim.simKey` đổi.
3. `preview-quiz-simulation.tsx`: presentational — take view dựng parts từ
   `buildQuizParts(sim.takeQuestions)`; review view từ `fullQuestions` +
   verdicts; nhận state từ hook qua props.
4. `preview.tsx`: `const sim = useMemo(() => buildQuizSim(draft), [simKey])`
   (memo theo `simKey`, không theo object identity); segmented control 2 tab
   khi `sim`; render điều kiện đúng 1 tab; gọi `useQuizSimulation(sim)`;
   tab "Đề bài" render y hệt hôm nay; lead text cập nhật cho trường hợp có tab.
5. Unit tests theo Requirements; chạy full gates + e2e student-quiz mục
   Verification.

## Todo

- [ ] Mapping lib (strip-key takeQuestions + normalize + resolver chuẩn) + test
- [ ] Hook use-quiz-simulation (state route-level + reset theo simKey)
- [ ] Simulation component (take + review + reset) + test jsdom + composed-state
- [ ] Preview route tích hợp tab (render điều kiện) + test/adjust impacted
- [ ] Full gates + e2e student-quiz xanh

<!-- Updated: Red Team Session 1 — strip-key takeQuestions, resolver đúng công thức, normalize malformed, state lift + simKey reset, conditional tab render, width-oracle documented -->

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter web test
pnpm --filter student test
pnpm --filter server test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
```

(e2e chạy toàn suite như gate chuẩn; tối thiểu `student-quiz-take-review.spec.ts`
phải xanh — xác nhận extraction Phase 1-2 không regress luồng thật.)

## Risk Assessment

- **Answer key lộ ở take view** — đã chặn ở tầng data (takeQuestions strip) +
  pin bằng unit test quét DOM take không chứa key/alts/note (mirror
  `QUIZ_LEAK_STRINGS` của e2e student); test composed state đề phòng regression
  render ẩn.
- **Offset lệch khi items có pin/filter** — `takeQuestions`/`fullQuestions`
  đồng bộ index (không lọc riêng mảng nào); PinOverlay tự filter hiển thị
  (behavior như take thật).
- **Draft mode thiếu items** (đề soạn dở) — `buildQuizSim` trả null, trang giữ
  hiện trạng; không crash.
- **Stale state khi đổi đề** — search-only navigation không remount; reset qua
  `simKey` + unit test transition.
- **Scope creep navigator** — navigator giữ nguyên tính năng, KHÔNG thêm
  scroll-sync mới cho web (đã có sẵn onSelect/current).

## Security Considerations

- Mọi dữ liệu simulation là client-side từ store giáo viên (đã auth);
  không network call mới, không bề mặt tấn công mới.
- Không hiển thị key khi chế độ take (như trên) — phòng cảnh screen-share
  giáo viên demo cho học viên.
- **Known accepted behavior ngoài scope**: tab "Đề bài" (giữ nguyên #282) render
  `ClozeStemText` preview-mode với width = f(độ dài answer) — answer-length
  oracle tồn tại từ trước trên bề mặt giáo viên này; plan KHÔNG claim bảo vệ
  screen-share end-to-end cho tab đó, chỉ cho tab "Làm thử & Soi bài" khi chưa
  nộp.

## Next Steps

→ Ship theo gate chuẩn của repo; cập nhật CHANGELOG nếu cần theo precedent #284.
