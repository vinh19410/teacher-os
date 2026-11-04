---
phase: 3
title: "Phase 3: Student Take, Dual-Store Autosave & Result Review"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Student Take, Dual-Store Autosave & Result Review

<!-- Updated: Red-Team & Validation Session 1 - exact apps/student/test/* paths, QuizEssayInput readOnly+maxLength, dispose mirror safety + cross-halt, /detail highlights+grade card, history-list canReview -->

## Goal
Cập nhật `@teacher-os/ui` (`QuizPaper`) và `apps/student` để học viên làm được bài gộp (Phần 1 Trắc nghiệm + Phần 2 Writing) với 2 autosave store độc lập không đè key `"0"`, không rớt chữ khi rời trang SPA, đồng bộ cross-halt khi 401/409, cảnh báo nộp bài kết hợp cả hai phần, và hiển thị đầy đủ kết quả cả hai phần trên màn kết quả, màn `/detail` và trang `/history`.

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Modify: `apps/student/src/lib/quiz-attempt-store.ts`
- Modify: `apps/student/test/quiz-attempt-store.test.ts`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx`
- Create: `apps/student/test/quiz-take-view.test.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
- Modify: `apps/student/src/lib/assignment-status.ts`
- Modify: `apps/student/test/assignment-status.test.ts`
- Modify: `apps/student/src/components/history/history-list.tsx`

## Tasks

### Task 3.1 — TDD Red & Green: `QuizPaper` hỗ trợ khối Phần 2 Writing độc lập không đụng `answers[0]`
- **Goal:** Render phần Writing đính kèm bên dưới danh sách câu trắc nghiệm ở cả hai chế độ `take` và `review` qua prop `writingSection`, `essay`, `onEssayChange`.
- **Target files and symbols:** `packages/ui/src/components/quiz/quiz-paper.tsx` (`QuizPaper`) và `apps/student/test/quiz-paper.test.tsx`.
- **Steps:**
  1. Mở `apps/student/test/quiz-paper.test.tsx`, viết thêm test (Red):
     - Khi `detail` là đề `grammar` có 2 câu MCQ (`answers = { 0: "A", 1: "B" }`) VÀ `writingSection = { part: "task2", type: "discuss", prompt: "<p>Write about technology.</p>" }`, `essay = "My draft essay"`:
       - Câu 1 vẫn hiển thị lựa chọn `"A"` đã chọn (không đụng `answers[0]`).
       - Khối `data-testid="hybrid-writing-section"` hiển thị tiêu đề `"Phần 2 · Writing (Task 2)"`, mục tiêu `"Tối thiểu 250 từ"`, đề `"Write about technology."`, và `<QuizEssayInput>` có giá trị `"My draft essay"`, `maxLength={10000}`, không `readOnly`.
       - Ở `mode="review"`, `<textarea>` của `<QuizEssayInput>` có thuộc tính `readonly` / `aria-readonly="true"` và vẫn hiển thị đúng bài luận đã nộp cùng verdict của câu 1.
  2. Chạy `pnpm --filter student test -- quiz-paper` để xác nhận Red.
  3. Cập nhật `QuizPaper` trong `packages/ui/src/components/quiz/quiz-paper.tsx`:
     - Thêm optional props: `writingSection?: { part: string; type: string; prompt: string } | null`, `essay?: string`, `onEssayChange?: (value: string) => void`.
     - Giữ nguyên nhánh `isWritingEssay = skill === "writing" && questions.length === 0` cho đề Writing thuần.
     - Khi `isAuto && writingSection != null` (và khi không truyền custom review slot thay thế): sau khối câu hỏi trắc nghiệm, render `<section aria-labelledby="hybrid-writing-heading" className="mt-8 border-border border-t pt-6" data-testid="hybrid-writing-section">` gồm header `"Phần 2 · Writing (${writingSection.part === "task1" ? "Task 1" : "Task 2"})"` kèm dòng phụ `WRITING_MIN_WORDS[writingSection.part] ? \`Tối thiểu ${WRITING_MIN_WORDS[writingSection.part]} từ\` : null`, `<RichTextBody text={writingSection.prompt} />`, và `<QuizEssayInput value={essay ?? ""} onChange={(v) => onEssayChange?.(v)} readOnly={reviewMode} maxLength={QUIZ_ESSAY_MAX} />`.
- **Success criteria:** `apps/student/test/quiz-paper.test.tsx` pass 100%.
- **Verify:** `pnpm --filter student test -- quiz-paper` exits 0 và in `passed`.

### Task 3.2 — TDD Red & Green: Mở rộng `quiz-attempt-store.ts` với `mirrorKey` riêng, bảo toàn mirror khi `dispose()` còn thay đổi chưa xong, và `halt()`
- **Goal:** Cho phép tạo 2 store trên cùng một `attemptId` không đè `localStorage` của nhau, không làm mất chữ cuối khi bấm `Thoát` lúc `PATCH /essay` đang bay, và cho phép cross-halt giữa 2 store.
- **Target files and symbols:** `apps/student/src/lib/quiz-attempt-store.ts` (`quizAttemptEssayMirrorKey`, `QuizAttemptStore.halt`, `dispose`, `QuizAttemptStoreOptions.mirrorKey`, `UseQuizAttemptStoreOptions.mirrorKey`) và `apps/student/test/quiz-attempt-store.test.ts`.
- **Steps:**
  1. Viết test trong `apps/student/test/quiz-attempt-store.test.ts` (Red):
     - `quizAttemptEssayMirrorKey("att-1")` trả `"quiz-attempt:att-1:essay"`.
     - `answerStore` (`valueMax = 500`) và `essayStore` (`mirrorKey: quizAttemptEssayMirrorKey("att-1")`, `valueMax = 10_000`) chạy song song trên cùng `storage` không đè dữ liệu của nhau.
     - **Unmount / `dispose()` & StrictMode remount safety:** (a) khi `essayStore` đang có request `send` #1 in-flight cho `q = 0` và người dùng gõ thêm đoạn 2 rồi gọi `essayStore.dispose()`, `storage` vẫn giữ nguyên bản nháp đoạn 2 và khi request #1 settle thì phát đúng 1 lượt `send` cuối cùng (`keepalive: true`); nếu request cuối lỗi mạng, mirror vẫn còn nguyên cho lần mount kế tiếp reconcile; (b) giả lập React StrictMode double-mount (mount #1 reconcile bản nháp chưa lưu từ `storage` → unmount #1 `dispose()` ngay lập tức → mount #2 trên cùng `storage`) bảo toàn 100% bản nháp cục bộ không bị xoá mất.
     - `store.halt("auth")` chuyển `getHalted()` sang `"auth"` và huỷ timer debounce mà không xoá mirror; `store.finalize()` chuyển `"finalized"` và xoá sạch mirror.
  2. Chạy `pnpm --filter student test -- quiz-attempt-store` để xác nhận Red.
  3. Cập nhật `quiz-attempt-store.ts`:
     - Export `quizAttemptEssayMirrorKey = (attemptId: string): string => \`quiz-attempt:${attemptId}:essay\`;`.
     - Thêm `mirrorKey?: string;` vào `QuizAttemptStoreOptions` và `UseQuizAttemptStoreOptions`.
     - Thêm method `halt(reason: QuizAttemptHaltReason): void` trên `QuizAttemptStore` (nếu `halted === null`, huỷ timer, gán `halted = reason`, nếu `reason === "submitted" || reason === "finalized"` thì `clearMirror()`, và `emit()`).
     - Trong `dispose()`: gọi `cancelTimer()`, `flushPending({ keepalive: true })`; nếu `pending.size === 0 && inflight.size === 0` thì `halted = "finalized"; clearMirror();` ngay; ngược lại đánh dấu cờ nội bộ `disposing = true` để khi `inflight` settle: nếu còn `skippedQs` thì gửi nốt 1 lượt `flushPending({ keepalive: true })` một lần duy nhất, và chỉ gọi `clearMirror()` khi toàn bộ `pending` + `inflight` đã thành công hết (nếu mạng rớt thì mirror vẫn còn nguyên trong `localStorage` để lần mở lại reconcile!).
- **Success criteria:** Toàn bộ test cũ + mới trong `apps/student/test/quiz-attempt-store.test.ts` pass.
- **Verify:** `pnpm --filter student test -- quiz-attempt-store` exits 0 và in `passed`.

### Task 3.3 — TDD Red & Green: `QuizTakeView` & `$assignmentId.tsx` nối dual-store, cross-halt, footer và submit guard
- **Goal:** Học viên vào làm bài gộp có resume đúng cả câu trắc nghiệm lẫn bài viết, autosave độc lập hai kênh, cross-halt khi 401/409, drain cả hai trước khi submit, và thấy cảnh báo rõ ràng nếu còn câu bỏ trống hoặc bài viết trống/thiếu từ.
- **Target files and symbols:**
  - `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
  - `apps/student/src/components/quiz/quiz-take-view.tsx`
  - `apps/student/test/quiz-take-view.test.tsx` (mới, mở đầu bằng `// @vitest-environment jsdom`)
- **Steps:**
  1. Tạo `apps/student/test/quiz-take-view.test.tsx` (với `// @vitest-environment jsdom` ở dòng 1):
     - Render `QuizTakeView` (bọc `QueryClientProvider`) với dữ liệu mock đề `grammar` 2 câu + `writing: { part: "task2", type: "discuss", prompt: "<p>Write essay</p>" }`:
       - Chọn đáp án câu 1 gọi `patchQuizAnswer` (`q = 0`), gõ bài luận gọi `patchQuizEssay` và không ghi đè đáp án câu 1.
       - Bấm `Nộp bài` khi còn 1 câu bỏ trống và bài luận thiếu từ mở dialog cảnh báo gộp cả hai thông tin; bấm xác nhận gọi `drain()` trên cả 2 store rồi mới gọi `submitQuizAttempt`.
  2. Chạy `pnpm --filter student test -- quiz-take-view` để xác nhận Red.
  3. Cập nhật `$assignmentId.tsx`:
     - Khi `detail.attempt?.status === "submitted"`, xoá cả `quizAttemptMirrorKey(detail.attempt.id)` lẫn `quizAttemptEssayMirrorKey(detail.attempt.id)`.
     - Trả thêm `serverEssay: detail.writing ? (detail.attempt?.essay ?? "") : ""` từ loader và truyền vào `<QuizTakeView source={...} serverAnswers={serverAnswers} serverEssay={serverEssay} />`.
  4. Cập nhật `QuizTakeView`:
     - Nhận prop `serverEssay?: string` (mặc định `""`).
     - `const hybridWriting = detail?.writing ?? null; const hasHybridWriting = hybridWriting !== null;`.
     - `serverHasAnswers = Object.keys(serverAnswers).length > 0 || (hasHybridWriting && serverEssay.trim().length > 0);`.
     - Tạo `essayStore` với `attemptId: storeActive && hasHybridWriting ? attemptId : null`, `serverAnswers: serverEssay ? { "0": serverEssay } : {}`, `mirrorKey: attemptId ? quizAttemptEssayMirrorKey(attemptId) : undefined`, `send: (_q, value, opts) => patchQuizEssay(attemptId ?? "", value, opts)`, `valueMax: QUIZ_ESSAY_MAX`.
     - Trong `onAuthError` của mỗi store: gọi `siblingRef.current?.halt("auth")`, `setAuthBanner(true)`, `reauth()`. Trong `onAlreadySubmitted`: gọi `siblingRef.current?.halt("submitted")` và điều hướng sang summary.
     - Tổng hợp `combinedSaveState` (`"error"` > `"saving"` > `"saved"`), `anyHalted = snapshot.halted !== null || essaySnapshot.halted !== null`, và `submitDisabled = submitMutation.isPending || anyHalted || !storeActive || store === null || (hasHybridWriting && essayStore === null) || (isSpeaking && (media === null || mediaUploading))`.
     - Trong `pagehide`/`visibilitychange` và `beforeunload`: flush / kiểm tra `isDirty()` trên cả `store` lẫn `essayStore`.
     - Trong `submitMutation.mutationFn`: kiểm tra `if (current === null || (hasHybridWriting && currentEssay === null)) throw new Error("No active attempt to submit");`, `await Promise.all([current.drain(), ...(hasHybridWriting && currentEssay ? [currentEssay.drain()] : [])])`, kiểm tra `getHalted() !== null` trên cả hai, rồi gọi `submitQuizAttempt`. Ở `onSuccess`: gọi `finalize()` cho cả hai store.
     - Cảnh báo nộp bài kết hợp: nếu cả `unansweredCount > 0` và `essayGuardNeedsConfirm` cùng đúng trên bài gộp, truyền `title="Còn câu chưa trả lời và bài viết chưa hoàn chỉnh"` và `description` nêu rõ số câu bỏ trống + trạng thái bài viết; nếu chỉ `essayGuardNeedsConfirm` đúng, dùng copy cảnh báo bài viết.
     - Truyền `writingSection={hybridWriting}`, `essay={hybridEssayText}`, `onEssayChange={(v) => essayStore?.setAnswer(0, v)}` vào `<QuizPaper />` ở cả 2 nhánh (`splitPane` và 1 cột), hiển thị chip đếm từ cạnh `QuizNavigator`, và cập nhật dòng mô tả ở gate card trước khi start (`"{N} câu hỏi + Bài viết · Band {band}"`).
- **Success criteria:** `apps/student/test/quiz-take-view.test.tsx` pass 100%.
- **Verify:** `pnpm --filter student test -- quiz-take-view` exits 0 và in `passed`.

### Task 3.4 — TDD Red & Green: `assignment-status.ts`, màn kết quả `$attemptId.tsx`, màn `/detail` và `history-list.tsx`
- **Goal:** Đồng bộ nhãn trạng thái chờ chấm, ghép mượt cả kết quả trắc nghiệm lẫn bài viết + band/nhận xét/highlight trên cả màn summary lẫn `/detail`, dọn sạch mirror ở loader summary, và mở nút `Xem nhận xét` trên `/history`.
- **Target files and symbols:**
  - `apps/student/src/lib/assignment-status.ts` & `apps/student/test/assignment-status.test.ts`
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` & `apps/student/test/attempt-summary.test.tsx`
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
  - `apps/student/src/components/history/history-list.tsx`
- **Steps:**
  1. Mở `apps/student/test/assignment-status.test.ts` và `apps/student/test/attempt-summary.test.tsx`, thêm các test case (Red):
     - `deriveAssignmentStatus`: bài có `skill: "grammar"`, `hasWriting: true`, đã nộp, `gradedAt: null` → `"Đang chờ giáo viên chấm"`; khi có `gradedAt` → nhãn đã chấm.
     - `AttemptSummaryBody`: summary bài gộp (`skill: "reading"`, `totalCount: 3`, `correctCount: 2`, `items: [...]`, `essay: "Student essay"`) render **đồng thời** `<AttemptScoreCard>` (`2/3`), `Bảng đáp án`, VÀ khung `Bài viết của bạn` + dòng `awaiting-grade` (khi `grade === null`) hoặc `<AttemptGradeCard>` + `EssayWithHighlights` (khi `grade` đã có).
  2. Chạy `pnpm --filter student test -- assignment-status attempt-summary` để xác nhận Red.
  3. Cập nhật `assignment-status.ts`: dùng `hasGradableTask({ skill: assignment.skill ?? "", hasWriting: assignment.hasWriting })`.
  4. Cập nhật `$attemptId.tsx`:
     - Trong route loader (hoặc khi mount summary), dọn dẹp cả `quizAttemptMirrorKey(attemptId)` và `quizAttemptEssayMirrorKey(attemptId)` khỏi `localStorage` để không rò rỉ mirror sau cross-tab submit.
     - Dòng `awaiting-grade` hiện khi `(summary.skill === "writing" || summary.skill === "speaking" || essay !== null) && grade === null`.
     - Với bài gộp (`summary.skill !== "speaking" && summary.totalCount > 0 && essay !== null`): render `submittedLine`, tiếp theo là `AttemptScoreCard` + `Bảng đáp án` (`AttemptCompactList`), tiếp theo là khối `essayFrame` + `AttemptGradeCard` (dạng 2 cột `writing-result-split` khi `split && grade`, hoặc xếp dọc kèm `"Giáo viên sẽ chấm bài viết của bạn."` khi chưa chấm). Đề Writing thuần và đề tự chấm thuần giữ nguyên DOM cũ 100%.
  5. Cập nhật `$attemptId.detail.tsx`:
     - Sửa dòng 108: chỉ inject `{ ...answers, 0: attempt.essay }` khi `attempt.questions.length === 0 && attempt.essay != null` (đề Writing thuần). Với bài gộp (`attempt.questions.length > 0`), giữ nguyên `reviewAnswers = answers` để câu hỏi số 1 không bị ghi đè!
     - Khi bài gộp (`(attempt.writing ?? quizQuery.data.writing) != null` hoặc `attempt.questions.length > 0 && attempt.essay != null`), bên dưới `<QuizPaper mode="review" />` (không truyền `writingSection` vào `QuizPaper` ở review để tránh vẽ 2 lần, mà render trực tiếp khối kết quả Phần 2 Writing giàu thông tin): hiển thị đề Writing (`RichTextBody`), bài viết của học viên qua `<EssayWithHighlights essay={attempt.essay ?? ""} annotations={attempt.annotations ?? []} inlineNotes />` (hoặc thông báo bài trống), và `<AttemptGradeCard grade={attempt.grade} skill="writing" part={attempt.part ?? ""} />` khi đã chấm (hoặc `"Giáo viên sẽ chấm bài viết của bạn."` khi chưa chấm) — đảm bảo `/detail` có đầy đủ band, nhận xét và highlight như màn kết quả!
  6. Cập nhật `apps/student/src/components/history/history-list.tsx`: mở `canReview(entry)` thành `entry.status === "graded" && entry.attemptId !== null && (entry.skill === "writing" || entry.hasWriting === true)`.
- **Success criteria:** Toàn bộ test suite `apps/student` pass 100%.
- **Verify:** `pnpm --filter student test` exits 0 và không có test nào fail.

## Verification
- `pnpm --filter student test` exits 0.
- `pnpm check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
